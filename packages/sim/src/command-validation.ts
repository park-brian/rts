import type { CommandRejectReason } from './commands.ts';
import { isActiveAddon } from './addon.ts';
import { isPowered } from './power.ts';
import { isLiftedStructureFlags } from './terran-mobility.ts';
import type { State } from './world.ts';
import { isAlive, slotOf } from './world.ts';

export type CommandRejection = { ok: false; reason: CommandRejectReason };

export type CommandValidation =
  | { ok: true }
  | CommandRejection;

export const reject = (reason: CommandRejectReason): CommandRejection => ({ ok: false, reason });

export const ownedSlot = (s: State, id: number, player: number): number | null => {
  const e = s.e;
  if (!isAlive(e, id)) return null;
  const slot = slotOf(id);
  return e.owner[slot] === player ? slot : null;
};

export const rejectMissingOwnedSlot = (s: State, id: number): CommandRejection =>
  isAlive(s.e, id) ? reject('wrong-owner') : reject('stale-entity');

export type SlotCommandValidation =
  | { ok: true; slot: number }
  | CommandRejection;

type ProducerUseOptions = {
  role?: number;
  requireBuilt?: boolean;
  requireActiveAddon?: boolean;
  requirePowered?: boolean;
  rejectLifted?: boolean;
  rejectIllusion?: boolean;
  missingRoleReason?: CommandRejectReason;
};

export type ResourceAmount = {
  minerals?: number;
  gas?: number;
};

export const canPay = (
  s: State,
  player: number,
  cost: ResourceAmount,
  credit: ResourceAmount = {},
): CommandValidation => {
  const minerals = s.players.minerals[player] ?? 0;
  const gas = s.players.gas[player] ?? 0;
  if (minerals + (credit.minerals ?? 0) < (cost.minerals ?? 0) ||
      gas + (credit.gas ?? 0) < (cost.gas ?? 0)) {
    return reject('not-affordable');
  }
  return { ok: true };
};

export const canUseProducer = (
  s: State,
  player: number,
  id: number,
  options: ProducerUseOptions = {},
): SlotCommandValidation => {
  const e = s.e;
  const slot = ownedSlot(s, id, player);
  if (slot === null) return rejectMissingOwnedSlot(s, id);
  if (options.rejectIllusion && e.illusion[slot] === 1) return reject('missing-capability');
  if (options.role !== undefined && (e.flags[slot]! & options.role) === 0) {
    return reject(options.missingRoleReason ?? 'missing-capability');
  }
  if (options.requireBuilt && e.built[slot] !== 1) return reject('incomplete-producer');
  if (options.rejectLifted && isLiftedStructureFlags(e.flags[slot]!)) return reject('missing-capability');
  if (options.requireActiveAddon && !isActiveAddon(s, slot)) return reject('missing-capability');
  if (options.requirePowered && !isPowered(s, slot)) return reject('missing-capability');
  return { ok: true, slot };
};
