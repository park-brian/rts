import type { Command, CommandRejectReason } from './commands.ts';
import { Kind, Units } from './data.ts';
import type { State } from './world.ts';
import { NONE, isAlive, slotOf } from './world.ts';
import {
  UNLOAD_RANGE,
  canLoadInto,
  canUnloadAt,
  cargoUsed,
  containedBy,
  isContained,
  sameTeam,
  transportCapacity,
  unloadAnchorSlot,
  withinLoadRange,
} from './cargo.ts';
import { isDisabled } from './systems/status.ts';
import { withinRangeSq } from './spatial.ts';

type CommandValidation =
  | { ok: true }
  | { ok: false; reason: CommandRejectReason };

type LoadCommand = Extract<Command, { t: 'load' }>;
type UnloadCommand = Extract<Command, { t: 'unload' }>;

const reject = (reason: CommandRejectReason): CommandValidation => ({ ok: false, reason });

const ownedSlot = (s: State, id: number, player: number): number | null => {
  const e = s.e;
  if (!isAlive(e, id)) return null;
  const slot = slotOf(id);
  return e.owner[slot] === player ? slot : null;
};

const usableTransportSlot = (s: State, id: number, player: number): number | null => {
  const e = s.e;
  if (!isAlive(e, id)) return null;
  const slot = slotOf(id);
  if (e.owner[slot] === player) return slot;
  return e.kind[slot] === Kind.NydusCanal && sameTeam(s, player, e.owner[slot]!) ? slot : null;
};

export const validateLoadCommand = (s: State, player: number, command: LoadCommand): CommandValidation => {
  const e = s.e;
  const transport = usableTransportSlot(s, command.transport, player);
  if (transport === null) return isAlive(e, command.transport) ? reject('wrong-owner') : reject('stale-entity');
  const unit = ownedSlot(s, command.unit, player);
  if (unit === null) return isAlive(e, command.unit) ? reject('wrong-owner') : reject('stale-entity');
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
  const transport = usableTransportSlot(s, command.transport, player);
  if (transport === null) return isAlive(e, command.transport) ? reject('wrong-owner') : reject('stale-entity');
  const unit = ownedSlot(s, command.unit, player);
  if (unit === null) return isAlive(e, command.unit) ? reject('wrong-owner') : reject('stale-entity');
  if (!containedBy(s, unit, transport)) return reject('target-not-allowed');
  const anchor = unloadAnchorSlot(s, transport, command.x, command.y);
  if (anchor === NONE || !withinRangeSq(e.x[anchor]!, e.y[anchor]!, command.x, command.y, UNLOAD_RANGE)) {
    return reject('target-out-of-range');
  }
  if (!canUnloadAt(s, unit, command.x, command.y, anchor)) return reject('placement-blocked');
  return { ok: true };
};
