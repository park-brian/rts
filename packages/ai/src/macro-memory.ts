import { ONE, TILE } from '@rts/sim';
import type { TacticalIncident } from './macro-incidents.ts';
import type { BotExpertSignals } from './macro-objective.ts';
import { botIntentExpectation } from './macro-expert.ts';
import type { BotFailureReason, BotIntentKind, BotIntentProgressMetric, BotIntentRecord } from './macro-intents.ts';
import { placementAnchorKey, type PlacementDiagnostic, type PlacementLayoutRole } from './macro-placement.ts';

export const INTENT_OUTCOME_MEMORY_TICKS = 20 * 24;
export const PRODUCTION_STALL_REACTION_COUNT = 3;
export const PRODUCTION_STALL_FRESH_TICKS = 6 * 24;
export const MISSING_PRODUCTION_INTENT_REACTION_COUNT = 3;
export const MISSING_PRODUCTION_INTENT_FRESH_TICKS = 6 * 24;
export const MISSING_PRODUCTION_INTENT_RESOURCES = 300;
export const MACRO_FLOAT_STALL_REACTION_COUNT = 3;
export const MACRO_FLOAT_STALL_FRESH_TICKS = 6 * 24;
export const MACRO_FLOAT_STALL_RESOURCES = 800;
export const BLOCKED_EXPANSION_REACTION_COUNT = 2;
export const BLOCKED_EXPANSION_FRESH_TICKS = 6 * 24;
export const COMBAT_STALL_REACTION_TICKS = 15 * 24;
export const COMBAT_STALL_FRESH_TICKS = 6 * 24;
export const PLACEMENT_STALL_REACTION_COUNT = 3;
export const PLACEMENT_STALL_FRESH_TICKS = 6 * 24;
export const TECH_STALL_REACTION_COUNT = 3;
export const TECH_STALL_FRESH_TICKS = 6 * 24;

export type ProductionStallMemory = {
  count: number;
  sinceTick: number;
  lastTick: number;
  reason?: BotFailureReason;
};

export type MissingProductionIntentMemory = {
  count: number;
  sinceTick: number;
  lastTick: number;
};

export type MacroFloatStallMemory = {
  count: number;
  sinceTick: number;
  lastTick: number;
};

export type BlockedExpansionMemory = {
  count: number;
  sinceTick: number;
  lastTick: number;
  reason?: BotFailureReason;
};

export type CombatStallMemory = {
  sinceTick: number;
  lastTick: number;
  reason?: BotFailureReason;
};

export type PlacementStallMemory = {
  kind: number;
  role: PlacementLayoutRole;
  anchorX: number;
  anchorY: number;
  count: number;
  sinceTick: number;
  lastTick: number;
};

export type TechStallMemory = {
  count: number;
  sinceTick: number;
  lastTick: number;
  reason?: BotFailureReason;
};

export type ExpectedProgressMemory = {
  intentKind: BotIntentKind;
  baseline: number;
  sinceTick: number;
  lastTick: number;
};

export type BotMemory = {
  lastTick: number;
  blockedSites: Map<string, { x: number; y: number; reason: BotFailureReason; tick: number }>;
  placementStalls: Map<string, PlacementStallMemory>;
  expectedProgress: Map<BotIntentProgressMetric, ExpectedProgressMemory>;
  suspectedInvisibleThreats: Map<string, { x: number; y: number; tick: number }>;
  tacticalIncidents: Map<string, TacticalIncident>;
  tacticalCommitments: Map<string, { unitIds: number[]; expiresAt: number }>;
  productionStall: ProductionStallMemory;
  missingProductionIntent: MissingProductionIntentMemory;
  macroFloatStall: MacroFloatStallMemory;
  blockedExpansion: BlockedExpansionMemory;
  combatStall: CombatStallMemory;
  techStall: TechStallMemory;
  offenseWaitSince: number;
};

export type IntentOutcomeMemoryContext = {
  resourceFloat?: number;
  missingProductionIntent?: boolean;
  progress?: Partial<Record<BotIntentProgressMetric, number>>;
};

export const createBotMemory = (): BotMemory => ({
  lastTick: -1,
  blockedSites: new Map(),
  placementStalls: new Map(),
  expectedProgress: new Map(),
  suspectedInvisibleThreats: new Map(),
  tacticalIncidents: new Map(),
  tacticalCommitments: new Map(),
  productionStall: { count: 0, sinceTick: -1, lastTick: -1 },
  missingProductionIntent: { count: 0, sinceTick: -1, lastTick: -1 },
  macroFloatStall: { count: 0, sinceTick: -1, lastTick: -1 },
  blockedExpansion: { count: 0, sinceTick: -1, lastTick: -1 },
  combatStall: { sinceTick: -1, lastTick: -1 },
  techStall: { count: 0, sinceTick: -1, lastTick: -1 },
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

export const productionIntent = (kind: BotIntentKind): boolean =>
  kind === 'train-counter' || kind === 'spend-larva';

export const trainIntent = (kind: BotIntentKind): boolean =>
  kind === 'train-worker' || productionIntent(kind);

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

const techIntent = (kind: BotIntentKind): boolean =>
  kind === 'take-gas' || kind === 'rebuild-tech' || kind === 'research-upgrade';

const techStallFailure = (reason: BotFailureReason): boolean =>
  reason === 'missing-prerequisite' ||
  reason === 'no-builder' ||
  reason === 'no-producer' ||
  reason === 'placement-unavailable' ||
  reason === 'path-blocked' ||
  reason === 'unsafe-location';

export const locationBlockedByIntentMemory = (memory: BotMemory, x: number, y: number): boolean =>
  memory.blockedSites.has(tileKey(x, y));

export const productionStallActive = (memory: BotMemory, tick: number): boolean =>
  memory.productionStall.count >= PRODUCTION_STALL_REACTION_COUNT &&
  tick - memory.productionStall.lastTick <= PRODUCTION_STALL_FRESH_TICKS;

export const missingProductionIntentActive = (memory: BotMemory, tick: number): boolean =>
  memory.missingProductionIntent.count >= MISSING_PRODUCTION_INTENT_REACTION_COUNT &&
  tick - memory.missingProductionIntent.lastTick <= MISSING_PRODUCTION_INTENT_FRESH_TICKS;

export const macroFloatStallActive = (memory: BotMemory, tick: number): boolean =>
  memory.macroFloatStall.count >= MACRO_FLOAT_STALL_REACTION_COUNT &&
  tick - memory.macroFloatStall.lastTick <= MACRO_FLOAT_STALL_FRESH_TICKS;

export const blockedExpansionActive = (memory: BotMemory, tick: number): boolean =>
  memory.blockedExpansion.count >= BLOCKED_EXPANSION_REACTION_COUNT &&
  tick - memory.blockedExpansion.lastTick <= BLOCKED_EXPANSION_FRESH_TICKS;

export const combatStallActive = (memory: BotMemory, tick: number): boolean =>
  memory.combatStall.sinceTick >= 0 &&
  tick - memory.combatStall.sinceTick >= COMBAT_STALL_REACTION_TICKS &&
  tick - memory.combatStall.lastTick <= COMBAT_STALL_FRESH_TICKS;

export const techStallActive = (memory: BotMemory, tick: number): boolean =>
  memory.techStall.count >= TECH_STALL_REACTION_COUNT &&
  tick - memory.techStall.lastTick <= TECH_STALL_FRESH_TICKS;

export const expectedProgressStalls = (memory: BotMemory, tick: number): ReadonlySet<BotIntentProgressMetric> => {
  const stalled = new Set<BotIntentProgressMetric>();
  for (const [metric, progress] of memory.expectedProgress) {
    const expectation = botIntentExpectation(progress.intentKind);
    if (
      tick - progress.sinceTick >= expectation.windowTicks &&
      tick - progress.lastTick <= expectation.windowTicks
    ) {
      stalled.add(metric);
    }
  }
  return stalled;
};

export const expectedProgressStallActive = (
  memory: BotMemory,
  tick: number,
  metric: BotIntentProgressMetric,
): boolean => expectedProgressStalls(memory, tick).has(metric);

export const botMemoryExpertSignals = (memory: BotMemory, tick: number): BotExpertSignals => ({
  productionStalled: productionStallActive(memory, tick),
  missingProductionIntent: missingProductionIntentActive(memory, tick),
  macroFloatStalled: macroFloatStallActive(memory, tick),
  blockedExpansion: blockedExpansionActive(memory, tick),
  techStalled: techStallActive(memory, tick),
  expectedProgressStalls: expectedProgressStalls(memory, tick),
});

export const placementStallAnchorKeys = (memory: BotMemory, tick: number): Set<string> => {
  const keys = new Set<string>();
  for (const [key, stall] of memory.placementStalls) {
    if (
      stall.count >= PLACEMENT_STALL_REACTION_COUNT &&
      tick - stall.lastTick <= PLACEMENT_STALL_FRESH_TICKS
    ) {
      keys.add(key);
    }
  }
  return keys;
};

const clearProductionStall = (memory: BotMemory): void => {
  memory.productionStall.count = 0;
  memory.productionStall.sinceTick = -1;
  memory.productionStall.lastTick = -1;
  memory.productionStall.reason = undefined;
};

const clearMissingProductionIntent = (memory: BotMemory): void => {
  memory.missingProductionIntent.count = 0;
  memory.missingProductionIntent.sinceTick = -1;
  memory.missingProductionIntent.lastTick = -1;
};

const clearMacroFloatStall = (memory: BotMemory): void => {
  memory.macroFloatStall.count = 0;
  memory.macroFloatStall.sinceTick = -1;
  memory.macroFloatStall.lastTick = -1;
};

const clearBlockedExpansion = (memory: BotMemory): void => {
  memory.blockedExpansion.count = 0;
  memory.blockedExpansion.sinceTick = -1;
  memory.blockedExpansion.lastTick = -1;
  memory.blockedExpansion.reason = undefined;
};

const clearCombatStall = (memory: BotMemory): void => {
  memory.combatStall.sinceTick = -1;
  memory.combatStall.lastTick = -1;
  memory.combatStall.reason = undefined;
};

const clearTechStall = (memory: BotMemory): void => {
  memory.techStall.count = 0;
  memory.techStall.sinceTick = -1;
  memory.techStall.lastTick = -1;
  memory.techStall.reason = undefined;
};

const rememberExpectedProgress = (
  memory: BotMemory,
  records: readonly BotIntentRecord[],
  tick: number,
  progress: Partial<Record<BotIntentProgressMetric, number>> | undefined,
): void => {
  const seen = new Set<BotIntentProgressMetric>();

  for (const { intent, result } of records) {
    const expectation = botIntentExpectation(intent.kind);
    const metric = expectation.metric;
    seen.add(metric);

    if (result.status === 'done') {
      memory.expectedProgress.delete(metric);
      continue;
    }

    const current = progress?.[metric];
    const existing = memory.expectedProgress.get(metric);
    if (current !== undefined && existing && current > existing.baseline) {
      memory.expectedProgress.delete(metric);
      continue;
    }

    const continuing = existing !== undefined && existing.intentKind === intent.kind;
    memory.expectedProgress.set(metric, {
      intentKind: intent.kind,
      baseline: continuing ? existing.baseline : current ?? 0,
      sinceTick: continuing ? existing.sinceTick : tick,
      lastTick: tick,
    });
  }

  for (const metric of memory.expectedProgress.keys()) {
    if (!seen.has(metric)) memory.expectedProgress.delete(metric);
  }
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

const rememberMissingProductionIntent = (
  memory: BotMemory,
  tick: number,
  context: IntentOutcomeMemoryContext,
): void => {
  if (!context.missingProductionIntent) {
    clearMissingProductionIntent(memory);
    return;
  }

  const stall = memory.missingProductionIntent;
  const continuing = tick - stall.lastTick <= MISSING_PRODUCTION_INTENT_FRESH_TICKS;
  stall.count = continuing ? stall.count + 1 : 1;
  stall.sinceTick = continuing ? stall.sinceTick : tick;
  stall.lastTick = tick;
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

const rememberBlockedExpansion = (
  memory: BotMemory,
  records: readonly BotIntentRecord[],
  tick: number,
): void => {
  const record = records.find((candidate) => candidate.intent.kind === 'expand');
  if (!record) return;
  if (record.result.status === 'done') {
    clearBlockedExpansion(memory);
    return;
  }
  if (
    (record.result.status !== 'blocked' && record.result.status !== 'failed') ||
    !locationFailure(record.result.reason)
  ) {
    clearBlockedExpansion(memory);
    return;
  }

  const stall = memory.blockedExpansion;
  const continuing = stall.reason === record.result.reason &&
    tick - stall.lastTick <= BLOCKED_EXPANSION_FRESH_TICKS;
  stall.count = continuing ? stall.count + 1 : 1;
  stall.sinceTick = continuing ? stall.sinceTick : tick;
  stall.lastTick = tick;
  stall.reason = record.result.reason;
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

const rememberTechStall = (
  memory: BotMemory,
  records: readonly BotIntentRecord[],
  tick: number,
): void => {
  const record = records[0];
  if (!record || !techIntent(record.intent.kind) || record.result.status === 'done') {
    clearTechStall(memory);
    return;
  }
  if (!techStallFailure(record.result.reason)) {
    clearTechStall(memory);
    return;
  }

  const stall = memory.techStall;
  const continuing = stall.reason === record.result.reason &&
    tick - stall.lastTick <= TECH_STALL_FRESH_TICKS;
  stall.count = continuing ? stall.count + 1 : 1;
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
  rememberMissingProductionIntent(memory, tick, context);
  rememberMacroFloatStall(memory, records, tick, context);
  rememberBlockedExpansion(memory, records, tick);
  rememberCombatStall(memory, records, tick);
  rememberTechStall(memory, records, tick);
  rememberExpectedProgress(memory, records, tick, context.progress);

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

export const rememberPlacementDiagnostics = (
  memory: BotMemory,
  diagnostics: readonly PlacementDiagnostic[],
  tick: number,
): void => {
  const oldest = tick - INTENT_OUTCOME_MEMORY_TICKS;
  for (const [key, stall] of memory.placementStalls) {
    if (stall.lastTick < oldest) memory.placementStalls.delete(key);
  }

  for (const diagnostic of diagnostics) {
    const key = placementAnchorKey(diagnostic.kind, diagnostic.anchorX, diagnostic.anchorY, diagnostic.role);
    if (diagnostic.result === 'chosen') {
      memory.placementStalls.delete(key);
      continue;
    }

    const existing = memory.placementStalls.get(key);
    const continuing = existing !== undefined && tick - existing.lastTick <= PLACEMENT_STALL_FRESH_TICKS;
    memory.placementStalls.set(key, {
      kind: diagnostic.kind,
      role: diagnostic.role,
      anchorX: diagnostic.anchorX,
      anchorY: diagnostic.anchorY,
      count: continuing ? existing.count + 1 : 1,
      sinceTick: continuing ? existing.sinceTick : tick,
      lastTick: tick,
    });
  }
};
