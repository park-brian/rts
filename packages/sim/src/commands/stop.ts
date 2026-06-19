import type { Command } from './types.ts';
import { Order, Role } from '../data/index.ts';
import { isContained } from '../mechanics/cargo.ts';
import type { State } from '../entity/world.ts';
import { NONE, slotOf } from '../entity/world.ts';
import { clearVelocity } from '../spatial/motion.ts';
import {
  cancelPendingBeforeOrder,
  clearSettled,
  ownedSlot,
  reject,
  rejectMissingOwnedSlot,
  type CommandValidation,
} from './shared.ts';

type StopCommand = Extract<Command, { t: 'stop' }>;

export const validateStopCommand = (s: State, player: number, command: StopCommand): CommandValidation => {
  const e = s.e;
  const slot = ownedSlot(s, command.unit, player);
  if (slot === null) return rejectMissingOwnedSlot(s, command.unit);
  if (isContained(s, slot)) return reject('missing-capability');
  if ((e.flags[slot]! & Role.Mobile) === 0 && e.order[slot] !== Order.Build) return reject('missing-capability');
  return { ok: true };
};

export const applyStopCommand = (s: State, command: StopCommand): void => {
  const e = s.e;
  const slot = slotOf(command.unit);
  cancelPendingBeforeOrder(s, slot);
  clearSettled(s, slot);
  clearVelocity(e, slot);
  e.order[slot] = Order.Idle;
  e.target[slot] = NONE;
  e.intentTarget[slot] = NONE;
  e.combatTarget[slot] = NONE;
};
