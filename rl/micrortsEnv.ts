import type { GameState, Unit, UnitAction } from '../microrts/types.ts';
import { DIRS, Kind } from '../microrts/types.ts';
import { idleUnits, livePlayerUnits, step, unitAt, winner } from '../microrts/game.ts';
import { makeMap } from '../microrts/setup.ts';
import type { Bot } from '../microrts/bots.ts';
import { economyBot } from '../microrts/bots.ts';
import { decode, unitMask, PER_UNIT_ACTIONS } from './microActions.ts';

// A microRTS environment with a FACTORED, PER-UNIT action space — the point of
// masking. Each decision step the agent commands EVERY idle unit at once; each
// unit gets its own fixed-size action head, MASKED to that unit's own legal
// actions (a worker's legal set differs from a base's, etc.). The GridNet env
// (gridEnv.ts) is the spatial-CNN form of the same idea.
export { PER_UNIT_ACTIONS };

const adj = (s: GameState, u: Unit, pred: (t: Unit) => boolean): number => {
  for (const d of DIRS) { const t = unitAt(s, u.x + d.dx, u.y + d.dy); if (t && pred(t)) return 1; }
  return 0;
};

const unitObs = (s: GameState, u: Unit, me: 0 | 1, maxCycles: number): number[] => {
  const kind = new Array(7).fill(0);
  kind[u.kind] = 1;
  const enemy = me === 0 ? 1 : 0;
  return [
    ...kind,
    u.hp / 10,
    u.carrying > 0 ? 1 : 0,
    u.x / (s.w - 1),
    u.y / (s.h - 1),
    adj(s, u, (t) => t.kind === Kind.Resource && t.carrying > 0),
    adj(s, u, (t) => t.owner === me && t.kind === Kind.Base),
    adj(s, u, (t) => t.owner === enemy),
    s.resources[me] / 20,
    livePlayerUnits(s, me).length / 10,
    livePlayerUnits(s, enemy).length / 10,
    s.time / maxCycles,
  ];
};

const count = (s: GameState, p: 0 | 1, k: number) => livePlayerUnits(s, p).filter((u) => u.kind === k).length;
const globalObs = (s: GameState, me: 0 | 1, maxCycles: number): number[] => {
  const e = me === 0 ? 1 : 0;
  return [
    s.resources[me] / 20, s.resources[e] / 20,
    count(s, me, Kind.Worker) / 8, count(s, me, Kind.Base) / 2, count(s, me, Kind.Barracks) / 2,
    (count(s, me, Kind.Light) + count(s, me, Kind.Heavy) + count(s, me, Kind.Ranged)) / 8,
    count(s, e, Kind.Worker) / 8,
    (count(s, e, Kind.Light) + count(s, e, Kind.Heavy) + count(s, e, Kind.Ranged)) / 8,
    livePlayerUnits(s, me).length / 10, livePlayerUnits(s, e).length / 10,
    s.time / maxCycles,
  ];
};

export type UnitObs = { id: number; obs: number[]; mask: boolean[] };
export type MultiObs = { units: UnitObs[]; global: number[] };

export class MicroRTSEnv {
  readonly perUnitActions = PER_UNIT_ACTIONS;
  readonly unitObsDim: number;
  readonly globalObsDim: number;
  private me: 0 | 1 = 0;
  private opp: Bot;
  private maxCycles: number;
  private econReward: boolean;
  private s: GameState;

  constructor(opponent: Bot = economyBot, maxCycles = 400, econReward = true) {
    this.opp = opponent;
    this.maxCycles = maxCycles;
    this.econReward = econReward;
    this.s = makeMap();
    this.unitObsDim = unitObs(this.s, this.s.units.find((u) => u.owner === 0 && u.kind === Kind.Worker)!, 0, maxCycles).length;
    this.globalObsDim = globalObs(this.s, 0, maxCycles).length;
  }

  private observe(): MultiObs {
    const units = idleUnits(this.s, this.me).map((u) => ({ id: u.id, obs: unitObs(this.s, u, this.me, this.maxCycles), mask: unitMask(this.s, u) }));
    return { units, global: globalObs(this.s, this.me, this.maxCycles) };
  }

  reset(): MultiObs {
    this.s = makeMap();
    return this.observe();
  }

  /** Apply one action slot per idle unit (all units commanded at once), then
   *  fast-forward frames where the agent has nothing to do. */
  step(actions: { unitId: number; slot: number }[]): { obs: MultiObs; reward: number; done: boolean } {
    const before = this.s.resources[this.me];
    const my = actions
      .map(({ unitId, slot }) => {
        const u = this.s.units.find((z) => z.id === unitId);
        const a = u ? decode(this.s, u, slot) : null;
        return a ? { unitId, action: a } : null;
      })
      .filter((x): x is { unitId: number; action: UnitAction } => x !== null);
    const oppMove = (st: GameState) => this.opp(st, (this.me === 0 ? 1 : 0) as 0 | 1);

    this.s = this.me === 0 ? step(this.s, my, oppMove(this.s)) : step(this.s, oppMove(this.s), my);
    // fast-forward to the next decision point (the agent has an idle unit) or end
    let guard = 0;
    while (winner(this.s, this.maxCycles) === null && idleUnits(this.s, this.me).length === 0 && guard++ < 2000) {
      this.s = this.me === 0 ? step(this.s, [], oppMove(this.s)) : step(this.s, oppMove(this.s), []);
    }
    const w = winner(this.s, this.maxCycles);
    const done = w !== null;
    let reward = this.s.resources[this.me] - before; // economy reward: net resources gained
    if (done && !this.econReward) reward += w === this.me ? 10 : w === 'draw' ? 0 : -10;
    return { obs: this.observe(), reward, done };
  }
}
