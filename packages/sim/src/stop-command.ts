import type { Command } from './commands.ts';
import { Order, Role } from './data.ts';
import { isContained } from './cargo.ts';
import type { State } from './entity/world.ts';
import { reject, rejectMissingOwnedSlot, ownedSlot, type CommandValidation } from './command-validation.ts';

type StopCommand = Extract<Command, { t: 'stop' }>;

export const validateStopCommand = (s: State, player: number, command: StopCommand): CommandValidation => {
  const e = s.e;
  const slot = ownedSlot(s, command.unit, player);
  if (slot === null) return rejectMissingOwnedSlot(s, command.unit);
  if (isContained(s, slot)) return reject('missing-capability');
  if ((e.flags[slot]! & Role.Mobile) === 0 && e.order[slot] !== Order.Build) return reject('missing-capability');
  return { ok: true };
};
