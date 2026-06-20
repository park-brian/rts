import {
  botObjectiveTrends,
  botTraceCompetenceGates,
  botTraceAlerts,
  botTraceExpertDiagnoses,
  botTraceFrame,
  botTracePhaseAssessments,
  botTracePhaseSummaries,
  createBotPlanner,
  type BotExpertDiagnosis,
  type BotMatchTrace,
  type BotPlanner,
  type BotTraceCompetenceGate,
  type BotTraceFrame,
  type BotTracePhaseAssessment,
  type BotTracePhaseSummary,
  type BotTurnPlan,
} from '@rts/ai';
import { Terran, type CommandResult, type Controller, type Faction, type MatchStats, type State } from './sim.ts';
import type { MatchHealthRow } from './match-health.ts';

export type AppBotDiagnostics = {
  player: number;
  faction: Faction;
  planner: BotPlanner;
  sampleEvery: number;
  frames: BotTraceFrame[];
  commandResults: CommandResult[];
  lastPlan: BotTurnPlan | null;
};

export type AppBotExpertReport = {
  healthRows: MatchHealthRow[];
  phaseSummaries: BotTracePhaseSummary[];
  phaseAssessments: BotTracePhaseAssessment[];
  competenceGates: BotTraceCompetenceGate[];
};

const botConfigFor = (player: number): Parameters<typeof createBotPlanner>[1] =>
  player % 2 === 0
    ? { attackThreshold: 10, barracksTarget: 2 }
    : { attackThreshold: 12, barracksTarget: 3 };

export const createBotDiagnostics = (
  players: number,
  factions: readonly Faction[] = [],
  sampleEvery = 240,
): AppBotDiagnostics[] =>
  Array.from({ length: players }, (_, player) => {
    const faction = factions[player] ?? Terran;
    return {
      player,
      faction,
      planner: createBotPlanner(faction, botConfigFor(player)),
      sampleEvery: Math.max(1, sampleEvery),
      frames: [],
      commandResults: [],
      lastPlan: null,
    };
  });

export const botDiagnosticController = (diagnostics: AppBotDiagnostics): Controller =>
  (s: State, player: number) => {
    const plan = diagnostics.planner(s, player);
    diagnostics.lastPlan = plan;
    if (s.tick % diagnostics.sampleEvery === 0) {
      diagnostics.frames.push(botTraceFrame(s, player, diagnostics.faction, plan));
    }
    return plan.commands;
  };

export const recordBotDiagnosticResults = (
  diagnostics: readonly AppBotDiagnostics[],
  results: readonly CommandResult[],
): void => {
  const byPlayer = new Map(diagnostics.map((diagnostic) => [diagnostic.player, diagnostic]));
  for (const result of results) byPlayer.get(result.player)?.commandResults.push(result);
};

const allBotFrames = (diagnostics: readonly AppBotDiagnostics[]): BotTraceFrame[] =>
  diagnostics.flatMap((diagnostic) => diagnostic.frames);

const allBotCommandResults = (diagnostics: readonly AppBotDiagnostics[]): CommandResult[] =>
  diagnostics.flatMap((diagnostic) => diagnostic.commandResults);

export const botDiagnosticTrace = (
  diagnostics: readonly AppBotDiagnostics[],
  stats: MatchStats,
): BotMatchTrace | null => {
  const frames = allBotFrames(diagnostics);
  if (frames.length === 0) return null;
  const commandResults = allBotCommandResults(diagnostics);
  const invalidCommandsByPlayer = stats.players.map(() => 0);
  let invalidCommands = 0;
  for (const result of commandResults) {
    if (result.ok) continue;
    invalidCommands++;
    if (result.player >= 0 && result.player < invalidCommandsByPlayer.length) {
      invalidCommandsByPlayer[result.player]!++;
    }
  }
  const objectiveTrends = botObjectiveTrends(frames);
  const alerts = botTraceAlerts(frames, commandResults);
  const phaseSummaries = botTracePhaseSummaries(frames, alerts);
  return {
    frames,
    stats,
    invalidCommands,
    invalidCommandsByPlayer,
    commandResults,
    objectiveTrends,
    alerts,
    expertDiagnoses: botTraceExpertDiagnoses(frames, stats, alerts, objectiveTrends),
    phaseSummaries,
    phaseAssessments: botTracePhaseAssessments(phaseSummaries),
  };
};

export const botExpertDiagnoses = (
  diagnostics: readonly AppBotDiagnostics[],
  stats: MatchStats,
): BotExpertDiagnosis[] =>
  botDiagnosticTrace(diagnostics, stats)?.expertDiagnoses ?? [];

export const botExpertHealthRows = (
  diagnostics: readonly AppBotDiagnostics[],
  stats: MatchStats,
): MatchHealthRow[] =>
  botExpertReport(diagnostics, stats).healthRows;

export const botExpertReport = (
  diagnostics: readonly AppBotDiagnostics[],
  stats: MatchStats,
): AppBotExpertReport => {
  const trace = botDiagnosticTrace(diagnostics, stats);
  if (!trace) {
    return {
      healthRows: [],
      phaseSummaries: [],
      phaseAssessments: [],
      competenceGates: [],
    };
  }
  const players = diagnostics
    .filter((diagnostic) => diagnostic.frames.length > 0)
    .map((diagnostic) => diagnostic.player);
  return {
    healthRows: trace.expertDiagnoses.map((diagnosis) => ({
      player: diagnosis.player,
      domain: diagnosis.domain,
      status: diagnosis.status,
      severity: diagnosis.severity,
      detail: diagnosis.detail,
    })),
    phaseSummaries: trace.phaseSummaries,
    phaseAssessments: trace.phaseAssessments,
    competenceGates: players.flatMap((player) => botTraceCompetenceGates(trace, player)),
  };
};

export const botPhaseSummaries = (
  diagnostics: readonly AppBotDiagnostics[],
  stats: MatchStats,
): BotTracePhaseSummary[] =>
  botExpertReport(diagnostics, stats).phaseSummaries;

export const botPhaseAssessments = (
  diagnostics: readonly AppBotDiagnostics[],
  stats: MatchStats,
): BotTracePhaseAssessment[] =>
  botExpertReport(diagnostics, stats).phaseAssessments;

export const botCompetenceGates = (
  diagnostics: readonly AppBotDiagnostics[],
  stats: MatchStats,
): BotTraceCompetenceGate[] =>
  botExpertReport(diagnostics, stats).competenceGates;
