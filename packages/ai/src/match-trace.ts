import {
  COMMAND_TYPES,
  type CommandType,
  type CountMap,
  type Faction,
  type State,
} from '@rts/sim';
import { collectBotFacts } from './macro.ts';
import { BOT_INTENT_KINDS, type BotFailureReason, type BotIntentKind } from './macro-intents.ts';
import type { BotTurnPlan } from './bot.ts';

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

