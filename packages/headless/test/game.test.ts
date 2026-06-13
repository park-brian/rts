import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim, generateMap, Terran, type PlayerCommands } from '@rts/sim';
import { createBot, createMacroBot } from '@rts/ai';

// Run a 1v1 to completion: an army AI vs an economy-only AI (which builds no army
// and cannot defend), so the result is decisive.
const playOut = (seed: number, budget: number): { over: boolean; winner: number; ticks: number; hash: number } => {
  const map = generateMap(1, seed);
  const sim = new Sim({ map, players: 2, seed });
  const army = createBot(Terran, { attackThreshold: 8, barracksTarget: 2 });
  const eco = createMacroBot(Terran);
  while (!sim.fullState().result.over && sim.tick < budget) {
    const batch: PlayerCommands[] = [
      { player: 0, cmds: army(sim.fullState(), 0) },
      { player: 1, cmds: eco(sim.fullState(), 1) },
    ];
    sim.step(batch);
  }
  const r = sim.fullState().result;
  return { over: r.over, winner: r.winner, ticks: sim.tick, hash: sim.hash() };
};

test('an army AI defeats an economy-only AI', () => {
  const r = playOut(42, 60000);
  assert.ok(r.over, `game should end (ticks=${r.ticks})`);
  assert.equal(r.winner, 0, 'the army player (team 0) wins');
});

test('full AI-vs-AI games are deterministic', () => {
  const a = playOut(7, 60000);
  const b = playOut(7, 60000);
  assert.deepEqual(a, b);
});
