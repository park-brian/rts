import type { BotIntent, BotIntentExpectation, BotIntentKind, BotIntentRecord, BotVictoryAxis } from './macro-intents.ts';
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

export const botIntentVictoryAxis = (kind: BotIntentKind): BotVictoryAxis => {
  switch (kind) {
    case 'train-worker':
    case 'expand':
      return 'economy-growth';
    case 'spend-larva':
    case 'train-counter':
      return 'combat-strength';
    case 'add-production':
      return 'production-throughput';
    case 'take-gas':
    case 'rebuild-tech':
    case 'research-upgrade':
      return 'tech-unlock';
    case 'defend-base':
    case 'get-detection':
    case 'clear-site':
    case 'evacuate-workers':
    case 'add-static-defense':
    case 'retreat':
      return 'safety';
    case 'attack-wave':
    case 'harass':
    case 'contain':
    case 'counterattack':
      return 'enemy-degradation';
    case 'scout':
      return 'map-control';
  }
};

export const botIntentExpectation = (kind: BotIntentKind): BotIntentExpectation => {
  switch (kind) {
    case 'train-worker':
      return {
        metric: 'worker-pipeline',
        windowTicks: 8 * 24,
        detail: 'worker production should enter the queue',
      };
    case 'spend-larva':
    case 'train-counter':
      return {
        metric: 'combat-pipeline',
        windowTicks: 8 * 24,
        detail: 'combat production should enter the queue',
      };
    case 'add-production':
      return {
        metric: 'production-capacity',
        windowTicks: 45 * 24,
        detail: 'combat production capacity should increase or become pending',
      };
    case 'expand':
      return {
        metric: 'base-count',
        windowTicks: 90 * 24,
        detail: 'a resource depot should start or complete at a base cluster',
      };
    case 'take-gas':
    case 'rebuild-tech':
    case 'research-upgrade':
      return {
        metric: 'tech-unlock',
        windowTicks: 60 * 24,
        detail: 'a tech, upgrade, gas, add-on, or prerequisite should progress',
      };
    case 'add-static-defense':
      return {
        metric: 'defense-command',
        windowTicks: 45 * 24,
        detail: 'static defense should start near the protected region',
      };
    case 'defend-base':
    case 'get-detection':
    case 'clear-site':
    case 'evacuate-workers':
    case 'retreat':
      return {
        metric: 'safety-command',
        windowTicks: 10 * 24,
        detail: 'a safety command should be issued or the incident should resolve',
      };
    case 'attack-wave':
    case 'harass':
    case 'contain':
    case 'counterattack':
      return {
        metric: 'combat-command',
        windowTicks: 12 * 24,
        detail: 'combat units should receive attack, travel, or ability commands',
      };
    case 'scout':
      return {
        metric: 'map-control',
        windowTicks: 30 * 24,
        detail: 'scouting should reveal or approach valuable map space',
      };
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
