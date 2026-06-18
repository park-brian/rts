import type { Command, CommandRejectReason } from './commands.ts';
import { Kind, Order, Role, Units, hasAnyWeapon, weaponForTarget } from './data.ts';
import { cancelPendingBuild, hasPendingBuild } from './build-cost.ts';
import { commandMoveSpeed } from './terran-mobility.ts';
import type { State } from './world.ts';
import { NONE, isAlive, isEnemy, slotOf } from './world.ts';
import { isContained } from './cargo.ts';
import { isDisabled } from './systems/status.ts';
import { isPowered } from './power.ts';
import { canDetect } from './detection.ts';
import { canUseWeaponNow } from './burrow.ts';
import { carrierCanAttack } from './interceptor.ts';

type CommandValidation =
  | { ok: true }
  | { ok: false; reason: CommandRejectReason };

type MoveLikeCommand = Extract<Command, { t: 'move' | 'amove' }>;
export type BasicUnitOrderCommand = Extract<Command, { t: 'attack' | 'move' | 'amove' | 'stop' }>;

type BasicUnitOrderContext = {
  destination(command: MoveLikeCommand, slot: number, player: number): { x: number; y: number };
};

type CommandSpec<C extends BasicUnitOrderCommand> = {
  apply(s: State, player: number, command: C, ctx: BasicUnitOrderContext): void;
  validate(s: State, player: number, command: C): CommandValidation;
};

const reject = (reason: CommandRejectReason): CommandValidation => ({ ok: false, reason });

const ownedSlot = (s: State, id: number, player: number): number | null => {
  const e = s.e;
  if (!isAlive(e, id)) return null;
  const slot = slotOf(id);
  return e.owner[slot] === player ? slot : null;
};

export const clearSettled = (s: State, slot: number): void => {
  s.e.settled[slot] = 0;
};

export const cancelPendingBeforeOrder = (s: State, slot: number): void => {
  if (hasPendingBuild(s.e, slot)) cancelPendingBuild(s, slot);
};

const validateMoveLike = (s: State, player: number, command: MoveLikeCommand): CommandValidation => {
  const e = s.e;
  const slot = ownedSlot(s, command.unit, player);
  if (slot === null) return isAlive(e, command.unit) ? reject('wrong-owner') : reject('stale-entity');
  if (isContained(s, slot) || e.burrowed[slot] === 1) return reject('missing-capability');
  if (isDisabled(e, slot)) return reject('missing-capability');
  if (e.built[slot] !== 1) return reject('missing-capability');
  if (e.kind[slot] === Kind.SpiderMine) return reject('missing-capability');
  if ((e.flags[slot]! & Role.Mobile) === 0 || commandMoveSpeed(e.kind[slot]!, e.flags[slot]!) <= 0) {
    return reject('missing-capability');
  }
  return { ok: true };
};

const validateStop = (s: State, player: number, command: Extract<Command, { t: 'stop' }>): CommandValidation => {
  const e = s.e;
  const slot = ownedSlot(s, command.unit, player);
  if (slot === null) return isAlive(e, command.unit) ? reject('wrong-owner') : reject('stale-entity');
  if (isContained(s, slot)) return reject('missing-capability');
  if ((e.flags[slot]! & Role.Mobile) === 0 && e.order[slot] !== Order.Build) return reject('missing-capability');
  return { ok: true };
};

const validateAttack = (s: State, player: number, command: Extract<Command, { t: 'attack' }>): CommandValidation => {
  const e = s.e;
  const slot = ownedSlot(s, command.unit, player);
  if (slot === null) return isAlive(e, command.unit) ? reject('wrong-owner') : reject('stale-entity');
  if (isContained(s, slot)) return reject('missing-capability');
  if (isDisabled(e, slot)) return reject('missing-capability');
  if (e.built[slot] !== 1) return reject('missing-capability');
  if (!isPowered(s, slot)) return reject('missing-capability');
  if (e.kind[slot] === Kind.SpiderMine) return reject('missing-capability');
  const attacker = Units[e.kind[slot]!]!;
  const carrierAttack = e.kind[slot] === Kind.Carrier && isAlive(e, command.target) && carrierCanAttack(s, slot, slotOf(command.target));
  if (!hasAnyWeapon(attacker) && !carrierAttack) return reject('missing-capability');
  if (!canUseWeaponNow(s, slot)) return reject('missing-capability');
  if (e.kind[slot] === Kind.Reaver && e.specialAmmo[slot]! <= 0) return reject('target-not-allowed');
  if (!isAlive(e, command.target)) return reject('target-not-found');
  const target = slotOf(command.target);
  if (isContained(s, target)) return reject('target-not-allowed');
  if (!isEnemy(s, player, e.owner[target]!)) return reject('target-not-allowed');
  if (!canDetect(s, player, target)) return reject('target-not-allowed');
  if (!carrierAttack && !weaponForTarget(attacker, Units[e.kind[target]!]!)) return reject('target-not-allowed');
  return { ok: true };
};

const attackSpec: CommandSpec<Extract<Command, { t: 'attack' }>> = {
  validate: validateAttack,
  apply(s, _player, command): void {
    const e = s.e;
    const slot = slotOf(command.unit);
    cancelPendingBeforeOrder(s, slot);
    clearSettled(s, slot);
    e.order[slot] = Order.Attack;
    e.target[slot] = command.target;
  },
};

const moveSpec: CommandSpec<Extract<Command, { t: 'move' }>> = {
  validate: validateMoveLike,
  apply(s, player, command, ctx): void {
    const e = s.e;
    const slot = slotOf(command.unit);
    const dest = ctx.destination(command, slot, player);
    cancelPendingBeforeOrder(s, slot);
    clearSettled(s, slot);
    e.order[slot] = Order.Move;
    e.target[slot] = NONE;
    e.tx[slot] = dest.x;
    e.ty[slot] = dest.y;
  },
};

const amoveSpec: CommandSpec<Extract<Command, { t: 'amove' }>> = {
  validate: validateMoveLike,
  apply(s, player, command, ctx): void {
    const e = s.e;
    const slot = slotOf(command.unit);
    const dest = ctx.destination(command, slot, player);
    cancelPendingBeforeOrder(s, slot);
    clearSettled(s, slot);
    e.order[slot] = Order.AttackMove;
    e.target[slot] = NONE;
    e.tx[slot] = dest.x;
    e.ty[slot] = dest.y;
  },
};

const stopSpec: CommandSpec<Extract<Command, { t: 'stop' }>> = {
  validate: validateStop,
  apply(s, _player, command): void {
    const e = s.e;
    const slot = slotOf(command.unit);
    cancelPendingBeforeOrder(s, slot);
    clearSettled(s, slot);
    e.order[slot] = Order.Idle;
    e.target[slot] = NONE;
  },
};

export const basicUnitOrderSpecs = {
  attack: attackSpec,
  amove: amoveSpec,
  move: moveSpec,
  stop: stopSpec,
};

export const validateBasicUnitOrder = (s: State, player: number, command: BasicUnitOrderCommand): CommandValidation => {
  switch (command.t) {
    case 'attack': return basicUnitOrderSpecs.attack.validate(s, player, command);
    case 'move': return basicUnitOrderSpecs.move.validate(s, player, command);
    case 'amove': return basicUnitOrderSpecs.amove.validate(s, player, command);
    case 'stop': return basicUnitOrderSpecs.stop.validate(s, player, command);
  }
};

export const applyBasicUnitOrder = (
  s: State,
  player: number,
  command: BasicUnitOrderCommand,
  ctx: BasicUnitOrderContext,
): void => {
  switch (command.t) {
    case 'attack':
      basicUnitOrderSpecs.attack.apply(s, player, command, ctx);
      return;
    case 'move':
      basicUnitOrderSpecs.move.apply(s, player, command, ctx);
      return;
    case 'amove':
      basicUnitOrderSpecs.amove.apply(s, player, command, ctx);
      return;
    case 'stop':
      basicUnitOrderSpecs.stop.apply(s, player, command, ctx);
      return;
  }
};
