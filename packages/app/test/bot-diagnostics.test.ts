import assert from 'node:assert/strict';
import test from 'node:test';
import {
  Sim,
  Terran,
  createMatchStats,
  recordMatchStatsStep,
  sliceMap,
  type PlayerCommands,
} from '../src/sim.ts';
import {
  botCompetenceGates,
  botDiagnosticController,
  botDiagnosticTrace,
  botExpertReport,
  botExpertHealthRows,
  botPhaseAssessments,
  botPhaseSummaries,
  createBotDiagnostics,
  recordBotDiagnosticResults,
} from '../src/bot-diagnostics.ts';
import { Game } from '../src/game.ts';

test('traceable bot controllers produce expert health rows for the post-match panel', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 8321, factions: [Terran, Terran] });
  const diagnostics = createBotDiagnostics(2, [Terran, Terran], 1);
  const controllers = diagnostics.map(botDiagnosticController);
  const stats = createMatchStats(sim.fullState());
  const before = sim.fullState();
  const batch: PlayerCommands[] = controllers.map((controller, player) => ({
    player,
    cmds: controller(before, player),
  }));
  const results = sim.step(batch);

  recordMatchStatsStep(stats, sim.fullState(), batch, results);
  recordBotDiagnosticResults(diagnostics, results);

  assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.frames.length), [1, 1]);
  assert.equal(diagnostics.every((diagnostic) => diagnostic.lastPlan !== null), true);
  const trace = botDiagnosticTrace(diagnostics, stats);
  assert.notEqual(trace, null);
  assert.equal(trace!.invalidCommands, results.filter((result) => !result.ok).length);
  const rows = botExpertHealthRows(diagnostics, stats);
  for (const player of [0, 1]) {
    assert.deepEqual(
      rows
        .filter((row) => row.player === player)
        .map((row) => row.domain)
        .sort(),
      ['combat', 'economy', 'macro', 'objective', 'production', 'strategy', 'summary', 'tech'],
    );
  }
  assert.equal(rows.some((row) => row.domain === 'strategy' && row.detail.includes('posture')), true);
  assert.equal(rows.some((row) => row.domain === 'summary' && row.detail.includes('plan')), true);

  const report = botExpertReport(diagnostics, stats);
  assert.equal(report.obligationPressures.length, 8);
  assert.equal(report.expertAgenda.length, 8);
  for (const player of [0, 1]) {
    assert.deepEqual(
      report.obligationPressures
        .filter((pressure) => pressure.player === player)
        .map((pressure) => pressure.id),
      ['safety', 'economy', 'production', 'combat'],
    );
    assert.deepEqual(
      report.expertAgenda
        .filter((item) => item.player === player)
        .map((item) => item.id)
        .sort(),
      ['combat', 'economy', 'production', 'safety'],
    );
  }
  assert.equal(report.obligationPressures.every((pressure) => pressure.detail.length > 0), true);
  assert.equal(report.obligationPressures.every((pressure) => pressure.pressure >= 0), true);
  assert.equal(report.expertAgenda.every((item) => item.intentKinds.length > 0), true);
  assert.equal(report.expertAgenda.some((item) =>
    item.topIntentKind === 'add-production' &&
    item.reason.includes('production')), true);

  const gates = botCompetenceGates(diagnostics, stats);
  const expectedGateDomains = [
    'army-pipeline',
    'combat',
    'commands',
    'defense-response',
    'economy',
    'expansion-plan',
    'expert',
    'macro-spending',
    'objective-progress',
    'obligation-pressure',
    'opening-combat',
    'opening-discipline',
    'phase-evidence',
    'placement',
    'plan-coherence',
    'production',
    'resource-conversion',
    'supply',
    'tech',
    'worker-pipeline',
  ];
  for (const player of [0, 1]) {
    assert.deepEqual(
      gates
        .filter((gate) => gate.player === player)
        .map((gate) => gate.domain)
        .sort(),
      expectedGateDomains,
    );
  }
  assert.equal(gates.some((gate) => gate.domain === 'commands' && gate.detail.includes('planner commands')), true);
  assert.equal(gates.some((gate) => gate.domain === 'worker-pipeline' && gate.detail.length > 0), true);
  assert.equal(gates.some((gate) => gate.domain === 'army-pipeline' && gate.detail.length > 0), true);
  assert.equal(gates.some((gate) => gate.domain === 'defense-response' && gate.detail.length > 0), true);
  assert.equal(gates.some((gate) => gate.domain === 'resource-conversion' && gate.detail.includes('converted')), true);
  assert.equal(gates.some((gate) => gate.domain === 'supply' && gate.detail.length > 0), true);
  assert.equal(gates.some((gate) => gate.domain === 'opening-combat' && gate.detail.length > 0), true);
  assert.equal(gates.some((gate) => gate.domain === 'opening-discipline' && gate.detail.length > 0), true);
  assert.equal(gates.some((gate) => gate.domain === 'obligation-pressure' && gate.detail.length > 0), true);
  assert.equal(gates.some((gate) => gate.domain === 'expansion-plan' && gate.detail.length > 0), true);
  assert.equal(gates.some((gate) => gate.domain === 'objective-progress' && gate.detail.length > 0), true);
  assert.equal(gates.some((gate) => gate.domain === 'macro-spending' && gate.detail.includes('peak resource float')), true);
  assert.equal(gates.some((gate) => gate.domain === 'placement' && gate.detail.includes('placement deadlock')), true);
  assert.equal(gates.some((gate) => gate.domain === 'tech' && gate.detail.includes('tech deadlock')), true);
  assert.equal(gates.some((gate) => gate.domain === 'plan-coherence' && gate.detail.includes('strategy phases')), true);
  assert.equal(gates.some((gate) =>
    gate.domain === 'phase-evidence' &&
    gate.detail.includes('economy') &&
    gate.detail.includes('production') &&
    gate.detail.includes('combat')), true);

  const phases = botPhaseSummaries(diagnostics, stats);
  assert.equal(phases.length > 0, true);
  assert.equal(phases.every((phase) => phase.samples > 0), true);
  assert.equal(phases.some((phase) => (phase.commandsByType.train ?? 0) + (phase.commandsByType.build ?? 0) > 0), true);
  assert.equal(phases.some((phase) => Object.values(phase.intentAxes).some((count) => count > 0)), true);
  assert.equal(phases.some((phase) => phase.plan.reasons.length > 0), true);

  const assessments = botPhaseAssessments(diagnostics, stats);
  assert.equal(assessments.length >= phases.length, true);
  assert.equal(assessments.some((entry) => entry.domain === 'summary' && entry.detail.includes('plan ')), true);
  assert.equal(assessments.every((entry) => phases.some((phase) =>
    phase.player === entry.player &&
    phase.phase === entry.phase &&
    phase.fromTick === entry.fromTick &&
    phase.toTick === entry.toTick)), true);

  assert.deepEqual(report.healthRows, rows);
  assert.equal(report.expertAgenda.length, diagnostics.reduce((sum, diagnostic) =>
    sum + (diagnostic.frames.at(-1)?.expertAgenda.length ?? 0), 0));
  assert.deepEqual(report.phaseSummaries, phases);
  assert.deepEqual(report.phaseAssessments, assessments);
  assert.deepEqual(report.competenceGates, gates);
});

test('bot command results are stored only for their owning diagnostic participant', () => {
  const diagnostics = createBotDiagnostics(2, [Terran, Terran], 1);

  recordBotDiagnosticResults(diagnostics, [
    { player: 0, index: 0, t: 'train', ok: false, reason: 'not-affordable' },
    { player: 1, index: 0, t: 'move', ok: true },
  ]);

  assert.equal(diagnostics[0]!.commandResults.length, 1);
  assert.equal(diagnostics[0]!.commandResults[0]!.player, 0);
  assert.equal(diagnostics[1]!.commandResults.length, 1);
  assert.equal(diagnostics[1]!.commandResults[0]!.player, 1);
});

test('game bot diagnostics facade records command results for reports', () => {
  const game = new Game('spectate', 2468);

  game.fastForward(1);

  const report = game.botExpertReport();
  assert.equal(report.healthRows.length > 0, true);
  assert.equal(report.competenceGates.length > 0, true);
  assert.deepEqual(game.botExpertHealthRows(), report.healthRows);
  assert.deepEqual(game.botPhaseSummaries(), report.phaseSummaries);
  assert.deepEqual(game.botPhaseAssessments(), report.phaseAssessments);
  assert.deepEqual(game.botCompetenceGates(), report.competenceGates);
});
