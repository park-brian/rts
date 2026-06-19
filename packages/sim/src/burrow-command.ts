import type { Command, CommandRejectReason } from './commands.ts';
import { canBurrowSlot, hasBurrowAccess } from './burrow.ts';
import { isContained } from './cargo.ts';
import { isDisabled } from './systems/status.ts';
import type { State } from './world.ts';
import { isAlive, slotOf } from './world.ts';

type CommandValidation =
  | { ok: true }
  | { ok: false; reason: CommandRejectReason };

type BurrowCommand = Extract<Command, { t: 'burrow' }>;

const reject = (reason: CommandRejectReason): CommandValidation => ({ ok: false, reason });

const ownedSlot = (s: State, id: number, player: number): number | null => {
  const e = s.e;
  if (!isAlive(e, id)) return null;
  const slot = slotOf(id);
  return e.owner[slot] === player ? slot : null;
};

export const validateBurrowCommand = (s: State, player: number, command: BurrowCommand): CommandValidation => {
  const e = s.e;
  const slot = ownedSlot(s, command.unit, player);
  if (slot === null) return isAlive(e, command.unit) ? reject('wrong-owner') : reject('stale-entity');
  if (isContained(s, slot) || isDisabled(e, slot) || e.illusion[slot] === 1) return reject('missing-capability');
  if (!canBurrowSlot(s, slot)) return reject('missing-capability');
  if (!hasBurrowAccess(s, player, e.kind[slot]!)) return reject('missing-requirement');
  if ((e.burrowed[slot] === 1) === command.active) return reject('target-not-allowed');
  return { ok: true };
};
