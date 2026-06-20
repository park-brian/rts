import type { Command } from './types.ts';
import { canBurrowSlot, hasBurrowAccess } from '../mechanics/burrow.ts';
import { isContained } from '../mechanics/cargo.ts';
import { isDisabled } from '../mechanics/status.ts';
import { isModeTransitioning } from '../entity/state.ts';
import type { State } from '../entity/world.ts';
import { slotOf } from '../entity/world.ts';
import { startBurrowTransition } from '../mechanics/mode-transition.ts';
import { reject, rejectMissingOwnedSlot, ownedSlot, type CommandValidation } from './shared.ts';

type BurrowCommand = Extract<Command, { t: 'burrow' }>;

export const validateBurrowCommand = (s: State, player: number, command: BurrowCommand): CommandValidation => {
  const e = s.e;
  const slot = ownedSlot(s, command.unit, player);
  if (slot === null) return rejectMissingOwnedSlot(s, command.unit);
  if (isContained(s, slot) || isDisabled(e, slot) || e.illusion[slot] === 1) return reject('missing-capability');
  if (isModeTransitioning(s, slot)) return reject('missing-capability');
  if (!canBurrowSlot(s, slot)) return reject('missing-capability');
  if (!hasBurrowAccess(s, player, e.kind[slot]!)) return reject('missing-requirement');
  if ((e.burrowed[slot] === 1) === command.active) return reject('target-not-allowed');
  return { ok: true };
};

export const applyBurrowCommand = (s: State, command: BurrowCommand): void => {
  startBurrowTransition(s, slotOf(command.unit), command.active);
};
