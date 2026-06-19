import type { Command, CommandRejectReason } from './commands.ts';
import {
  Kind, Order, Role, Tech, Units,
  hasAnyWeapon, weaponForTarget,
} from './data.ts';
import { cancelFoundation, cancelPendingBuild, hasPendingBuild } from './build-cost.ts';
import {
  commandMoveSpeed, isLiftableTerranStructureKind, isLiftedStructureFlags, liftStructure, startStructureLanding,
} from './terran-mobility.ts';
import type { State } from './world.ts';
import { NONE, canSpawnEntity, isAlive, isEnemy, slotOf } from './world.ts';
import {
  isContained, loadUnitInto, sameTeam, unloadUnit,
} from './cargo.ts';
import { isDisabled } from './systems/status.ts';
import { isPowered } from './power.ts';
import { canDetect } from './detection.ts';
import { canBurrowSlot, canUseWeaponNow, hasBurrowAccess, setBurrowed } from './burrow.ts';
import { carrierCanAttack } from './interceptor.ts';
import { REPAIR_RATE, canContinueConstructionKind, isRepairableKind, repairCost, resumeConstruction } from './repair.ts';
import { getTechLevel, queueResearch } from './tech.ts';
import { hasInternalProductReady, internalProductCapacity } from './internal-products.ts';
import { laySpiderMine } from './spider-mine.ts';
import { applyTransform, mergePartnerFor, transformFor } from './unit-transform.ts';
import { requirementsMet } from './requirements.ts';
import { placementForStructure } from './placement.ts';
import { addonParentKind, addonPosition, isActiveAddon, isAddonKind, startAddon } from './addon.ts';
import { queueProduction } from './production-queue.ts';
import { beginWorkerBuild, validateWorkerBuild } from './build-command.ts';
import { applyAbilityCommand, validateAbilityCommand } from './ability-command.ts';
import { hasWeaponMechanicAmmo, weaponMechanicDef } from './weapon-mechanics.ts';
import { clearVelocity } from './systems/move.ts';
import { issueTravelOrder } from './travel-intent.ts';
import { isGatherTargetSlot } from './resource-targets.ts';
import { producerDirectlyProducesOnlyWorkers } from './rally.ts';
import { validateLoadCommand, validateUnloadCommand } from './cargo-command.ts';
import { validateCancelBuildCommand } from './cancel-command.ts';
import { validateHarvestCommand } from './harvest-command.ts';
import { snapRallyTarget, validateRallyCommand } from './rally-command.ts';
import { validateTrainCommand } from './production-command.ts';
import { validateResearchCommand } from './research-command.ts';

export { snapRallyTarget };

type CommandValidation =
  | { ok: true }
  | { ok: false; reason: CommandRejectReason };

type MoveLikeCommand = Extract<Command, { t: 'move' | 'amove' }>;
export type CommandSpecCommand = Extract<Command, {
  t:
    | 'attack' | 'burrow' | 'cancelBuild' | 'harvest' | 'load' | 'mine' | 'move'
    | 'ability' | 'addon' | 'amove' | 'build' | 'land' | 'lift' | 'rally' | 'repair' | 'research'
    | 'stop' | 'train' | 'transform' | 'unload';
}>;

type CommandSpecValidationContext = {
  reservedSupply?: number;
};

type CommandSpecContext = CommandSpecValidationContext & {
  destination(command: MoveLikeCommand, slot: number, player: number): { x: number; y: number; target?: number };
  reserveSupply?(kind: number): void;
};

type CommandSpec<C extends CommandSpecCommand> = {
  apply(s: State, player: number, command: C, ctx: CommandSpecContext): void;
  validate(s: State, player: number, command: C, ctx?: CommandSpecValidationContext): CommandValidation;
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
  if (command.t === 'move' && command.target !== undefined) {
    if (!isAlive(e, command.target)) return reject('target-not-found');
    const target = slotOf(command.target);
    if (target === slot || isContained(s, target) || !sameTeam(s, player, e.owner[target]!)) return reject('target-not-allowed');
    if (isGatherTargetSlot(s, target)) return reject('target-not-allowed');
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

const validateBuild = (s: State, player: number, command: Extract<Command, { t: 'build' }>): CommandValidation => {
  const e = s.e;
  const slot = ownedSlot(s, command.unit, player);
  if (slot === null) return isAlive(e, command.unit) ? reject('wrong-owner') : reject('stale-entity');
  const def = Units[command.kind];
  if (def && def.buildMethod !== 'morph' && !canSpawnEntity(s)) return reject('capacity-full');
  return validateWorkerBuild(s, player, slot, command.kind, command.x, command.y);
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
  if (internalProductCapacity(s, slot, Kind.SpiderMine) <= 0) return reject('missing-requirement');
  if (!hasInternalProductReady(s, slot, Kind.SpiderMine)) return reject('target-not-allowed');
  if (!canSpawnEntity(s)) return reject('capacity-full');
  return { ok: true };
};

const validateAddon = (s: State, player: number, command: Extract<Command, { t: 'addon' }>): CommandValidation => {
  const e = s.e;
  const slot = ownedSlot(s, command.building, player);
  if (slot === null) return isAlive(e, command.building) ? reject('wrong-owner') : reject('stale-entity');
  if ((e.flags[slot]! & Role.Structure) === 0 || e.built[slot] !== 1) return reject('incomplete-producer');
  if (isLiftedStructureFlags(e.flags[slot]!)) return reject('missing-capability');
  const def = Units[command.kind];
  if (!def || !isAddonKind(command.kind) || addonParentKind(command.kind) !== e.kind[slot]) {
    return reject('target-not-allowed');
  }
  if (e.target[slot] !== NONE && isAlive(e, e.target[slot]!)) return reject('queue-full');
  if (!requirementsMet(s, player, def.requires)) return reject('missing-requirement');
  if (s.players.minerals[player]! < def.minerals || s.players.gas[player]! < def.gas) return reject('not-affordable');
  if (!canSpawnEntity(s)) return reject('capacity-full');
  const pos = addonPosition(s, slot, command.kind);
  const placement = placementForStructure(s, command.kind, pos.x, pos.y, NONE, player);
  return placement.ok ? { ok: true } : reject(placement.reason);
};

const validateTransform = (s: State, player: number, command: Extract<Command, { t: 'transform' }>): CommandValidation => {
  const e = s.e;
  const slot = ownedSlot(s, command.unit, player);
  if (slot === null) return isAlive(e, command.unit) ? reject('wrong-owner') : reject('stale-entity');
  if (isContained(s, slot) || e.burrowed[slot] === 1 || e.illusion[slot] === 1) return reject('missing-capability');
  if (isDisabled(e, slot) || e.built[slot] !== 1) return reject('missing-capability');
  const transform = transformFor(e.kind[slot]!, command.kind);
  if (!transform) return reject('target-not-allowed');
  if (transform.tech !== undefined && getTechLevel(s, player, transform.tech) <= 0) return reject('missing-requirement');
  if (transform.mode === 'merge') {
    if (mergePartnerFor(s, slot, command.kind, command.target ?? NONE) === NONE) return reject('target-not-allowed');
  }
  if (transform.mode === 'morph') {
    const def = Units[command.kind]!;
    const source = Units[e.kind[slot]!]!;
    if (!requirementsMet(s, player, def.requires)) return reject('missing-requirement');
    if (e.prodKind[slot] !== Kind.None || e.researchKind[slot] !== Kind.None) return reject('queue-full');
    if (s.players.minerals[player]! < def.minerals || s.players.gas[player]! < def.gas) return reject('not-affordable');
    const supplyDelta = def.supply - source.supply;
    if (supplyDelta > 0 && s.players.supplyUsed[player]! + supplyDelta > s.players.supplyMax[player]!) return reject('supply-blocked');
  }
  return { ok: true };
};

const validateLift = (s: State, player: number, command: Extract<Command, { t: 'lift' }>): CommandValidation => {
  const e = s.e;
  const slot = ownedSlot(s, command.building, player);
  if (slot === null) return isAlive(e, command.building) ? reject('wrong-owner') : reject('stale-entity');
  if ((e.flags[slot]! & Role.Structure) === 0 || e.built[slot] !== 1) return reject('incomplete-producer');
  if (!isLiftableTerranStructureKind(e.kind[slot]!) || isLiftedStructureFlags(e.flags[slot]!)) return reject('target-not-allowed');
  if (e.target[slot] !== NONE && isAlive(e, e.target[slot]!)) return reject('target-not-allowed');
  if (e.prodKind[slot] !== Kind.None || e.researchKind[slot] !== Kind.None) return reject('queue-full');
  return { ok: true };
};

const validateLand = (s: State, player: number, command: Extract<Command, { t: 'land' }>): CommandValidation => {
  const e = s.e;
  const slot = ownedSlot(s, command.building, player);
  if (slot === null) return isAlive(e, command.building) ? reject('wrong-owner') : reject('stale-entity');
  if (!isLiftableTerranStructureKind(e.kind[slot]!) || !isLiftedStructureFlags(e.flags[slot]!)) return reject('target-not-allowed');
  const placement = placementForStructure(s, e.kind[slot]!, command.x, command.y, slot, player);
  return placement.ok ? { ok: true } : reject(placement.reason);
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
  const mechanic = weaponMechanicDef(e.kind[slot]!);
  const carrierAttack = e.kind[slot] === Kind.Carrier && isAlive(e, command.target) && carrierCanAttack(s, slot, slotOf(command.target));
  if (!hasAnyWeapon(attacker) && !carrierAttack) return reject('missing-capability');
  if (!canUseWeaponNow(s, slot)) return reject('missing-capability');
  if (!hasWeaponMechanicAmmo(s, slot, mechanic)) return reject('target-not-allowed');
  if (!isAlive(e, command.target)) return reject('target-not-found');
  const target = slotOf(command.target);
  if (isContained(s, target)) return reject('target-not-allowed');
  if (!isEnemy(s, player, e.owner[target]!)) return reject('target-not-allowed');
  if (!canDetect(s, player, target)) return reject('target-not-allowed');
  if (!carrierAttack && !weaponForTarget(attacker, Units[e.kind[target]!]!)) return reject('target-not-allowed');
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
    e.combatTarget[slot] = command.target;
    e.intentTarget[slot] = NONE;
  },
};

const abilitySpec: CommandSpec<Extract<Command, { t: 'ability' }>> = {
  validate: validateAbilityCommand,
  apply(s, _player, command): void {
    applyAbilityCommand(s, command);
  },
};

const addonSpec: CommandSpec<Extract<Command, { t: 'addon' }>> = {
  validate: validateAddon,
  apply(s, player, command): void {
    startAddon(s, slotOf(command.building), command.kind, player);
  },
};

const cancelBuildSpec: CommandSpec<Extract<Command, { t: 'cancelBuild' }>> = {
  validate: validateCancelBuildCommand,
  apply(s, _player, command): void {
    cancelFoundation(s, slotOf(command.building));
  },
};

const burrowSpec: CommandSpec<Extract<Command, { t: 'burrow' }>> = {
  validate: validateBurrow,
  apply(s, _player, command): void {
    setBurrowed(s, slotOf(command.unit), command.active);
  },
};

const buildSpec: CommandSpec<Extract<Command, { t: 'build' }>> = {
  validate: validateBuild,
  apply(s, player, command): void {
    const slot = slotOf(command.unit);
    const placement = placementForStructure(s, command.kind, command.x, command.y, slot, player);
    if (placement.ok) beginWorkerBuild(s, slot, command.kind, placement, player);
  },
};

const harvestSpec: CommandSpec<Extract<Command, { t: 'harvest' }>> = {
  validate: validateHarvestCommand,
  apply(s, _player, command): void {
    const e = s.e;
    const slot = slotOf(command.unit);
    cancelPendingBeforeOrder(s, slot);
    clearSettled(s, slot);
    e.order[slot] = Order.Harvest;
    e.target[slot] = command.patch;
    e.intentTarget[slot] = NONE;
    e.combatTarget[slot] = NONE;
    e.timer[slot] = 0;
  },
};

const loadSpec: CommandSpec<Extract<Command, { t: 'load' }>> = {
  validate: validateLoadCommand,
  apply(s, _player, command): void {
    loadUnitInto(s, slotOf(command.transport), slotOf(command.unit));
  },
};

const liftSpec: CommandSpec<Extract<Command, { t: 'lift' }>> = {
  validate: validateLift,
  apply(s, _player, command): void {
    liftStructure(s, slotOf(command.building));
  },
};

const landSpec: CommandSpec<Extract<Command, { t: 'land' }>> = {
  validate: validateLand,
  apply(s, player, command): void {
    const e = s.e;
    const slot = slotOf(command.building);
    const placement = placementForStructure(s, e.kind[slot]!, command.x, command.y, slot, player);
    if (placement.ok) startStructureLanding(s, slot, placement.x, placement.y);
  },
};

const mineSpec: CommandSpec<Extract<Command, { t: 'mine' }>> = {
  validate: validateMine,
  apply(s, _player, command): void {
    laySpiderMine(s, slotOf(command.unit));
  },
};

const transformSpec: CommandSpec<Extract<Command, { t: 'transform' }>> = {
  validate: validateTransform,
  apply(s, _player, command): void {
    const slot = slotOf(command.unit);
    cancelPendingBeforeOrder(s, slot);
    applyTransform(s, slot, command.kind, command.target ?? NONE);
  },
};

const unloadSpec: CommandSpec<Extract<Command, { t: 'unload' }>> = {
  validate: validateUnloadCommand,
  apply(s, _player, command): void {
    unloadUnit(s, slotOf(command.unit), command.x, command.y);
  },
};

const repairSpec: CommandSpec<Extract<Command, { t: 'repair' }>> = {
  validate: validateRepair,
  apply(s, _player, command): void {
    const e = s.e;
    const slot = slotOf(command.unit);
    cancelPendingBeforeOrder(s, slot);
    clearSettled(s, slot);
    e.intentTarget[slot] = NONE;
    e.combatTarget[slot] = NONE;
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

const researchSpec: CommandSpec<Extract<Command, { t: 'research' }>> = {
  validate: validateResearchCommand,
  apply(s, player, command): void {
    queueResearch(s, slotOf(command.building), command.tech, player);
  },
};

const trainSpec: CommandSpec<Extract<Command, { t: 'train' }>> = {
  validate(s, player, command, ctx): CommandValidation {
    return validateTrainCommand(s, player, command, ctx);
  },
  apply(s, player, command, ctx): void {
    queueProduction(s, slotOf(command.building), command.kind, player);
    ctx.reserveSupply?.(command.kind);
  },
};

const rallySpec: CommandSpec<Extract<Command, { t: 'rally' }>> = {
  validate: validateRallyCommand,
  apply(s, player, command): void {
    const e = s.e;
    const slot = slotOf(command.building);
    const target = command.target ?? snapRallyTarget(s, player, command.x, command.y, slot);
    if (target !== NONE && isAlive(e, target)) {
      const targetSlot = slotOf(target);
      if (isGatherTargetSlot(s, targetSlot)) {
        e.workerRallyTarget[slot] = target;
        e.workerRallyX[slot] = e.x[targetSlot]!;
        e.workerRallyY[slot] = e.y[targetSlot]!;
        return;
      }
      e.rallyTarget[slot] = target;
      e.rallyX[slot] = e.x[targetSlot]!;
      e.rallyY[slot] = e.y[targetSlot]!;
      if (producerDirectlyProducesOnlyWorkers(s, slot)) {
        e.workerRallyTarget[slot] = NONE;
        e.workerRallyX[slot] = NONE;
        e.workerRallyY[slot] = NONE;
      }
      return;
    }
    e.rallyTarget[slot] = NONE;
    e.rallyX[slot] = command.x;
    e.rallyY[slot] = command.y;
    if (producerDirectlyProducesOnlyWorkers(s, slot)) {
      e.workerRallyTarget[slot] = NONE;
      e.workerRallyX[slot] = NONE;
      e.workerRallyY[slot] = NONE;
    }
  },
};

const moveSpec: CommandSpec<Extract<Command, { t: 'move' }>> = {
  validate: validateMoveLike,
  apply(s, player, command, ctx): void {
    const slot = slotOf(command.unit);
    const dest = ctx.destination(command, slot, player);
    cancelPendingBeforeOrder(s, slot);
    clearSettled(s, slot);
    issueTravelOrder(s, slot, dest, 'move');
  },
};

const amoveSpec: CommandSpec<Extract<Command, { t: 'amove' }>> = {
  validate: validateMoveLike,
  apply(s, player, command, ctx): void {
    const slot = slotOf(command.unit);
    const dest = ctx.destination(command, slot, player);
    cancelPendingBeforeOrder(s, slot);
    clearSettled(s, slot);
    issueTravelOrder(s, slot, dest, 'attack-move');
  },
};

const stopSpec: CommandSpec<Extract<Command, { t: 'stop' }>> = {
  validate: validateStop,
  apply(s, _player, command): void {
    const e = s.e;
    const slot = slotOf(command.unit);
    cancelPendingBeforeOrder(s, slot);
    clearSettled(s, slot);
    clearVelocity(e, slot);
    e.order[slot] = Order.Idle;
    e.target[slot] = NONE;
    e.intentTarget[slot] = NONE;
    e.combatTarget[slot] = NONE;
  },
};

export const commandSpecs = {
  ability: abilitySpec,
  addon: addonSpec,
  attack: attackSpec,
  amove: amoveSpec,
  build: buildSpec,
  burrow: burrowSpec,
  cancelBuild: cancelBuildSpec,
  harvest: harvestSpec,
  land: landSpec,
  lift: liftSpec,
  load: loadSpec,
  mine: mineSpec,
  move: moveSpec,
  rally: rallySpec,
  repair: repairSpec,
  research: researchSpec,
  stop: stopSpec,
  train: trainSpec,
  transform: transformSpec,
  unload: unloadSpec,
};

export const validateCommandSpec = (
  s: State,
  player: number,
  command: CommandSpecCommand,
  ctx: CommandSpecValidationContext = {},
): CommandValidation => {
  switch (command.t) {
    case 'ability': return commandSpecs.ability.validate(s, player, command);
    case 'addon': return commandSpecs.addon.validate(s, player, command);
    case 'attack': return commandSpecs.attack.validate(s, player, command);
    case 'build': return commandSpecs.build.validate(s, player, command);
    case 'burrow': return commandSpecs.burrow.validate(s, player, command);
    case 'cancelBuild': return commandSpecs.cancelBuild.validate(s, player, command);
    case 'harvest': return commandSpecs.harvest.validate(s, player, command);
    case 'land': return commandSpecs.land.validate(s, player, command);
    case 'lift': return commandSpecs.lift.validate(s, player, command);
    case 'load': return commandSpecs.load.validate(s, player, command);
    case 'mine': return commandSpecs.mine.validate(s, player, command);
    case 'move': return commandSpecs.move.validate(s, player, command);
    case 'amove': return commandSpecs.amove.validate(s, player, command);
    case 'rally': return commandSpecs.rally.validate(s, player, command);
    case 'repair': return commandSpecs.repair.validate(s, player, command);
    case 'research': return commandSpecs.research.validate(s, player, command);
    case 'stop': return commandSpecs.stop.validate(s, player, command);
    case 'train': return commandSpecs.train.validate(s, player, command, ctx);
    case 'transform': return commandSpecs.transform.validate(s, player, command);
    case 'unload': return commandSpecs.unload.validate(s, player, command);
  }
};

export const applyCommandSpec = (
  s: State,
  player: number,
  command: CommandSpecCommand,
  ctx: CommandSpecContext,
): void => {
  switch (command.t) {
    case 'ability':
      commandSpecs.ability.apply(s, player, command, ctx);
      return;
    case 'addon':
      commandSpecs.addon.apply(s, player, command, ctx);
      return;
    case 'attack':
      commandSpecs.attack.apply(s, player, command, ctx);
      return;
    case 'build':
      commandSpecs.build.apply(s, player, command, ctx);
      return;
    case 'burrow':
      commandSpecs.burrow.apply(s, player, command, ctx);
      return;
    case 'cancelBuild':
      commandSpecs.cancelBuild.apply(s, player, command, ctx);
      return;
    case 'harvest':
      commandSpecs.harvest.apply(s, player, command, ctx);
      return;
    case 'land':
      commandSpecs.land.apply(s, player, command, ctx);
      return;
    case 'lift':
      commandSpecs.lift.apply(s, player, command, ctx);
      return;
    case 'load':
      commandSpecs.load.apply(s, player, command, ctx);
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
    case 'research':
      commandSpecs.research.apply(s, player, command, ctx);
      return;
    case 'stop':
      commandSpecs.stop.apply(s, player, command, ctx);
      return;
    case 'train':
      commandSpecs.train.apply(s, player, command, ctx);
      return;
    case 'transform':
      commandSpecs.transform.apply(s, player, command, ctx);
      return;
    case 'unload':
      commandSpecs.unload.apply(s, player, command, ctx);
      return;
  }
};
