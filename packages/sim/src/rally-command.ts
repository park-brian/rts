import type { Command, CommandRejectReason } from './commands.ts';
import { Role, TILE } from './data.ts';
import { fx } from './fixed.ts';
import { isContained, sameTeam } from './cargo.ts';
import { canPlayerGatherTargetSlot, isGatherTargetSlot } from './resource-targets.ts';
import { producerSupportsWorkerRally } from './rally.ts';
import type { State } from './world.ts';
import { NONE, eid, isAlive, nearest, slotOf } from './world.ts';

type CommandValidation =
  | { ok: true }
  | { ok: false; reason: CommandRejectReason };

type RallyCommand = Extract<Command, { t: 'rally' }>;

const RALLY_SNAP = fx(2 * TILE);
const reject = (reason: CommandRejectReason): CommandValidation => ({ ok: false, reason });

const ownedSlot = (s: State, id: number, player: number): number | null => {
  const e = s.e;
  if (!isAlive(e, id)) return null;
  const slot = slotOf(id);
  return e.owner[slot] === player ? slot : null;
};

const canRallyToSlot = (s: State, player: number, source: number, target: number): boolean => {
  const e = s.e;
  if (target === source || e.alive[target] !== 1 || isContained(s, target)) return false;
  if (isGatherTargetSlot(s, target)) {
    return source !== NONE && producerSupportsWorkerRally(s, source) && canPlayerGatherTargetSlot(s, player, target);
  }
  return sameTeam(s, player, e.owner[target]!);
};

const withinRallySnap = (s: State, slot: number, x: number, y: number): boolean => {
  const e = s.e;
  const dx = e.x[slot]! - x;
  const dy = e.y[slot]! - y;
  return dx * dx + dy * dy <= RALLY_SNAP * RALLY_SNAP;
};

export const snapRallyTarget = (s: State, player: number, x: number, y: number, source = NONE): number => {
  const e = s.e;
  const unit = nearest(s, x, y, (sl) =>
    canRallyToSlot(s, player, source, sl) && !isGatherTargetSlot(s, sl));
  if (unit !== NONE && withinRallySnap(s, unit, x, y)) return eid(e, unit);
  const node = nearest(s, x, y, (sl) => canRallyToSlot(s, player, source, sl));
  return node !== NONE && withinRallySnap(s, node, x, y) ? eid(e, node) : NONE;
};

export const validateRallyCommand = (s: State, player: number, command: RallyCommand): CommandValidation => {
  const e = s.e;
  const slot = ownedSlot(s, command.building, player);
  if (slot === null) return isAlive(e, command.building) ? reject('wrong-owner') : reject('stale-entity');
  if ((e.flags[slot]! & Role.Structure) === 0) return reject('missing-capability');
  if (e.built[slot] !== 1) return reject('incomplete-producer');
  if (command.target !== undefined) {
    if (!isAlive(e, command.target)) return reject('target-not-found');
    if (!canRallyToSlot(s, player, slot, slotOf(command.target))) return reject('target-not-allowed');
  }
  return { ok: true };
};
