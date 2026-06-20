export type BotFailureReason =
  | 'unsafe-location'
  | 'occupied-location'
  | 'missing-detection'
  | 'missing-prerequisite'
  | 'insufficient-force'
  | 'no-builder'
  | 'no-producer'
  | 'no-production-capacity'
  | 'placement-unavailable'
  | 'supply-blocked'
  | 'resource-starved'
  | 'path-blocked';

export const BOT_INTENT_KINDS = [
  'defend-base',
  'get-detection',
  'clear-site',
  'evacuate-workers',
  'take-gas',
  'rebuild-tech',
  'add-static-defense',
  'add-production',
  'expand',
  'train-worker',
  'spend-larva',
  'train-counter',
  'research-upgrade',
  'scout',
  'attack-wave',
  'harass',
  'contain',
  'counterattack',
  'retreat',
] as const;

export type BotIntentKind = typeof BOT_INTENT_KINDS[number];

export type BotIntentScoreReason = {
  kind:
    | 'economy-growth'
    | 'army-growth'
    | 'production-throughput'
    | 'tech-unlock'
    | 'supply-availability'
    | 'safety'
    | 'enemy-degradation'
    | 'map-control'
    | 'strategy';
  value: number;
  detail: string;
};

export type BotIntentScore = {
  value: number;
  reasons: BotIntentScoreReason[];
};

export type BotIntentProgressMetric =
  | 'worker-pipeline'
  | 'combat-pipeline'
  | 'production-capacity'
  | 'tech-unlock'
  | 'base-count'
  | 'defense-command'
  | 'combat-command'
  | 'safety-command'
  | 'map-control';

export type BotIntentExpectation = {
  metric: BotIntentProgressMetric;
  windowTicks: number;
  detail: string;
};

export type BotIntent = {
  kind: BotIntentKind;
  urgency: number;
  score?: BotIntentScore;
  expiresAt?: number;
  targetKind?: number;
  targetTech?: number;
  targetSlot?: number;
  x?: number;
  y?: number;
};

export type BotIntentResult =
  | { status: 'done' }
  | { status: 'waiting'; reason: BotFailureReason }
  | { status: 'blocked'; reason: BotFailureReason; followup?: BotIntent }
  | { status: 'failed'; reason: BotFailureReason };

export type BotIntentRecord = {
  intent: BotIntent;
  result: BotIntentResult;
};
