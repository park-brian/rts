import type { Command } from './commands.ts';
import { Role } from './data.ts';
import { isContained } from './cargo.ts';
import { canPlayerGatherTargetSlot } from './resource-targets.ts';
import { isDisabled } from './systems/status.ts';
import type { State } from './world.ts';
import { isAlive, slotOf } from './world.ts';
import { reject, rejectMissingOwnedSlot, ownedSlot, type CommandValidation } from './command-validation.ts';

type HarvestCommand = Extract<Command, { t: 'harvest' }>;

export const validateHarvestCommand = (s: State, player: number, command: HarvestCommand): CommandValidation => {
  const e = s.e;
  const slot = ownedSlot(s, command.unit, player);
  if (slot === null) return rejectMissingOwnedSlot(s, command.unit);
  if (isContained(s, slot) || e.burrowed[slot] === 1 || e.illusion[slot] === 1) return reject('missing-capability');
  if (isDisabled(e, slot)) return reject('missing-capability');
  if ((e.flags[slot]! & Role.Worker) === 0) return reject('missing-capability');
  if (!isAlive(e, command.patch)) return reject('target-not-found');
  const target = slotOf(command.patch);
  if (!canPlayerGatherTargetSlot(s, player, target)) return reject('target-not-allowed');
  return { ok: true };
};
