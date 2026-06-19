import { Kind, NONE, Units, type Command, type Faction, type State } from '@rts/sim';
import { maybeQueueTerranAddons } from './macro-addons.ts';
import { type ResourceBudget } from './macro-build.ts';
import { maybeQueueCoreProductionCapacity, maybeQueueZergMacroHatchery } from './macro-capacity.ts';
import {
  desiredWorkerCount,
  maybeQueueArmyStructure,
  maybeQueueSupply,
  maybeQueueWorkers,
  maybeSetArmyStructureRallies,
  summarizeEconomyRoster,
} from './macro-economy.ts';
import { maybeQueueExpansion } from './macro-expansion.ts';
import { maybeQueueZergMorphs } from './macro-morph.ts';
import { findExactSpot, findMacroSpot, findSpot } from './macro-placement.ts';
import { maybeQueueTrain, type SupplyBudget } from './macro-production.ts';
import { type ProducerReservations } from './macro-producers.ts';
import { maybeQueueRaceResearch } from './macro-research.ts';
import { maybeQueueRaceTechStructure } from './macro-tech.ts';
import type { BotIntent } from './macro-intents.ts';
import type { BotFacts } from './macro.ts';

export type MacroScheduleConfig = {
  workerTarget?: number;
  barracksTarget: number;
};

export type MacroSchedule = {
  budget: ResourceBudget;
  builderUsed: boolean;
  builder: number;
  army: number;
  intents: BotIntent[];
  retaskableArmy: number[];
  casters: number[];
};

const intentUrgency = (kind: BotIntent['kind']): number => {
  switch (kind) {
    case 'rebuild-tech': return 45;
    case 'expand': return 35;
    case 'spend-larva': return 35;
    case 'add-production': return 30;
    case 'train-counter': return 30;
    case 'research-upgrade': return 25;
    default: return 20;
  }
};

const techTransformKind = (kind: number): boolean =>
  kind === Kind.Lair || kind === Kind.Hive || kind === Kind.GreaterSpire;

const commandMacroIntent = (command: Command, faction: Faction): BotIntent | null => {
  switch (command.t) {
    case 'build': {
      const kind = command.kind === faction.depot
        ? 'expand'
        : command.kind === faction.supplyStructure || command.kind === faction.armyStructure || command.kind === Kind.Hatchery
          ? 'add-production'
          : 'rebuild-tech';
      return { kind, urgency: intentUrgency(kind), targetKind: command.kind, x: command.x, y: command.y };
    }
    case 'land':
      return { kind: 'expand', urgency: intentUrgency('expand'), targetKind: faction.depot, x: command.x, y: command.y };
    case 'addon':
      return { kind: 'add-production', urgency: intentUrgency('add-production'), targetKind: command.kind };
    case 'research':
      return { kind: 'research-upgrade', urgency: intentUrgency('research-upgrade') };
    case 'train':
      return Units[command.kind]?.buildMethod === 'larva'
        ? { kind: 'spend-larva', urgency: intentUrgency('spend-larva'), targetKind: command.kind }
        : command.kind === faction.armyUnit
          ? { kind: 'train-counter', urgency: intentUrgency('train-counter'), targetKind: command.kind }
          : null;
    case 'transform': {
      const kind = techTransformKind(command.kind) ? 'rebuild-tech' : 'train-counter';
      return { kind, urgency: intentUrgency(kind), targetKind: command.kind };
    }
    default:
      return null;
  }
};

export const macroIntentsFromCommands = (
  commands: readonly Command[],
  faction: Faction,
): BotIntent[] => {
  const intents: BotIntent[] = [];
  const seen = new Set<string>();
  for (const command of commands) {
    const intent = commandMacroIntent(command, faction);
    if (!intent) continue;
    const key = `${intent.kind}:${intent.targetKind ?? NONE}:${intent.x ?? NONE}:${intent.y ?? NONE}`;
    if (seen.has(key)) continue;
    seen.add(key);
    intents.push(intent);
  }
  return intents;
};

export const scheduleBotMacro = (
  s: State,
  player: number,
  faction: Faction,
  cmds: Command[],
  facts: BotFacts,
  config: MacroScheduleConfig,
): MacroSchedule => {
  const e = s.e;
  const commandStart = cmds.length;
  const depot = facts.primaryBase;
  const economy = summarizeEconomyRoster(s, player, faction);
  const workers = facts.workers.length;
  const idleDepots = economy.idleDepots;
  const idleLarvae = facts.idleLarvae;
  const builtArmyStructures = economy.builtArmyStructures;
  const pendingArmyStructures = economy.pendingArmyStructures;
  const pendingSupply = economy.pendingSupply;

  const budget: ResourceBudget = { minerals: s.players.minerals[player]!, gas: s.players.gas[player]! };
  const supplyBudget: SupplyBudget = { used: s.players.supplyUsed[player]!, max: s.players.supplyMax[player]! };
  const workerDef = Units[faction.worker]!;
  const armyDef = Units[faction.armyUnit]!;
  const workerProducer = workerDef.buildMethod === 'larva' ? idleLarvae : idleDepots;
  const armyProducer = armyDef.buildMethod === 'larva' ? idleLarvae : builtArmyStructures;
  const usedProducers = new Set<number>();
  const reservedTechProducers: ProducerReservations = new Set();
  let builderUsed = false;

  const workerTarget = desiredWorkerCount(s, depot, config.workerTarget);
  maybeSetArmyStructureRallies(s, cmds, depot, builtArmyStructures);

  maybeQueueWorkers(
    s,
    player,
    cmds,
    budget,
    supplyBudget,
    workerProducer,
    usedProducers,
    faction.worker,
    workers,
    workerTarget,
  );

  const supplyQueued = maybeQueueSupply(
    s,
    player,
    faction,
    cmds,
    budget,
    supplyBudget,
    idleLarvae,
    usedProducers,
    economy.builder,
    depot,
    pendingSupply,
    findSpot,
  );
  if (supplyQueued.queued) {
    builderUsed = supplyQueued.usedBuilder;
  } else if (maybeQueueArmyStructure(
    s,
    player,
    faction,
    cmds,
    budget,
    economy.builder,
    depot,
    builtArmyStructures.length,
    pendingArmyStructures,
    config.barracksTarget,
    findMacroSpot,
  )) {
    builderUsed = true;
  }

  if (!builderUsed) {
    builderUsed = maybeQueueRaceTechStructure(
      s,
      player,
      faction,
      facts,
      cmds,
      budget,
      economy.builder,
      depot,
      findMacroSpot,
    );
  }

  maybeQueueTerranAddons(s, player, faction, cmds, budget, reservedTechProducers);
  maybeQueueZergMorphs(s, player, faction, cmds, budget);
  maybeQueueRaceResearch(s, player, faction, cmds, budget, reservedTechProducers);

  for (const producer of armyProducer) {
    if (producer === NONE || e.prodKind[producer] !== Kind.None) continue;
    maybeQueueTrain(s, player, cmds, budget, supplyBudget, [producer], usedProducers, faction.armyUnit);
  }

  if (!builderUsed) {
    builderUsed = maybeQueueCoreProductionCapacity(
      s,
      player,
      faction,
      cmds,
      budget,
      economy.builder,
      depot,
      config.barracksTarget,
      findMacroSpot,
    );
  }

  if (!builderUsed) {
    builderUsed = maybeQueueExpansion(s, player, faction, facts, cmds, budget, economy.builder, findExactSpot);
  }

  if (!builderUsed) {
    builderUsed = maybeQueueZergMacroHatchery(
      s,
      player,
      faction,
      cmds,
      budget,
      economy.builder,
      depot,
      idleLarvae,
      usedProducers,
      findMacroSpot,
    );
  }

  return {
    budget,
    builderUsed,
    builder: economy.builder,
    army: facts.army.length,
    intents: macroIntentsFromCommands(cmds.slice(commandStart), faction),
    retaskableArmy: facts.retaskableArmy,
    casters: facts.casters,
  };
};
