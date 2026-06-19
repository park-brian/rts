import type { Command } from './types.ts';
import { Kind } from '../data.ts';
import { hasInternalProductReady, internalProductCapacity } from '../mechanics/internal-products.ts';
import { laySpiderMine } from '../mechanics/spider-mine.ts';
import type { State } from '../entity/world.ts';
import { canSpawnEntity, slotOf } from '../entity/world.ts';
import { canReceiveOrder, reject, type CommandValidation } from './shared.ts';

type MineCommand = Extract<Command, { t: 'mine' }>;

export const validateMineCommand = (s: State, player: number, command: MineCommand): CommandValidation => {
  const e = s.e;
  const actor = canReceiveOrder(s, player, command.unit, { rejectBurrowed: true, rejectIllusion: true });
  if (!actor.ok) return actor;
  const slot = actor.slot;
  if (e.kind[slot] !== Kind.Vulture) return reject('missing-capability');
  if (internalProductCapacity(s, slot, Kind.SpiderMine) <= 0) return reject('missing-requirement');
  if (!hasInternalProductReady(s, slot, Kind.SpiderMine)) return reject('target-not-allowed');
  if (!canSpawnEntity(s)) return reject('capacity-full');
  return { ok: true };
};

export const applyMineCommand = (s: State, command: MineCommand): void => {
  laySpiderMine(s, slotOf(command.unit));
};
