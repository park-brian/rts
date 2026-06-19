import type { Command } from './commands.ts';
import { Kind } from './data.ts';
import { isContained } from './cargo.ts';
import { hasInternalProductReady, internalProductCapacity } from './internal-products.ts';
import { isDisabled } from './systems/status.ts';
import type { State } from './world.ts';
import { canSpawnEntity } from './world.ts';
import { reject, rejectMissingOwnedSlot, ownedSlot, type CommandValidation } from './command-validation.ts';

type MineCommand = Extract<Command, { t: 'mine' }>;

export const validateMineCommand = (s: State, player: number, command: MineCommand): CommandValidation => {
  const e = s.e;
  const slot = ownedSlot(s, command.unit, player);
  if (slot === null) return rejectMissingOwnedSlot(s, command.unit);
  if (isContained(s, slot) || e.burrowed[slot] === 1 || isDisabled(e, slot) || e.illusion[slot] === 1) {
    return reject('missing-capability');
  }
  if (e.kind[slot] !== Kind.Vulture || e.built[slot] !== 1) return reject('missing-capability');
  if (internalProductCapacity(s, slot, Kind.SpiderMine) <= 0) return reject('missing-requirement');
  if (!hasInternalProductReady(s, slot, Kind.SpiderMine)) return reject('target-not-allowed');
  if (!canSpawnEntity(s)) return reject('capacity-full');
  return { ok: true };
};
