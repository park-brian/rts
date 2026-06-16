import type { Action, Params, State, Who } from './types.ts';
import { Target } from './types.ts';
import type { Policy } from './oracle.ts';

// A small zoo of scripted "archetypes". These are the strategic poles of the
// game — cheese / macro / turtle / harass — and exist to (a) seed an opponent
// pool, (b) act as behavior-cloning demonstrators, and (c) be measured against
// the oracle. None is meant to be optimal; the point is that they beat and lose
// to each other in a cycle (see arena.ts), which is what makes the game a real
// game rather than a solved race.

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

// While our army is marching we cannot launch another; macro/hold at home
// instead (keep half as a rear guard, harvest the rest, keep building).
const holdAtHome = (s: State, who: Who, p: Params): Action => {
  const me = s[who];
  const w = me.workers.length;
  return {
    attack: 0,
    defend: clamp(Math.floor(w / 2), 0, w),
    target: Target.Base,
    build: me.minerals >= p.workerCost,
  };
};

// "Should I attack the soft economy or the base?" If the enemy still has a
// healthy worker count, denying it is worth more than chipping the base; once
// they're crippled (or we're closing), go for the kill.
const harassOrKill = (enemyWorkers: number): Action['target'] =>
  enemyWorkers >= 2 ? Target.Harvesters : Target.Base;

// Greedy macro -> single timing wave. Drone up to a target, then commit all-in.
export const macro: Policy = (s, who, p): Action => {
  const me = s[who];
  if (me.inbound) return holdAtHome(s, who, p);
  const w = me.workers.length;
  const enemy = s[who === 'a' ? 'b' : 'a'];
  const build = me.minerals >= p.workerCost;
  const waveSize = Math.min(p.maxWorkers, Math.max(3, Math.floor(p.maxWorkers * 0.75)));
  if (w >= waveSize) {
    return { attack: w, defend: 0, target: harassOrKill(enemy.workers.length), build: false };
  }
  return { attack: 0, defend: 0, target: Target.Base, build };
};

// Cheese: build a couple, then send everything early to deny + kill before the
// opponent can scale. High variance — wins vs greedy, dies vs a defender.
export const cheese: Policy = (s, who, p): Action => {
  const me = s[who];
  if (me.inbound) return holdAtHome(s, who, p);
  const w = me.workers.length;
  const enemy = s[who === 'a' ? 'b' : 'a'];
  const rushSize = 3;
  if (w >= rushSize) {
    return { attack: w, defend: 0, target: harassOrKill(enemy.workers.length), build: false };
  }
  return { attack: 0, defend: 0, target: Target.Base, build: me.minerals >= p.workerCost };
};

// Turtle: always hold back defenders, out-economy, and only push when maxed.
export const turtle: Policy = (s, who, p): Action => {
  const me = s[who];
  if (me.inbound) return holdAtHome(s, who, p);
  const w = me.workers.length;
  const enemy = s[who === 'a' ? 'b' : 'a'];
  const build = me.minerals >= p.workerCost;
  if (w >= p.maxWorkers) {
    // Maxed: push with the bulk, keep a rear guard.
    const guard = clamp(Math.floor(w / 3), 1, w);
    return { attack: w - guard, defend: guard, target: harassOrKill(enemy.workers.length), build: false };
  }
  const defend = clamp(Math.ceil(w / 2), 0, w);
  return { attack: 0, defend, target: Target.Base, build };
};

// Harasser: perpetually chip the enemy economy with one worker, drone with the
// rest. Pure attrition — strong vs greedy, weak vs anyone who defends + scales.
export const harasser: Policy = (s, who, p): Action => {
  const me = s[who];
  if (me.inbound) return holdAtHome(s, who, p);
  const w = me.workers.length;
  const build = me.minerals >= p.workerCost;
  if (w <= 1) return { attack: 0, defend: 0, target: Target.Base, build };
  return { attack: 1, defend: 0, target: Target.Harvesters, build };
};

// Pure economy, never attacks — a punching bag / lower bound.
export const greedy: Policy = (s, who, p): Action => {
  const me = s[who];
  return { attack: 0, defend: 0, target: Target.Base, build: me.minerals >= p.workerCost };
};

export const ARCHETYPES: { name: string; policy: Policy }[] = [
  { name: 'cheese', policy: cheese },
  { name: 'macro', policy: macro },
  { name: 'turtle', policy: turtle },
  { name: 'harasser', policy: harasser },
  { name: 'greedy', policy: greedy },
];
