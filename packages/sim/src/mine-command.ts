import type { Command, CommandRejectReason } from './commands.ts';
import { Kind } from './data.ts';
import { isContained } from './cargo.ts';
import { hasInternalProductReady, internalProductCapacity } from './internal-products.ts';
import { isDisabled } from './systems/status.ts';
import type { State } from './world.ts';
import { canSpawnEntity, isAlive, slotOf } from './world.ts';

type CommandValidation =
  | { ok: true }
  | { ok: false; reason: CommandRejectReason };

type MineCommand = Extract<Command, { t: 'mine' }>;

const reject = (reason: CommandRejectReason): CommandValidation => ({ ok: false, reason });

const ownedSlot = (s: State, id: number, player: number): number | null => {
  const e = s.e;
  if (!isAlive(e, id)) return null;
  const slot = slotOf(id);
  return e.owner[slot] === player ? slot : null;
};

export const validateMineCommand = (s: State, player: number, command: MineCommand): CommandValidation => {
  const e = s.e;
  const slot = ownedSlot(s, command.unit, player);
  if (slot === null) return isAlive(e, command.unit) ? reject('wrong-owner') : reject('stale-entity');
  if (isContained(s, slot) || e.burrowed[slot] === 1 || isDisabled(e, slot) || e.illusion[slot] === 1) {
    return reject('missing-capability');
  }
  if (e.kind[slot] !== Kind.Vulture || e.built[slot] !== 1) return reject('missing-capability');
  if (internalProductCapacity(s, slot, Kind.SpiderMine) <= 0) return reject('missing-requirement');
  if (!hasInternalProductReady(s, slot, Kind.SpiderMine)) return reject('target-not-allowed');
  if (!canSpawnEntity(s)) return reject('capacity-full');
  return { ok: true };
};
