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
  assert.equal(rows.length, 10);
  assert.equal(rows.some((row) => row.domain === 'strategy' && row.detail.includes('posture')), true);
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
