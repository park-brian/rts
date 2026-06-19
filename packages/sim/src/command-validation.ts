import type { CommandRejectReason } from './commands.ts';
import { isActiveAddon } from './addon.ts';
import { isContained } from './cargo.ts';
import { Kind } from './data.ts';
import { canDetect } from './detection.ts';
import { isTransitioning } from './entity/state.ts';
import { isPowered } from './power.ts';
import { isDisabled } from './systems/status.ts';
import { isLiftedStructureFlags } from './terran-mobility.ts';
import type { State } from './entity/world.ts';
import { isAlive, isEnemy, NONE, slotOf } from './entity/world.ts';

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

type ReceiveOrderOptions = {
  rejectBurrowed?: boolean;
  rejectIllusion?: boolean;
};

type TargetEntityOptions = {
  team?: 'own' | 'enemy' | 'any';
  requireDetection?: boolean;
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
  if (options.requireBuilt && isTransitioning(s, slot)) return reject('incomplete-producer');
  if (options.rejectLifted && isLiftedStructureFlags(e.flags[slot]!)) return reject('missing-capability');
  if (options.requireActiveAddon && !isActiveAddon(s, slot)) return reject('missing-capability');
  if (options.requirePowered && !isPowered(s, slot)) return reject('missing-capability');
  return { ok: true, slot };
};

export const canReceiveOrder = (
  s: State,
  player: number,
  id: number,
  options: ReceiveOrderOptions = {},
): SlotCommandValidation => {
  const e = s.e;
  const slot = ownedSlot(s, id, player);
  if (slot === null) return rejectMissingOwnedSlot(s, id);
  if (isContained(s, slot)) return reject('missing-capability');
  if (options.rejectBurrowed && e.burrowed[slot] === 1) return reject('missing-capability');
  if (options.rejectIllusion && e.illusion[slot] === 1) return reject('missing-capability');
  if (isDisabled(e, slot)) return reject('missing-capability');
  if (isTransitioning(s, slot)) return reject('missing-capability');
  return { ok: true, slot };
};

export const canTargetEntity = (
  s: State,
  player: number,
  id: number | undefined,
  options: TargetEntityOptions = {},
): SlotCommandValidation => {
  const e = s.e;
  if (id === undefined || !isAlive(e, id)) return reject('target-not-found');
  const slot = slotOf(id);
  if (isContained(s, slot)) return reject('target-not-allowed');
  if (options.team === 'own' && e.owner[slot] !== player) return reject('target-not-allowed');
  const enemy = isEnemy(s, player, e.owner[slot]!);
  if (options.team === 'enemy' && !enemy) return reject('target-not-allowed');
  if (options.requireDetection && enemy && !canDetect(s, player, slot)) return reject('target-not-allowed');
  return { ok: true, slot };
};

export const hasActiveProduction = (s: State, slot: number): boolean =>
  s.e.prodKind[slot] !== Kind.None;

export const hasActiveResearch = (s: State, slot: number): boolean =>
  s.e.researchKind[slot] !== Kind.None;

export const hasActiveAddonTarget = (s: State, slot: number): boolean => {
  const target = s.e.target[slot];
  return target !== NONE && isAlive(s.e, target!);
};

export const isBusy = (s: State, slot: number): boolean =>
  hasActiveProduction(s, slot) || hasActiveResearch(s, slot);
