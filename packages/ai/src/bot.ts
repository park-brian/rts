// A complete hardcoded AI in the spirit of docs/specs/ai-training.md §4: economy
// (workers + supply), tech (army structures), production (pump army), and military
// (attack in waves at the enemy, defend the base when threatened). God-vision,
// deterministic (no RNG), faction-driven. This is both the built-in opponent and
// the demonstrator we'll behavior-clone from later.

import {
  Kind, Units,
  NONE, type Faction, type State, type Command, type Controller,
} from '@rts/sim';
import { castTacticalAbilities } from './ability-policies.ts';
import { maybeQueueTerranAddons } from './macro-addons.ts';
import { type ResourceBudget } from './macro-build.ts';
import { maybeQueueCoreProductionCapacity, maybeQueueZergMacroHatchery } from './macro-capacity.ts';
import { issueDefenseEngagement, issuePressureEngagement } from './macro-combat.ts';
import { emergencyWorkerResponders, incidentTarget } from './macro-defense.ts';
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
import { maybeQueueNydusEndpoint } from './macro-nydus.ts';
import { findExactSpot, findMacroSpot, findSpot } from './macro-placement.ts';
import { maybeQueueTrain, type SupplyBudget } from './macro-production.ts';
import { type ProducerReservations } from './macro-producers.ts';
import { markPressureCommitted, pressureFocus, shouldCommitPressure } from './macro-pressure.ts';
import { maybeQueueRaceResearch } from './macro-research.ts';
import { maybeQueueRaceTechStructure } from './macro-tech.ts';
import {
  collectBotFacts,
  commitTacticalResponders,
  createBotMemory,
  deriveTacticalIncidents,
  rememberTacticalIncidents,
  type BotMemory,
} from './macro.ts';

export type BotConfig = {
  workerTarget?: number; // omit to auto-derive from the base's mineral-patch count
  barracksTarget: number;
  attackThreshold: number; // army size that triggers an attack wave
};

const DEFAULT: Omit<BotConfig, 'workerTarget'> = { barracksTarget: 3, attackThreshold: 12 };

export const createBot = (faction: Faction, cfg: Partial<BotConfig> = {}): Controller => {
  const c = { ...DEFAULT, ...cfg };
  const workerDef = Units[faction.worker]!;
  const armyDef = Units[faction.armyUnit]!;
  const memories = new Map<number, BotMemory>();
  const memoryFor = (player: number): BotMemory => {
    let memory = memories.get(player);
    if (!memory) {
      memory = createBotMemory();
      memories.set(player, memory);
    }
    return memory;
  };
  const prepareMemory = (player: number, tick: number): BotMemory => {
    let memory = memoryFor(player);
    if (tick < memory.lastTick) {
      memory = createBotMemory();
      memories.set(player, memory);
    }
    memory.lastTick = tick;
    return memory;
  };

  return (s: State, p: number): Command[] => {
    const e = s.e;
    const cmds: Command[] = [];

    const facts = collectBotFacts(s, p, faction, { risk: 'none' });
    const depot = facts.primaryBase;
    if (depot === NONE) return cmds; // no base: nothing to do

    const economy = summarizeEconomyRoster(s, p, faction);
    let workers = facts.workers.length;
    const idleDepots = economy.idleDepots;
    const idleLarvae = facts.idleLarvae;
    const builtBarracks = economy.builtArmyStructures;
    let pendingBarracks = economy.pendingArmyStructures;
    let pendingSupply = economy.pendingSupply;
    const army = facts.army.length;
    const retaskableArmy = facts.retaskableArmy;
    const casters = facts.casters;
    const aWorker = economy.builder;

    const budget: ResourceBudget = { minerals: s.players.minerals[p]!, gas: s.players.gas[p]! };
    const supplyBudget: SupplyBudget = { used: s.players.supplyUsed[p]!, max: s.players.supplyMax[p]! };
    const workerProducer = workerDef.buildMethod === 'larva' ? idleLarvae : idleDepots;
    const armyProducer = armyDef.buildMethod === 'larva' ? idleLarvae : builtBarracks;
    const usedProducers = new Set<number>();
    const reservedTechProducers: ProducerReservations = new Set();
    let builderUsed = false;

    const workerTarget = desiredWorkerCount(s, depot, c.workerTarget);
    maybeSetArmyStructureRallies(s, cmds, depot, builtBarracks);

    // 1) Workers from idle depots.
    workers += maybeQueueWorkers(
      s,
      p,
      cmds,
      budget,
      supplyBudget,
      workerProducer,
      usedProducers,
      faction.worker,
      workers,
      workerTarget,
    );

    // 2) Supply when nearly capped.
    const supplyQueued = maybeQueueSupply(
      s,
      p,
      faction,
      cmds,
      budget,
      supplyBudget,
      idleLarvae,
      usedProducers,
      aWorker,
      depot,
      pendingSupply,
      findSpot,
    );
    if (supplyQueued.queued) {
      builderUsed = supplyQueued.usedBuilder;
      pendingSupply++;
    }

    // 3) Army structures.
    else if (!builderUsed) {
      if (maybeQueueArmyStructure(
        s,
        p,
        faction,
        cmds,
        budget,
        aWorker,
        depot,
        builtBarracks.length,
        pendingBarracks,
        c.barracksTarget,
        findMacroSpot,
      )) {
        builderUsed = true;
        pendingBarracks++;
      }
    }

    if (!builderUsed) {
      builderUsed = maybeQueueRaceTechStructure(s, p, faction, facts, cmds, budget, aWorker, depot, findMacroSpot);
    }

    maybeQueueTerranAddons(s, p, faction, cmds, budget, reservedTechProducers);

    maybeQueueZergMorphs(s, p, faction, cmds, budget);

    maybeQueueRaceResearch(s, p, faction, cmds, budget, reservedTechProducers);

    // 4) Pump army from the faction's real producer.
    for (const b of armyProducer) {
      if (b === NONE || e.prodKind[b] !== Kind.None) continue;
      maybeQueueTrain(s, p, cmds, budget, supplyBudget, [b], usedProducers, faction.armyUnit);
    }

    if (!builderUsed) {
      builderUsed = maybeQueueCoreProductionCapacity(
        s,
        p,
        faction,
        cmds,
        budget,
        aWorker,
        depot,
        c.barracksTarget,
        findMacroSpot,
      );
    }

    if (!builderUsed) {
      builderUsed = maybeQueueExpansion(s, p, faction, facts, cmds, budget, aWorker, findExactSpot);
    }

    if (!builderUsed) {
      builderUsed = maybeQueueZergMacroHatchery(
        s,
        p,
        faction,
        cmds,
        budget,
        aWorker,
        depot,
        idleLarvae,
        usedProducers,
        findMacroSpot,
      );
    }

    // 5) Defense: incidents protect every owned base, not only the initial depot.
    const visibleIncidents = deriveTacticalIncidents(s, facts);
    const memory = prepareMemory(p, s.tick);
    const incident = rememberTacticalIncidents(memory, visibleIncidents, s.tick)[0];
    const threat = incident ? incidentTarget(s, incident) : NONE;
    let attackCandidates = retaskableArmy;
    if (incident) {
      const focusX = threat !== NONE ? e.x[threat]! : incident.x;
      const focusY = threat !== NONE ? e.y[threat]! : incident.y;
      if (threat !== NONE) castTacticalAbilities(s, p, cmds, casters, focusX, focusY);
      const defenders = commitTacticalResponders(s, memory, retaskableArmy, incident, threat, s.tick);
      defenders.push(...emergencyWorkerResponders(s, facts.workers, incident, defenders.length, builderUsed ? aWorker : NONE));
      const defenderSet = new Set(defenders);
      attackCandidates = retaskableArmy.filter((slot) => !defenderSet.has(slot));
      for (const a of defenders) {
        issueDefenseEngagement(s, cmds, a, { x: focusX, y: focusY, target: threat });
      }
    }

    if (shouldCommitPressure(memory, s.tick, incident ? attackCandidates.length : army, c.attackThreshold)) {
      // 6) Offense: pressure the enemy's most valuable exposed region.
      const pressureFacts = facts.enemyProtectedRegions.length > 1 && facts.visibleEnemies.length > 0
        ? collectBotFacts(s, p, faction)
        : facts;
      const focus = pressureFocus(s, p, pressureFacts, depot, { strategicOnly: incident !== undefined });
      if (focus) {
        let issuedOffense = false;
        if (!builderUsed) {
          builderUsed = maybeQueueNydusEndpoint(s, p, cmds, budget, aWorker, focus.x, focus.y, findSpot);
        }
        if (!incident) castTacticalAbilities(s, p, cmds, casters, focus.x, focus.y);
        for (const a of attackCandidates) {
          issuePressureEngagement(s, p, cmds, a, focus);
          issuedOffense = true;
        }
        if (issuedOffense) markPressureCommitted(memory, s.tick);
      }
    }

    return cmds;
  };
};
