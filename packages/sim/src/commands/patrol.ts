import { Kind, Order, Role } from '../data/index.ts';
import { canQueueOrder, currentOrderIsIdle, enqueueTravelOrder } from '../entity/order-queue.ts';
import { setPatrolOrder } from '../entity/patrol.ts';
import type { State } from '../entity/world.ts';
import { slotOf } from '../entity/world.ts';
import { commandMoveSpeed } from '../mechanics/terran-mobility.ts';
import {
  canReceiveOrder,
  cancelPendingBeforeOrder,
  reject,
  type CommandValidation,
} from './shared.ts';
import type { Command } from './types.ts';

type PatrolCommand = Extract<Command, { t: 'patrol' }>;

export const validatePatrolCommand = (s: State, player: number, command: PatrolCommand): CommandValidation => {
  const e = s.e;
  const actor = canReceiveOrder(s, player, command.unit, { rejectBurrowed: true });
  if (!actor.ok) return actor;
  const slot = actor.slot;
  if (e.kind[slot] === Kind.SpiderMine) return reject('missing-capability');
  if ((e.flags[slot]! & Role.Mobile) === 0 || commandMoveSpeed(e.kind[slot]!, e.flags[slot]!) <= 0) {
    return reject('missing-capability');
  }
  if (command.queue === true && !currentOrderIsIdle(e, slot) && !canQueueOrder(e, slot)) return reject('queue-full');
  return { ok: true };
};

export const applyPatrolCommand = (s: State, command: PatrolCommand): void => {
  const slot = slotOf(command.unit);
  if (command.queue === true && !currentOrderIsIdle(s.e, slot)) {
    enqueueTravelOrder(s, slot, Order.Patrol, command.x, command.y);
    return;
  }
  cancelPendingBeforeOrder(s, slot);
  setPatrolOrder(s, slot, command.x, command.y);
};
