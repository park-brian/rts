import type { GameState, Unit, UnitAction } from '../microrts/types.ts';
import { ActionType, Kind, NEUTRAL } from '../microrts/types.ts';
import { legalActions, unitAt } from '../microrts/game.ts';

// Shared per-unit action encoding used by BOTH the per-unit env and the GridNet
// env, so masks and decoding have one source of truth.
//
// Slot layout (fixed size PER_UNIT_ACTIONS):
//   0       None
//   1-4     Move dir
//   5-8     Harvest dir
//   9-12    Return dir
//   13-36   Produce (dir x 6 kinds)
//   37+     Attack (relative target offset within range)
export const PRODUCE_KINDS = [Kind.Worker, Kind.Light, Kind.Heavy, Kind.Ranged, Kind.Base, Kind.Barracks];
export const ATTACK_OFFSETS: { dx: number; dy: number }[] = [];
for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (dx !== 0 || dy !== 0) ATTACK_OFFSETS.push({ dx, dy });
export const PER_UNIT_ACTIONS = 37 + ATTACK_OFFSETS.length; // 85

export const decode = (s: GameState, u: Unit, slot: number): UnitAction | null => {
  if (slot === 0) return { type: ActionType.None };
  if (slot <= 4) return { type: ActionType.Move, dir: slot - 1 };
  if (slot <= 8) return { type: ActionType.Harvest, dir: slot - 5 };
  if (slot <= 12) return { type: ActionType.Return, dir: slot - 9 };
  if (slot <= 36) { const i = slot - 13; return { type: ActionType.Produce, dir: Math.floor(i / 6), kind: PRODUCE_KINDS[i % 6]! }; }
  const off = ATTACK_OFFSETS[slot - 37]!;
  const tgt = unitAt(s, u.x + off.dx, u.y + off.dy);
  if (!tgt || tgt.owner === u.owner || tgt.owner === NEUTRAL) return null;
  return { type: ActionType.Attack, targetId: tgt.id };
};

export const eqAction = (a: UnitAction, b: UnitAction): boolean => {
  if (a.type !== b.type) return false;
  if (a.type === ActionType.Attack) return a.targetId === (b as { targetId: number }).targetId;
  if (a.type === ActionType.Produce) return a.dir === (b as { dir: number }).dir && a.kind === (b as { kind: number }).kind;
  if (a.type === ActionType.Move || a.type === ActionType.Harvest || a.type === ActionType.Return) return a.dir === (b as { dir: number }).dir;
  return true;
};

export const unitMask = (s: GameState, u: Unit): boolean[] => {
  const legal = legalActions(s, u);
  const mask = new Array(PER_UNIT_ACTIONS).fill(false);
  for (let slot = 0; slot < PER_UNIT_ACTIONS; slot++) {
    const a = decode(s, u, slot);
    if (a && legal.some((b) => eqAction(a, b))) mask[slot] = true;
  }
  mask[0] = true;
  return mask;
};
