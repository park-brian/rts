export type BotFailureReason =
  | 'unsafe-location'
  | 'occupied-location'
  | 'missing-detection'
  | 'missing-prerequisite'
  | 'insufficient-force'
  | 'no-builder'
  | 'no-producer'
  | 'no-production-capacity'
  | 'supply-blocked'
  | 'resource-starved'
  | 'path-blocked';

export type BotIntentKind =
  | 'defend-base'
  | 'get-detection'
  | 'clear-site'
  | 'rebuild-tech'
  | 'add-production'
  | 'expand'
  | 'spend-larva'
  | 'train-counter'
  | 'research-upgrade'
  | 'attack-wave'
  | 'harass'
  | 'retreat';

export type BotIntent = {
  kind: BotIntentKind;
  urgency: number;
  expiresAt?: number;
  targetKind?: number;
  targetSlot?: number;
  x?: number;
  y?: number;
};

export type BotIntentResult =
  | { status: 'done' }
  | { status: 'waiting'; reason: BotFailureReason }
  | { status: 'blocked'; reason: BotFailureReason; followup?: BotIntent }
  | { status: 'failed'; reason: BotFailureReason };
