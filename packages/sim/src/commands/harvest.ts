import type { Command } from './types.ts';
import { Role } from '../data/index.ts';
import { canPlayerGatherTargetSlot } from '../mechanics/resources.ts';
import type { State } from '../entity/world.ts';
import { isAlive, slotOf } from '../entity/world.ts';
import {
  canReceiveOrder,
  cancelPendingBeforeOrder,
  clearSettled,
  reject,
  type CommandValidation,
} from './shared.ts';
import { canQueueOrder, currentOrderIsIdle, enqueueHarvestOrder, setCurrentHarvestOrder } from '../entity/order-queue.ts';

type HarvestCommand = Extract<Command, { t: 'harvest' }>;

export const validateHarvestCommand = (s: State, player: number, command: HarvestCommand): CommandValidation => {
  const e = s.e;
  const actor = canReceiveOrder(s, player, command.unit, { rejectBurrowed: true, rejectIllusion: true });
  if (!actor.ok) return actor;
  const slot = actor.slot;
  if ((e.flags[slot]! & Role.Worker) === 0) return reject('missing-capability');
  if (!isAlive(e, command.patch)) return reject('target-not-found');
  const target = slotOf(command.patch);
  if (!canPlayerGatherTargetSlot(s, player, target)) return reject('target-not-allowed');
  if (command.queue === true && !currentOrderIsIdle(e, slot) && !canQueueOrder(e, slot)) return reject('queue-full');
  return { ok: true };
};

export const applyHarvestCommand = (s: State, command: HarvestCommand): void => {
  const e = s.e;
  const slot = slotOf(command.unit);
  const append = command.queue === true && !currentOrderIsIdle(e, slot);
  if (!append) cancelPendingBeforeOrder(s, slot);
  clearSettled(s, slot);
  if (append) {
    enqueueHarvestOrder(s, slot, command.patch);
  } else {
    setCurrentHarvestOrder(s, slot, command.patch);
  }
};
