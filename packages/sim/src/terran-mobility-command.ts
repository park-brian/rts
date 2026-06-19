import type { Command, CommandRejectReason } from './commands.ts';
import { Kind, Role } from './data.ts';
import { placementForStructure } from './placement.ts';
import type { State } from './world.ts';
import { NONE, isAlive, slotOf } from './world.ts';
import { isLiftableTerranStructureKind, isLiftedStructureFlags } from './terran-mobility.ts';

type CommandValidation =
  | { ok: true }
  | { ok: false; reason: CommandRejectReason };

type LiftCommand = Extract<Command, { t: 'lift' }>;
type LandCommand = Extract<Command, { t: 'land' }>;

const reject = (reason: CommandRejectReason): CommandValidation => ({ ok: false, reason });

const ownedSlot = (s: State, id: number, player: number): number | null => {
  const e = s.e;
  if (!isAlive(e, id)) return null;
  const slot = slotOf(id);
  return e.owner[slot] === player ? slot : null;
};

export const validateLiftCommand = (s: State, player: number, command: LiftCommand): CommandValidation => {
  const e = s.e;
  const slot = ownedSlot(s, command.building, player);
  if (slot === null) return isAlive(e, command.building) ? reject('wrong-owner') : reject('stale-entity');
  if ((e.flags[slot]! & Role.Structure) === 0 || e.built[slot] !== 1) return reject('incomplete-producer');
  if (!isLiftableTerranStructureKind(e.kind[slot]!) || isLiftedStructureFlags(e.flags[slot]!)) {
    return reject('target-not-allowed');
  }
  if (e.target[slot] !== NONE && isAlive(e, e.target[slot]!)) return reject('target-not-allowed');
  if (e.prodKind[slot] !== Kind.None || e.researchKind[slot] !== Kind.None) return reject('queue-full');
  return { ok: true };
};

export const validateLandCommand = (s: State, player: number, command: LandCommand): CommandValidation => {
  const e = s.e;
  const slot = ownedSlot(s, command.building, player);
  if (slot === null) return isAlive(e, command.building) ? reject('wrong-owner') : reject('stale-entity');
  if (!isLiftableTerranStructureKind(e.kind[slot]!) || !isLiftedStructureFlags(e.flags[slot]!)) {
    return reject('target-not-allowed');
  }
  const placement = placementForStructure(s, e.kind[slot]!, command.x, command.y, slot, player);
  return placement.ok ? { ok: true } : reject(placement.reason);
};
