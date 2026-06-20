import {
  Kind,
  NONE,
  isLarvaProductKind,
  type Command,
  type Faction,
  type State,
} from '@rts/sim';
import { maybeQueueTerranAddons } from './macro-addons.ts';
import { type ResourceBudget, type StructureBlock } from './macro-build.ts';
import { queueCoreProductionCapacity, queueZergMacroHatchery } from './macro-capacity.ts';
import {
  desiredWorkerCount,
  queueArmyStructure,
  maybeQueueSupply,
  maybeQueueWorkers,
  maybeSetArmyStructureRallies,
  summarizeEconomyRoster,
} from './macro-economy.ts';
import { queueExpansion } from './macro-expansion.ts';
import { maybeQueueZergMorphs } from './macro-morph.ts';
import { findExactSpot, findMacroSpot, findSpot } from './macro-placement.ts';
import { maybeQueueTrain, trainFailureReason, type SupplyBudget } from './macro-production.ts';
import { type ProducerReservations } from './macro-producers.ts';
import { maybeQueueRaceResearch } from './macro-research.ts';
import { queueRaceTechStructure } from './macro-tech.ts';
import type { BotFailureReason, BotIntent, BotIntentRecord } from './macro-intents.ts';
import type { BotMemory } from './macro-memory.ts';
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
  intentResults: BotIntentRecord[];
  retaskableArmy: number[];
  casters: number[];
};

const intentUrgency = (kind: BotIntent['kind']): number => {
  switch (kind) {
    case 'rebuild-tech': return 45;
    case 'expand': return 35;
    case 'train-worker': return 35;
    case 'spend-larva': return 35;
    case 'add-production': return 30;
    case 'train-counter': return 30;
    case 'research-upgrade': return 25;
    default: return 20;
  }
};

const techTransformKind = (kind: number): boolean =>
  kind === Kind.Lair || kind === Kind.Hive || kind === Kind.GreaterSpire;

const trainIntentKind = (kind: number, faction: Faction): BotIntent['kind'] => {
  if (kind === faction.worker) return 'train-worker';
  return isLarvaProductKind(kind) ? 'spend-larva' : 'train-counter';
};

const trainOutcome = (
  faction: Faction,
  kind: number,
  reason: BotFailureReason,
): BotIntentRecord => {
  const intentKind = trainIntentKind(kind, faction);
  return {
    intent: { kind: intentKind, urgency: intentUrgency(intentKind), targetKind: kind },
    result: { status: 'waiting', reason },
  };
};

const structureIntentKind = (faction: Faction, kind: number): BotIntent['kind'] => {
  if (kind === faction.depot) return 'expand';
  if (kind === faction.supplyStructure || kind === faction.armyStructure || kind === Kind.Hatchery) {
    return 'add-production';
  }
  return 'rebuild-tech';
};

const blockedStructureReason = (block: StructureBlock): boolean =>
  block.x !== undefined &&
  block.y !== undefined &&
  (block.reason === 'occupied-location' || block.reason === 'path-blocked' || block.reason === 'unsafe-location');

const structureOutcome = (faction: Faction, block: StructureBlock): BotIntentRecord => {
  const kind = structureIntentKind(faction, block.kind);
  return {
    intent: {
      kind,
      urgency: intentUrgency(kind),
      targetKind: block.kind,
      ...(block.x !== undefined && block.y !== undefined ? { x: block.x, y: block.y } : {}),
    },
    result: blockedStructureReason(block)
      ? { status: 'blocked', reason: block.reason }
      : { status: 'waiting', reason: block.reason },
  };
};

const commandMacroIntent = (command: Command, faction: Faction): BotIntent | null => {
  switch (command.t) {
    case 'build': {
      const kind = structureIntentKind(faction, command.kind);
      return { kind, urgency: intentUrgency(kind), targetKind: command.kind, x: command.x, y: command.y };
    }
    case 'land':
      return { kind: 'expand', urgency: intentUrgency('expand'), targetKind: faction.depot, x: command.x, y: command.y };
    case 'addon':
      return { kind: 'add-production', urgency: intentUrgency('add-production'), targetKind: command.kind };
    case 'research':
      return { kind: 'research-upgrade', urgency: intentUrgency('research-upgrade'), targetTech: command.tech };
    case 'train': {
      const kind = trainIntentKind(command.kind, faction);
      if (kind === 'train-counter' && command.kind !== faction.armyUnit) return null;
      return { kind, urgency: intentUrgency(kind), targetKind: command.kind };
    }
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
    const key = `${intent.kind}:${intent.targetKind ?? NONE}:${intent.targetTech ?? NONE}:${intent.x ?? NONE}:${intent.y ?? NONE}`;
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
  memory?: BotMemory,
): MacroSchedule => {
  const e = s.e;
  const commandStart = cmds.length;
  const depot = facts.primaryBase;
  const economy = summarizeEconomyRoster(s, player, faction);
  const workers = facts.workers.length;
  const idleDepots = economy.idleDepots;
  const builtDepots = economy.builtDepots;
  const idleLarvae = facts.idleLarvae;
  const builtArmyStructures = economy.builtArmyStructures;
  const pendingArmyStructures = economy.pendingArmyStructures;
  const pendingSupply = economy.pendingSupply;

  const budget: ResourceBudget = { minerals: s.players.minerals[player]!, gas: s.players.gas[player]! };
  const supplyBudget: SupplyBudget = { used: s.players.supplyUsed[player]!, max: s.players.supplyMax[player]! };
  const workerIsLarvaProduct = isLarvaProductKind(faction.worker);
  const armyIsLarvaProduct = isLarvaProductKind(faction.armyUnit);
  const workerProducer = workerIsLarvaProduct ? idleLarvae : idleDepots;
  const workerOutcomeProducer = workerIsLarvaProduct ? idleLarvae : builtDepots;
  const armyProducer = armyIsLarvaProduct ? idleLarvae : builtArmyStructures;
  const usedProducers = new Set<number>();
  const reservedTechProducers: ProducerReservations = new Set();
  const intentResults: BotIntentRecord[] = [];
  let builderUsed = false;

  const workerTarget = desiredWorkerCount(s, depot, config.workerTarget);
  maybeSetArmyStructureRallies(s, cmds, depot, builtArmyStructures);

  const workerCommandStart = cmds.length;
  const queuedWorkers = maybeQueueWorkers(
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
  if (workers < workerTarget && queuedWorkers === 0 && cmds.length === workerCommandStart) {
    const reason = trainFailureReason(s, player, workerOutcomeProducer, usedProducers, budget, supplyBudget, faction.worker);
    if (reason) intentResults.push(trainOutcome(faction, faction.worker, reason));
  }

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
  } else if (supplyQueued.block) {
    intentResults.push(structureOutcome(faction, supplyQueued.block));
  }

  if (!supplyQueued.queued) {
    const armyStructure = queueArmyStructure(
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
    );
    if (armyStructure.queued) {
      builderUsed = true;
    } else if (armyStructure.block) {
      intentResults.push(structureOutcome(faction, armyStructure.block));
    }
  }

  if (!builderUsed) {
    const techStructure = queueRaceTechStructure(
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
    if (techStructure.queued) {
      builderUsed = true;
    } else if (techStructure.block) {
      intentResults.push(structureOutcome(faction, techStructure.block));
    }
  }

  const addonBlock = maybeQueueTerranAddons(s, player, faction, cmds, budget, reservedTechProducers);
  if (addonBlock) {
    intentResults.push({
      intent: {
        kind: 'add-production',
        urgency: intentUrgency('add-production'),
        targetKind: addonBlock.kind,
      },
      result: addonBlock.reason === 'occupied-location'
        ? { status: 'blocked', reason: addonBlock.reason }
        : { status: 'waiting', reason: addonBlock.reason },
    });
  }
  const morphBlock = maybeQueueZergMorphs(s, player, faction, cmds, budget);
  if (morphBlock) {
    const intentKind = techTransformKind(morphBlock.kind) ? 'rebuild-tech' : trainIntentKind(morphBlock.kind, faction);
    intentResults.push({
      intent: { kind: intentKind, urgency: intentUrgency(intentKind), targetKind: morphBlock.kind },
      result: { status: 'waiting', reason: morphBlock.reason },
    });
  }
  const researchBlock = maybeQueueRaceResearch(s, player, faction, cmds, budget, reservedTechProducers);
  if (researchBlock) {
    intentResults.push({
      intent: {
        kind: 'research-upgrade',
        urgency: intentUrgency('research-upgrade'),
        targetTech: researchBlock.tech,
      },
      result: { status: 'waiting', reason: researchBlock.reason },
    });
  }

  const armyCommandStart = cmds.length;
  for (const producer of armyProducer) {
    if (producer === NONE || e.prodKind[producer] !== Kind.None) continue;
    maybeQueueTrain(s, player, cmds, budget, supplyBudget, [producer], usedProducers, faction.armyUnit);
  }
  if (cmds.length === armyCommandStart) {
    const reason = trainFailureReason(s, player, armyProducer, usedProducers, budget, supplyBudget, faction.armyUnit);
    if (reason) intentResults.push(trainOutcome(faction, faction.armyUnit, reason));
  }

  if (!builderUsed) {
    const capacity = queueCoreProductionCapacity(
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
    builderUsed = capacity.queued;
    if (capacity.block) intentResults.push(structureOutcome(faction, capacity.block));
  }

  if (!builderUsed) {
    const expansion = queueExpansion(s, player, faction, facts, cmds, budget, economy.builder, findExactSpot, memory);
    builderUsed = expansion.queued;
    if (expansion.outcome) intentResults.push(expansion.outcome);
  }

  if (!builderUsed) {
    const macroHatchery = queueZergMacroHatchery(
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
    builderUsed = macroHatchery.queued;
    if (macroHatchery.block) intentResults.push(structureOutcome(faction, macroHatchery.block));
  }

  return {
    budget,
    builderUsed,
    builder: economy.builder,
    army: facts.army.length,
    intents: macroIntentsFromCommands(cmds.slice(commandStart), faction),
    intentResults,
    retaskableArmy: facts.retaskableArmy,
    casters: facts.casters,
  };
};
