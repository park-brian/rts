import type { Action, Params, State } from '../minigame/types.ts';
import { Target } from '../minigame/types.ts';
import { initialState, step, outcome, legalActions } from '../minigame/game.ts';
import type { Policy } from '../minigame/oracle.ts';
import type { Env, Obs, StepOut } from './env.ts';
import { ActorCritic, maskedSoftmax, sampleFrom } from './nn.ts';
import { greedyAction } from './ppo.ts';

// Adapts the minigame macro game to the RL Env interface: the learner is player
// A, the opponent is a fixed scripted minigame Policy for B. The action space is
// a FIXED enumeration (canonicalActions) and the per-step MASK is exactly the set
// of currently-legal actions from the game's own legalActions — the same source
// of truth the engine validates against.

// Enumerate every action the game could ever offer (generated with the same
// structure as legalActions, so membership tests match exactly).
const canonicalActions = (p: Params): Action[] => {
  const out: Action[] = [];
  for (let attack = 0; attack <= p.maxWorkers; attack++) {
    for (let defend = 0; defend <= p.maxWorkers - attack; defend++) {
      const targets = attack > 0 ? [Target.Harvesters, Target.Defenders, Target.Base] : [Target.Base];
      for (const target of targets) for (const build of [false, true]) out.push({ attack, defend, target, build });
    }
  }
  return out;
};

const eq = (a: Action, b: Action): boolean => a.attack === b.attack && a.defend === b.defend && a.target === b.target && a.build === b.build;

const features = (s: State, p: Params): number[] => {
  const f = (pl: State['a']) => [
    pl.minerals / p.mineralCap,
    pl.workers.length / p.maxWorkers,
    pl.baseHp / p.baseHp,
    pl.inbound ? 1 : 0,
    pl.inbound ? pl.inbound.eta / Math.max(1, p.marchTime) : 0,
    pl.inbound ? pl.inbound.hps.length / p.maxWorkers : 0,
  ];
  return [...f(s.a), ...f(s.b), s.turn / p.horizon];
};

export class MinigameEnv implements Env {
  readonly obsDim: number;
  readonly nActions: number;
  private actions: Action[];
  private p: Params;
  private opponent: Policy;
  private shaping: number;
  private s: State;

  constructor(p: Params, opponent: Policy, shaping = 0.02) {
    this.p = p;
    this.opponent = opponent;
    this.shaping = shaping;
    this.actions = canonicalActions(p);
    this.nActions = this.actions.length;
    this.s = initialState(p);
    this.obsDim = features(this.s, p).length;
  }

  private mask(s: State): boolean[] {
    const legal = legalActions(s, 'a', this.p);
    return this.actions.map((a) => legal.some((b) => eq(a, b)));
  }

  reset(): Obs {
    this.s = initialState(this.p);
    return { obs: features(this.s, this.p), mask: this.mask(this.s) };
  }

  step(actionIdx: number): StepOut {
    const prev = this.s;
    const aA = this.actions[actionIdx]!;
    const aB = this.opponent(prev, 'b', this.p);
    const s2 = step(prev, aA, aB, this.p);
    this.s = s2;
    const o = outcome(s2, this.p);
    // light reward shaping: progress on the enemy base minus damage taken
    const shaped = this.shaping * ((prev.b.baseHp - s2.b.baseHp) - (prev.a.baseHp - s2.a.baseHp)) / this.p.baseHp;
    const reward = (o ?? 0) + shaped;
    return { obs: features(s2, this.p), mask: this.mask(s2), reward, done: o !== null };
  }
}

/** Wrap a trained net as a minigame Policy for player A (greedy decode). */
export const netPolicyA = (net: ActorCritic, p: Params): Policy => {
  const actions = canonicalActions(p);
  return (s, _who, _p): Action => {
    const legal = legalActions(s, 'a', p);
    const mask = actions.map((a) => legal.some((b) => eq(a, b)));
    return actions[greedyAction(net, features(s, p), mask)]!;
  };
};

/** Win rate of a trained net (player A) vs the opponent, over `games`. */
export const winRate = (net: ActorCritic, p: Params, opponent: Policy, games: number, seed: number, greedy = false): number => {
  const actions = canonicalActions(p);
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
  let wins = 0;
  for (let g = 0; g < games; g++) {
    let st = initialState(p);
    for (;;) {
      const o = outcome(st, p);
      if (o !== null) { if (o === 1) wins++; break; }
      const legal = legalActions(st, 'a', p);
      const mask = actions.map((a) => legal.some((b) => eq(a, b)));
      const f = net.forward(features(st, p));
      const idx = greedy ? greedyAction(net, features(st, p), mask) : sampleFrom(maskedSoftmax(f.logits, mask), rnd());
      st = step(st, actions[idx]!, opponent(st, 'b', p), p);
    }
  }
  return wins / games;
};
