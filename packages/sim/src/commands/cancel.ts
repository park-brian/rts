import type { Command } from './types.ts';
import { Kind, Role } from '../data/index.ts';
import { cancelFoundation } from '../mechanics/build-cancel.ts';
import type { State } from '../entity/world.ts';
import { slotOf } from '../entity/world.ts';
import { reject, rejectMissingOwnedSlot, ownedSlot, type CommandValidation } from './shared.ts';

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

export const applyCancelBuildCommand = (s: State, command: CancelBuildCommand): void => {
  cancelFoundation(s, slotOf(command.building));
};
