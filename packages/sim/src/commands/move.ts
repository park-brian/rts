import type { Command } from './types.ts';
import { Kind, Role } from '../data.ts';
import { isContained, sameTeam } from '../cargo.ts';
import { commandMoveSpeed } from '../terran-mobility.ts';
import { isGatherTargetSlot } from '../mechanics/resources.ts';
import type { State } from '../entity/world.ts';
import { isAlive, slotOf } from '../entity/world.ts';
import { issueTravelOrder } from '../travel-intent.ts';
import {
  canReceiveOrder,
  cancelPendingBeforeOrder,
  clearSettled,
  reject,
  type CommandValidation,
} from './shared.ts';

type MoveCommand = Extract<Command, { t: 'move' | 'amove' }>;
export type MoveDestination = { x: number; y: number; target?: number };

export const validateMoveCommand = (s: State, player: number, command: MoveCommand): CommandValidation => {
  const e = s.e;
  const actor = canReceiveOrder(s, player, command.unit, { rejectBurrowed: true });
  if (!actor.ok) return actor;
  const slot = actor.slot;
  if (e.kind[slot] === Kind.SpiderMine) return reject('missing-capability');
  if ((e.flags[slot]! & Role.Mobile) === 0 || commandMoveSpeed(e.kind[slot]!, e.flags[slot]!) <= 0) {
    return reject('missing-capability');
  }
  if (command.t === 'move' && command.target !== undefined) {
    if (!isAlive(e, command.target)) return reject('target-not-found');
    const target = slotOf(command.target);
    if (target === slot || isContained(s, target) || !sameTeam(s, player, e.owner[target]!)) {
      return reject('target-not-allowed');
    }
    if (isGatherTargetSlot(s, target)) return reject('target-not-allowed');
  }
  return { ok: true };
};

export const applyMoveCommand = (
  s: State,
  command: MoveCommand,
  destination: MoveDestination,
): void => {
  const slot = slotOf(command.unit);
  cancelPendingBeforeOrder(s, slot);
  clearSettled(s, slot);
  issueTravelOrder(s, slot, destination, command.t === 'amove' ? 'attack-move' : 'move');
};
