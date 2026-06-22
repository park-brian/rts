import type { Command } from './types.ts';
import { Kind, Units } from '../data/index.ts';
import { isContained } from '../mechanics/cargo.ts';
import {
  canContinueConstructionKind,
  isRepairableKind,
  nextRepairCost,
  resumeConstruction,
} from '../mechanics/repair.ts';
import type { State } from '../entity/world.ts';
import { NONE, isAlive, isEnemy, slotOf } from '../entity/world.ts';
import { canQueueOrder, currentOrderIsIdle, enqueueRepairOrder, setCurrentRepairOrder } from '../entity/order-queue.ts';
import {
  canPay,
  canReceiveOrder,
  cancelPendingBeforeOrder,
  clearSettled,
  reject,
  type CommandValidation,
} from './shared.ts';

type RepairCommand = Extract<Command, { t: 'repair' }>;

export const validateRepairCommand = (s: State, player: number, command: RepairCommand): CommandValidation => {
  const e = s.e;
  const actor = canReceiveOrder(s, player, command.unit, { rejectBurrowed: true, rejectIllusion: true });
  if (!actor.ok) return actor;
  const slot = actor.slot;
  if (e.kind[slot] !== Kind.SCV) return reject('missing-capability');
  if (!isAlive(e, command.target)) return reject('target-not-found');
  const target = slotOf(command.target);
  if (isContained(s, target)) return reject('target-not-allowed');
  if (isEnemy(s, player, e.owner[target]!)) return reject('target-not-allowed');
  if (command.queue === true && !currentOrderIsIdle(e, slot) && !canQueueOrder(e, slot)) return reject('queue-full');
  const def = Units[e.kind[target]!];
  if (def && e.built[target] !== 1 && canContinueConstructionKind(e.kind[target]!)) {
    return command.queue === true && !currentOrderIsIdle(e, slot) ? reject('target-not-allowed') : { ok: true };
  }
  if (!def || e.built[target] !== 1 || !isRepairableKind(e.kind[target]!) || e.hp[target]! >= def.hp) return reject('target-not-allowed');
  return canPay(s, player, nextRepairCost(e.kind[target]!, e.hp[target]!));
};

export const applyRepairCommand = (s: State, command: RepairCommand): void => {
  const e = s.e;
  const slot = slotOf(command.unit);
  const append = command.queue === true && !currentOrderIsIdle(e, slot);
  if (!append) cancelPendingBeforeOrder(s, slot);
  clearSettled(s, slot);
  const target = slotOf(command.target);
  if (e.built[target] !== 1 && canContinueConstructionKind(e.kind[target]!)) {
    if (append) return;
    resumeConstruction(s, slot, target);
  } else if (append) {
    enqueueRepairOrder(s, slot, command.target);
  } else {
    setCurrentRepairOrder(s, slot, command.target);
  }
};
