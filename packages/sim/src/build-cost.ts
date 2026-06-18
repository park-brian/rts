import type { Entities, State } from './world.ts';
import { NONE, eid, isAlive, kill, slotOf } from './world.ts';
import { Kind, Order } from './data.ts';
import { setEntityKind } from './entity-kind.ts';

export const hasPendingBuild = (e: Entities, slot: number): boolean =>
  e.order[slot] === Order.Build && e.buildKind[slot] !== 0;

export const clearBuildCost = (e: Entities, slot: number): void => {
  e.buildCostMinerals[slot] = 0;
  e.buildCostGas[slot] = 0;
};

export const refundBuildCost = (
  s: State,
  slot: number,
  numerator = 1,
  denominator = 1,
): void => {
  const e = s.e;
  const owner = e.owner[slot]!;
  if (owner >= s.players.minerals.length) {
    clearBuildCost(e, slot);
    return;
  }
  s.players.minerals[owner] = s.players.minerals[owner]! + Math.trunc((e.buildCostMinerals[slot]! * numerator) / denominator);
  s.players.gas[owner] = s.players.gas[owner]! + Math.trunc((e.buildCostGas[slot]! * numerator) / denominator);
  clearBuildCost(e, slot);
};

export const cancelPendingBuild = (s: State, slot: number): void => {
  const e = s.e;
  if (!hasPendingBuild(e, slot)) return;
  refundBuildCost(s, slot);
  e.order[slot] = Order.Idle;
  e.buildKind[slot] = 0;
  e.target[slot] = NONE;
  e.intentTarget[slot] = NONE;
  e.combatTarget[slot] = NONE;
};

export const cancelFoundation = (s: State, slot: number): void => {
  const e = s.e;
  if (e.morphFromKind[slot] !== Kind.None) {
    const original = e.morphFromKind[slot]!;
    refundBuildCost(s, slot, 3, 4);
    setEntityKind(s, slot, original);
    e.built[slot] = 1;
    e.ctimer[slot] = 0;
    e.morphFromKind[slot] = Kind.None;
    e.order[slot] = Order.Idle;
    e.target[slot] = NONE;
    e.intentTarget[slot] = NONE;
    e.combatTarget[slot] = NONE;
    return;
  }
  const workerId = e.target[slot]!;
  if (workerId !== NONE && isAlive(e, workerId)) {
    const worker = slotOf(workerId);
    if (e.order[worker] === Order.Build && e.target[worker] === eid(e, slot)) {
      e.order[worker] = Order.Idle;
      e.target[worker] = NONE;
      e.intentTarget[worker] = NONE;
      e.combatTarget[worker] = NONE;
    }
  }
  if (e.target[slot] !== NONE && isAlive(e, e.target[slot]!)) {
    const parent = slotOf(e.target[slot]!);
    if (e.target[parent] === eid(e, slot)) {
      e.target[parent] = NONE;
      e.intentTarget[parent] = NONE;
      e.combatTarget[parent] = NONE;
    }
  }
  refundBuildCost(s, slot, 3, 4);
  kill(s, slot);
};

export const transferBuildCost = (e: Entities, from: number, to: number): void => {
  e.buildCostMinerals[to] = e.buildCostMinerals[from]!;
  e.buildCostGas[to] = e.buildCostGas[from]!;
  clearBuildCost(e, from);
};
