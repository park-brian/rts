import type { GameState, Unit, UnitAction } from '../microrts/types.ts';
import { ActionType, DIRS, Kind, NEUTRAL } from '../microrts/types.ts';
import { idleUnits, legalActions, livePlayerUnits, step, unitAt, winner } from '../microrts/game.ts';
import { def } from '../microrts/units.ts';
import { makeMap } from '../microrts/setup.ts';
import type { Bot } from '../microrts/bots.ts';
import { economyBot } from '../microrts/bots.ts';

// A microRTS environment with a FACTORED, PER-UNIT action space — the point of
// masking. Each decision step the agent commands EVERY idle unit at once; each
// unit gets its own fixed-size action head, MASKED to that unit's own legal
// actions (a worker's legal set differs from a base's, etc.). This is the
// GridNet/Gym-µRTS representation: one forward pass, all units, per-unit masks.

// ---- fixed per-unit action encoding (decode + mask below) ----
// 0: None | 1-4: Move dir | 5-8: Harvest dir | 9-12: Return dir
// 13-36: Produce (dir x 6 kinds) | 37-84: Attack (relative target within range 3)
const PRODUCE_KINDS = [Kind.Worker, Kind.Light, Kind.Heavy, Kind.Ranged, Kind.Base, Kind.Barracks];
const ATTACK_OFFSETS: { dx: number; dy: number }[] = [];
for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (dx !== 0 || dy !== 0) ATTACK_OFFSETS.push({ dx, dy });
export const PER_UNIT_ACTIONS = 37 + ATTACK_OFFSETS.length; // = 85

// Decode a slot to a concrete UnitAction for `u` in `s`, or null if impossible.
const decode = (s: GameState, u: Unit, slot: number): UnitAction | null => {
  if (slot === 0) return { type: ActionType.None };
  if (slot <= 4) return { type: ActionType.Move, dir: slot - 1 };
  if (slot <= 8) return { type: ActionType.Harvest, dir: slot - 5 };
  if (slot <= 12) return { type: ActionType.Return, dir: slot - 9 };
  if (slot <= 36) {
    const idx = slot - 13;
    return { type: ActionType.Produce, dir: Math.floor(idx / 6), kind: PRODUCE_KINDS[idx % 6]! };
  }
  const off = ATTACK_OFFSETS[slot - 37]!;
  const tgt = unitAt(s, u.x + off.dx, u.y + off.dy);
  if (!tgt || tgt.owner === u.owner || tgt.owner === NEUTRAL) return null;
  return { type: ActionType.Attack, targetId: tgt.id };
};

const eqAction = (a: UnitAction, b: UnitAction): boolean => {
  if (a.type !== b.type) return false;
  if (a.type === ActionType.Attack) return a.targetId === (b as { targetId: number }).targetId;
  if (a.type === ActionType.Produce) return a.dir === (b as { dir: number }).dir && a.kind === (b as { kind: number }).kind;
  if (a.type === ActionType.Move || a.type === ActionType.Harvest || a.type === ActionType.Return) return a.dir === (b as { dir: number }).dir;
  return true;
};

// Per-unit legal-action mask: a slot is legal iff its decoded action is in the
// engine's own legalActions for that unit (one source of truth).
const unitMask = (s: GameState, u: Unit): boolean[] => {
  const legal = legalActions(s, u);
  const mask = new Array(PER_UNIT_ACTIONS).fill(false);
  for (let slot = 0; slot < PER_UNIT_ACTIONS; slot++) {
    const a = decode(s, u, slot);
    if (a && legal.some((b) => eqAction(a, b))) mask[slot] = true;
  }
  mask[0] = true; // None is always allowed
  return mask;
};

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
