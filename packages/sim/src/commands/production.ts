import type { Command } from './types.ts';
import { Kind, MAX_QUEUE, Role, Units, productionCostCount, productionCount } from '../data.ts';
import { canQueueInternalProduct, internalProductCapacity } from '../internal-products.ts';
import { requirementsMet } from '../requirements.ts';
import { queuedProductionCount } from '../production-queue.ts';
import type { State } from '../entity/world.ts';
import { canSpawnEntity } from '../entity/world.ts';
import { canPay, canUseProducer, reject, type CommandValidation } from './shared.ts';

export type ProductionValidationContext = {
  reservedSupply?: number;
};

type TrainCommand = Extract<Command, { t: 'train' }>;

export const validateTrainCommand = (
  s: State,
  player: number,
  command: TrainCommand,
  ctx: ProductionValidationContext = {},
): CommandValidation => {
  const e = s.e;
  const producer = canUseProducer(s, player, command.building, {
    role: Role.Producer,
    requireBuilt: true,
    rejectIllusion: true,
    requireActiveAddon: true,
    requirePowered: true,
  });
  if (!producer.ok) return producer;
  const { slot } = producer;
  const def = Units[command.kind];
  const building = Units[e.kind[slot]!];
  if (!def || !building || !building.produces.includes(command.kind)) return reject('target-not-allowed');
  if (!requirementsMet(s, player, def.requires)) return reject('missing-requirement');
  const queued = queuedProductionCount(e, slot);
  const internalCapacity = internalProductCapacity(s, slot, command.kind);
  if (internalCapacity > 0 && !canQueueInternalProduct(s, slot, command.kind, queued)) return reject('queue-full');
  if (queued >= MAX_QUEUE) return reject('queue-full');
  const entityCount = internalCapacity > 0
    ? 0
    : e.kind[slot] === Kind.Larva
      ? Math.max(0, productionCount(command.kind) - 1)
      : 1;
  if (entityCount > 0 && !canSpawnEntity(s, entityCount)) return reject('capacity-full');
  const costCount = productionCostCount(command.kind);
  const payment = canPay(s, player, { minerals: def.minerals * costCount, gas: def.gas * costCount });
  if (!payment.ok) return payment;
  const used = ctx.reservedSupply ?? s.players.supplyUsed[player]!;
  if (used + def.supply * productionCount(command.kind) > s.players.supplyMax[player]!) return reject('supply-blocked');
  return { ok: true };
};
