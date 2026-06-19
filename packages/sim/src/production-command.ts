import type { Command, CommandRejectReason } from './commands.ts';
import { Kind, MAX_QUEUE, Role, Units, productionCostCount, productionCount } from './data.ts';
import { canQueueInternalProduct, internalProductCapacity } from './internal-products.ts';
import { requirementsMet } from './requirements.ts';
import { isActiveAddon } from './addon.ts';
import { isPowered } from './power.ts';
import { queuedProductionCount } from './production-queue.ts';
import type { State } from './world.ts';
import { canSpawnEntity, isAlive, slotOf } from './world.ts';

type CommandValidation =
  | { ok: true }
  | { ok: false; reason: CommandRejectReason };

export type ProductionValidationContext = {
  reservedSupply?: number;
};

type TrainCommand = Extract<Command, { t: 'train' }>;

const reject = (reason: CommandRejectReason): CommandValidation => ({ ok: false, reason });

const ownedSlot = (s: State, id: number, player: number): number | null => {
  const e = s.e;
  if (!isAlive(e, id)) return null;
  const slot = slotOf(id);
  return e.owner[slot] === player ? slot : null;
};

export const validateTrainCommand = (
  s: State,
  player: number,
  command: TrainCommand,
  ctx: ProductionValidationContext = {},
): CommandValidation => {
  const e = s.e;
  const slot = ownedSlot(s, command.building, player);
  if (slot === null) return isAlive(e, command.building) ? reject('wrong-owner') : reject('stale-entity');
  if (e.illusion[slot] === 1) return reject('missing-capability');
  if ((e.flags[slot]! & Role.Producer) === 0) return reject('missing-capability');
  if (e.built[slot] !== 1) return reject('incomplete-producer');
  if (!isActiveAddon(s, slot)) return reject('missing-capability');
  if (!isPowered(s, slot)) return reject('missing-capability');
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
  if (s.players.minerals[player]! < def.minerals * costCount || s.players.gas[player]! < def.gas * costCount) {
    return reject('not-affordable');
  }
  const used = ctx.reservedSupply ?? s.players.supplyUsed[player]!;
  if (used + def.supply * productionCount(command.kind) > s.players.supplyMax[player]!) return reject('supply-blocked');
  return { ok: true };
};
