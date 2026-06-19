import {
  NONE,
  Units,
  eid,
  productionCostCount,
  productionCount,
  validateCommand,
  type Command,
  type State,
} from '@rts/sim';
import type { ResourceBudget } from './macro-build.ts';

export type SupplyBudget = { used: number; max: number };

export const maybeQueueTrain = (
  s: State,
  player: number,
  cmds: Command[],
  budget: ResourceBudget,
  supply: SupplyBudget,
  producers: readonly number[],
  usedProducers: Set<number>,
  kind: number,
): number => {
  const def = Units[kind]!;
  const count = productionCount(kind);
  const costCount = productionCostCount(kind);
  const minerals = def.minerals * costCount;
  const gas = def.gas * costCount;
  const supplyUsed = def.supply * count;
  if (budget.minerals < minerals || budget.gas < gas || supply.used + supplyUsed > supply.max) return 0;

  for (const producer of producers) {
    if (producer === NONE) continue;
    if (usedProducers.has(producer)) continue;
    const command: Command = { t: 'train', building: eid(s.e, producer), kind };
    if (!validateCommand(s, player, command, { reservedSupply: supply.used }).ok) continue;
    cmds.push(command);
    usedProducers.add(producer);
    budget.minerals -= minerals;
    budget.gas -= gas;
    supply.used += supplyUsed;
    return count;
  }
  return 0;
};
