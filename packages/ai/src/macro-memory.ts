import { ONE, TILE } from '@rts/sim';
import type { TacticalIncident } from './macro-incidents.ts';
import type { BotFailureReason, BotIntentKind, BotIntentRecord } from './macro-intents.ts';

export const INTENT_OUTCOME_MEMORY_TICKS = 20 * 24;
export const PRODUCTION_STALL_REACTION_COUNT = 3;
export const PRODUCTION_STALL_FRESH_TICKS = 6 * 24;
export const MACRO_FLOAT_STALL_REACTION_COUNT = 3;
export const MACRO_FLOAT_STALL_FRESH_TICKS = 6 * 24;
export const MACRO_FLOAT_STALL_RESOURCES = 800;
export const COMBAT_STALL_REACTION_TICKS = 15 * 24;
export const COMBAT_STALL_FRESH_TICKS = 6 * 24;

export type ProductionStallMemory = {
  count: number;
  sinceTick: number;
  lastTick: number;
  reason?: BotFailureReason;
};

export type MacroFloatStallMemory = {
  count: number;
  sinceTick: number;
  lastTick: number;
};

export type CombatStallMemory = {
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
  macroFloatStall: MacroFloatStallMemory;
  combatStall: CombatStallMemory;
  offenseWaitSince: number;
};

export type IntentOutcomeMemoryContext = {
  resourceFloat?: number;
};

export const createBotMemory = (): BotMemory => ({
  lastTick: -1,
  blockedSites: new Map(),
  suspectedInvisibleThreats: new Map(),
  tacticalIncidents: new Map(),
  tacticalCommitments: new Map(),
  productionStall: { count: 0, sinceTick: -1, lastTick: -1 },
  macroFloatStall: { count: 0, sinceTick: -1, lastTick: -1 },
  combatStall: { sinceTick: -1, lastTick: -1 },
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

const macroSpendIntent = (kind: BotIntentKind): boolean => {
  switch (kind) {
    case 'rebuild-tech':
    case 'add-static-defense':
    case 'add-production':
    case 'expand':
    case 'train-worker':
    case 'spend-larva':
    case 'train-counter':
    case 'research-upgrade':
      return true;
    default:
      return false;
  }
};

const offensiveCombatIntent = (kind: BotIntentKind): boolean =>
  kind === 'attack-wave' || kind === 'harass' || kind === 'contain' || kind === 'counterattack';

const combatStallFailure = (reason: BotFailureReason): boolean =>
  reason === 'insufficient-force' || reason === 'path-blocked';

export const locationBlockedByIntentMemory = (memory: BotMemory, x: number, y: number): boolean =>
  memory.blockedSites.has(tileKey(x, y));

export const productionStallActive = (memory: BotMemory, tick: number): boolean =>
  memory.productionStall.count >= PRODUCTION_STALL_REACTION_COUNT &&
  tick - memory.productionStall.lastTick <= PRODUCTION_STALL_FRESH_TICKS;

export const macroFloatStallActive = (memory: BotMemory, tick: number): boolean =>
  memory.macroFloatStall.count >= MACRO_FLOAT_STALL_REACTION_COUNT &&
  tick - memory.macroFloatStall.lastTick <= MACRO_FLOAT_STALL_FRESH_TICKS;

export const combatStallActive = (memory: BotMemory, tick: number): boolean =>
  memory.combatStall.sinceTick >= 0 &&
  tick - memory.combatStall.sinceTick >= COMBAT_STALL_REACTION_TICKS &&
  tick - memory.combatStall.lastTick <= COMBAT_STALL_FRESH_TICKS;

const clearProductionStall = (memory: BotMemory): void => {
  memory.productionStall.count = 0;
  memory.productionStall.sinceTick = -1;
  memory.productionStall.lastTick = -1;
  memory.productionStall.reason = undefined;
};

const clearMacroFloatStall = (memory: BotMemory): void => {
  memory.macroFloatStall.count = 0;
  memory.macroFloatStall.sinceTick = -1;
  memory.macroFloatStall.lastTick = -1;
};

const clearCombatStall = (memory: BotMemory): void => {
  memory.combatStall.sinceTick = -1;
  memory.combatStall.lastTick = -1;
  memory.combatStall.reason = undefined;
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

const rememberMacroFloatStall = (
  memory: BotMemory,
  records: readonly BotIntentRecord[],
  tick: number,
  context: IntentOutcomeMemoryContext,
): void => {
  if ((context.resourceFloat ?? 0) < MACRO_FLOAT_STALL_RESOURCES) {
    clearMacroFloatStall(memory);
    return;
  }

  let sawMacroSpend = false;
  for (const record of records) {
    if (!macroSpendIntent(record.intent.kind)) continue;
    sawMacroSpend = true;
    if (record.result.status === 'done') {
      clearMacroFloatStall(memory);
      return;
    }
  }
  if (!sawMacroSpend) {
    clearMacroFloatStall(memory);
    return;
  }

  const stall = memory.macroFloatStall;
  const continuing = tick - stall.lastTick <= MACRO_FLOAT_STALL_FRESH_TICKS;
  stall.count = continuing ? stall.count + 1 : 1;
  stall.sinceTick = continuing ? stall.sinceTick : tick;
  stall.lastTick = tick;
};

const rememberCombatStall = (
  memory: BotMemory,
  records: readonly BotIntentRecord[],
  tick: number,
): void => {
  const record = records.find((candidate) => offensiveCombatIntent(candidate.intent.kind));
  if (!record || record.result.status === 'done') {
    clearCombatStall(memory);
    return;
  }
  if (!combatStallFailure(record.result.reason)) {
    clearCombatStall(memory);
    return;
  }

  const stall = memory.combatStall;
  const continuing = stall.reason === record.result.reason &&
    tick - stall.lastTick <= COMBAT_STALL_FRESH_TICKS;
  stall.sinceTick = continuing ? stall.sinceTick : tick;
  stall.lastTick = tick;
  stall.reason = record.result.reason;
};

export const rememberIntentOutcomes = (
  memory: BotMemory,
  records: readonly BotIntentRecord[],
  tick: number,
  context: IntentOutcomeMemoryContext = {},
): void => {
  pruneOlderThan(memory.blockedSites, tick);
  pruneOlderThan(memory.suspectedInvisibleThreats, tick);
  rememberProductionStall(memory, records, tick);
  rememberMacroFloatStall(memory, records, tick, context);
  rememberCombatStall(memory, records, tick);

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
