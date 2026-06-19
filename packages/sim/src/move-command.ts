import type { Command, CommandRejectReason } from './commands.ts';
import { Kind, Role } from './data.ts';
import { isContained, sameTeam } from './cargo.ts';
import { commandMoveSpeed } from './terran-mobility.ts';
import { isGatherTargetSlot } from './resource-targets.ts';
import { isDisabled } from './systems/status.ts';
import type { State } from './world.ts';
import { isAlive, slotOf } from './world.ts';

type CommandValidation =
  | { ok: true }
  | { ok: false; reason: CommandRejectReason };

type MoveCommand = Extract<Command, { t: 'move' | 'amove' }>;

const reject = (reason: CommandRejectReason): CommandValidation => ({ ok: false, reason });

const ownedSlot = (s: State, id: number, player: number): number | null => {
  const e = s.e;
  if (!isAlive(e, id)) return null;
  const slot = slotOf(id);
  return e.owner[slot] === player ? slot : null;
};

export const validateMoveCommand = (s: State, player: number, command: MoveCommand): CommandValidation => {
  const e = s.e;
  const slot = ownedSlot(s, command.unit, player);
  if (slot === null) return isAlive(e, command.unit) ? reject('wrong-owner') : reject('stale-entity');
  if (isContained(s, slot) || e.burrowed[slot] === 1) return reject('missing-capability');
  if (isDisabled(e, slot)) return reject('missing-capability');
  if (e.built[slot] !== 1) return reject('missing-capability');
  if (e.kind[slot] === Kind.SpiderMine) return reject('missing-capability');
  if ((e.flags[slot]! & Role.Mobile) === 0 || commandMoveSpeed(e.kind[slot]!, e.flags[slot]!) <= 0) {
    return reject('missing-capability');
  }
  if (command.t === 'move' && command.target !== undefined) {
    if (!isAlive(e, command.target)) return reject('target-not-found');
    const target = slotOf(command.target);
    if (target === slot || isContained(s, target) || !sameTeam(s, player, e.owner[target]!)) {
      return reject('target-not-allowed');
    }
    if (isGatherTargetSlot(s, target)) return reject('target-not-allowed');
  }
  return { ok: true };
};
