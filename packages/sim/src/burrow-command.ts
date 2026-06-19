import type { Command } from './commands.ts';
import { canBurrowSlot, hasBurrowAccess } from './burrow.ts';
import { isContained } from './cargo.ts';
import { isDisabled } from './systems/status.ts';
import type { State } from './entity/world.ts';
import { reject, rejectMissingOwnedSlot, ownedSlot, type CommandValidation } from './command-validation.ts';

type BurrowCommand = Extract<Command, { t: 'burrow' }>;

export const validateBurrowCommand = (s: State, player: number, command: BurrowCommand): CommandValidation => {
  const e = s.e;
  const slot = ownedSlot(s, command.unit, player);
  if (slot === null) return rejectMissingOwnedSlot(s, command.unit);
  if (isContained(s, slot) || isDisabled(e, slot) || e.illusion[slot] === 1) return reject('missing-capability');
  if (!canBurrowSlot(s, slot)) return reject('missing-capability');
  if (!hasBurrowAccess(s, player, e.kind[slot]!)) return reject('missing-requirement');
  if ((e.burrowed[slot] === 1) === command.active) return reject('target-not-allowed');
  return { ok: true };
};
