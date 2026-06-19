import type { Command } from './commands.ts';
import { Kind, Role } from './data.ts';
import type { State } from './entity/world.ts';
import { reject, rejectMissingOwnedSlot, ownedSlot, type CommandValidation } from './command-validation.ts';

type CancelBuildCommand = Extract<Command, { t: 'cancelBuild' }>;

export const validateCancelBuildCommand = (s: State, player: number, command: CancelBuildCommand): CommandValidation => {
  const e = s.e;
  const slot = ownedSlot(s, command.building, player);
  if (slot === null) return rejectMissingOwnedSlot(s, command.building);
  if (e.morphFromKind[slot] !== Kind.None) return { ok: true };
  if ((e.flags[slot]! & Role.Structure) === 0 || e.built[slot] === 1 ||
      (e.buildCostMinerals[slot] === 0 && e.buildCostGas[slot] === 0)) {
    return reject('target-not-allowed');
  }
  return { ok: true };
};
