import type { Command } from './commands.ts';
import { Role } from './data.ts';
import { placementForStructure } from './placement.ts';
import type { State } from './world.ts';
import { isLiftableTerranStructureKind, isLiftedStructureFlags } from './terran-mobility.ts';
import {
  hasActiveAddonTarget,
  isBusy,
  reject,
  rejectMissingOwnedSlot,
  ownedSlot,
  type CommandValidation,
} from './command-validation.ts';

type LiftCommand = Extract<Command, { t: 'lift' }>;
type LandCommand = Extract<Command, { t: 'land' }>;

export const validateLiftCommand = (s: State, player: number, command: LiftCommand): CommandValidation => {
  const e = s.e;
  const slot = ownedSlot(s, command.building, player);
  if (slot === null) return rejectMissingOwnedSlot(s, command.building);
  if ((e.flags[slot]! & Role.Structure) === 0 || e.built[slot] !== 1) return reject('incomplete-producer');
  if (!isLiftableTerranStructureKind(e.kind[slot]!) || isLiftedStructureFlags(e.flags[slot]!)) {
    return reject('target-not-allowed');
  }
  if (hasActiveAddonTarget(s, slot)) return reject('target-not-allowed');
  if (isBusy(s, slot)) return reject('queue-full');
  return { ok: true };
};

export const validateLandCommand = (s: State, player: number, command: LandCommand): CommandValidation => {
  const e = s.e;
  const slot = ownedSlot(s, command.building, player);
  if (slot === null) return rejectMissingOwnedSlot(s, command.building);
  if (!isLiftableTerranStructureKind(e.kind[slot]!) || !isLiftedStructureFlags(e.flags[slot]!)) {
    return reject('target-not-allowed');
  }
  const placement = placementForStructure(s, e.kind[slot]!, command.x, command.y, slot, player);
  return placement.ok ? { ok: true } : reject(placement.reason);
};
