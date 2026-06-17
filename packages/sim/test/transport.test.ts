import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/sim.ts';
import { sliceMap } from '../src/map.ts';
import { Kind, Order, Tech } from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import { eid, isAlive, NONE, slotOf } from '../src/world.ts';
import { spawnUnit } from '../src/factory.ts';
import { setTechLevel } from '../src/tech.ts';
import { deserializeState, serializeState } from '../src/serialize.ts';
import { parseReplay } from '../src/replay.ts';

test('transports load, carry, and unload ground units through explicit commands', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 170 });
  const s = sim.fullState();
  const e = s.e;
  const dropship = slotOf(spawnUnit(s, Kind.Dropship, 0, fx(700), fx(700)));
  const marine = slotOf(spawnUnit(s, Kind.Marine, 0, fx(720), fx(700)));

  const load = sim.step([{ player: 0, cmds: [{ t: 'load', transport: eid(e, dropship), unit: eid(e, marine) }] }]);
  assert.deepEqual(load, [{ player: 0, index: 0, t: 'load', ok: true }]);
  assert.equal(e.container[marine], eid(e, dropship));
  assert.equal(e.order[marine], Order.Idle);

  sim.step([{ player: 0, cmds: [{ t: 'move', unit: eid(e, dropship), x: fx(820), y: fx(700) }] }]);
  for (let i = 0; i < 4; i++) sim.step([]);
  assert.equal(e.x[marine], e.x[dropship]);
  assert.equal(e.y[marine], e.y[dropship]);

  const unloadX = e.x[dropship]!;
  const unloadY = e.y[dropship]! + fx(40);
  const unload = sim.step([{ player: 0, cmds: [{ t: 'unload', transport: eid(e, dropship), unit: eid(e, marine), x: unloadX, y: unloadY }] }]);
  assert.deepEqual(unload, [{ player: 0, index: 0, t: 'unload', ok: true }]);
  assert.equal(e.container[marine], NONE);
  assert.equal(e.x[marine], unloadX);
  assert.equal(e.y[marine], unloadY);
});

test('transport capacity and Overlord transport tech are validated centrally', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 171 });
  const s = sim.fullState();
  const e = s.e;
  const dropship = slotOf(spawnUnit(s, Kind.Dropship, 0, fx(700), fx(700)));
  const a = slotOf(spawnUnit(s, Kind.SiegeTank, 0, fx(710), fx(700)));
  const b = slotOf(spawnUnit(s, Kind.SiegeTank, 0, fx(720), fx(700)));
  const c = slotOf(spawnUnit(s, Kind.Marine, 0, fx(730), fx(700)));

  const full = sim.step([{ player: 0, cmds: [
    { t: 'load', transport: eid(e, dropship), unit: eid(e, a) },
    { t: 'load', transport: eid(e, dropship), unit: eid(e, b) },
    { t: 'load', transport: eid(e, dropship), unit: eid(e, c) },
  ] }]);
  assert.deepEqual(full, [
    { player: 0, index: 0, t: 'load', ok: true },
    { player: 0, index: 1, t: 'load', ok: true },
    { player: 0, index: 2, t: 'load', ok: false, reason: 'queue-full' },
  ]);

  const overlord = slotOf(spawnUnit(s, Kind.Overlord, 0, fx(900), fx(700)));
  const drone = slotOf(spawnUnit(s, Kind.Drone, 0, fx(910), fx(700)));
  const beforeTech = sim.step([{ player: 0, cmds: [{ t: 'load', transport: eid(e, overlord), unit: eid(e, drone) }] }]);
  assert.deepEqual(beforeTech, [{ player: 0, index: 0, t: 'load', ok: false, reason: 'missing-capability' }]);

  setTechLevel(s, 0, Tech.VentralSacs, 1);
  const afterTech = sim.step([{ player: 0, cmds: [{ t: 'load', transport: eid(e, overlord), unit: eid(e, drone) }] }]);
  assert.deepEqual(afterTech, [{ player: 0, index: 0, t: 'load', ok: true }]);
});

test('contained units cannot be attacked or seen by enemies and die with the transport', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 172, vision: true });
  const s = sim.fullState();
  const e = s.e;
  const dropship = slotOf(spawnUnit(s, Kind.Dropship, 0, fx(700), fx(700)));
  const marine = slotOf(spawnUnit(s, Kind.Marine, 0, fx(720), fx(700)));
  const enemy = slotOf(spawnUnit(s, Kind.Marine, 1, fx(760), fx(700)));

  sim.step([{ player: 0, cmds: [{ t: 'load', transport: eid(e, dropship), unit: eid(e, marine) }] }]);
  const attackCargo = sim.step([{ player: 1, cmds: [{ t: 'attack', unit: eid(e, enemy), target: eid(e, marine) }] }]);
  assert.deepEqual(attackCargo, [{ player: 1, index: 0, t: 'attack', ok: false, reason: 'target-not-allowed' }]);

  const enemyView = sim.observe(1);
  assert.ok(enemyView.entities.some((v) => v.id === eid(e, dropship)));
  assert.ok(!enemyView.entities.some((v) => v.id === eid(e, marine)));

  e.hp[dropship] = 1;
  sim.step([{ player: 1, cmds: [{ t: 'attack', unit: eid(e, enemy), target: eid(e, dropship) }] }]);
  for (let i = 0; i < 20 && e.alive[dropship] === 1; i++) sim.step([]);
  assert.equal(isAlive(e, eid(e, dropship)), false);
  assert.equal(isAlive(e, eid(e, marine)), false);
});

test('transport containment survives serialization and replay parsing', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 173 });
  const s = sim.fullState();
  const e = s.e;
  const dropship = slotOf(spawnUnit(s, Kind.Dropship, 0, fx(700), fx(700)));
  const marine = slotOf(spawnUnit(s, Kind.Marine, 0, fx(720), fx(700)));
  sim.step([{ player: 0, cmds: [{ t: 'load', transport: eid(e, dropship), unit: eid(e, marine) }] }]);

  const restored = deserializeState(serializeState(s));
  assert.equal(restored.e.container[marine], eid(e, dropship));

  const replay = parseReplay(JSON.stringify({
    version: 1,
    map: { kind: 'slice' },
    players: 1,
    seed: 1,
    frames: [[{ player: 0, cmds: [
      { t: 'load', transport: 1, unit: 2 },
      { t: 'unload', transport: 1, unit: 2, x: 100, y: 200 },
    ] }]],
  }));

  assert.deepEqual(replay.frames[0]![0]!.cmds, [
    { t: 'load', transport: 1, unit: 2 },
    { t: 'unload', transport: 1, unit: 2, x: 100, y: 200 },
  ]);
});

test('bunkers load only infantry up to capacity', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 174 });
  const s = sim.fullState();
  const e = s.e;
  const bunker = slotOf(spawnUnit(s, Kind.Bunker, 0, fx(700), fx(700)));
  const marineA = spawnUnit(s, Kind.Marine, 0, fx(710), fx(700));
  const marineB = spawnUnit(s, Kind.Marine, 0, fx(720), fx(700));
  const firebat = spawnUnit(s, Kind.Firebat, 0, fx(730), fx(700));
  const ghost = spawnUnit(s, Kind.Ghost, 0, fx(740), fx(700));
  const medic = spawnUnit(s, Kind.Medic, 0, fx(750), fx(700));
  const scv = spawnUnit(s, Kind.SCV, 0, fx(760), fx(700));

  const scvLoad = sim.step([{ player: 0, cmds: [{ t: 'load', transport: eid(e, bunker), unit: scv }] }]);
  assert.deepEqual(scvLoad, [{ player: 0, index: 0, t: 'load', ok: false, reason: 'target-not-allowed' }]);

  const fill = sim.step([{ player: 0, cmds: [
    { t: 'load', transport: eid(e, bunker), unit: marineA },
    { t: 'load', transport: eid(e, bunker), unit: marineB },
    { t: 'load', transport: eid(e, bunker), unit: firebat },
    { t: 'load', transport: eid(e, bunker), unit: ghost },
    { t: 'load', transport: eid(e, bunker), unit: medic },
  ] }]);
  assert.deepEqual(fill, [
    { player: 0, index: 0, t: 'load', ok: true },
    { player: 0, index: 1, t: 'load', ok: true },
    { player: 0, index: 2, t: 'load', ok: true },
    { player: 0, index: 3, t: 'load', ok: true },
    { player: 0, index: 4, t: 'load', ok: false, reason: 'queue-full' },
  ]);
});

test('loaded bunker infantry fire from the bunker while hidden from the map', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 175, vision: true });
  const s = sim.fullState();
  const e = s.e;
  const bunker = slotOf(spawnUnit(s, Kind.Bunker, 0, fx(700), fx(700)));
  const marine = slotOf(spawnUnit(s, Kind.Marine, 0, fx(710), fx(700)));
  const enemy = slotOf(spawnUnit(s, Kind.Marine, 1, fx(810), fx(700)));

  sim.step([{ player: 0, cmds: [{ t: 'load', transport: eid(e, bunker), unit: eid(e, marine) }] }]);
  assert.equal(e.container[marine], eid(e, bunker));
  assert.ok(!sim.observe(1).entities.some((v) => v.id === eid(e, marine)));

  const hpBefore = e.hp[enemy]!;
  for (let i = 0; i < 20; i++) sim.step([]);
  assert.ok(e.hp[enemy]! < hpBefore, 'loaded Marine should fire from the Bunker');
  assert.equal(e.container[marine], eid(e, bunker));
});

test('nydus network lets allied units teleport through teammate endpoints', () => {
  const sim = new Sim({ map: sliceMap(), players: 3, seed: 176 });
  const s = sim.fullState();
  s.teams[1] = s.teams[0]!;
  const e = s.e;
  const entrance = slotOf(spawnUnit(s, Kind.NydusCanal, 0, fx(700), fx(700)));
  const exit = slotOf(spawnUnit(s, Kind.NydusCanal, 0, fx(1250), fx(700)));
  const drone = slotOf(spawnUnit(s, Kind.Drone, 1, fx(720), fx(700)));

  const load = sim.step([{ player: 1, cmds: [{ t: 'load', transport: eid(e, entrance), unit: eid(e, drone) }] }]);
  assert.deepEqual(load, [{ player: 1, index: 0, t: 'load', ok: true }]);
  assert.equal(e.container[drone], eid(e, entrance));

  const unloadX = e.x[exit]! + fx(32);
  const unloadY = e.y[exit]!;
  const unload = sim.step([{ player: 1, cmds: [{ t: 'unload', transport: eid(e, entrance), unit: eid(e, drone), x: unloadX, y: unloadY }] }]);
  assert.deepEqual(unload, [{ player: 1, index: 0, t: 'unload', ok: true }]);
  assert.equal(e.container[drone], NONE);
  assert.equal(e.x[drone], unloadX);
  assert.equal(e.y[drone], unloadY);
});

test('nydus unload can choose any same-team exit by target point', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 177 });
  const s = sim.fullState();
  const e = s.e;
  const entrance = slotOf(spawnUnit(s, Kind.NydusCanal, 0, fx(640), fx(700)));
  spawnUnit(s, Kind.NydusCanal, 0, fx(980), fx(700));
  const chosenExit = slotOf(spawnUnit(s, Kind.NydusCanal, 0, fx(1320), fx(700)));
  const zergling = slotOf(spawnUnit(s, Kind.Zergling, 0, fx(660), fx(700)));

  sim.step([{ player: 0, cmds: [{ t: 'load', transport: eid(e, entrance), unit: eid(e, zergling) }] }]);
  const unloadX = e.x[chosenExit]! + fx(40);
  const unload = sim.step([{ player: 0, cmds: [{ t: 'unload', transport: eid(e, entrance), unit: eid(e, zergling), x: unloadX, y: e.y[chosenExit]! }] }]);

  assert.deepEqual(unload, [{ player: 0, index: 0, t: 'unload', ok: true }]);
  assert.equal(e.container[zergling], NONE);
  assert.equal(e.x[zergling], unloadX);
});

test('isolated nydus canal rejects loading instead of trapping units', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 178 });
  const s = sim.fullState();
  const e = s.e;
  const nydus = slotOf(spawnUnit(s, Kind.NydusCanal, 0, fx(700), fx(700)));
  const drone = slotOf(spawnUnit(s, Kind.Drone, 0, fx(720), fx(700)));

  const load = sim.step([{ player: 0, cmds: [{ t: 'load', transport: eid(e, nydus), unit: eid(e, drone) }] }]);
  assert.deepEqual(load, [{ player: 0, index: 0, t: 'load', ok: false, reason: 'missing-capability' }]);
  assert.equal(e.container[drone], NONE);
});
