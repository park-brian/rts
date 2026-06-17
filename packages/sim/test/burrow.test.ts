import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/sim.ts';
import { sliceMap } from '../src/map.ts';
import { spawnUnit } from '../src/factory.ts';
import { Kind, Tech, Units } from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import { kill, slotOf } from '../src/world.ts';
import { setTechLevel } from '../src/tech.ts';
import { canDetect } from '../src/detection.ts';
import { parseReplay } from '../src/replay.ts';

test('burrow requires tech for normal zerg units and cloaks them from non-detectors', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 80 });
  const s = sim.fullState();
  const e = s.e;
  const zergling = spawnUnit(s, Kind.Zergling, 0, fx(400), fx(400));
  const marine = spawnUnit(s, Kind.Marine, 1, fx(430), fx(400));

  let results = sim.step([{ player: 0, cmds: [{ t: 'burrow', unit: zergling, active: true }] }]);
  assert.deepEqual(results, [{ player: 0, index: 0, t: 'burrow', ok: false, reason: 'missing-requirement' }]);

  setTechLevel(s, 0, Tech.Burrow, 1);
  results = sim.step([{ player: 0, cmds: [{ t: 'burrow', unit: zergling, active: true }] }]);
  assert.deepEqual(results, [{ player: 0, index: 0, t: 'burrow', ok: true }]);
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

  spawnUnit(s, Kind.ScienceVessel, 1, fx(420), fx(400));
  assert.equal(canDetect(s, 1, slotOf(zergling)), true);
  results = sim.step([{ player: 1, cmds: [{ t: 'attack', unit: marine, target: zergling }] }]);
  assert.deepEqual(results, [{ player: 1, index: 0, t: 'attack', ok: true }]);
});

test('lurkers burrow innately and only attack while burrowed', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 81 });
  const s = sim.fullState();
  const e = s.e;
  const lurker = spawnUnit(s, Kind.Lurker, 0, fx(400), fx(400));
  let marine = spawnUnit(s, Kind.Marine, 1, fx(455), fx(400));

  let results = sim.step([{ player: 0, cmds: [{ t: 'attack', unit: lurker, target: marine }] }]);
  assert.deepEqual(results, [{ player: 0, index: 0, t: 'attack', ok: false, reason: 'missing-capability' }]);
  kill(s, slotOf(marine));

  results = sim.step([{ player: 0, cmds: [{ t: 'burrow', unit: lurker, active: true }] }]);
  assert.deepEqual(results, [{ player: 0, index: 0, t: 'burrow', ok: true }]);
  assert.equal(e.burrowed[slotOf(lurker)], 1);

  marine = spawnUnit(s, Kind.Marine, 1, fx(455), fx(400));
  const hpBefore = e.hp[slotOf(marine)]!;
  results = sim.step([{ player: 0, cmds: [{ t: 'attack', unit: lurker, target: marine }] }]);
  assert.deepEqual(results, [{ player: 0, index: 0, t: 'attack', ok: true }]);
  assert.ok(e.hp[slotOf(marine)]! < hpBefore);
});

test('lurker attack line damages ground units along the spine path', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 82 });
  const s = sim.fullState();
  const e = s.e;
  const lurker = spawnUnit(s, Kind.Lurker, 0, fx(400), fx(400));
  sim.step([{ player: 0, cmds: [{ t: 'burrow', unit: lurker, active: true }] }]);
  const target = spawnUnit(s, Kind.SiegeTank, 1, fx(560), fx(400));
  const along = spawnUnit(s, Kind.Marine, 1, fx(490), fx(405));
  const friendlyAlong = spawnUnit(s, Kind.Medic, 0, fx(520), fx(398));
  const offLine = spawnUnit(s, Kind.Marine, 1, fx(490), fx(470));
  const air = spawnUnit(s, Kind.Wraith, 1, fx(500), fx(400));
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

test('burrow state round-trips through byte snapshots', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 83 });
  const s = sim.fullState();
  const zergling = spawnUnit(s, Kind.Zergling, 0, fx(400), fx(400));
  setTechLevel(s, 0, Tech.Burrow, 1);
  sim.step([{ player: 0, cmds: [{ t: 'burrow', unit: zergling, active: true }] }]);

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
