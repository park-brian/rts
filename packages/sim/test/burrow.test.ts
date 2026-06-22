import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/sim.ts';
import { Kind, Tech, Units, tiles } from '../src/data/index.ts';
import { fx } from '../src/fixed.ts';
import { kill, slotOf } from '../src/entity/world.ts';
import { canDetect } from '../src/mechanics/detection.ts';
import { parseReplay } from '../src/io/replay.ts';
import { bodyBounds } from '../src/spatial/geometry.ts';
import { ModeTransitionTimings } from '../src/mechanics/mode-transition.ts';
import { simScenario } from '../test-support/scenario.ts';

const finishTransition = (sim: Sim, slot: number): void => {
  const e = sim.fullState().e;
  for (let i = 0; i < 200 && e.modeTransitionTimer[slot]! > 0; i++) sim.step([]);
  assert.equal(e.modeTransitionTimer[slot], 0);
};

test('burrow requires tech for normal zerg units and cloaks them from non-detectors', () => {
  const { sim, state: s, spawn, grant } = simScenario({ seed: 80 });
  const e = s.e;
  const zergling = spawn(Kind.Zergling, 0, fx(400), fx(400));
  const marine = spawn(Kind.Marine, 1, fx(430), fx(400));

  let results = sim.step([{ player: 0, cmds: [{ t: 'burrow', unit: zergling, active: true }] }]);
  assert.deepEqual(results, [{ player: 0, index: 0, t: 'burrow', ok: false, reason: 'missing-requirement' }]);

  grant(0, Tech.Burrow);
  results = sim.step([{ player: 0, cmds: [{ t: 'burrow', unit: zergling, active: true }] }]);
  assert.deepEqual(results, [{ player: 0, index: 0, t: 'burrow', ok: true }]);
  assert.equal(e.burrowed[slotOf(zergling)], 0);
  assert.equal(e.modeTransitionTotal[slotOf(zergling)], ModeTransitionTimings.Burrow.duration);
  finishTransition(sim, slotOf(zergling));
  assert.equal(e.burrowed[slotOf(zergling)], 1);
  assert.equal(canDetect(s, 1, slotOf(zergling)), false);

  results = sim.step([
    { player: 0, cmds: [{ t: 'move', unit: zergling, x: fx(500), y: fx(400) }] },
    { player: 1, cmds: [{ t: 'attack', unit: marine, target: zergling }] },
  ]);
  assert.deepEqual(results, [
    { player: 0, index: 0, t: 'move', ok: false, reason: 'missing-capability' },
    { player: 1, index: 0, t: 'attack', ok: false, reason: 'target-not-allowed' },
  ]);

  spawn(Kind.ScienceVessel, 1, fx(420), fx(400));
  assert.equal(canDetect(s, 1, slotOf(zergling)), true);
  results = sim.step([{ player: 1, cmds: [{ t: 'attack', unit: marine, target: zergling }] }]);
  assert.deepEqual(results, [{ player: 1, index: 0, t: 'attack', ok: true }]);
});

test('unburrow uses the sourced deterministic iscript random range', () => {
  const { sim, state: s, spawn, grant } = simScenario({ seed: 8080 });
  const e = s.e;
  const zergling = spawn(Kind.Zergling, 0, fx(400), fx(400));
  grant(0, Tech.Burrow);

  sim.step([{ player: 0, cmds: [{ t: 'burrow', unit: zergling, active: true }] }]);
  finishTransition(sim, slotOf(zergling));
  const results = sim.step([{ player: 0, cmds: [{ t: 'burrow', unit: zergling, active: false }] }]);

  assert.deepEqual(results, [{ player: 0, index: 0, t: 'burrow', ok: true }]);
  assert.equal(e.burrowed[slotOf(zergling)], 1);
  assert.ok(e.modeTransitionTotal[slotOf(zergling)]! >= ModeTransitionTimings.Unburrow.minDuration);
  assert.ok(e.modeTransitionTotal[slotOf(zergling)]! <= ModeTransitionTimings.Unburrow.maxDuration);
  finishTransition(sim, slotOf(zergling));
  assert.equal(e.burrowed[slotOf(zergling)], 0);
});

test('lurkers burrow innately and only attack while burrowed', () => {
  const { sim, state: s, spawn } = simScenario({ seed: 81 });
  const e = s.e;
  const lurker = spawn(Kind.Lurker, 0, fx(400), fx(400));
  let marine = spawn(Kind.Marine, 1, fx(455), fx(400));

  let results = sim.step([{ player: 0, cmds: [{ t: 'attack', unit: lurker, target: marine }] }]);
  assert.deepEqual(results, [{ player: 0, index: 0, t: 'attack', ok: false, reason: 'missing-capability' }]);
  kill(s, slotOf(marine));

  results = sim.step([{ player: 0, cmds: [{ t: 'burrow', unit: lurker, active: true }] }]);
  assert.deepEqual(results, [{ player: 0, index: 0, t: 'burrow', ok: true }]);
  assert.equal(e.burrowed[slotOf(lurker)], 0);
  assert.equal(e.modeTransitionTotal[slotOf(lurker)], ModeTransitionTimings.LurkerBurrow.duration);
  finishTransition(sim, slotOf(lurker));
  assert.equal(e.burrowed[slotOf(lurker)], 1);

  marine = spawn(Kind.Marine, 1, fx(455), fx(400));
  const hpBefore = e.hp[slotOf(marine)]!;
  results = sim.step([{ player: 0, cmds: [{ t: 'attack', unit: lurker, target: marine }] }]);
  assert.deepEqual(results, [{ player: 0, index: 0, t: 'attack', ok: true }]);
  assert.ok(e.hp[slotOf(marine)]! < hpBefore);
});

test('burrow transition timings are sourced from iscript completion signals', () => {
  assert.equal(ModeTransitionTimings.Burrow.sourceStatus, 'sourced');
  assert.equal(ModeTransitionTimings.Burrow.duration, 5);
  assert.match(ModeTransitionTimings.Burrow.note, /sigorder 4/);

  assert.equal(ModeTransitionTimings.InfestedTerranBurrow.sourceStatus, 'sourced');
  assert.equal(ModeTransitionTimings.InfestedTerranBurrow.duration, 6);
  assert.equal(ModeTransitionTimings.LurkerBurrow.sourceStatus, 'sourced');
  assert.equal(ModeTransitionTimings.LurkerBurrow.duration, 20);

  assert.equal(ModeTransitionTimings.Unburrow.sourceStatus, 'sourced');
  assert.equal(ModeTransitionTimings.Unburrow.minDuration, 5);
  assert.equal(ModeTransitionTimings.Unburrow.maxDuration, 9);
  assert.equal(ModeTransitionTimings.InfestedTerranUnburrow.sourceStatus, 'sourced');
  assert.equal(ModeTransitionTimings.InfestedTerranUnburrow.minDuration, 6);
  assert.equal(ModeTransitionTimings.InfestedTerranUnburrow.maxDuration, 10);
});

test('lurker attack line damages ground units along the spine path', () => {
  const { sim, state: s, spawn } = simScenario({ seed: 82 });
  const e = s.e;
  const lurker = spawn(Kind.Lurker, 0, fx(400), fx(400));
  sim.step([{ player: 0, cmds: [{ t: 'burrow', unit: lurker, active: true }] }]);
  finishTransition(sim, slotOf(lurker));
  const target = spawn(Kind.SiegeTank, 1, fx(560), fx(400));
  const along = spawn(Kind.Marine, 1, fx(490), fx(405));
  const friendlyAlong = spawn(Kind.Medic, 0, fx(520), fx(398));
  const offLine = spawn(Kind.Marine, 1, fx(490), fx(470));
  const air = spawn(Kind.Wraith, 1, fx(500), fx(400));
  const alongHp = e.hp[slotOf(along)]!;
  const friendlyHp = e.hp[slotOf(friendlyAlong)]!;
  const offLineHp = e.hp[slotOf(offLine)]!;
  const airHp = e.hp[slotOf(air)]!;

  const results = sim.step([{ player: 0, cmds: [{ t: 'attack', unit: lurker, target }] }]);

  assert.deepEqual(results, [{ player: 0, index: 0, t: 'attack', ok: true }]);
  assert.ok(e.hp[slotOf(target)]! < Units[Kind.SiegeTank]!.hp);
  assert.ok(e.hp[slotOf(along)]! < alongHp);
  assert.ok(e.hp[slotOf(friendlyAlong)]! < friendlyHp);
  assert.equal(e.hp[slotOf(offLine)], offLineHp);
  assert.equal(e.hp[slotOf(air)], airHp);
});

test('lurker attack line uses top-down body edges for width', () => {
  const { sim, state: s, spawn } = simScenario({ seed: 821 });
  const e = s.e;
  const lurker = spawn(Kind.Lurker, 0, fx(400), fx(400));
  sim.step([{ player: 0, cmds: [{ t: 'burrow', unit: lurker, active: true }] }]);
  finishTransition(sim, slotOf(lurker));
  const target = spawn(Kind.SiegeTank, 1, fx(560), fx(400));
  const lineWidth = tiles(1);
  const tankUp = bodyBounds(Kind.SiegeTank).up;
  const edgeSplash = spawn(Kind.SiegeTank, 1, fx(480), fx(400) + lineWidth + tankUp - fx(4));
  const outsideSplash = spawn(Kind.SiegeTank, 1, fx(520), fx(400) + lineWidth + tankUp + fx(4));
  const edgeSlot = slotOf(edgeSplash);
  const outsideSlot = slotOf(outsideSplash);
  const edgeHp = e.hp[edgeSlot]!;
  const outsideHp = e.hp[outsideSlot]!;

  assert.ok(Math.abs(e.y[edgeSlot]! - fx(400)) > lineWidth, 'edge case center is outside the old line-width check');

  const results = sim.step([{ player: 0, cmds: [{ t: 'attack', unit: lurker, target }] }]);

  assert.deepEqual(results, [{ player: 0, index: 0, t: 'attack', ok: true }]);
  assert.ok(e.hp[edgeSlot]! < edgeHp);
  assert.equal(e.hp[outsideSlot], outsideHp);
});

test('burrow state round-trips through byte snapshots', () => {
  const { sim, spawn, grant } = simScenario({ players: 1, seed: 83 });
  const zergling = spawn(Kind.Zergling, 0, fx(400), fx(400));
  grant(0, Tech.Burrow);
  sim.step([{ player: 0, cmds: [{ t: 'burrow', unit: zergling, active: true }] }]);
  finishTransition(sim, slotOf(zergling));

  const restored = Sim.deserialize(sim.serialize());

  assert.equal(restored.fullState().e.burrowed[slotOf(zergling)], 1);
  assert.equal(restored.hash(), sim.hash());
});

test('replay parser accepts burrow commands', () => {
  const replay = {
    version: 1,
    map: { kind: 'slice' },
    players: 1,
    seed: 84,
    frames: [[{ player: 0, cmds: [{ t: 'burrow', unit: 123, active: true }] }]],
  };

  const parsed = parseReplay(JSON.stringify(replay));

  assert.deepEqual(parsed.frames[0]![0]!.cmds[0], { t: 'burrow', unit: 123, active: true });
});
