import { Kind, Order, Tech, Units, tiles } from '../data/index.ts';
import type { State } from '../entity/world.ts';
import { NONE, isAlive, kill, slotOf } from '../entity/world.ts';
import { setEntityKind, setEntityKindFull } from '../entity/kind.ts';
import { isContained } from './cargo.ts';
import { distanceSq, withinRangeSq } from '../spatial/geometry.ts';
import { clearVelocity } from '../spatial/motion.ts';
import { isDisabled } from './status.ts';
import { startModeTransform } from './mode-transition.ts';

export type UnitTransform = {
  from: number;
  to: number;
  tech?: number;
  mode?: 'instant' | 'morph' | 'merge' | 'deploy';
};

export const UnitTransforms: readonly UnitTransform[] = [
  { from: Kind.SiegeTank, to: Kind.SiegeTankSieged, tech: Tech.SiegeTech, mode: 'deploy' },
  { from: Kind.SiegeTankSieged, to: Kind.SiegeTank, mode: 'deploy' },
  { from: Kind.HighTemplar, to: Kind.Archon, mode: 'merge' },
  { from: Kind.DarkTemplar, to: Kind.DarkArchon, mode: 'merge' },
  { from: Kind.Hydralisk, to: Kind.Lurker, tech: Tech.LurkerAspect, mode: 'morph' },
  { from: Kind.Mutalisk, to: Kind.Guardian, mode: 'morph' },
  { from: Kind.Mutalisk, to: Kind.Devourer, mode: 'morph' },
  { from: Kind.Hatchery, to: Kind.Lair, mode: 'morph' },
  { from: Kind.Lair, to: Kind.Hive, mode: 'morph' },
  { from: Kind.Spire, to: Kind.GreaterSpire, mode: 'morph' },
  { from: Kind.CreepColony, to: Kind.SunkenColony, mode: 'morph' },
  { from: Kind.CreepColony, to: Kind.SporeColony, mode: 'morph' },
];

export const transformFor = (from: number, to: number): UnitTransform | null => {
  for (const t of UnitTransforms) if (t.from === from && t.to === to) return t;
  return null;
};

export const transformTargetsFor = (from: number): number[] =>
  UnitTransforms.filter((t) => t.from === from).map((t) => t.to);

export const MERGE_RANGE = tiles(2);

const validMergePartner = (s: State, slot: number, partner: number, to: number): boolean => {
  const e = s.e;
  const transform = transformFor(e.kind[slot]!, to);
  if (!transform || transform.mode !== 'merge') return false;
  if (partner === slot || e.alive[partner] !== 1) return false;
  if (e.owner[partner] !== e.owner[slot] || e.kind[partner] !== e.kind[slot]) return false;
  if (e.built[partner] !== 1 || isContained(s, partner) || isDisabled(e, partner)) return false;
  return withinRangeSq(e.x[slot]!, e.y[slot]!, e.x[partner]!, e.y[partner]!, MERGE_RANGE);
};

export const mergePartnerFor = (s: State, slot: number, to: number, target = NONE): number => {
  const e = s.e;
  if (target !== NONE) {
    if (!isAlive(e, target)) return NONE;
    const partner = slotOf(target);
    return validMergePartner(s, slot, partner, to) ? partner : NONE;
  }
  let best = NONE;
  let bestD = MERGE_RANGE * MERGE_RANGE + 1;
  for (let i = 0; i < e.hi; i++) {
    if (!validMergePartner(s, slot, i, to)) continue;
    const d = distanceSq(e.x[slot]!, e.y[slot]!, e.x[i]!, e.y[i]!);
    if (d < bestD || (d === bestD && i < best)) { best = i; bestD = d; }
  }
  return best;
};

const clearSettled = (s: State, slot: number): void => {
  s.e.settled[slot] = 0;
};

const transformUnit = (s: State, slot: number, kind: number): void => {
  const e = s.e;
  clearSettled(s, slot);
  clearVelocity(e, slot);
  setEntityKind(s, slot, kind);
  e.order[slot] = Order.Idle;
  e.target[slot] = NONE;
  e.intentTarget[slot] = NONE;
  e.combatTarget[slot] = NONE;
};

const startMorph = (s: State, slot: number, kind: number): void => {
  const e = s.e;
  const def = Units[kind]!;
  const player = e.owner[slot]!;
  clearSettled(s, slot);
  clearVelocity(e, slot);
  s.players.minerals[player] = s.players.minerals[player]! - def.minerals;
  s.players.gas[player] = s.players.gas[player]! - def.gas;
  e.morphFromKind[slot] = e.kind[slot]!;
  setEntityKind(s, slot, kind);
  e.built[slot] = 0;
  e.ctimer[slot] = def.buildTime;
  e.order[slot] = Order.Idle;
  e.target[slot] = NONE;
  e.intentTarget[slot] = NONE;
  e.combatTarget[slot] = NONE;
  e.prodKind[slot] = Kind.None;
  e.prodTimer[slot] = 0;
  e.prodQueued[slot] = 0;
  e.researchKind[slot] = Kind.None;
  e.researchTimer[slot] = 0;
  e.buildCostMinerals[slot] = def.minerals;
  e.buildCostGas[slot] = def.gas;
};

const startMerge = (s: State, slot: number, kind: number, partner: number): void => {
  const e = s.e;
  const def = Units[kind]!;
  const x = Math.trunc((e.x[slot]! + e.x[partner]!) / 2);
  const y = Math.trunc((e.y[slot]! + e.y[partner]!) / 2);
  clearSettled(s, slot);
  clearVelocity(e, slot);
  kill(s, partner);
  setEntityKindFull(s, slot, kind);
  e.x[slot] = x;
  e.y[slot] = y;
  e.built[slot] = 0;
  e.ctimer[slot] = def.buildTime;
  e.order[slot] = Order.Idle;
  e.target[slot] = NONE;
  e.intentTarget[slot] = NONE;
  e.combatTarget[slot] = NONE;
  e.prodKind[slot] = Kind.None;
  e.prodTimer[slot] = 0;
  e.prodQueued[slot] = 0;
  e.researchKind[slot] = Kind.None;
  e.researchTimer[slot] = 0;
};

export const applyTransform = (s: State, slot: number, kind: number, target = NONE): void => {
  const transform = transformFor(s.e.kind[slot]!, kind);
  if (transform?.mode === 'merge') {
    const partner = mergePartnerFor(s, slot, kind, target);
    if (partner !== NONE) startMerge(s, slot, kind, partner);
  } else if (transform?.mode === 'morph') startMorph(s, slot, kind);
  else if (transform?.mode === 'deploy') startModeTransform(s, slot, kind);
  else transformUnit(s, slot, kind);
};
