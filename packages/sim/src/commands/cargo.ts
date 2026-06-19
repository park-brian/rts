import type { Command } from './types.ts';
import { Kind, Units } from '../data.ts';
import type { State } from '../entity/world.ts';
import { NONE, isAlive, slotOf } from '../entity/world.ts';
import {
  UNLOAD_RANGE,
  canLoadInto,
  canUnloadAt,
  cargoUsed,
  containedBy,
  isContained,
  loadUnitInto,
  sameTeam,
  transportCapacity,
  unloadUnit,
  unloadAnchorSlot,
  withinLoadRange,
} from '../cargo.ts';
import { isDisabled } from '../systems/status.ts';
import { withinRangeSq } from '../spatial.ts';
import {
  reject,
  rejectMissingOwnedSlot,
  ownedSlot,
  type CommandValidation,
  type SlotCommandValidation,
} from './shared.ts';

type LoadCommand = Extract<Command, { t: 'load' }>;
type UnloadCommand = Extract<Command, { t: 'unload' }>;

const usableTransportSlot = (s: State, id: number, player: number): SlotCommandValidation => {
  const e = s.e;
  const owned = ownedSlot(s, id, player);
  if (owned !== null) return { ok: true, slot: owned };
  if (!isAlive(e, id)) return rejectMissingOwnedSlot(s, id);
  const slot = slotOf(id);
  return e.kind[slot] === Kind.NydusCanal && sameTeam(s, player, e.owner[slot]!)
    ? { ok: true, slot }
    : reject('wrong-owner');
};

export const validateLoadCommand = (s: State, player: number, command: LoadCommand): CommandValidation => {
  const e = s.e;
  const transportResult = usableTransportSlot(s, command.transport, player);
  if (!transportResult.ok) return transportResult;
  const transport = transportResult.slot;
  const unit = ownedSlot(s, command.unit, player);
  if (unit === null) return rejectMissingOwnedSlot(s, command.unit);
  if (transport === unit || isContained(s, transport)) return reject('target-not-allowed');
  const capacity = transportCapacity(s, transport);
  if (capacity <= 0 || e.built[transport] !== 1 || isDisabled(e, transport) || e.illusion[transport] === 1) {
    return reject('missing-capability');
  }
  if (!canLoadInto(s, transport, unit)) return reject('target-not-allowed');
  const unitSize = Units[e.kind[unit]!]!.cargoSize;
  if (cargoUsed(s, transport) + unitSize > capacity) return reject('queue-full');
  if (!withinLoadRange(s, transport, unit)) return reject('target-out-of-range');
  return { ok: true };
};

export const validateUnloadCommand = (s: State, player: number, command: UnloadCommand): CommandValidation => {
  const e = s.e;
  const transportResult = usableTransportSlot(s, command.transport, player);
  if (!transportResult.ok) return transportResult;
  const transport = transportResult.slot;
  const unit = ownedSlot(s, command.unit, player);
  if (unit === null) return rejectMissingOwnedSlot(s, command.unit);
  if (!containedBy(s, unit, transport)) return reject('target-not-allowed');
  const anchor = unloadAnchorSlot(s, transport, command.x, command.y);
  if (anchor === NONE || !withinRangeSq(e.x[anchor]!, e.y[anchor]!, command.x, command.y, UNLOAD_RANGE)) {
    return reject('target-out-of-range');
  }
  if (!canUnloadAt(s, unit, command.x, command.y, anchor)) return reject('placement-blocked');
  return { ok: true };
};

export const applyLoadCommand = (s: State, command: LoadCommand): void => {
  loadUnitInto(s, slotOf(command.transport), slotOf(command.unit));
};

export const applyUnloadCommand = (s: State, command: UnloadCommand): void => {
  unloadUnit(s, slotOf(command.unit), command.x, command.y);
};
