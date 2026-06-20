import type { BotIntent, BotIntentKind, BotIntentRecord } from './macro-intents.ts';
import { scoreBotIntent, scoreBotIntentRecord, type BotExpertContext } from './macro-objective.ts';

export type BotIntentFields = Omit<BotIntent, 'kind' | 'urgency'> & {
  urgency?: number;
};

export type BotIntentCandidate<T = unknown> = T & {
  order: number;
  intent: BotIntent;
};

export const botIntentUrgency = (kind: BotIntentKind): number => {
  switch (kind) {
    case 'take-gas': return 46;
    case 'rebuild-tech': return 45;
    case 'add-static-defense': return 42;
    case 'expand': return 35;
    case 'train-worker': return 35;
    case 'spend-larva': return 35;
    case 'add-production': return 30;
    case 'train-counter': return 30;
    case 'research-upgrade': return 25;
    default: return 20;
  }
};

export const botIntent = (kind: BotIntentKind, fields: BotIntentFields = {}): BotIntent => {
  const { urgency, ...rest } = fields;
  return { kind, urgency: urgency ?? botIntentUrgency(kind), ...rest };
};

export const scoreBotIntentRecords = (
  records: readonly BotIntentRecord[],
  expert: BotExpertContext,
): BotIntentRecord[] => records.map((record) => scoreBotIntentRecord(record, expert));

export const rankBotIntentRecords = (records: readonly BotIntentRecord[]): BotIntentRecord[] =>
  [...records].sort((a, b) =>
    b.intent.urgency - a.intent.urgency ||
    (b.intent.score?.value ?? 0) - (a.intent.score?.value ?? 0));

export const rankBotIntentCandidates = <T extends BotIntentCandidate>(
  candidates: readonly T[],
  expert: BotExpertContext,
): T[] =>
  candidates
    .map((candidate) => ({ ...candidate, intent: scoreBotIntent(candidate.intent, expert) }))
    .sort((a, b) =>
      (b.intent.score?.value ?? 0) - (a.intent.score?.value ?? 0) ||
      b.intent.urgency - a.intent.urgency ||
      a.order - b.order);
