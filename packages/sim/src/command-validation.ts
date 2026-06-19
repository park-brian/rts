import type { CommandRejectReason } from './commands.ts';
import type { State } from './world.ts';
import { isAlive, slotOf } from './world.ts';

export type CommandValidation =
  | { ok: true }
  | { ok: false; reason: CommandRejectReason };

export const reject = (reason: CommandRejectReason): CommandValidation => ({ ok: false, reason });

export const ownedSlot = (s: State, id: number, player: number): number | null => {
  const e = s.e;
  if (!isAlive(e, id)) return null;
  const slot = slotOf(id);
  return e.owner[slot] === player ? slot : null;
};

export const rejectMissingOwnedSlot = (s: State, id: number): CommandValidation =>
  isAlive(s.e, id) ? reject('wrong-owner') : reject('stale-entity');
