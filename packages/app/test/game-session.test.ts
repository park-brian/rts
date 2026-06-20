import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import type { Replay } from '../src/sim.ts';

test('game restart preserves procedural map recipe for replay export', () => {
  const g = new Game('play', 1001);
  g.restart('spectate', 4242, 2, ['terran', 'protoss', 'zerg', 'terran'], 0, {
    kind: 'procedural',
    perTeam: 2,
    seed: 4242,
    preset: 'fortress',
    midfield: 'dualChoke',
  });

  const json = g.exportReplay();
  assert.ok(json);
  const replay = JSON.parse(json) as Replay;

  assert.deepEqual(replay.map, {
    kind: 'procedural',
    perTeam: 2,
    seed: 4242,
    preset: 'fortress',
    midfield: 'dualChoke',
  });
  assert.equal(replay.seed, 4242);
  assert.deepEqual(replay.factions, ['terran', 'protoss', 'zerg', 'terran']);
});
