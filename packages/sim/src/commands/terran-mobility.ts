import type { Command } from './types.ts';
import { Role } from '../data/index.ts';
import { isTransitioning } from '../entity/state.ts';
import { placementForStructure } from '../mechanics/placement.ts';
import type { State } from '../entity/world.ts';
import { slotOf } from '../entity/world.ts';
import {
  isLiftableTerranStructureKind,
  isLiftedStructureFlags,
  liftStructure,
  startStructureLanding,
} from '../mechanics/terran-mobility.ts';
import {
  hasActiveAddonTarget,
  isBusy,
  reject,
  rejectMissingOwnedSlot,
  ownedSlot,
  type CommandValidation,
} from './shared.ts';

type LiftCommand = Extract<Command, { t: 'lift' }>;
type LandCommand = Extract<Command, { t: 'land' }>;

export const validateLiftCommand = (s: State, player: number, command: LiftCommand): CommandValidation => {
  const e = s.e;
  const slot = ownedSlot(s, command.building, player);
  if (slot === null) return rejectMissingOwnedSlot(s, command.building);
  if ((e.flags[slot]! & Role.Structure) === 0 || isTransitioning(s, slot)) return reject('incomplete-producer');
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

export const applyLiftCommand = (s: State, command: LiftCommand): void => {
  liftStructure(s, slotOf(command.building));
};

export const applyLandCommand = (s: State, player: number, command: LandCommand): void => {
  const e = s.e;
  const slot = slotOf(command.building);
  const placement = placementForStructure(s, e.kind[slot]!, command.x, command.y, slot, player);
  if (placement.ok) startStructureLanding(s, slot, placement.x, placement.y);
};
