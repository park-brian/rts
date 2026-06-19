import { ONE, TILE } from '@rts/sim';
import type { TacticalIncident } from './macro-incidents.ts';
import type { BotFailureReason, BotIntentRecord } from './macro-intents.ts';

export const INTENT_OUTCOME_MEMORY_TICKS = 20 * 24;

export type BotMemory = {
  lastTick: number;
  blockedSites: Map<string, { reason: BotFailureReason; tick: number }>;
  suspectedInvisibleThreats: Map<string, { x: number; y: number; tick: number }>;
  tacticalIncidents: Map<string, TacticalIncident>;
  tacticalCommitments: Map<string, { unitIds: number[]; expiresAt: number }>;
  offenseWaitSince: number;
};

export const createBotMemory = (): BotMemory => ({
  lastTick: -1,
  blockedSites: new Map(),
  suspectedInvisibleThreats: new Map(),
  tacticalIncidents: new Map(),
  tacticalCommitments: new Map(),
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

export const locationBlockedByIntentMemory = (memory: BotMemory, x: number, y: number): boolean =>
  memory.blockedSites.has(tileKey(x, y));

export const rememberIntentOutcomes = (
  memory: BotMemory,
  records: readonly BotIntentRecord[],
  tick: number,
): void => {
  pruneOlderThan(memory.blockedSites, tick);
  pruneOlderThan(memory.suspectedInvisibleThreats, tick);

  for (const { intent, result } of records) {
    if (result.status === 'done') continue;
    if (intent.x === undefined || intent.y === undefined) continue;
    const key = tileKey(intent.x, intent.y);

    if (result.reason === 'missing-detection') {
      memory.suspectedInvisibleThreats.set(key, { x: intent.x, y: intent.y, tick });
    }
    if ((result.status === 'blocked' || result.status === 'failed') && locationFailure(result.reason)) {
      memory.blockedSites.set(key, { reason: result.reason, tick });
    }
  }
};
