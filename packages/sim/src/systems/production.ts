// Production: structures with an in-progress unit count down and, on completion,
// spawn it and dequeue the next. Supply is derived by the census system, so this
// system does no supply bookkeeping. Race-agnostic: a produced *worker* (by role)
// auto-mines the nearest *resource* (by role).

import type { State } from '../world.ts';
import { canSpawnEntity, nearest, eid, slotOf, NONE } from '../world.ts';
import { trySpawnUnit } from '../factory.ts';
import { Kind, Order, Role, Units, isLarvaSourceKind, productionCount, sec } from '../data.ts';
import { fx, isqrt } from '../fixed.ts';
import { pickPatch } from './harvest.ts';
import { effectiveSpeed } from './status.ts';
import { isPowered } from '../power.ts';
import { isLiftedStructureFlags } from '../terran-mobility.ts';
import { completeInternalProduct } from '../internal-products.ts';
import { LARVA_MAX, countLarvae } from '../larva.ts';
import { activeAddonParentSlot, isAddonKind } from '../addon.ts';
import { isContained, loadUnitInto, withinLoadRange } from '../cargo.ts';
import { groupOffset, roundedGroupSpacing, usesGroundMoveSlot } from '../movement-slots.ts';
import { issueTravelOrder } from '../travel-intent.ts';
import { canPlayerGatherTargetSlot } from '../resource-targets.ts';
import { producedUnitRallyIntent } from '../command-intent.ts';

const EXIT = fx(40); // how far from a structure produced units appear
const LARVA_INTERVAL = sec(15);
const LARVA_OFFSETS: readonly [number, number][] = [
  [-32, 28], [0, 36], [32, 28],
];

type RallyMove = { slot: number; owner: number; order: number; x: number; y: number };

const rallyMoveKey = (move: Pick<RallyMove, 'owner' | 'order' | 'x' | 'y'>): string =>
  `${move.owner}:${move.order}:${move.x}:${move.y}`;

/** Direct a freshly produced unit per its producer's rally (default worker = auto-mine). */
const applyRally = (
  s: State,
  producer: number,
  slot: number,
  owner: number,
  speed: number,
  rallyMoves: RallyMove[],
): void => {
  const e = s.e;
  e.settled[slot] = 0;
  const intent = producedUnitRallyIntent(s, producer, slot);
  if (intent.kind === 'gather-target') {
    e.order[slot] = Order.Harvest;
    e.target[slot] = eid(e, intent.target);
  } else if (intent.kind === 'gather-near') {
    const np = pickPatch(s, slot, owner, speed, intent.x, intent.y);
    if (np !== NONE) { e.order[slot] = Order.Harvest; e.target[slot] = eid(e, np); }
  } else if (intent.kind === 'load') {
    if (withinLoadRange(s, intent.transport, slot)) {
      loadUnitInto(s, intent.transport, slot);
      return;
    }
    issueTravelOrder(s, slot, intent.endpoint, 'move');
  } else if (intent.kind === 'travel') {
    const issued = issueTravelOrder(s, slot, intent.endpoint, intent.intent);
    rallyMoves.push({ slot, owner, order: issued.order, x: issued.x, y: issued.y });
  }
};

const nearestProducerForRally = (s: State, slot: number, owner: number): number =>
  nearest(s, s.e.x[slot]!, s.e.y[slot]!, (sl) => s.e.owner[sl] === owner && isLarvaSourceKind(s.e.kind[sl]!));

const finishEgg = (s: State, slot: number, kind: number, rallyMoves: RallyMove[]): boolean => {
  const e = s.e;
  const def = Units[kind]!;
  const owner = e.owner[slot]!;
  const rally = nearestProducerForRally(s, slot, owner);
  const count = productionCount(kind);
  if (!canSpawnEntity(s, count - 1)) return false;
  e.kind[slot] = kind;
  e.hp[slot] = def.hp;
  e.shield[slot] = def.shields;
  e.energyMax[slot] = def.energyMax;
  e.energy[slot] = def.startEnergy;
  e.flags[slot] = def.roles;
  e.order[slot] = Order.Idle;
  e.target[slot] = NONE;
  e.intentTarget[slot] = NONE;
  e.combatTarget[slot] = NONE;
  e.prodKind[slot] = Kind.None;
  e.prodTimer[slot] = 0;
  e.prodQueued[slot] = 0;
  if (rally !== NONE) applyRally(s, rally, slot, owner, effectiveSpeed(s, e, slot, def.speed), rallyMoves);

  for (let n = 1; n < count; n++) {
    const id = trySpawnUnit(s, kind, owner, e.x[slot]! + fx(12 * n), e.y[slot]!);
    if (id === NONE) return true;
    const extra = slotOf(id);
    if (rally !== NONE) applyRally(s, rally, extra, owner, effectiveSpeed(s, e, extra, def.speed), rallyMoves);
  }
  return true;
};

const matchingGroupRank = (x: number, y: number, cx: number, cy: number, spacing: number, maxRank: number): number => {
  for (let rank = 0; rank <= maxRank; rank++) {
    const offset = groupOffset(rank, spacing);
    if (x === cx + offset.x && y === cy + offset.y) return rank;
  }
  return -1;
};

const reserveExistingRallyRanks = (
  s: State,
  move: RallyMove,
  spacing: number,
  fresh: ReadonlySet<number>,
  reserved: Set<number>,
): void => {
  const e = s.e;
  const maxRank = e.hi + fresh.size + 8;
  for (let i = 0; i < e.hi; i++) {
    if (fresh.has(i) || e.alive[i] !== 1 || e.owner[i] !== move.owner || isContained(s, i)) continue;
    if (e.order[i] !== move.order && e.order[i] !== Order.Idle) continue;
    if (!usesGroundMoveSlot(e.flags[i]!)) continue;
    const rank = matchingGroupRank(e.tx[i]!, e.ty[i]!, move.x, move.y, spacing, maxRank);
    if (rank >= 0) reserved.add(rank);
  }
};

const assignRallyMoveSlots = (s: State, moves: readonly RallyMove[]): void => {
  if (moves.length === 0) return;
  const e = s.e;
  const groups = new Map<string, number[]>();
  const byKey = new Map<string, RallyMove>();
  for (const move of moves) {
    if (e.alive[move.slot] !== 1 || e.order[move.slot] !== move.order || !usesGroundMoveSlot(e.flags[move.slot]!)) continue;
    const key = rallyMoveKey(move);
    byKey.set(key, move);
    let group = groups.get(key);
    if (!group) {
      group = [];
      groups.set(key, group);
    }
    group.push(move.slot);
  }
  for (const [key, slots] of groups) {
    slots.sort((a, b) => a - b);
    const spacing = roundedGroupSpacing(s, slots);
    const fresh = new Set(slots);
    const reserved = new Set<number>();
    const move = byKey.get(key)!;
    reserveExistingRallyRanks(s, move, spacing, fresh, reserved);
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i]!;
      let rank = 0;
      while (reserved.has(rank)) rank++;
      reserved.add(rank);
      const offset = groupOffset(rank, spacing);
      e.tx[slot] = move.x + offset.x;
      e.ty[slot] = move.y + offset.y;
    }
  }
};

const spawnLarva = (s: State, hatch: number, index: number): void => {
  const e = s.e;
  const [dx, dy] = LARVA_OFFSETS[index % LARVA_OFFSETS.length]!;
  trySpawnUnit(s, Kind.Larva, e.owner[hatch]!, e.x[hatch]! + fx(dx), e.y[hatch]! + fx(dy));
};

const larvae = (s: State): void => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.built[i] !== 1 || !isLarvaSourceKind(e.kind[i]!)) continue;
    const n = countLarvae(s, i);
    if (n >= LARVA_MAX) { e.timer[i] = LARVA_INTERVAL; continue; }
    if (e.timer[i]! > 0) {
      e.timer[i] = e.timer[i]! - 1;
      if (e.timer[i]! > 0) continue;
    }
    if (!canSpawnEntity(s)) continue;
    spawnLarva(s, i, n);
    if (canSpawnEntity(s) || countLarvae(s, i) > n) e.timer[i] = LARVA_INTERVAL;
  }
};

const finishInternalAmmo = (s: State, producer: number, kind: number): boolean => {
  const e = s.e;
  if (!completeInternalProduct(s, producer, kind)) return false;
  if (e.prodQueued[producer]! > 0) {
    e.prodQueued[producer] = e.prodQueued[producer]! - 1;
    e.prodTimer[producer] = Units[kind]!.buildTime;
  } else {
    e.prodKind[producer] = Kind.None;
    e.prodTimer[producer] = 0;
  }
  return true;
};

export const production = (s: State): void => {
  const e = s.e;
  const rallyMoves: RallyMove[] = [];
  larvae(s);
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.built[i] !== 1 || e.prodKind[i] === Kind.None) continue;
    if (e.kind[i] !== Kind.Egg && isLiftedStructureFlags(e.flags[i]!)) continue;
    if (isAddonKind(e.kind[i]!) && activeAddonParentSlot(s, i) === NONE) continue;
    if (!isPowered(s, i)) continue;
    if (e.prodTimer[i]! > 0) {
      e.prodTimer[i] = e.prodTimer[i]! - 1;
      if (e.prodTimer[i]! > 0) continue;
    }
    const kind = e.prodKind[i]!;
    const def = Units[kind]!;
    const owner = e.owner[i]!;
    if (finishInternalAmmo(s, i, kind)) continue;
    if (e.kind[i] === Kind.Egg) {
      if (finishEgg(s, i, kind, rallyMoves)) continue;
      continue;
    }
    if (!canSpawnEntity(s)) continue;
    const isWorker = (def.roles & Role.Worker) !== 0;
    const node = isWorker
      ? nearest(s, e.x[i]!, e.y[i]!, (sl) => canPlayerGatherTargetSlot(s, owner, sl))
      : NONE;

    // Exit position: a step toward the work (symmetric across bases), else +y.
    let sx = e.x[i]!;
    let sy = e.y[i]! + EXIT;
    if (node !== NONE) {
      const dx = e.x[node]! - e.x[i]!;
      const dy = e.y[node]! - e.y[i]!;
      const d = isqrt(dx * dx + dy * dy) || 1;
      sx = e.x[i]! + Math.trunc((dx * EXIT) / d);
      sy = e.y[i]! + Math.trunc((dy * EXIT) / d);
    }

    const id = trySpawnUnit(s, kind, owner, sx, sy);
    if (id === NONE) continue;
    const slot = slotOf(id);
    applyRally(s, i, slot, owner, effectiveSpeed(s, e, slot, def.speed), rallyMoves);

    // Dequeue the next unit, or go idle.
    if (e.prodQueued[i]! > 0) {
      e.prodQueued[i] = e.prodQueued[i]! - 1;
      e.prodTimer[i] = def.buildTime;
    } else {
      e.prodKind[i] = Kind.None;
    }
  }
  assignRallyMoveSlots(s, rallyMoves);
};
