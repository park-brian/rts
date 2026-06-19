import {
  Kind,
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
import type { BotFailureReason } from './macro-intents.ts';

export type SupplyBudget = { used: number; max: number };

const trainValidationFailure = (
  s: State,
  player: number,
  producers: readonly number[],
  usedProducers: Set<number>,
  supplyBudget: SupplyBudget,
  kind: number,
): BotFailureReason | null => {
  for (const producer of producers) {
    if (producer === NONE || usedProducers.has(producer)) continue;
    const result = validateCommand(s, player, { t: 'train', building: eid(s.e, producer), kind }, {
      reservedSupply: supplyBudget.used,
    });
    if (result.ok) return null;
    switch (result.reason) {
      case 'not-affordable': return 'resource-starved';
      case 'supply-blocked': return 'supply-blocked';
      case 'missing-requirement': return 'missing-prerequisite';
      case 'queue-full':
      case 'capacity-full':
      case 'incomplete-producer':
      case 'missing-capability':
        return 'no-production-capacity';
      default:
        break;
    }
  }
  return 'no-producer';
};

export const trainFailureReason = (
  s: State,
  player: number,
  producers: readonly number[],
  usedProducers: Set<number>,
  budget: ResourceBudget,
  supplyBudget: SupplyBudget,
  kind: number,
): BotFailureReason | null => {
  const def = Units[kind]!;
  let producersSeen = 0;
  let producersReady = 0;
  for (const producer of producers) {
    if (producer === NONE) continue;
    producersSeen++;
    if (!usedProducers.has(producer) && s.e.prodKind[producer] === Kind.None) producersReady++;
  }
  if (producersSeen === 0) return def.buildMethod === 'larva' ? 'no-production-capacity' : 'no-producer';
  if (producersReady === 0) return 'no-production-capacity';

  const costCount = productionCostCount(kind);
  const producedCount = productionCount(kind);
  if (budget.minerals < def.minerals * costCount || budget.gas < def.gas * costCount) {
    return 'resource-starved';
  }
  if (supplyBudget.used + def.supply * producedCount > supplyBudget.max) return 'supply-blocked';
  return trainValidationFailure(s, player, producers, usedProducers, supplyBudget, kind);
};

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
