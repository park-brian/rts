import type { Command, CommandRejectReason } from './types.ts';
import type { State } from '../entity/world.ts';
import { slotOf } from '../entity/world.ts';
import { applyBuildCommand, validateBuildCommand } from './build.ts';
import { applyAbilityCommand, validateAbilityCommand } from './ability.ts';
import { applyLoadCommand, applyUnloadCommand, validateLoadCommand, validateUnloadCommand } from './cargo.ts';
import { applyCancelBuildCommand, validateCancelBuildCommand } from './cancel.ts';
import { applyHarvestCommand, validateHarvestCommand } from './harvest.ts';
import { applyRepairCommand, validateRepairCommand } from './repair.ts';
import { applyAddonCommand, validateAddonCommand } from './addon.ts';
import { applyMineCommand, validateMineCommand } from './mine.ts';
import { applyRallyCommand, snapRallyTarget, validateRallyCommand } from './rally.ts';
import { applyTrainCommand, validateTrainCommand } from './production.ts';
import { applyResearchCommand, validateResearchCommand } from './research.ts';
import { applyAttackCommand, validateAttackCommand } from './attack.ts';
import { applyBurrowCommand, validateBurrowCommand } from './burrow.ts';
import { applyStopCommand, validateStopCommand } from './stop.ts';
import {
  applyLandCommand,
  applyLiftCommand,
  validateLandCommand,
  validateLiftCommand,
} from './terran-mobility.ts';
import { applyMoveCommand, validateMoveCommand } from './move.ts';
import { applyTransformCommand, validateTransformCommand } from './transform.ts';

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

const attackSpec: CommandSpec<Extract<Command, { t: 'attack' }>> = {
  validate: validateAttackCommand,
  apply(s, _player, command): void {
    applyAttackCommand(s, command);
  },
};

const abilitySpec: CommandSpec<Extract<Command, { t: 'ability' }>> = {
  validate: validateAbilityCommand,
  apply(s, _player, command): void {
    applyAbilityCommand(s, command);
  },
};

const addonSpec: CommandSpec<Extract<Command, { t: 'addon' }>> = {
  validate: validateAddonCommand,
  apply(s, player, command): void {
    applyAddonCommand(s, player, command);
  },
};

const cancelBuildSpec: CommandSpec<Extract<Command, { t: 'cancelBuild' }>> = {
  validate: validateCancelBuildCommand,
  apply(s, _player, command): void {
    applyCancelBuildCommand(s, command);
  },
};

const burrowSpec: CommandSpec<Extract<Command, { t: 'burrow' }>> = {
  validate: validateBurrowCommand,
  apply(s, _player, command): void {
    applyBurrowCommand(s, command);
  },
};

const buildSpec: CommandSpec<Extract<Command, { t: 'build' }>> = {
  validate: validateBuildCommand,
  apply(s, player, command): void {
    applyBuildCommand(s, player, command);
  },
};

const harvestSpec: CommandSpec<Extract<Command, { t: 'harvest' }>> = {
  validate: validateHarvestCommand,
  apply(s, _player, command): void {
    applyHarvestCommand(s, command);
  },
};

const loadSpec: CommandSpec<Extract<Command, { t: 'load' }>> = {
  validate: validateLoadCommand,
  apply(s, _player, command): void {
    applyLoadCommand(s, command);
  },
};

const liftSpec: CommandSpec<Extract<Command, { t: 'lift' }>> = {
  validate: validateLiftCommand,
  apply(s, _player, command): void {
    applyLiftCommand(s, command);
  },
};

const landSpec: CommandSpec<Extract<Command, { t: 'land' }>> = {
  validate: validateLandCommand,
  apply(s, player, command): void {
    applyLandCommand(s, player, command);
  },
};

const mineSpec: CommandSpec<Extract<Command, { t: 'mine' }>> = {
  validate: validateMineCommand,
  apply(s, _player, command): void {
    applyMineCommand(s, command);
  },
};

const transformSpec: CommandSpec<Extract<Command, { t: 'transform' }>> = {
  validate: validateTransformCommand,
  apply(s, _player, command): void {
    applyTransformCommand(s, command);
  },
};

const unloadSpec: CommandSpec<Extract<Command, { t: 'unload' }>> = {
  validate: validateUnloadCommand,
  apply(s, _player, command): void {
    applyUnloadCommand(s, command);
  },
};

const repairSpec: CommandSpec<Extract<Command, { t: 'repair' }>> = {
  validate: validateRepairCommand,
  apply(s, _player, command): void {
    applyRepairCommand(s, command);
  },
};

const researchSpec: CommandSpec<Extract<Command, { t: 'research' }>> = {
  validate: validateResearchCommand,
  apply(s, player, command): void {
    applyResearchCommand(s, player, command);
  },
};

const trainSpec: CommandSpec<Extract<Command, { t: 'train' }>> = {
  validate(s, player, command, ctx): CommandValidation {
    return validateTrainCommand(s, player, command, ctx);
  },
  apply(s, player, command, ctx): void {
    applyTrainCommand(s, player, command, ctx.reserveSupply);
  },
};

const rallySpec: CommandSpec<Extract<Command, { t: 'rally' }>> = {
  validate: validateRallyCommand,
  apply(s, player, command): void {
    applyRallyCommand(s, player, command);
  },
};

const moveSpec: CommandSpec<Extract<Command, { t: 'move' }>> = {
  validate: validateMoveCommand,
  apply(s, player, command, ctx): void {
    const slot = slotOf(command.unit);
    applyMoveCommand(s, command, ctx.destination(command, slot, player));
  },
};

const amoveSpec: CommandSpec<Extract<Command, { t: 'amove' }>> = {
  validate: validateMoveCommand,
  apply(s, player, command, ctx): void {
    const slot = slotOf(command.unit);
    applyMoveCommand(s, command, ctx.destination(command, slot, player));
  },
};

const stopSpec: CommandSpec<Extract<Command, { t: 'stop' }>> = {
  validate: validateStopCommand,
  apply(s, _player, command): void {
    applyStopCommand(s, command);
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
