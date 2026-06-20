import { Kind, Order, Role, Trait, Units, unitTraits } from '../data/index.ts';
import type { State } from '../entity/world.ts';
import { NONE, eid } from '../entity/world.ts';

type Cost = { minerals: number; gas: number };

const repairSourceKind = (kind: number): number => {
  switch (kind) {
    case Kind.SiegeTankSieged: return Kind.SiegeTank;
    default: return kind;
  }
};

const repairSourceDef = (kind: number) => Units[repairSourceKind(kind)] ?? Units[kind];

export const repairDuration = (kind: number): number => {
  const source = repairSourceDef(kind);
  const def = Units[kind];
  return Math.max(1, source?.buildTime || def?.buildTime || def?.hp || 1);
};

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

const cumulativeCost = (totalCost: number, hp: number, maxHp: number): number =>
  Math.ceil((totalCost * Math.max(0, Math.min(maxHp, hp))) / Math.max(1, maxHp * 4));

/**
 * Cost for an HP interval. Using cumulative thresholds makes a full 0->max
 * repair cost exactly 25% of the unit's resource cost, without overcharging
 * slow repairs that restore only one integer HP on a tick.
 */
export const repairCostDelta = (kind: number, beforeHp: number, afterHp: number): Cost => {
  const source = repairSourceDef(kind);
  const def = Units[kind];
  if (!source || !def || afterHp <= beforeHp) return { minerals: 0, gas: 0 };
  const before = Math.max(0, Math.min(def.hp, beforeHp));
  const after = Math.max(before, Math.min(def.hp, afterHp));
  return {
    minerals: cumulativeCost(source.minerals, after, def.hp) - cumulativeCost(source.minerals, before, def.hp),
    gas: cumulativeCost(source.gas, after, def.hp) - cumulativeCost(source.gas, before, def.hp),
  };
};

export const repairCost = (kind: number, hp: number): Cost => {
  const def = Units[kind];
  if (!def || hp <= 0) return { minerals: 0, gas: 0 };
  return repairCostDelta(kind, 0, hp);
};

export const nextRepairCost = (kind: number, currentHp: number): Cost => {
  const def = Units[kind];
  if (!def || currentHp >= def.hp) return { minerals: 0, gas: 0 };
  for (let hp = currentHp + 1; hp <= def.hp; hp++) {
    const cost = repairCostDelta(kind, currentHp, hp);
    if (cost.minerals > 0 || cost.gas > 0 || hp === def.hp) return cost;
  }
  return { minerals: 0, gas: 0 };
};

export const repairTick = (kind: number, accumulator: number): { hp: number; accumulator: number } => {
  const def = Units[kind];
  if (!def || def.hp <= 0) return { hp: 0, accumulator: 0 };
  const total = repairDuration(kind);
  const next = Math.max(0, accumulator) + def.hp;
  return { hp: Math.trunc(next / total), accumulator: next % total };
};

export const resumeConstruction = (s: State, worker: number, foundation: number): void => {
  const e = s.e;
  const foundationId = eid(e, foundation);
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
