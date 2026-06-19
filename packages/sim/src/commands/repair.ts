import type { Command } from './types.ts';
import { Kind, Order, Units } from '../data.ts';
import { isContained } from '../cargo.ts';
import {
  REPAIR_RATE,
  canContinueConstructionKind,
  isRepairableKind,
  repairCost,
  resumeConstruction,
} from '../repair.ts';
import type { State } from '../entity/world.ts';
import { NONE, isAlive, isEnemy, slotOf } from '../entity/world.ts';
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
  const def = Units[e.kind[target]!];
  if (def && e.built[target] !== 1 && canContinueConstructionKind(e.kind[target]!)) return { ok: true };
  if (!def || e.built[target] !== 1 || !isRepairableKind(e.kind[target]!) || e.hp[target]! >= def.hp) return reject('target-not-allowed');
  const cost = repairCost(e.kind[target]!, Math.min(REPAIR_RATE, def.hp - e.hp[target]!));
  return canPay(s, player, cost);
};

export const applyRepairCommand = (s: State, command: RepairCommand): void => {
  const e = s.e;
  const slot = slotOf(command.unit);
  cancelPendingBeforeOrder(s, slot);
  clearSettled(s, slot);
  e.intentTarget[slot] = NONE;
  e.combatTarget[slot] = NONE;
  const target = slotOf(command.target);
  if (e.built[target] !== 1 && canContinueConstructionKind(e.kind[target]!)) {
    resumeConstruction(s, slot, target);
  } else {
    e.order[slot] = Order.Repair;
    e.target[slot] = command.target;
    e.timer[slot] = 0;
  }
};
