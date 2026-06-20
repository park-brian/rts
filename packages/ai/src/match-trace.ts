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
import type { BotPlanner, BotTurnPlan } from './bot.ts';

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
  topIntents: BotTraceIntentSummary[];
  objective: BotObjectiveSnapshot;
};

type BotTraceOutcomeStatus = 'done' | 'waiting' | 'blocked' | 'failed';
type BotTraceIntentReason = Pick<BotIntentScoreReason, 'kind' | 'value' | 'detail'>;

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
  | 'combat-intent-stall';

export type BotTraceAlert = {
  kind: BotTraceAlertKind;
  player: number;
  fromTick: number;
  toTick: number;
  severity: number;
  detail: string;
};

export type BotExpertDiagnosisDomain =
  | 'macro'
  | 'economy'
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

const combatIntentCount = (frame: BotTraceFrame): number =>
  countIntents(frame, COMBAT_INTENTS);

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
        frame.objective.resourceFloat >= PRODUCTION_FLOAT_ALERT &&
        frame.supplyUsed < frame.supplyMax &&
        frame.idleProducers + frame.idleLarvae > 0 &&
        trainIntentCount(frame) > 0 &&
        (frame.commandsByType.train ?? 0) === 0,
      (_start, end, count) => `${count} sampled frames had idle production and ${end.objective.resourceFloat} resources without training`,
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
    const macroAlerts = playerAlerts(alerts, player, ['invalid-commands', 'resource-float-stall']);
    const productionAlerts = playerAlerts(alerts, player, ['production-stall']);
    const combatAlerts = playerAlerts(alerts, player, ['combat-intent-stall']);
    const macroCommands = playerStats ? commandTotal(playerStats.commandsByType, MACRO_COMMANDS) : 0;
    const combatCommands = playerStats ? commandTotal(playerStats.commandsByType, COMBAT_COMMANDS) : 0;
    const workerGain = trend ? trend.after.workerSupply - trend.before.workerSupply : last.workers - first.workers;
    const armyGain = trend ? trend.after.armyStrength - trend.before.armyStrength : last.army - first.army;
    const enemyLoss = trend
      ? trend.reasons.some((reason) => reason.kind === 'enemy-economy-damage' || reason.kind === 'enemy-army-damage')
      : false;

    diagnoses.push(macroAlerts.length > 0
      ? diagnosis('macro', player, 'failing', alertSeverity(macroAlerts), macroAlerts.map((alert) => alert.detail).join('; '))
      : diagnosis('macro', player, macroCommands > 0 ? 'healthy' : 'watch', macroCommands, macroCommands > 0
        ? `${macroCommands} macro command attempts in the trace`
        : 'no macro command attempts were observed'));

    const economyStatus: BotExpertDiagnosisStatus = workerGain > 0
      ? 'healthy'
      : last.workers >= first.workers ? 'watch' : 'failing';
    diagnoses.push(diagnosis(
      'economy',
      player,
      economyStatus,
      Math.abs(workerGain),
      workerGain > 0
        ? `worker supply increased by ${workerGain}`
        : last.workers >= first.workers ? 'worker count held steady during the trace' : 'worker count declined during the trace',
    ));

    diagnoses.push(productionAlerts.length > 0
      ? diagnosis('production', player, 'failing', alertSeverity(productionAlerts), productionAlerts.map((alert) => alert.detail).join('; '))
      : diagnosis('production', player, armyGain > 0 ? 'healthy' : 'watch', Math.max(0, armyGain), armyGain > 0
        ? `field army strength increased by ${armyGain}`
        : 'no completed combat production was observed'));

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
    topIntents: plan.intentResults.slice(0, TOP_TRACE_INTENTS).map(intentSummary),
    objective: botObjectiveSnapshot(s, player),
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

export const runBotMatchTrace = (
  sim: Sim,
  participants: readonly BotTraceParticipant[],
  options: BotMatchTraceOptions,
): BotMatchTrace => {
  const stats = createMatchStats(sim.fullState());
  const frames: BotTraceFrame[] = [];
  const commandResults: CommandResult[] = [];
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
    }
    recordMatchStatsStep(stats, sim.fullState(), batch, results);
  }

  const objectiveTrends = botObjectiveTrends(frames);
  const alerts = botTraceAlerts(frames, commandResults);

  return {
    frames,
    stats,
    invalidCommands,
    commandResults,
    objectiveTrends,
    alerts,
    expertDiagnoses: botTraceExpertDiagnoses(frames, stats, alerts, objectiveTrends),
  };
};
