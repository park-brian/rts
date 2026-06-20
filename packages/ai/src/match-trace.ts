import {
  COMMAND_TYPES,
  createMatchStats,
  recordMatchStatsStep,
  type CommandResult,
  type CommandType,
  type Controller,
  type CountMap,
  type Faction,
  type MatchStats,
  type PlayerCommands,
  type Sim,
  type State,
} from '@rts/sim';
import { collectBotFacts } from './macro.ts';
import { BOT_INTENT_KINDS, type BotFailureReason, type BotIntentKind } from './macro-intents.ts';
import type { BotPlanner, BotTurnPlan } from './bot.ts';

export type BotTraceFrame = {
  tick: number;
  player: number;
  minerals: number;
  gas: number;
  supplyUsed: number;
  supplyMax: number;
  bases: number;
  workers: number;
  army: number;
  retaskableArmy: number;
  idleProducers: number;
  idleLarvae: number;
  visibleEnemies: number;
  commandsIssued: number;
  commandsByType: CountMap<CommandType>;
  intentsByKind: CountMap<BotIntentKind>;
  outcomesByStatus: CountMap<BotTraceOutcomeStatus>;
  waitsByReason: CountMap<BotFailureReason>;
  blocksByReason: CountMap<BotFailureReason>;
};

type BotTraceOutcomeStatus = 'done' | 'waiting' | 'blocked' | 'failed';

export type BotTraceParticipant = {
  faction: Faction;
  planner?: BotPlanner;
  controller?: Controller;
};

export type BotMatchTraceOptions = {
  maxTicks: number;
  sampleEvery?: number;
};

export type BotMatchTrace = {
  frames: BotTraceFrame[];
  stats: MatchStats;
  invalidCommands: number;
  commandResults: CommandResult[];
};

const blankCounts = <K extends string>(keys: readonly K[]): CountMap<K> => {
  const counts = Object.create(null) as CountMap<K>;
  for (const key of keys) counts[key] = 0;
  return counts;
};

const inc = <K extends string>(counts: CountMap<K>, key: K): void => {
  counts[key] = (counts[key] ?? 0) + 1;
};

export const botTraceFrame = (
  s: State,
  player: number,
  faction: Faction,
  plan: BotTurnPlan,
): BotTraceFrame => {
  const facts = collectBotFacts(s, player, faction, { risk: 'none' });
  const commandsByType = blankCounts<CommandType>(COMMAND_TYPES);
  const intentsByKind = blankCounts<BotIntentKind>(BOT_INTENT_KINDS);
  const outcomesByStatus = blankCounts<BotTraceOutcomeStatus>(['done', 'waiting', 'blocked', 'failed']);
  const waitsByReason = Object.create(null) as CountMap<BotFailureReason>;
  const blocksByReason = Object.create(null) as CountMap<BotFailureReason>;

  for (const command of plan.commands) inc(commandsByType, command.t);
  for (const intent of plan.intents) inc(intentsByKind, intent.kind);
  for (const record of plan.intentResults) {
    inc(outcomesByStatus, record.result.status);
    if (record.result.status === 'waiting') inc(waitsByReason, record.result.reason);
    if (record.result.status === 'blocked') inc(blocksByReason, record.result.reason);
  }

  return {
    tick: s.tick,
    player,
    minerals: facts.minerals,
    gas: facts.gas,
    supplyUsed: facts.supplyUsed,
    supplyMax: facts.supplyMax,
    bases: facts.bases.length,
    workers: facts.workers.length,
    army: facts.army.length,
    retaskableArmy: facts.retaskableArmy.length,
    idleProducers: facts.idleProducers.length,
    idleLarvae: facts.idleLarvae.length,
    visibleEnemies: facts.visibleEnemies.length,
    commandsIssued: plan.commands.length,
    commandsByType,
    intentsByKind,
    outcomesByStatus,
    waitsByReason,
    blocksByReason,
  };
};

const participantCommands = (
  s: State,
  player: number,
  participant: BotTraceParticipant,
  sampled: boolean,
  frames: BotTraceFrame[],
): PlayerCommands => {
  if (participant.planner) {
    const plan = participant.planner(s, player);
    if (sampled) frames.push(botTraceFrame(s, player, participant.faction, plan));
    return { player, cmds: plan.commands };
  }
  return { player, cmds: participant.controller?.(s, player) ?? [] };
};

export const runBotMatchTrace = (
  sim: Sim,
  participants: readonly BotTraceParticipant[],
  options: BotMatchTraceOptions,
): BotMatchTrace => {
  const stats = createMatchStats(sim.fullState());
  const frames: BotTraceFrame[] = [];
  const commandResults: CommandResult[] = [];
  const sampleEvery = Math.max(1, options.sampleEvery ?? 240);
  let invalidCommands = 0;

  for (let tick = 0; tick < options.maxTicks && !sim.fullState().result.over; tick++) {
    const s = sim.fullState();
    const sampled = tick % sampleEvery === 0;
    const batch = participants.map((participant, player) =>
      participantCommands(s, player, participant, sampled, frames));
    const results = sim.step(batch);
    commandResults.push(...results);
    for (const result of results) {
      if (!result.ok) invalidCommands++;
    }
    recordMatchStatsStep(stats, sim.fullState(), batch, results);
  }

  return { frames, stats, invalidCommands, commandResults };
};
