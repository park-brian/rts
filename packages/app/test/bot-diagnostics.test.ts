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
  botDiagnosticController,
  botExpertHealthRows,
  botPhaseAssessments,
  botPhaseSummaries,
  createBotDiagnostics,
  recordBotDiagnosticResults,
} from '../src/bot-diagnostics.ts';

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

  const phases = botPhaseSummaries(diagnostics);
  assert.equal(phases.length > 0, true);
  assert.equal(phases.every((phase) => phase.samples > 0), true);
  assert.equal(phases.some((phase) => (phase.commandsByType.train ?? 0) + (phase.commandsByType.build ?? 0) > 0), true);
  assert.equal(phases.some((phase) => Object.values(phase.intentAxes).some((count) => count > 0)), true);
  assert.equal(phases.some((phase) => phase.plan.reasons.length > 0), true);

  const assessments = botPhaseAssessments(diagnostics);
  assert.equal(assessments.length >= phases.length, true);
  assert.equal(assessments.some((entry) => entry.domain === 'summary' && entry.detail.includes('plan ')), true);
  assert.equal(assessments.every((entry) => phases.some((phase) =>
    phase.player === entry.player &&
    phase.phase === entry.phase &&
    phase.fromTick === entry.fromTick &&
    phase.toTick === entry.toTick)), true);
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
