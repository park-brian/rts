import {
  Kind,
  NONE,
  isLarvaProductKind,
  type Command,
  type Faction,
  type State,
} from '@rts/sim';
import { maybeQueueTerranAddons } from './macro-addons.ts';
import { type MacroSpotFinder, type PointSpotFinder, type ResourceBudget, type StructureBlock } from './macro-build.ts';
import { queueCoreProductionCapacity, queueZergMacroHatchery, type CapacityQueueResult } from './macro-capacity.ts';
import {
  desiredWorkerCount,
  queueArmyStructure,
  maybeQueueSupply,
  maybeQueueWorkers,
  maybeSetArmyStructureRallies,
  summarizeEconomyRoster,
} from './macro-economy.ts';
import { queueExpansion } from './macro-expansion.ts';
import { botIntent, rankBotIntentCandidates, type BotIntentCandidate } from './macro-expert.ts';
import { gasStructureKind, queueGasStructure } from './macro-gas.ts';
import { maybeQueueZergMorphs } from './macro-morph.ts';
import { botExpertContext } from './macro-objective.ts';
import { findExactSpot, findMacroSpot, findSpot, type PlacementDiagnostic } from './macro-placement.ts';
import { maybeQueueTrain, trainFailureReason, type SupplyBudget } from './macro-production.ts';
import { type ProducerReservations } from './macro-producers.ts';
import { maybeQueueRaceResearch } from './macro-research.ts';
import { queueRaceTechStructure } from './macro-tech.ts';
import { isStaticDefenseMacroKind, queueStaticDefense } from './macro-static-defense.ts';
import type { BotFailureReason, BotIntent, BotIntentRecord } from './macro-intents.ts';
import { macroFloatStallActive, placementStallAnchorKeys, productionStallActive, type BotMemory } from './macro-memory.ts';
import type { BotFacts } from './macro.ts';
import type { BotStrategyPosture } from './macro-strategy.ts';

export type MacroScheduleConfig = {
  workerTarget?: number;
  barracksTarget: number;
  attackThreshold?: number;
  strategy?: BotStrategyPosture;
  placementDiagnostics?: PlacementDiagnostic[];
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
    intent: botIntent(intentKind, { targetKind: kind }),
    result: { status: 'waiting', reason },
  };
};

const structureIntentKind = (faction: Faction, kind: number): BotIntent['kind'] => {
  if (kind === gasStructureKind(faction)) return 'take-gas';
  if (isStaticDefenseMacroKind(faction, kind)) return 'add-static-defense';
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
    intent: botIntent(kind, {
      targetKind: block.kind,
      ...(block.x !== undefined && block.y !== undefined ? { x: block.x, y: block.y } : {}),
    }),
    result: blockedStructureReason(block)
      ? { status: 'blocked', reason: block.reason }
      : { status: 'waiting', reason: block.reason },
  };
};

const commandMacroIntent = (command: Command, faction: Faction): BotIntent | null => {
  switch (command.t) {
    case 'build': {
      const kind = structureIntentKind(faction, command.kind);
      return botIntent(kind, { targetKind: command.kind, x: command.x, y: command.y });
    }
    case 'land':
      return botIntent('expand', { targetKind: faction.depot, x: command.x, y: command.y });
    case 'addon':
      return botIntent('add-production', { targetKind: command.kind });
    case 'research':
      return botIntent('research-upgrade', { targetTech: command.tech });
    case 'train': {
      const kind = trainIntentKind(command.kind, faction);
      if (kind === 'train-counter' && command.kind !== faction.armyUnit) return null;
      return botIntent(kind, { targetKind: command.kind });
    }
    case 'transform': {
      if (isStaticDefenseMacroKind(faction, command.kind)) {
        return botIntent('add-static-defense', { targetKind: command.kind });
      }
      const kind = techTransformKind(command.kind) ? 'rebuild-tech' : 'train-counter';
      return botIntent(kind, { targetKind: command.kind });
    }
    default:
      return null;
  }
};

type MacroGrowthAttempt = {
  queued: boolean;
  block?: StructureBlock;
  outcome?: BotIntentRecord;
};

type MacroGrowthCandidate = BotIntentCandidate<{
  intent: BotIntent;
  run: () => MacroGrowthAttempt;
}>;

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
  const placementOptions = {
    risk: facts.risk,
    diagnostics: config.placementDiagnostics,
    stalledAnchors: memory ? placementStallAnchorKeys(memory, s.tick) : undefined,
  };
  const riskAwareFindSpot: PointSpotFinder = (state, owner, worker, kind, x, y, request = {}) =>
    findSpot(state, owner, worker, kind, x, y, { ...placementOptions, ...request });
  const riskAwareFindMacroSpot: MacroSpotFinder = (state, owner, worker, kind, fallback, request = {}) =>
    findMacroSpot(state, owner, worker, kind, fallback, { ...placementOptions, ...request });

  const workerTarget = desiredWorkerCount(s, depot, config.workerTarget);
  const expert = botExpertContext(s, player, facts, workerTarget, config.attackThreshold ?? 12, config.strategy);
  const productionStalled = memory ? productionStallActive(memory, s.tick) : false;
  const macroFloatStalled = memory ? macroFloatStallActive(memory, s.tick) : false;
  const postureWantsProduction = (config.strategy?.productionRatio ?? 0) >= 1 &&
    config.strategy?.techTarget === 'combat-production';
  const postureWantsExpansion = config.strategy?.expansionPriority === 'high';
  const capacityPressure = { productionStalled: productionStalled || postureWantsProduction };
  const expansionPressure = { macroFloatStalled: macroFloatStalled || postureWantsExpansion };
  const queueProductionCapacity = (): CapacityQueueResult => faction.name === 'Zerg'
    ? queueZergMacroHatchery(
      s,
      player,
      faction,
      cmds,
      budget,
      economy.builder,
      depot,
      idleLarvae,
      usedProducers,
      riskAwareFindMacroSpot,
      capacityPressure,
    )
    : queueCoreProductionCapacity(
      s,
      player,
      faction,
      cmds,
      budget,
      economy.builder,
      depot,
      config.barracksTarget,
      riskAwareFindMacroSpot,
      capacityPressure,
    );
  maybeSetArmyStructureRallies(s, cmds, depot, builtArmyStructures);

  if (armyIsLarvaProduct && builtArmyStructures.length > 0 && facts.army.length === 0) {
    maybeQueueTrain(s, player, cmds, budget, supplyBudget, armyProducer, usedProducers, faction.armyUnit);
  }

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
    riskAwareFindSpot,
  );
  if (supplyQueued.queued) {
    builderUsed = supplyQueued.usedBuilder;
  } else if (supplyQueued.block) {
    intentResults.push(structureOutcome(faction, supplyQueued.block));
  }

  if (!supplyQueued.queued) {
    const staticDefense = queueStaticDefense(
      s,
      player,
      faction,
      facts,
      cmds,
      budget,
      economy.builder,
      depot,
      riskAwareFindMacroSpot,
      riskAwareFindSpot,
    );
    if (staticDefense.queued) {
      builderUsed = staticDefense.usedBuilder;
    } else if (staticDefense.block) {
      intentResults.push(structureOutcome(faction, staticDefense.block));
    }
  }

  if (!supplyQueued.queued && !builderUsed) {
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
      riskAwareFindMacroSpot,
    );
    if (armyStructure.queued) {
      builderUsed = true;
    } else if (armyStructure.block) {
      intentResults.push(structureOutcome(faction, armyStructure.block));
    }
  }

  if (!supplyQueued.queued && !builderUsed && config.strategy?.gasTiming === 'soon') {
    const gasKind = gasStructureKind(faction);
    if (!facts.ownedOrPendingStructureKinds.has(gasKind)) {
      const gas = queueGasStructure(
        s,
        player,
        faction,
        cmds,
        budget,
        economy.builder,
        depot,
      );
      if (gas.queued) {
        builderUsed = true;
      } else if (gas.block) {
        intentResults.push(structureOutcome(faction, gas.block));
      }
    }
  }

  let stalledCapacityAttempted = false;
  if (!builderUsed && productionStalled) {
    stalledCapacityAttempted = true;
    const capacity = queueProductionCapacity();
    if (capacity.queued) {
      builderUsed = true;
    } else if (capacity.block) {
      intentResults.push(structureOutcome(faction, capacity.block));
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
      riskAwareFindMacroSpot,
      config.strategy,
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
      intent: botIntent('add-production', { targetKind: addonBlock.kind }),
      result: addonBlock.reason === 'occupied-location'
        ? { status: 'blocked', reason: addonBlock.reason }
        : { status: 'waiting', reason: addonBlock.reason },
    });
  }
  const morphBlock = maybeQueueZergMorphs(s, player, faction, cmds, budget);
  if (morphBlock) {
    const intentKind = techTransformKind(morphBlock.kind) ? 'rebuild-tech' : trainIntentKind(morphBlock.kind, faction);
    intentResults.push({
      intent: botIntent(intentKind, { targetKind: morphBlock.kind }),
      result: { status: 'waiting', reason: morphBlock.reason },
    });
  }
  const researchBlock = maybeQueueRaceResearch(s, player, faction, cmds, budget, reservedTechProducers);
  if (researchBlock) {
    intentResults.push({
      intent: botIntent('research-upgrade', { targetTech: researchBlock.tech }),
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
    const growthCandidates: MacroGrowthCandidate[] = [];
    if (faction.name !== 'Zerg' && config.barracksTarget > 0) {
      growthCandidates.push({
        order: 0,
        intent: botIntent('add-production', { targetKind: faction.armyStructure }),
        run: queueProductionCapacity,
      });
    }
    growthCandidates.push({
      order: 1,
      intent: botIntent('expand', { targetKind: faction.depot }),
      run: () => queueExpansion(
        s,
        player,
        faction,
        facts,
        cmds,
        budget,
        economy.builder,
        findExactSpot,
        memory,
        expansionPressure,
      ),
    });
    if (faction.name === 'Zerg') {
      growthCandidates.push({
        order: 2,
        intent: botIntent('add-production', { targetKind: Kind.Hatchery }),
        run: queueProductionCapacity,
      });
    }

    const candidates = stalledCapacityAttempted
      ? growthCandidates.filter((candidate) => candidate.intent.kind !== 'add-production')
      : growthCandidates;
    for (const candidate of rankBotIntentCandidates(candidates, expert)) {
      const attempt = candidate.run();
      if (attempt.block) intentResults.push(structureOutcome(faction, attempt.block));
      if (attempt.outcome) intentResults.push(attempt.outcome);
      if (attempt.queued) {
        builderUsed = true;
        break;
      }
    }
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
