import type { Command, CommandRejectReason } from './commands.ts';
import { Kind, Role } from './data.ts';
import type { State } from './world.ts';
import { isAlive, slotOf } from './world.ts';

type CommandValidation =
  | { ok: true }
  | { ok: false; reason: CommandRejectReason };

type CancelBuildCommand = Extract<Command, { t: 'cancelBuild' }>;

const reject = (reason: CommandRejectReason): CommandValidation => ({ ok: false, reason });

const ownedSlot = (s: State, id: number, player: number): number | null => {
  const e = s.e;
  if (!isAlive(e, id)) return null;
  const slot = slotOf(id);
  return e.owner[slot] === player ? slot : null;
};

export const validateCancelBuildCommand = (s: State, player: number, command: CancelBuildCommand): CommandValidation => {
  const e = s.e;
  const slot = ownedSlot(s, command.building, player);
  if (slot === null) return isAlive(e, command.building) ? reject('wrong-owner') : reject('stale-entity');
  if (e.morphFromKind[slot] !== Kind.None) return { ok: true };
  if ((e.flags[slot]! & Role.Structure) === 0 || e.built[slot] === 1 ||
      (e.buildCostMinerals[slot] === 0 && e.buildCostGas[slot] === 0)) {
    return reject('target-not-allowed');
  }
  return { ok: true };
};
