import type { Entities, State } from './world.ts';
import { NONE } from './world.ts';
import { Order } from './data.ts';

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
};

export const transferBuildCost = (e: Entities, from: number, to: number): void => {
  e.buildCostMinerals[to] = e.buildCostMinerals[from]!;
  e.buildCostGas[to] = e.buildCostGas[from]!;
  clearBuildCost(e, from);
};
