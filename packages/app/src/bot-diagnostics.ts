import {
  botObjectiveTrends,
  botTraceAlerts,
  botTraceExpertDiagnoses,
  botTraceFrame,
  botTracePhaseAssessments,
  botTracePhaseSummaries,
  createBotPlanner,
  type BotExpertDiagnosis,
  type BotPlanner,
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

export const botExpertDiagnoses = (
  diagnostics: readonly AppBotDiagnostics[],
  stats: MatchStats,
): BotExpertDiagnosis[] => {
  const frames = allBotFrames(diagnostics);
  if (frames.length === 0) return [];
  const commandResults = allBotCommandResults(diagnostics);
  const alerts = botTraceAlerts(frames, commandResults);
  return botTraceExpertDiagnoses(frames, stats, alerts, botObjectiveTrends(frames));
};

export const botExpertHealthRows = (
  diagnostics: readonly AppBotDiagnostics[],
  stats: MatchStats,
): MatchHealthRow[] => botExpertDiagnoses(diagnostics, stats).map((diagnosis) => ({
  player: diagnosis.player,
  domain: diagnosis.domain,
  status: diagnosis.status,
  severity: diagnosis.severity,
  detail: diagnosis.detail,
}));

export const botPhaseSummaries = (
  diagnostics: readonly AppBotDiagnostics[],
): BotTracePhaseSummary[] => {
  const frames = allBotFrames(diagnostics);
  if (frames.length === 0) return [];
  return botTracePhaseSummaries(frames, botTraceAlerts(frames, allBotCommandResults(diagnostics)));
};

export const botPhaseAssessments = (
  diagnostics: readonly AppBotDiagnostics[],
): BotTracePhaseAssessment[] =>
  botTracePhaseAssessments(botPhaseSummaries(diagnostics));
