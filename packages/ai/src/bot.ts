// A complete hardcoded AI in the spirit of docs/specs/ai-training.md §4: economy
// (workers + supply), tech (army structures), production (pump army), and military
// (attack in waves at the enemy, defend the base when threatened). God-vision,
// deterministic (no RNG), faction-driven. This is both the built-in opponent and
// the demonstrator we'll behavior-clone from later.

import { NONE, type Command, type Controller, type Faction, type State } from '@rts/sim';
import { desiredWorkerCount } from './macro-economy.ts';
import { rankBotIntentRecords, scoreBotIntentRecords } from './macro-expert.ts';
import { executePressureIntent, proposePressureIntent, type PressureScheduleResult } from './macro-offense.ts';
import { botExpertContext } from './macro-objective.ts';
import { findSpot } from './macro-placement.ts';
import { combatReserve } from './macro-reserve.ts';
import { scheduleBotMacro } from './macro-scheduler.ts';
import { botStrategyPosture, type BotStrategyPosture } from './macro-strategy.ts';
import { executeTacticalDefense, proposeTacticalDefense, tacticalIntentResult } from './macro-tactics.ts';
import { createBotMemory, rememberIntentOutcomes, type BotMemory } from './macro-memory.ts';
import { collectBotFacts } from './macro.ts';
import type { BotIntent, BotIntentRecord, BotIntentResult } from './macro-intents.ts';

export type BotConfig = {
  workerTarget?: number; // omit to auto-derive from the base's mineral-patch count
  barracksTarget: number;
  attackThreshold: number; // army size that triggers an attack wave
};

export type BotTurnPlan = {
  commands: Command[];
  intents: BotIntent[];
  intentResults: BotIntentRecord[];
  strategy: BotStrategyPosture;
};

export type BotPlanner = (s: State, p: number) => BotTurnPlan;

const DEFAULT: Omit<BotConfig, 'workerTarget'> = { barracksTarget: 3, attackThreshold: 12 };

const done: BotIntentResult = { status: 'done' };
const waitingForForce: BotIntentResult = { status: 'waiting', reason: 'insufficient-force' };

const pressureIntentResult = (
  result: Pick<PressureScheduleResult, 'decision' | 'focus' | 'issued'>,
): BotIntentResult => {
  if (result.issued) return done;
  if (result.decision.status === 'waiting') return waitingForForce;
  return { status: 'blocked', reason: result.focus ? 'insufficient-force' : 'path-blocked' };
};

export const createBotPlanner = (faction: Faction, cfg: Partial<BotConfig> = {}): BotPlanner => {
  const c = { ...DEFAULT, ...cfg };
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

  return (s: State, p: number): BotTurnPlan => {
    const cmds: Command[] = [];
    const intentResults: BotIntentRecord[] = [];

    const facts = collectBotFacts(s, p, faction, { risk: 'none' });
    const depot = facts.primaryBase;
    const workerTarget = depot === NONE
      ? c.workerTarget ?? faction.startWorkers
      : desiredWorkerCount(s, depot, c.workerTarget);
    const strategy = botStrategyPosture(faction, facts, {
      workerTarget,
      attackThreshold: c.attackThreshold,
    });
    if (depot === NONE) return { commands: cmds, intents: [], intentResults, strategy }; // no base: nothing to do

    const memory = prepareMemory(p, s.tick);
    const expert = botExpertContext(s, p, facts, strategy.workerTarget, strategy.attackThreshold, strategy);
    const macro = scheduleBotMacro(s, p, faction, cmds, facts, {
      ...c,
      workerTarget: strategy.workerTarget,
      attackThreshold: strategy.attackThreshold,
      strategy,
    }, memory);
    for (const intent of macro.intents) intentResults.push({ intent, result: done });
    intentResults.push(...macro.intentResults);

    // 5) Defense: tactical incidents protect every owned base, not only the initial depot.
    const defenseProposal = proposeTacticalDefense(s, facts, memory);
    const defenseCommandStart = cmds.length;
    const { incident, reserve } = executeTacticalDefense(
      s,
      p,
      cmds,
      facts,
      memory,
      defenseProposal,
      macro.retaskableArmy,
      macro.casters,
      macro.builderUsed ? macro.builder : NONE,
    );
    if (defenseProposal.intent) {
      intentResults.push({
        intent: defenseProposal.intent,
        result: tacticalIntentResult(defenseProposal.intent, cmds.length > defenseCommandStart),
      });
    }
    const pressureReserve = combatReserve(
      reserve.units,
      incident ? reserve.commitmentForce : macro.army,
      reserve.defenseActive,
    );

    // 6) Offense: propose pressure intent first, then let execution spend the remaining batch budget.
    const pressureProposal = proposePressureIntent(
      s,
      p,
      faction,
      facts,
      memory,
      depot,
      pressureReserve,
      {
        attackThreshold: strategy.attackThreshold,
        strategicOnly: incident !== undefined,
      },
    );
    const pressureResult = executePressureIntent(
      s,
      p,
      cmds,
      memory,
      pressureProposal,
      macro.casters,
      macro.budget,
      macro.builder,
      findSpot,
      {
        strategicOnly: incident !== undefined,
        builderUsed: macro.builderUsed,
      },
    );
    if (pressureProposal.intent) {
      intentResults.push({
        intent: pressureProposal.intent,
        result: pressureIntentResult(pressureResult),
      });
    }

    const rankedIntentResults = rankBotIntentRecords(scoreBotIntentRecords(intentResults, expert));
    rememberIntentOutcomes(memory, rankedIntentResults, s.tick, {
      resourceFloat: expert.objective.resourceFloat,
    });
    return {
      commands: cmds,
      intents: rankedIntentResults.map((record) => record.intent),
      intentResults: rankedIntentResults,
      strategy,
    };
  };
};

export const createBot = (faction: Faction, cfg: Partial<BotConfig> = {}): Controller => {
  const plan = createBotPlanner(faction, cfg);
  return (s: State, p: number): Command[] => plan(s, p).commands;
};
