// Production: structures with an in-progress unit count down and, on completion,
// spawn it and dequeue the next. Supply is derived by the census system, so this
// system does no supply bookkeeping. Race-agnostic: a produced *worker* (by role)
// auto-mines the nearest *resource* (by role).

import type { State } from '../../entity/world.ts';
import { canSpawnEntity, nearest, slotOf, NONE } from '../../entity/world.ts';
import { trySpawnUnit } from '../../entity/factory.ts';
import { Kind, Order, Role, Units, isLarvaSourceKind, productionCount } from '../../data.ts';
import { fx, isqrt } from '../../fixed.ts';
import { effectiveSpeed } from '../status.ts';
import { isPowered } from '../../power.ts';
import { isLiftedStructureFlags } from '../../terran-mobility.ts';
import { activeAddonParentSlot, isAddonKind } from '../../addon.ts';
import { canPlayerGatherTargetSlot } from '../../resource-targets.ts';
import { tickLarvae } from './larva.ts';
import { applySpawnRally, assignRallyMoveSlots, type RallyMove } from './rally.ts';
import { finishInternalProductQueue } from './internal-products.ts';

const EXIT = fx(40); // how far from a structure produced units appear

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
  if (rally !== NONE) applySpawnRally(s, rally, slot, owner, effectiveSpeed(s, e, slot, def.speed), rallyMoves);

  for (let n = 1; n < count; n++) {
    const id = trySpawnUnit(s, kind, owner, e.x[slot]! + fx(12 * n), e.y[slot]!);
    if (id === NONE) return true;
    const extra = slotOf(id);
    if (rally !== NONE) applySpawnRally(s, rally, extra, owner, effectiveSpeed(s, e, extra, def.speed), rallyMoves);
  }
  return true;
};

export const production = (s: State): void => {
  const e = s.e;
  const rallyMoves: RallyMove[] = [];
  tickLarvae(s);
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
    if (finishInternalProductQueue(s, i, kind)) continue;
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
    applySpawnRally(s, i, slot, owner, effectiveSpeed(s, e, slot, def.speed), rallyMoves);

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
