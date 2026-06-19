import { Kind, Order, Role, Units, isLarvaSourceKind, productionCount } from '../../data.ts';
import type { State } from '../../entity/world.ts';
import { canSpawnEntity, nearest, NONE, slotOf } from '../../entity/world.ts';
import { trySpawnUnit } from '../../entity/factory.ts';
import { fx, isqrt } from '../../fixed.ts';
import { canPlayerGatherTargetSlot } from '../../mechanics/resources.ts';
import { effectiveSpeed } from '../status.ts';
import { applySpawnRally, type RallyMove } from './rally.ts';
import { finishCurrentProduction } from './queue.ts';

const EXIT = fx(40); // how far from a structure produced units appear

const nearestProducerForRally = (s: State, slot: number, owner: number): number =>
  nearest(s, s.e.x[slot]!, s.e.y[slot]!, (sl) => s.e.owner[sl] === owner && isLarvaSourceKind(s.e.kind[sl]!));

export const finishEgg = (s: State, slot: number, kind: number, rallyMoves: RallyMove[]): boolean => {
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

export const finishProducedUnit = (
  s: State,
  producer: number,
  kind: number,
  rallyMoves: RallyMove[],
): boolean => {
  if (!canSpawnEntity(s)) return false;

  const e = s.e;
  const def = Units[kind]!;
  const owner = e.owner[producer]!;
  const node = (def.roles & Role.Worker) !== 0
    ? nearest(s, e.x[producer]!, e.y[producer]!, (sl) => canPlayerGatherTargetSlot(s, owner, sl))
    : NONE;

  let sx = e.x[producer]!;
  let sy = e.y[producer]! + EXIT;
  if (node !== NONE) {
    const dx = e.x[node]! - e.x[producer]!;
    const dy = e.y[node]! - e.y[producer]!;
    const d = isqrt(dx * dx + dy * dy) || 1;
    sx = e.x[producer]! + Math.trunc((dx * EXIT) / d);
    sy = e.y[producer]! + Math.trunc((dy * EXIT) / d);
  }

  const id = trySpawnUnit(s, kind, owner, sx, sy);
  if (id === NONE) return false;
  const slot = slotOf(id);
  applySpawnRally(s, producer, slot, owner, effectiveSpeed(s, e, slot, def.speed), rallyMoves);
  finishCurrentProduction(s, producer, kind);
  return true;
};
