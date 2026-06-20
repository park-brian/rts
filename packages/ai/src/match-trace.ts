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
import {
  BOT_INTENT_KINDS,
  type BotFailureReason,
  type BotIntentKind,
  type BotIntentRecord,
  type BotIntentScoreReason,
} from './macro-intents.ts';
import {
  botObjectiveSnapshot,
  botObjectiveTrends,
  type BotObjectiveSnapshot,
  type BotObjectiveTrend,
} from './macro-objective.ts';
import type { BotStrategyPosture } from './macro-strategy.ts';
import type { BotPlanner, BotTurnPlan } from './bot.ts';
import type { PlacementDiagnostic, PlacementScoreReason } from './macro-placement.ts';

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
  queuedWorkerProduction: number;
  queuedArmyProduction: number;
  queuedArmyStrength: number;
  idleProducers: number;
  idleLarvae: number;
  visibleEnemies: number;
  commandsIssued: number;
  commandsByType: CountMap<CommandType>;
  intentsByKind: CountMap<BotIntentKind>;
  outcomesByStatus: CountMap<BotTraceOutcomeStatus>;
  waitsByReason: CountMap<BotFailureReason>;
  blocksByReason: CountMap<BotFailureReason>;
  topIntents: BotTraceIntentSummary[];
  placementDiagnostics: BotTracePlacementDiagnostic[];
  objective: BotObjectiveSnapshot;
  strategy: BotStrategyPosture;
};

type BotTraceOutcomeStatus = 'done' | 'waiting' | 'blocked' | 'failed';
type BotTraceIntentReason = Pick<BotIntentScoreReason, 'kind' | 'value' | 'detail'>;
type BotTracePlacementReason = Pick<PlacementScoreReason, 'kind' | 'value' | 'detail'>;

export type BotTracePlacementDiagnostic = Pick<
  PlacementDiagnostic,
  'kind' | 'role' | 'result' | 'anchorX' | 'anchorY' | 'x' | 'y' | 'score' | 'candidates' | 'rejected' | 'rejectedByReason'
> & {
  scoreReasons: BotTracePlacementReason[];
};

export type BotTraceIntentSummary = {
  kind: BotIntentKind;
  status: BotTraceOutcomeStatus;
  urgency: number;
  reason?: BotFailureReason;
  score?: number;
  scoreReasons: BotTraceIntentReason[];
  targetKind?: number;
  targetTech?: number;
  x?: number;
  y?: number;
};

export type BotTraceAlertKind =
  | 'invalid-commands'
  | 'resource-float-stall'
  | 'production-stall'
  | 'no-army-production'
  | 'combat-intent-stall'
  | 'placement-stall';

export type BotTraceAlert = {
  kind: BotTraceAlertKind;
  player: number;
  fromTick: number;
  toTick: number;
  severity: number;
  detail: string;
};

export type BotExpertDiagnosisDomain =
  | 'strategy'
  | 'objective'
  | 'macro'
  | 'economy'
  | 'tech'
  | 'production'
  | 'combat';

export type BotExpertDiagnosisStatus = 'healthy' | 'watch' | 'failing';

export type BotExpertDiagnosis = {
  domain: BotExpertDiagnosisDomain;
  player: number;
  status: BotExpertDiagnosisStatus;
  severity: number;
  detail: string;
};

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
  invalidCommandsByPlayer: number[];
  commandResults: CommandResult[];
  objectiveTrends: BotObjectiveTrend[];
  alerts: BotTraceAlert[];
  expertDiagnoses: BotExpertDiagnosis[];
};

const blankCounts = <K extends string>(keys: readonly K[]): CountMap<K> => {
  const counts = Object.create(null) as CountMap<K>;
  for (const key of keys) counts[key] = 0;
  return counts;
};

const inc = <K extends string>(counts: CountMap<K>, key: K): void => {
  counts[key] = (counts[key] ?? 0) + 1;
};

const TOP_TRACE_INTENTS = 5;
const TOP_TRACE_PLACEMENTS = 5;
const ALERT_STREAK_FRAMES = 3;
const RESOURCE_FLOAT_ALERT = 800;
const PRODUCTION_FLOAT_ALERT = 300;
const MACRO_COMMANDS: readonly CommandType[] = ['build', 'train', 'research', 'addon', 'transform'];
const COMBAT_COMMANDS: readonly CommandType[] = ['attack', 'amove', 'ability', 'mine'];
const TRAIN_INTENTS: readonly BotIntentKind[] = ['train-worker', 'spend-larva', 'train-counter'];
const COMBAT_INTENTS: readonly BotIntentKind[] = ['attack-wave', 'harass', 'contain', 'counterattack', 'defend-base'];

const intentSummary = ({ intent, result }: BotIntentRecord): BotTraceIntentSummary => ({
  kind: intent.kind,
  status: result.status,
  urgency: intent.urgency,
  ...(result.status === 'done' ? {} : { reason: result.reason }),
  ...(intent.score ? { score: intent.score.value } : {}),
  scoreReasons: intent.score?.reasons.map((reason) => ({
    kind: reason.kind,
    value: reason.value,
    detail: reason.detail,
  })) ?? [],
  ...(intent.targetKind !== undefined ? { targetKind: intent.targetKind } : {}),
  ...(intent.targetTech !== undefined ? { targetTech: intent.targetTech } : {}),
  ...(intent.x !== undefined ? { x: intent.x } : {}),
  ...(intent.y !== undefined ? { y: intent.y } : {}),
});

const placementSummary = (diagnostic: PlacementDiagnostic): BotTracePlacementDiagnostic => ({
  kind: diagnostic.kind,
  role: diagnostic.role,
  result: diagnostic.result,
  anchorX: diagnostic.anchorX,
  anchorY: diagnostic.anchorY,
  ...(diagnostic.x !== undefined ? { x: diagnostic.x } : {}),
  ...(diagnostic.y !== undefined ? { y: diagnostic.y } : {}),
  ...(diagnostic.score !== undefined ? { score: diagnostic.score } : {}),
  candidates: diagnostic.candidates,
  rejected: diagnostic.rejected,
  rejectedByReason: diagnostic.rejectedByReason,
  scoreReasons: diagnostic.scoreReasons.map((reason) => ({
    kind: reason.kind,
    value: reason.value,
    ...(reason.detail ? { detail: reason.detail } : {}),
  })),
});

const countCommands = (frame: BotTraceFrame, types: readonly CommandType[]): number =>
  types.reduce((sum, type) => sum + (frame.commandsByType[type] ?? 0), 0);

const countIntents = (frame: BotTraceFrame, kinds: readonly BotIntentKind[]): number =>
  kinds.reduce((sum, kind) => sum + (frame.intentsByKind[kind] ?? 0), 0);

const macroCommandCount = (frame: BotTraceFrame): number =>
  countCommands(frame, MACRO_COMMANDS);

const combatCommandCount = (frame: BotTraceFrame): number =>
  countCommands(frame, COMBAT_COMMANDS);

const trainIntentCount = (frame: BotTraceFrame): number =>
  countIntents(frame, TRAIN_INTENTS);

const hasReadyArmyProduction = (frame: BotTraceFrame): boolean =>
  frame.objective.resourceFloat >= PRODUCTION_FLOAT_ALERT &&
  frame.supplyUsed < frame.supplyMax &&
  frame.idleProducers + frame.idleLarvae > 0;

const hasArmyPipeline = (frame: BotTraceFrame): boolean =>
  frame.queuedArmyProduction > 0 || trainIntentCount(frame) > 0;

const combatIntentCount = (frame: BotTraceFrame): number =>
  countIntents(frame, COMBAT_INTENTS);

type PlacementStreak = {
  start: number;
  end: number;
  count: number;
  kind: number;
  role: string;
  anchorX: number;
  anchorY: number;
  rejected: number;
  rejectedByReason: CountMap<string>;
};

const placementFailureKey = (diagnostic: BotTracePlacementDiagnostic): string =>
  `${diagnostic.role}:${diagnostic.kind}:${diagnostic.anchorX}:${diagnostic.anchorY}`;

const placementReasonDetail = (counts: CountMap<string>): string => {
  const topReason = Object.entries(counts)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0) || a[0].localeCompare(b[0]))[0];
  return topReason ? `; main rejection ${topReason[0]} (${topReason[1] ?? 0})` : '';
};

const playerAlerts = (
  alerts: readonly BotTraceAlert[],
  player: number,
  kinds: readonly BotTraceAlertKind[],
): BotTraceAlert[] =>
  alerts.filter((alert) => alert.player === player && kinds.includes(alert.kind));

const alertSeverity = (alerts: readonly BotTraceAlert[]): number =>
  alerts.reduce((sum, alert) => sum + alert.severity, 0);

const commandTotal = (counts: CountMap<CommandType>, types: readonly CommandType[]): number =>
  types.reduce((sum, type) => sum + (counts[type] ?? 0), 0);

const diagnosis = (
  domain: BotExpertDiagnosisDomain,
  player: number,
  status: BotExpertDiagnosisStatus,
  severity: number,
  detail: string,
): BotExpertDiagnosis => ({
  domain,
  player,
  status,
  severity,
  detail,
});

const framesByPlayer = (frames: readonly BotTraceFrame[]): Map<number, BotTraceFrame[]> => {
  const byPlayer = new Map<number, BotTraceFrame[]>();
  for (const frame of frames) {
    const bucket = byPlayer.get(frame.player);
    if (bucket) bucket.push(frame);
    else byPlayer.set(frame.player, [frame]);
  }
  for (const bucket of byPlayer.values()) bucket.sort((a, b) => a.tick - b.tick);
  return byPlayer;
};

const posturePath = (frames: readonly BotTraceFrame[]): string[] => {
  const names: string[] = [];
  for (const frame of frames) {
    if (names[names.length - 1] !== frame.strategy.name) names.push(frame.strategy.name);
  }
  return names;
};

const strategyDiagnosis = (frames: readonly BotTraceFrame[]): BotExpertDiagnosis => {
  const first = frames[0]!;
  const last = frames[frames.length - 1]!;
  const path = posturePath(frames);
  const reason = last.strategy.reasons[0] ?? 'no strategy reason recorded';
  return diagnosis(
    'strategy',
    first.player,
    last.strategy.name === 'opening' && frames.length >= ALERT_STREAK_FRAMES ? 'watch' : 'healthy',
    path.length,
    `posture ${path.join(' -> ')}; current ${last.strategy.name}, tech ${last.strategy.techTarget}, expansion ${last.strategy.expansionPriority}, harassment ${last.strategy.harassmentAppetite}; ${reason}`,
  );
};

const objectiveDiagnosis = (
  frames: readonly BotTraceFrame[],
  trend: BotObjectiveTrend | undefined,
): BotExpertDiagnosis => {
  const first = frames[0]!;
  const last = frames[frames.length - 1]!;
  const reasons = trend?.reasons ?? [];
  const score = reasons.reduce((sum, reason) => sum + reason.score, 0);
  const detail = reasons.length > 0
    ? reasons.map((reason) => reason.detail).join('; ')
    : `no objective progress observed from tick ${first.tick} to ${last.tick}`;
  const status: BotExpertDiagnosisStatus = score > 0 ? 'healthy' : score < 0 ? 'failing' : 'watch';

  return diagnosis('objective', first.player, status, Math.abs(score), detail);
};

type ProgressDiagnosis = Pick<BotExpertDiagnosis, 'status' | 'severity' | 'detail'>;

const plural = (count: number, singular: string, pluralized = `${singular}s`): string =>
  `${count} ${count === 1 ? singular : pluralized}`;

const queuedArmyDetail = (frame: BotTraceFrame): string =>
  frame.queuedArmyProduction > 0
    ? `, ${plural(frame.queuedArmyProduction, 'combat unit')} queued worth ${frame.queuedArmyStrength} strength,`
    : '';

const economyProgressDiagnosis = (
  first: BotTraceFrame,
  last: BotTraceFrame,
  workerGain: number,
): ProgressDiagnosis => {
  if (workerGain > 0) {
    return { status: 'healthy', severity: workerGain, detail: `worker supply increased by ${workerGain}` };
  }
  if (last.queuedWorkerProduction > 0) {
    const workers = plural(last.queuedWorkerProduction, 'worker');
    return { status: 'healthy', severity: last.queuedWorkerProduction, detail: `${workers} queued or morphing` };
  }
  if (last.workers >= first.workers) {
    return { status: 'watch', severity: 0, detail: 'worker count held steady during the trace' };
  }
  return { status: 'failing', severity: Math.abs(workerGain), detail: 'worker count declined during the trace' };
};

const productionProgressDiagnosis = (
  first: BotTraceFrame,
  last: BotTraceFrame,
  armyGain: number,
  trend: BotObjectiveTrend | undefined,
): ProgressDiagnosis => {
  const before = trend?.before ?? first.objective;
  const after = trend?.after ?? last.objective;
  const capacityGain = after.productionCapacity - before.productionCapacity;
  const pendingGain = after.pendingProductionCapacity - before.pendingProductionCapacity;

  if (armyGain > 0) {
    return { status: 'healthy', severity: armyGain, detail: `field army strength increased by ${armyGain}` };
  }
  if (capacityGain > 0) {
    const sources = plural(capacityGain, 'combat production source');
    return { status: 'healthy', severity: capacityGain, detail: `${sources} completed` };
  }
  if (last.queuedArmyProduction > 0) {
    const units = plural(last.queuedArmyProduction, 'combat unit');
    return {
      status: 'healthy',
      severity: Math.max(last.queuedArmyProduction, Math.trunc(last.queuedArmyStrength / 100)),
      detail: `${units} queued or morphing for ${last.queuedArmyStrength} future strength`,
    };
  }
  if (pendingGain > 0) {
    const sources = plural(pendingGain, 'combat production source');
    return { status: 'watch', severity: pendingGain, detail: `${sources} entered construction` };
  }
  if (after.pendingProductionCapacity > 0) {
    const sources = plural(after.pendingProductionCapacity, 'combat production source');
    return { status: 'watch', severity: after.pendingProductionCapacity, detail: `${sources} pending completion` };
  }
  return { status: 'watch', severity: 0, detail: 'no completed combat production was observed' };
};

const techProgressDiagnosis = (
  frames: readonly BotTraceFrame[],
  trend: BotObjectiveTrend | undefined,
): ProgressDiagnosis => {
  const first = frames[0]!;
  const last = frames[frames.length - 1]!;
  const before = trend?.before ?? first.objective;
  const after = trend?.after ?? last.objective;
  const techGain = after.techUnlocks - before.techUnlocks;
  if (techGain > 0) {
    return { status: 'healthy', severity: techGain, detail: `tech unlock count increased by ${techGain}` };
  }
  const researchAttempts = frames.reduce((sum, frame) => sum + (frame.commandsByType.research ?? 0), 0);
  const researchIntents = frames.reduce((sum, frame) => sum + (frame.intentsByKind['research-upgrade'] ?? 0), 0);
  if (researchAttempts > 0) {
    return { status: 'watch', severity: researchAttempts, detail: `${plural(researchAttempts, 'research command')} attempted` };
  }
  if (researchIntents > 0) {
    return { status: 'watch', severity: researchIntents, detail: `${plural(researchIntents, 'research-upgrade intent')} observed` };
  }
  return { status: 'watch', severity: 0, detail: 'no tech unlock or research attempt was observed' };
};

const pushFrameStreakAlerts = (
  alerts: BotTraceAlert[],
  frames: readonly BotTraceFrame[],
  kind: BotTraceAlertKind,
  predicate: (frame: BotTraceFrame) => boolean,
  detail: (start: BotTraceFrame, end: BotTraceFrame, count: number) => string,
  severity: (start: BotTraceFrame, end: BotTraceFrame, count: number) => number,
): void => {
  let start = -1;
  const flush = (end: number): void => {
    if (start < 0 || end - start + 1 < ALERT_STREAK_FRAMES) return;
    const first = frames[start]!;
    const last = frames[end]!;
    const count = end - start + 1;
    alerts.push({
      kind,
      player: first.player,
      fromTick: first.tick,
      toTick: last.tick,
      severity: severity(first, last, count),
      detail: detail(first, last, count),
    });
  };

  for (let i = 0; i < frames.length; i++) {
    if (predicate(frames[i]!)) {
      if (start < 0) start = i;
      continue;
    }
    flush(i - 1);
    start = -1;
  }
  flush(frames.length - 1);
};

const pushPlacementStallAlerts = (
  alerts: BotTraceAlert[],
  frames: readonly BotTraceFrame[],
): void => {
  const active = new Map<string, PlacementStreak>();
  const flush = (key: string): void => {
    const streak = active.get(key);
    if (!streak) return;
    active.delete(key);
    if (streak.count < ALERT_STREAK_FRAMES) return;
    const first = frames[streak.start]!;
    const last = frames[streak.end]!;
    alerts.push({
      kind: 'placement-stall',
      player: first.player,
      fromTick: first.tick,
      toTick: last.tick,
      severity: streak.count + Math.trunc(streak.rejected / 100),
      detail: `${streak.count} sampled frames could not place ${streak.role} kind ${streak.kind} near ${streak.anchorX},${streak.anchorY}; rejected ${streak.rejected} candidates${placementReasonDetail(streak.rejectedByReason)}`,
    });
  };

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i]!;
    const seen = new Set<string>();
    for (const diagnostic of frame.placementDiagnostics) {
      if (diagnostic.result !== 'unavailable') continue;
      const key = placementFailureKey(diagnostic);
      if (seen.has(key)) continue;
      seen.add(key);
      const streak = active.get(key);
      if (streak) {
        streak.end = i;
        streak.count++;
        streak.rejected += diagnostic.rejected;
        for (const [reason, count] of Object.entries(diagnostic.rejectedByReason)) {
          streak.rejectedByReason[reason] = (streak.rejectedByReason[reason] ?? 0) + count;
        }
        continue;
      }
      active.set(key, {
        start: i,
        end: i,
        count: 1,
        kind: diagnostic.kind,
        role: diagnostic.role,
        anchorX: diagnostic.anchorX,
        anchorY: diagnostic.anchorY,
        rejected: diagnostic.rejected,
        rejectedByReason: { ...diagnostic.rejectedByReason },
      });
    }
    for (const key of [...active.keys()]) {
      if (!seen.has(key)) flush(key);
    }
  }

  for (const key of [...active.keys()]) flush(key);
};

export const botTraceAlerts = (
  frames: readonly BotTraceFrame[],
  commandResults: readonly CommandResult[] = [],
): BotTraceAlert[] => {
  const alerts: BotTraceAlert[] = [];
  const invalidByPlayer = new Map<number, number>();
  let lastTick = 0;

  for (const frame of frames) lastTick = Math.max(lastTick, frame.tick);
  for (const result of commandResults) {
    if (result.ok) continue;
    invalidByPlayer.set(result.player, (invalidByPlayer.get(result.player) ?? 0) + 1);
  }
  for (const [player, count] of invalidByPlayer) {
    alerts.push({
      kind: 'invalid-commands',
      player,
      fromTick: 0,
      toTick: lastTick,
      severity: count,
      detail: `${count} rejected commands`,
    });
  }

  for (const playerFrames of framesByPlayer(frames).values()) {
    pushFrameStreakAlerts(
      alerts,
      playerFrames,
      'resource-float-stall',
      (frame) => frame.objective.resourceFloat >= RESOURCE_FLOAT_ALERT && macroCommandCount(frame) === 0,
      (_start, end, count) => `${count} sampled frames floated ${end.objective.resourceFloat} resources without macro spending`,
      (_start, end, count) => count * Math.trunc(end.objective.resourceFloat / 100),
    );
    pushFrameStreakAlerts(
      alerts,
      playerFrames,
      'production-stall',
      (frame) =>
        hasReadyArmyProduction(frame) &&
        hasArmyPipeline(frame) &&
        (frame.commandsByType.train ?? 0) === 0,
      (_start, end, count) => `${count} sampled frames had idle production${queuedArmyDetail(end)} and ${end.objective.resourceFloat} resources without training`,
      (_start, end, count) => count * (end.idleProducers + end.idleLarvae),
    );
    pushFrameStreakAlerts(
      alerts,
      playerFrames,
      'no-army-production',
      (frame) =>
        hasReadyArmyProduction(frame) &&
        frame.queuedArmyProduction === 0 &&
        trainIntentCount(frame) === 0 &&
        (frame.commandsByType.train ?? 0) === 0,
      (_start, end, count) => `${count} sampled frames had idle production, supply, and ${end.objective.resourceFloat} resources but no train intent`,
      (_start, end, count) => count * (end.idleProducers + end.idleLarvae),
    );
    pushFrameStreakAlerts(
      alerts,
      playerFrames,
      'combat-intent-stall',
      (frame) => frame.retaskableArmy > 0 && combatIntentCount(frame) > 0 && combatCommandCount(frame) === 0,
      (_start, _end, count) => `${count} sampled frames had combat intent but no combat commands`,
      (_start, end, count) => count * end.retaskableArmy,
    );
    pushPlacementStallAlerts(alerts, playerFrames);
  }

  return alerts.sort((a, b) =>
    b.severity - a.severity ||
    a.player - b.player ||
    a.fromTick - b.fromTick ||
    a.kind.localeCompare(b.kind));
};

export const botTraceExpertDiagnoses = (
  frames: readonly BotTraceFrame[],
  stats: MatchStats,
  alerts: readonly BotTraceAlert[] = botTraceAlerts(frames),
  trends: readonly BotObjectiveTrend[] = botObjectiveTrends(frames),
): BotExpertDiagnosis[] => {
  const diagnoses: BotExpertDiagnosis[] = [];

  for (const playerFrames of framesByPlayer(frames).values()) {
    const first = playerFrames[0]!;
    const last = playerFrames[playerFrames.length - 1]!;
    const player = first.player;
    const playerStats = stats.players[player];
    const trend = trends.find((candidate) => candidate.player === player);
    const macroAlerts = playerAlerts(alerts, player, ['invalid-commands', 'resource-float-stall', 'placement-stall']);
    const productionAlerts = playerAlerts(alerts, player, ['production-stall', 'no-army-production']);
    const combatAlerts = playerAlerts(alerts, player, ['combat-intent-stall']);
    const macroCommands = playerStats ? commandTotal(playerStats.commandsByType, MACRO_COMMANDS) : 0;
    const combatCommands = playerStats ? commandTotal(playerStats.commandsByType, COMBAT_COMMANDS) : 0;
    const workerGain = trend ? trend.after.workerSupply - trend.before.workerSupply : last.workers - first.workers;
    const armyGain = trend ? trend.after.armyStrength - trend.before.armyStrength : last.army - first.army;
    const enemyLoss = trend
      ? trend.reasons.some((reason) => reason.kind === 'enemy-economy-damage' || reason.kind === 'enemy-army-damage')
      : false;

    diagnoses.push(strategyDiagnosis(playerFrames));
    diagnoses.push(objectiveDiagnosis(playerFrames, trend));

    diagnoses.push(macroAlerts.length > 0
      ? diagnosis('macro', player, 'failing', alertSeverity(macroAlerts), macroAlerts.map((alert) => alert.detail).join('; '))
      : diagnosis('macro', player, macroCommands > 0 ? 'healthy' : 'watch', macroCommands, macroCommands > 0
        ? `${macroCommands} macro command attempts in the trace`
        : 'no macro command attempts were observed'));

    const economyProgress = economyProgressDiagnosis(first, last, workerGain);
    diagnoses.push(diagnosis(
      'economy',
      player,
      economyProgress.status,
      economyProgress.severity,
      economyProgress.detail,
    ));

    const techProgress = techProgressDiagnosis(playerFrames, trend);
    diagnoses.push(diagnosis(
      'tech',
      player,
      techProgress.status,
      techProgress.severity,
      techProgress.detail,
    ));

    const productionProgress = productionProgressDiagnosis(first, last, armyGain, trend);
    diagnoses.push(productionAlerts.length > 0
      ? diagnosis('production', player, 'failing', alertSeverity(productionAlerts), productionAlerts.map((alert) => alert.detail).join('; '))
      : diagnosis('production', player, productionProgress.status, productionProgress.severity, productionProgress.detail));

    const combatDetail = combatCommands > 0
      ? `${combatCommands} combat command attempts in the trace`
      : enemyLoss ? 'enemy economy or army degraded during the trace' : 'no combat commitment was observed';
    diagnoses.push(combatAlerts.length > 0
      ? diagnosis('combat', player, 'failing', alertSeverity(combatAlerts), combatAlerts.map((alert) => alert.detail).join('; '))
      : diagnosis('combat', player, combatCommands > 0 || enemyLoss ? 'healthy' : 'watch', combatCommands, combatDetail));
  }

  return diagnoses.sort((a, b) =>
    a.player - b.player ||
    a.domain.localeCompare(b.domain));
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
  const objective = botObjectiveSnapshot(s, player);

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
    queuedWorkerProduction: objective.queuedWorkerProduction,
    queuedArmyProduction: objective.queuedArmyProduction,
    queuedArmyStrength: objective.queuedArmyStrength,
    idleProducers: facts.idleProducers.length,
    idleLarvae: facts.idleLarvae.length,
    visibleEnemies: facts.visibleEnemies.length,
    commandsIssued: plan.commands.length,
    commandsByType,
    intentsByKind,
    outcomesByStatus,
    waitsByReason,
    blocksByReason,
    topIntents: plan.intentResults.slice(0, TOP_TRACE_INTENTS).map(intentSummary),
    placementDiagnostics: plan.placementDiagnostics.slice(0, TOP_TRACE_PLACEMENTS).map(placementSummary),
    objective,
    strategy: plan.strategy,
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

const samplePlannerFrames = (
  s: State,
  participants: readonly BotTraceParticipant[],
  frames: BotTraceFrame[],
): void => {
  for (let player = 0; player < participants.length; player++) {
    const participant = participants[player]!;
    if (!participant.planner) continue;
    frames.push(botTraceFrame(s, player, participant.faction, participant.planner(s, player)));
  }
};

export const runBotMatchTrace = (
  sim: Sim,
  participants: readonly BotTraceParticipant[],
  options: BotMatchTraceOptions,
): BotMatchTrace => {
  const stats = createMatchStats(sim.fullState());
  const frames: BotTraceFrame[] = [];
  const commandResults: CommandResult[] = [];
  const invalidCommandsByPlayer = participants.map(() => 0);
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
      if (!result.ok && result.player >= 0 && result.player < invalidCommandsByPlayer.length) {
        invalidCommandsByPlayer[result.player]!++;
      }
    }
    recordMatchStatsStep(stats, sim.fullState(), batch, results);
  }

  const finalState = sim.fullState();
  if (!frames.some((frame) => frame.tick === finalState.tick)) {
    samplePlannerFrames(finalState, participants, frames);
  }

  const objectiveTrends = botObjectiveTrends(frames);
  const alerts = botTraceAlerts(frames, commandResults);

  return {
    frames,
    stats,
    invalidCommands,
    invalidCommandsByPlayer,
    commandResults,
    objectiveTrends,
    alerts,
    expertDiagnoses: botTraceExpertDiagnoses(frames, stats, alerts, objectiveTrends),
  };
};
