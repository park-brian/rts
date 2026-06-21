import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import type { Replay } from '../src/sim.ts';

test('game restart can disable setup rows while preserving their map start slots', () => {
  const g = new Game('spectate', 1001);
  g.restart('play', 4242, 2, ['terran', 'protoss', 'zerg', 'protoss'], 1, {
    kind: 'procedural',
    perTeam: 2,
    seed: 4242,
    preset: 'fortress',
    midfield: 'dualChoke',
  }, [0, 0, 1, 1], [true, false, false, true]);

  const json = g.exportReplay();
  assert.ok(json);
  const replay = JSON.parse(json) as Replay;

  assert.equal(replay.players, 2);
  assert.deepEqual(replay.factions, ['terran', 'protoss']);
  assert.deepEqual(replay.teams, [0, 1]);
  assert.deepEqual(replay.startSlots, [0, 3]);
  assert.deepEqual(g.playerRaceNames, ['terran', 'protoss', 'zerg', 'protoss']);
  assert.deepEqual(g.playerTeamIds, [0, 0, 1, 1]);
  assert.deepEqual(g.playerEnabled, [true, false, false, true]);
  assert.equal(g.humanPlayer, 0);
  assert.equal(g.human, 0);
  assert.equal(g.controllers.length, 2);
  assert.equal(g.controllers[0], null);
});

test('game restart preserves procedural map recipe for replay export', () => {
  const g = new Game('play', 1001);
  g.restart('spectate', 4242, 2, ['terran', 'protoss', 'zerg', 'terran'], 0, {
    kind: 'procedural',
    perTeam: 2,
    seed: 4242,
    preset: 'fortress',
    midfield: 'dualChoke',
  }, [0, 0, 1, 1]);

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
  assert.deepEqual(replay.teams, [0, 0, 1, 1]);
  assert.deepEqual(Array.from(g.sim.fullState().teams), [0, 0, 1, 1]);
});
