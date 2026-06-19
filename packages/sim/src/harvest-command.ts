import type { Command } from './commands.ts';
import { Role } from './data.ts';
import { canPlayerGatherTargetSlot } from './resource-targets.ts';
import type { State } from './entity/world.ts';
import { isAlive, slotOf } from './entity/world.ts';
import { canReceiveOrder, reject, type CommandValidation } from './command-validation.ts';

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
