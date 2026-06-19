import type { Entities, State } from '../entity/world.ts';

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
  if (owner < s.players.minerals.length) {
    s.players.minerals[owner] = s.players.minerals[owner]! +
      Math.trunc((e.buildCostMinerals[slot]! * numerator) / denominator);
    s.players.gas[owner] = s.players.gas[owner]! +
      Math.trunc((e.buildCostGas[slot]! * numerator) / denominator);
  }
  clearBuildCost(e, slot);
};

export const transferBuildCost = (e: Entities, from: number, to: number): void => {
  e.buildCostMinerals[to] = e.buildCostMinerals[from]!;
  e.buildCostGas[to] = e.buildCostGas[from]!;
  clearBuildCost(e, from);
};
