import type { Command } from './types.ts';
import { Order, Role } from '../data.ts';
import { canPlayerGatherTargetSlot } from '../mechanics/resources.ts';
import type { State } from '../entity/world.ts';
import { NONE, isAlive, slotOf } from '../entity/world.ts';
import {
  canReceiveOrder,
  cancelPendingBeforeOrder,
  clearSettled,
  reject,
  type CommandValidation,
} from './shared.ts';

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
  return { ok: true };
};

export const applyHarvestCommand = (s: State, command: HarvestCommand): void => {
  const e = s.e;
  const slot = slotOf(command.unit);
  cancelPendingBeforeOrder(s, slot);
  clearSettled(s, slot);
  e.order[slot] = Order.Harvest;
  e.target[slot] = command.patch;
  e.intentTarget[slot] = NONE;
  e.combatTarget[slot] = NONE;
  e.timer[slot] = 0;
};
