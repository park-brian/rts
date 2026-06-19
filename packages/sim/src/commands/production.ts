import type { Command } from './types.ts';
import { Kind, MAX_QUEUE, Order, Role, Units, productionCostCount, productionCount } from '../data.ts';
import { canQueueInternalProduct, internalProductCapacity } from '../mechanics/internal-products.ts';
import { requirementsMet } from '../mechanics/requirements.ts';
import type { State } from '../entity/world.ts';
import { canSpawnEntity, NONE, slotOf, type Entities } from '../entity/world.ts';
import { canPay, canUseProducer, reject, type CommandValidation } from './shared.ts';

export type ProductionValidationContext = {
  reservedSupply?: number;
};

type TrainCommand = Extract<Command, { t: 'train' }>;

const queuedProductionCount = (e: Entities, slot: number): number =>
  e.prodKind[slot] === Kind.None ? 0 : 1 + e.prodQueued[slot]!;

const queueProduction = (s: State, slot: number, kind: number, player: number): void => {
  const e = s.e;
  const def = Units[kind];
  if (!def) return;
  const costCount = productionCostCount(kind);
  s.players.minerals[player] = s.players.minerals[player]! - def.minerals * costCount;
  s.players.gas[player] = s.players.gas[player]! - def.gas * costCount;
  if (e.kind[slot] === Kind.Larva) {
    const egg = Units[Kind.Egg]!;
    e.kind[slot] = Kind.Egg;
    e.hp[slot] = egg.hp;
    e.shield[slot] = egg.shields;
    e.energy[slot] = egg.startEnergy;
    e.energyMax[slot] = egg.energyMax;
    e.flags[slot] = egg.roles;
    e.order[slot] = Order.Idle;
    e.target[slot] = NONE;
    e.intentTarget[slot] = NONE;
    e.combatTarget[slot] = NONE;
    e.prodKind[slot] = kind;
    e.prodTimer[slot] = def.buildTime;
    e.prodQueued[slot] = 0;
    return;
  }
  if (e.prodKind[slot] === Kind.None) {
    e.prodKind[slot] = kind;
    e.prodTimer[slot] = def.buildTime;
  } else {
    e.prodQueued[slot] = e.prodQueued[slot]! + 1;
  }
};

export const reserveProductionSupply = (reservedSupply: Int32Array | undefined, player: number, kind: number): void => {
  if (reservedSupply) reservedSupply[player] = reservedSupply[player]! + Units[kind]!.supply * productionCount(kind);
};

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

export const applyTrainCommand = (
  s: State,
  player: number,
  command: TrainCommand,
  reserveSupply?: (kind: number) => void,
): void => {
  queueProduction(s, slotOf(command.building), command.kind, player);
  reserveSupply?.(command.kind);
};
