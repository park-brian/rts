import type { Command } from './types.ts';
import { Kind, Order, Role } from '../data/index.ts';
import type { State } from '../entity/world.ts';
import { NONE, slotOf } from '../entity/world.ts';
import { clearVelocity } from '../spatial/motion.ts';
import {
  canReceiveOrder,
  cancelPendingBeforeOrder,
  clearSettled,
  reject,
  type CommandValidation,
} from './shared.ts';

type HoldCommand = Extract<Command, { t: 'hold' }>;

export const validateHoldCommand = (s: State, player: number, command: HoldCommand): CommandValidation => {
  const e = s.e;
  const actor = canReceiveOrder(s, player, command.unit);
  if (!actor.ok) return actor;
  const slot = actor.slot;
  if (e.kind[slot] === Kind.SpiderMine || (e.flags[slot]! & Role.Mobile) === 0) return reject('missing-capability');
  return { ok: true };
};

export const applyHoldCommand = (s: State, command: HoldCommand): void => {
  const e = s.e;
  const slot = slotOf(command.unit);
  cancelPendingBeforeOrder(s, slot);
  clearSettled(s, slot);
  clearVelocity(e, slot);
  e.order[slot] = Order.Hold;
  e.target[slot] = NONE;
  e.intentTarget[slot] = NONE;
  e.combatTarget[slot] = NONE;
};
