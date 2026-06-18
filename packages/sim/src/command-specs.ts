import type { Command, CommandRejectReason } from './commands.ts';
import { Kind, Order, ResourceType, Role, TILE, Tech, Units, hasAnyWeapon, weaponForTarget } from './data.ts';
import { cancelPendingBuild, hasPendingBuild } from './build-cost.ts';
import { fx } from './fixed.ts';
import { commandMoveSpeed } from './terran-mobility.ts';
import type { State } from './world.ts';
import { NONE, eid, isAlive, isEnemy, nearest, slotOf } from './world.ts';
import { isContained, sameTeam } from './cargo.ts';
import { isDisabled } from './systems/status.ts';
import { isPowered } from './power.ts';
import { canDetect } from './detection.ts';
import { canBurrowSlot, canUseWeaponNow, hasBurrowAccess, setBurrowed } from './burrow.ts';
import { carrierCanAttack } from './interceptor.ts';
import { REPAIR_RATE, canContinueConstructionKind, isRepairableKind, repairCost, resumeConstruction } from './repair.ts';
import { getTechLevel } from './tech.ts';
import { laySpiderMine } from './spider-mine.ts';

type CommandValidation =
  | { ok: true }
  | { ok: false; reason: CommandRejectReason };

type MoveLikeCommand = Extract<Command, { t: 'move' | 'amove' }>;
export type CommandSpecCommand = Extract<Command, { t: 'attack' | 'burrow' | 'harvest' | 'mine' | 'move' | 'amove' | 'rally' | 'repair' | 'stop' }>;

type CommandSpecContext = {
  destination(command: MoveLikeCommand, slot: number, player: number): { x: number; y: number };
};

type CommandSpec<C extends CommandSpecCommand> = {
  apply(s: State, player: number, command: C, ctx: CommandSpecContext): void;
  validate(s: State, player: number, command: C): CommandValidation;
};

const RALLY_SNAP = fx(2 * TILE);
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

const canRallyToSlot = (s: State, player: number, source: number, target: number): boolean => {
  const e = s.e;
  if (target === source || e.alive[target] !== 1 || isContained(s, target)) return false;
  if ((e.flags[target]! & Role.Resource) !== 0) return true;
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
    canRallyToSlot(s, player, source, sl) && (e.flags[sl]! & Role.Resource) === 0);
  if (unit !== NONE && withinRallySnap(s, unit, x, y)) return eid(e, unit);
  const node = nearest(s, x, y, (sl) => canRallyToSlot(s, player, source, sl));
  return node !== NONE && withinRallySnap(s, node, x, y) ? eid(e, node) : NONE;
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

const validateBurrow = (s: State, player: number, command: Extract<Command, { t: 'burrow' }>): CommandValidation => {
  const e = s.e;
  const slot = ownedSlot(s, command.unit, player);
  if (slot === null) return isAlive(e, command.unit) ? reject('wrong-owner') : reject('stale-entity');
  if (isContained(s, slot) || isDisabled(e, slot) || e.illusion[slot] === 1) return reject('missing-capability');
  if (!canBurrowSlot(s, slot)) return reject('missing-capability');
  if (!hasBurrowAccess(s, player, e.kind[slot]!)) return reject('missing-requirement');
  if ((e.burrowed[slot] === 1) === command.active) return reject('target-not-allowed');
  return { ok: true };
};

const validateMine = (s: State, player: number, command: Extract<Command, { t: 'mine' }>): CommandValidation => {
  const e = s.e;
  const slot = ownedSlot(s, command.unit, player);
  if (slot === null) return isAlive(e, command.unit) ? reject('wrong-owner') : reject('stale-entity');
  if (isContained(s, slot) || e.burrowed[slot] === 1 || isDisabled(e, slot) || e.illusion[slot] === 1) return reject('missing-capability');
  if (e.kind[slot] !== Kind.Vulture || e.built[slot] !== 1) return reject('missing-capability');
  if (getTechLevel(s, player, Tech.SpiderMines) <= 0) return reject('missing-requirement');
  if (e.specialAmmo[slot]! <= 0) return reject('target-not-allowed');
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

const validateHarvest = (s: State, player: number, command: Extract<Command, { t: 'harvest' }>): CommandValidation => {
  const e = s.e;
  const slot = ownedSlot(s, command.unit, player);
  if (slot === null) return isAlive(e, command.unit) ? reject('wrong-owner') : reject('stale-entity');
  if (isContained(s, slot) || e.burrowed[slot] === 1 || e.illusion[slot] === 1) return reject('missing-capability');
  if (isDisabled(e, slot)) return reject('missing-capability');
  if ((e.flags[slot]! & Role.Worker) === 0) return reject('missing-capability');
  if (!isAlive(e, command.patch)) return reject('target-not-found');
  const target = slotOf(command.patch);
  const isResource = (e.flags[target]! & Role.Resource) !== 0;
  const def = Units[e.kind[target]!]!;
  if (!isResource || (def.resourceType === ResourceType.Gas && e.built[target] !== 1)) return reject('target-not-allowed');
  return { ok: true };
};

const validateRally = (s: State, player: number, command: Extract<Command, { t: 'rally' }>): CommandValidation => {
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

const validateRepair = (s: State, player: number, command: Extract<Command, { t: 'repair' }>): CommandValidation => {
  const e = s.e;
  const slot = ownedSlot(s, command.unit, player);
  if (slot === null) return isAlive(e, command.unit) ? reject('wrong-owner') : reject('stale-entity');
  if (isContained(s, slot) || e.burrowed[slot] === 1 || e.illusion[slot] === 1) return reject('missing-capability');
  if (isDisabled(e, slot) || e.kind[slot] !== Kind.SCV) return reject('missing-capability');
  if (!isAlive(e, command.target)) return reject('target-not-found');
  const target = slotOf(command.target);
  if (isContained(s, target)) return reject('target-not-allowed');
  if (isEnemy(s, player, e.owner[target]!)) return reject('target-not-allowed');
  const def = Units[e.kind[target]!];
  if (def && e.built[target] !== 1 && canContinueConstructionKind(e.kind[target]!)) return { ok: true };
  if (!def || e.built[target] !== 1 || !isRepairableKind(e.kind[target]!) || e.hp[target]! >= def.hp) return reject('target-not-allowed');
  const cost = repairCost(e.kind[target]!, Math.min(REPAIR_RATE, def.hp - e.hp[target]!));
  if (s.players.minerals[player]! < cost.minerals || s.players.gas[player]! < cost.gas) return reject('not-affordable');
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

const burrowSpec: CommandSpec<Extract<Command, { t: 'burrow' }>> = {
  validate: validateBurrow,
  apply(s, _player, command): void {
    setBurrowed(s, slotOf(command.unit), command.active);
  },
};

const harvestSpec: CommandSpec<Extract<Command, { t: 'harvest' }>> = {
  validate: validateHarvest,
  apply(s, _player, command): void {
    const e = s.e;
    const slot = slotOf(command.unit);
    cancelPendingBeforeOrder(s, slot);
    clearSettled(s, slot);
    e.order[slot] = Order.Harvest;
    e.target[slot] = command.patch;
    e.timer[slot] = 0;
  },
};

const mineSpec: CommandSpec<Extract<Command, { t: 'mine' }>> = {
  validate: validateMine,
  apply(s, _player, command): void {
    laySpiderMine(s, slotOf(command.unit));
  },
};

const repairSpec: CommandSpec<Extract<Command, { t: 'repair' }>> = {
  validate: validateRepair,
  apply(s, _player, command): void {
    const e = s.e;
    const slot = slotOf(command.unit);
    cancelPendingBeforeOrder(s, slot);
    clearSettled(s, slot);
    const target = slotOf(command.target);
    if (e.built[target] !== 1 && canContinueConstructionKind(e.kind[target]!)) {
      resumeConstruction(s, slot, target);
    } else {
      e.order[slot] = Order.Repair;
      e.target[slot] = command.target;
      e.timer[slot] = 0;
    }
  },
};

const rallySpec: CommandSpec<Extract<Command, { t: 'rally' }>> = {
  validate: validateRally,
  apply(s, player, command): void {
    const e = s.e;
    const slot = slotOf(command.building);
    const target = command.target ?? snapRallyTarget(s, player, command.x, command.y, slot);
    e.rallyTarget[slot] = target;
    if (target !== NONE && isAlive(e, target)) {
      const targetSlot = slotOf(target);
      e.rallyX[slot] = e.x[targetSlot]!;
      e.rallyY[slot] = e.y[targetSlot]!;
    } else {
      e.rallyX[slot] = command.x;
      e.rallyY[slot] = command.y;
    }
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

export const commandSpecs = {
  attack: attackSpec,
  amove: amoveSpec,
  burrow: burrowSpec,
  harvest: harvestSpec,
  mine: mineSpec,
  move: moveSpec,
  rally: rallySpec,
  repair: repairSpec,
  stop: stopSpec,
};

export const validateCommandSpec = (s: State, player: number, command: CommandSpecCommand): CommandValidation => {
  switch (command.t) {
    case 'attack': return commandSpecs.attack.validate(s, player, command);
    case 'burrow': return commandSpecs.burrow.validate(s, player, command);
    case 'harvest': return commandSpecs.harvest.validate(s, player, command);
    case 'mine': return commandSpecs.mine.validate(s, player, command);
    case 'move': return commandSpecs.move.validate(s, player, command);
    case 'amove': return commandSpecs.amove.validate(s, player, command);
    case 'rally': return commandSpecs.rally.validate(s, player, command);
    case 'repair': return commandSpecs.repair.validate(s, player, command);
    case 'stop': return commandSpecs.stop.validate(s, player, command);
  }
};

export const applyCommandSpec = (
  s: State,
  player: number,
  command: CommandSpecCommand,
  ctx: CommandSpecContext,
): void => {
  switch (command.t) {
    case 'attack':
      commandSpecs.attack.apply(s, player, command, ctx);
      return;
    case 'burrow':
      commandSpecs.burrow.apply(s, player, command, ctx);
      return;
    case 'harvest':
      commandSpecs.harvest.apply(s, player, command, ctx);
      return;
    case 'mine':
      commandSpecs.mine.apply(s, player, command, ctx);
      return;
    case 'move':
      commandSpecs.move.apply(s, player, command, ctx);
      return;
    case 'amove':
      commandSpecs.amove.apply(s, player, command, ctx);
      return;
    case 'rally':
      commandSpecs.rally.apply(s, player, command, ctx);
      return;
    case 'repair':
      commandSpecs.repair.apply(s, player, command, ctx);
      return;
    case 'stop':
      commandSpecs.stop.apply(s, player, command, ctx);
      return;
  }
};
