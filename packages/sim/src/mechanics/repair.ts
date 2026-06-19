import { Kind, Order, Role, Trait, Units, unitTraits } from '../data.ts';
import type { State } from '../entity/world.ts';
import { NONE, eid, isAlive, slotOf } from '../entity/world.ts';

export const REPAIR_RATE = 4;

export const isRepairableKind = (kind: number): boolean => {
  const def = Units[kind];
  if (!def) return false;
  return kind === Kind.SCV ||
    (unitTraits(kind) & Trait.Mechanical) !== 0 ||
    (def.race === 'terran' && (def.roles & Role.Structure) !== 0);
};

export const canContinueConstructionKind = (kind: number): boolean => {
  const def = Units[kind];
  return !!def && def.race === 'terran' && (def.roles & Role.Structure) !== 0 && def.buildMethod === 'worker';
};

export const repairCost = (kind: number, hp: number): { minerals: number; gas: number } => {
  const def = Units[kind];
  if (!def || hp <= 0) return { minerals: 0, gas: 0 };
  const denom = Math.max(1, def.hp * 3);
  return {
    minerals: Math.ceil((def.minerals * hp) / denom),
    gas: Math.ceil((def.gas * hp) / denom),
  };
};

export const resumeConstruction = (s: State, worker: number, foundation: number): void => {
  const e = s.e;
  const foundationId = eid(e, foundation);
  const old = e.target[foundation]!;
  if (old !== NONE && isAlive(e, old)) {
    const oldWorker = slotOf(old);
    if (e.order[oldWorker] === Order.Build && e.target[oldWorker] === foundationId) {
      e.order[oldWorker] = Order.Idle;
      e.target[oldWorker] = NONE;
      e.intentTarget[oldWorker] = NONE;
      e.combatTarget[oldWorker] = NONE;
    }
  }
  e.order[worker] = Order.Build;
  e.buildKind[worker] = Kind.None;
  e.target[worker] = foundationId;
  e.intentTarget[worker] = NONE;
  e.combatTarget[worker] = NONE;
  e.target[foundation] = eid(e, worker);
  e.tx[worker] = e.x[foundation]!;
  e.ty[worker] = e.y[foundation]!;
  e.timer[worker] = 0;
};
