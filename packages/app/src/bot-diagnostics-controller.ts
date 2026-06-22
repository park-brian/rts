import type { BotTraceCompetenceGate, BotTracePhaseAssessment, BotTracePhaseSummary } from '@rts/ai';
import {
  botCompetenceGates,
  botExpertHealthRows,
  botExpertReport,
  botPhaseAssessments,
  botPhaseSummaries,
  recordBotDiagnosticResults,
  type AppBotDiagnostics,
  type AppBotExpertReport,
} from './bot-diagnostics.ts';
import type { MatchHealthRow } from './match-health.ts';
import type { CommandResult, MatchStats } from './sim.ts';

export class BotDiagnosticsController {
  diagnostics: AppBotDiagnostics[] = [];

  reset(diagnostics: AppBotDiagnostics[]): void {
    this.diagnostics = diagnostics;
  }

  record(results: readonly CommandResult[]): void {
    recordBotDiagnosticResults(this.diagnostics, results);
  }

  healthRows(stats: MatchStats): MatchHealthRow[] {
    return botExpertHealthRows(this.diagnostics, stats);
  }

  report(stats: MatchStats): AppBotExpertReport {
    return botExpertReport(this.diagnostics, stats);
  }

  phaseSummaries(stats: MatchStats): BotTracePhaseSummary[] {
    return botPhaseSummaries(this.diagnostics, stats);
  }

  phaseAssessments(stats: MatchStats): BotTracePhaseAssessment[] {
    return botPhaseAssessments(this.diagnostics, stats);
  }

  competenceGates(stats: MatchStats): BotTraceCompetenceGate[] {
    return botCompetenceGates(this.diagnostics, stats);
  }
}
