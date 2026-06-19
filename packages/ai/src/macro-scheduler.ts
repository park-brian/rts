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
  retaskableArmy: number[];
  casters: number[];
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
    retaskableArmy: facts.retaskableArmy,
    casters: facts.casters,
  };
};
