import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { ui } from '../src/store.ts';
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

test('game restart controls full-vision tracking as a setup debug option', () => {
  const g = new Game('play', 1001);

  g.restart('play', 4242, 1, ['terran', 'protoss'], 0, {
    kind: 'procedural',
    perTeam: 1,
    seed: 4242,
    preset: 'teamPlateaus',
    midfield: 'empty',
  }, [0, 1], [true, true], true);

  assert.equal(g.fullVision, true);
  assert.equal(ui.fullVision.value, true);
  assert.equal(g.sim.fullState().trackVision, false);

  g.restart('play', 4243, 1, ['terran', 'protoss'], 0, {
    kind: 'procedural',
    perTeam: 1,
    seed: 4243,
    preset: 'teamPlateaus',
    midfield: 'empty',
  }, [0, 1], [true, true], false);

  assert.equal(g.fullVision, false);
  assert.equal(ui.fullVision.value, false);
  assert.equal(g.sim.fullState().trackVision, true);
});

test('replay transport state stays in sync while seeking and stepping', () => {
  const g = new Game('play', 1701);
  g.fastForward(3);
  const json = g.exportReplay();
  assert.ok(json);

  g.startReplay(JSON.parse(json) as Replay);

  assert.equal(g.mode, 'replay');
  assert.equal(g.replayTick, 0);
  assert.equal(ui.replayTick.value, 0);
  assert.equal(ui.replayTotal.value, 3);
  assert.equal(ui.paused.value, false);

  g.seekReplay(2);
  assert.equal(g.replayTick, 2);
  assert.equal(ui.replayTick.value, 2);
  assert.equal(g.paused, false);

  g.setReplaySpeed(2);
  assert.equal(g.replaySpeed, 2);
  assert.equal(ui.replaySpeed.value, 2);
  g.togglePause();
  assert.equal(g.paused, true);
  assert.equal(ui.paused.value, true);
  g.togglePause();
  assert.equal(g.paused, false);

  g.update(1000);
  g.update(1100);
  assert.equal(g.replayTick, 3);
  assert.equal(g.paused, true);
  assert.equal(ui.paused.value, true);

  g.togglePause();
  assert.equal(g.replayTick, 0);
  assert.equal(g.paused, false);
  assert.equal(ui.replayTick.value, 0);
});
