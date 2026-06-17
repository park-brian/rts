// Production: structures with an in-progress unit count down and, on completion,
// spawn it and dequeue the next. Supply is derived by the census system, so this
// system does no supply bookkeeping. Race-agnostic: a produced *worker* (by role)
// auto-mines the nearest *resource* (by role).

import type { State } from '../world.ts';
import { nearest, eid, slotOf, NONE } from '../world.ts';
import { spawnUnit } from '../factory.ts';
import { Kind, Order, ResourceType, Role, Units, isLarvaSourceKind, productionCount, sec } from '../data.ts';
import { fx, isqrt } from '../fixed.ts';
import { pickPatch, isResource } from './harvest.ts';
import { effectiveSpeed } from './status.ts';
import { isPowered } from '../power.ts';
import { isLiftedStructureFlags } from '../terran-mobility.ts';
import { internalAmmoCapacity } from '../derived.ts';
import { resolveRallyEndpoint } from '../rally.ts';
import { LARVA_MAX, countLarvae } from '../larva.ts';

const EXIT = fx(40); // how far from a structure produced units appear
const LARVA_INTERVAL = sec(15);
const LARVA_OFFSETS: readonly [number, number][] = [
  [-32, 28], [0, 36], [32, 28],
];

/** Direct a freshly produced unit per its producer's rally (default worker = auto-mine). */
const applyRally = (s: State, producer: number, slot: number, owner: number, isWorker: boolean, speed: number): void => {
  const e = s.e;
  const rally = resolveRallyEndpoint(s, producer, slot);
  const target = rally?.target ?? NONE;
  const targetIsResource = target !== NONE && isResource(e, eid(e, target));
  if (isWorker && targetIsResource) {
    const def = Units[e.kind[target]!]!;
    if (def.resourceType === ResourceType.Gas) {
      e.order[slot] = Order.Harvest;
      e.target[slot] = eid(e, target);
      return;
    }
    const np = pickPatch(s, slot, owner, speed, rally!.x, rally!.y);
    if (np !== NONE) { e.order[slot] = Order.Harvest; e.target[slot] = eid(e, np); }
  } else if (isWorker && !rally) {
    const np = pickPatch(s, slot, owner, speed, e.x[slot]!, e.y[slot]!);
    if (np !== NONE) { e.order[slot] = Order.Harvest; e.target[slot] = eid(e, np); }
  } else if (rally) {
    e.order[slot] = Order.Move;
    e.target[slot] = NONE;
    e.tx[slot] = rally.x;
    e.ty[slot] = rally.y;
  }
};

const nearestProducerForRally = (s: State, slot: number, owner: number): number =>
  nearest(s, s.e.x[slot]!, s.e.y[slot]!, (sl) => s.e.owner[sl] === owner && isLarvaSourceKind(s.e.kind[sl]!));

const finishEgg = (s: State, slot: number, kind: number): void => {
  const e = s.e;
  const def = Units[kind]!;
  const owner = e.owner[slot]!;
  const rally = nearestProducerForRally(s, slot, owner);
  e.kind[slot] = kind;
  e.hp[slot] = def.hp;
  e.shield[slot] = def.shields;
  e.energyMax[slot] = def.energyMax;
  e.energy[slot] = def.startEnergy;
  e.flags[slot] = def.roles;
  e.order[slot] = Order.Idle;
  e.target[slot] = NONE;
  e.prodKind[slot] = Kind.None;
  e.prodTimer[slot] = 0;
  e.prodQueued[slot] = 0;
  const isWorker = (def.roles & Role.Worker) !== 0;
  if (rally !== NONE) applyRally(s, rally, slot, owner, isWorker, effectiveSpeed(s, e, slot, def.speed));

  for (let n = 1; n < productionCount(kind); n++) {
    const id = spawnUnit(s, kind, owner, e.x[slot]! + fx(12 * n), e.y[slot]!);
    const extra = slotOf(id);
    if (rally !== NONE) applyRally(s, rally, extra, owner, isWorker, effectiveSpeed(s, e, extra, def.speed));
  }
};

const spawnLarva = (s: State, hatch: number, index: number): void => {
  const e = s.e;
  const [dx, dy] = LARVA_OFFSETS[index % LARVA_OFFSETS.length]!;
  spawnUnit(s, Kind.Larva, e.owner[hatch]!, e.x[hatch]! + fx(dx), e.y[hatch]! + fx(dy));
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
    spawnLarva(s, i, n);
    e.timer[i] = LARVA_INTERVAL;
  }
};

const finishInternalAmmo = (s: State, producer: number, kind: number): boolean => {
  const e = s.e;
  const capacity = internalAmmoCapacity(s, producer, kind);
  if (capacity <= 0) return false;
  e.specialAmmo[producer] = Math.min(capacity, e.specialAmmo[producer]! + 1);
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
  larvae(s);
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.built[i] !== 1 || e.prodKind[i] === Kind.None) continue;
    if (e.kind[i] !== Kind.Egg && isLiftedStructureFlags(e.flags[i]!)) continue;
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
      finishEgg(s, i, kind);
      continue;
    }
    const isWorker = (def.roles & Role.Worker) !== 0;
    const node = isWorker
      ? nearest(s, e.x[i]!, e.y[i]!, (sl) => (e.flags[sl]! & Role.Resource) !== 0)
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

    const id = spawnUnit(s, kind, owner, sx, sy);
    const slot = slotOf(id);
    applyRally(s, i, slot, owner, isWorker, effectiveSpeed(s, e, slot, def.speed));

    // Dequeue the next unit, or go idle.
    if (e.prodQueued[i]! > 0) {
      e.prodQueued[i] = e.prodQueued[i]! - 1;
      e.prodTimer[i] = def.buildTime;
    } else {
      e.prodKind[i] = Kind.None;
    }
  }
};
