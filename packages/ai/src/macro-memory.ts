import { ONE, TILE } from '@rts/sim';
import type { TacticalIncident } from './macro-incidents.ts';
import type { BotFailureReason, BotIntentKind, BotIntentRecord } from './macro-intents.ts';

export const INTENT_OUTCOME_MEMORY_TICKS = 20 * 24;
export const PRODUCTION_STALL_REACTION_COUNT = 3;
export const PRODUCTION_STALL_FRESH_TICKS = 6 * 24;

export type ProductionStallMemory = {
  count: number;
  sinceTick: number;
  lastTick: number;
  reason?: BotFailureReason;
};

export type BotMemory = {
  lastTick: number;
  blockedSites: Map<string, { x: number; y: number; reason: BotFailureReason; tick: number }>;
  suspectedInvisibleThreats: Map<string, { x: number; y: number; tick: number }>;
  tacticalIncidents: Map<string, TacticalIncident>;
  tacticalCommitments: Map<string, { unitIds: number[]; expiresAt: number }>;
  productionStall: ProductionStallMemory;
  offenseWaitSince: number;
};

export const createBotMemory = (): BotMemory => ({
  lastTick: -1,
  blockedSites: new Map(),
  suspectedInvisibleThreats: new Map(),
  tacticalIncidents: new Map(),
  tacticalCommitments: new Map(),
  productionStall: { count: 0, sinceTick: -1, lastTick: -1 },
  offenseWaitSince: -1,
});

const tileKey = (x: number, y: number): string =>
  `${Math.trunc(x / (TILE * ONE))}:${Math.trunc(y / (TILE * ONE))}`;

const pruneOlderThan = <T extends { tick: number }>(entries: Map<string, T>, tick: number): void => {
  const oldest = tick - INTENT_OUTCOME_MEMORY_TICKS;
  for (const [key, value] of entries) {
    if (value.tick < oldest) entries.delete(key);
  }
};

const locationFailure = (reason: BotFailureReason): boolean =>
  reason === 'unsafe-location' || reason === 'occupied-location' || reason === 'path-blocked';

const productionIntent = (kind: BotIntentKind): boolean =>
  kind === 'train-counter' || kind === 'spend-larva';

const productionCapacityFailure = (reason: BotFailureReason): boolean =>
  reason === 'no-production-capacity' || reason === 'no-producer';

export const locationBlockedByIntentMemory = (memory: BotMemory, x: number, y: number): boolean =>
  memory.blockedSites.has(tileKey(x, y));

export const productionStallActive = (memory: BotMemory, tick: number): boolean =>
  memory.productionStall.count >= PRODUCTION_STALL_REACTION_COUNT &&
  tick - memory.productionStall.lastTick <= PRODUCTION_STALL_FRESH_TICKS;

const clearProductionStall = (memory: BotMemory): void => {
  memory.productionStall.count = 0;
  memory.productionStall.sinceTick = -1;
  memory.productionStall.lastTick = -1;
  memory.productionStall.reason = undefined;
};

const rememberProductionStall = (
  memory: BotMemory,
  records: readonly BotIntentRecord[],
  tick: number,
): void => {
  const record = records.find((candidate) => productionIntent(candidate.intent.kind));
  if (!record || record.result.status === 'done') {
    clearProductionStall(memory);
    return;
  }
  if (!productionCapacityFailure(record.result.reason)) {
    clearProductionStall(memory);
    return;
  }

  const stall = memory.productionStall;
  const continuing = stall.reason === record.result.reason &&
    tick - stall.lastTick <= PRODUCTION_STALL_FRESH_TICKS;
  stall.count = continuing ? stall.count + 1 : 1;
  stall.sinceTick = continuing ? stall.sinceTick : tick;
  stall.lastTick = tick;
  stall.reason = record.result.reason;
};

export const rememberIntentOutcomes = (
  memory: BotMemory,
  records: readonly BotIntentRecord[],
  tick: number,
): void => {
  pruneOlderThan(memory.blockedSites, tick);
  pruneOlderThan(memory.suspectedInvisibleThreats, tick);
  rememberProductionStall(memory, records, tick);

  for (const { intent, result } of records) {
    if (intent.x === undefined || intent.y === undefined) continue;
    const key = tileKey(intent.x, intent.y);

    if (result.status === 'done') {
      if (intent.kind === 'clear-site' || intent.kind === 'scout') {
        memory.blockedSites.delete(key);
        memory.suspectedInvisibleThreats.delete(key);
      }
      continue;
    }

    if (result.reason === 'missing-detection') {
      memory.suspectedInvisibleThreats.set(key, { x: intent.x, y: intent.y, tick });
    }
    if ((result.status === 'blocked' || result.status === 'failed') && locationFailure(result.reason)) {
      memory.blockedSites.set(key, { x: intent.x, y: intent.y, reason: result.reason, tick });
    }
  }
};
