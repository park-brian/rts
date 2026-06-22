import test from 'node:test';
import assert from 'node:assert/strict';
import { Kind, Order, Tech } from '../src/data/index.ts';
import { fx } from '../src/fixed.ts';
import { eid, isAlive, NONE, slotOf } from '../src/entity/world.ts';
import { deserializeState, serializeState } from '../src/io/serialize.ts';
import { parseReplay } from '../src/io/replay.ts';
import { tileX, tileY } from '../src/spatial/pathing.ts';
import { topDownEdgeDistance } from '../src/spatial/geometry.ts';
import { simScenario } from '../test-support/scenario.ts';

test('transports load, carry, and unload ground units through explicit commands', () => {
  const { sim, state: s, spawn } = simScenario({ players: 1, seed: 170 });
  const e = s.e;
  const dropship = slotOf(spawn(Kind.Dropship, 0, fx(700), fx(700)));
  const marine = slotOf(spawn(Kind.Marine, 0, fx(720), fx(700)));

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

test('queued load commands append, travel, and board after current travel settles', () => {
  const { sim, state: s, spawn } = simScenario({ players: 1, seed: 181 });
  const e = s.e;
  const dropship = slotOf(spawn(Kind.Dropship, 0, fx(760), fx(700)));
  const marine = slotOf(spawn(Kind.Marine, 0, fx(500), fx(700)));
  const first = { x: fx(560), y: fx(700) };

  const results = sim.step([{ player: 0, cmds: [
    { t: 'move', unit: eid(e, marine), ...first },
    { t: 'load', transport: eid(e, dropship), unit: eid(e, marine), queue: true },
  ] }]);

  assert.deepEqual(results.map((r) => r.ok), [true, true]);
  assert.equal(e.order[marine], Order.Move);
  assert.equal(e.orderQueueLen[marine], 1);
  assert.equal(e.orderQueue0[marine], Order.Load);
  assert.equal(e.orderQueueTarget0[marine], eid(e, dropship));
  assert.equal(e.container[marine], NONE);

  for (let i = 0; i < 400 && e.container[marine] === NONE; i++) sim.step([]);

  assert.equal(e.container[marine], eid(e, dropship));
  assert.equal(e.orderQueueLen[marine], 0);
  assert.equal(e.order[marine], Order.Idle);
});

test('queued load skips invalid transports and advances to the next queued order', () => {
  const { sim, state: s, spawn } = simScenario({ players: 1, seed: 182 });
  const e = s.e;
  const dropship = slotOf(spawn(Kind.Dropship, 0, fx(760), fx(700)));
  const marine = slotOf(spawn(Kind.Marine, 0, fx(500), fx(700)));
  const first = { x: fx(560), y: fx(700) };
  const second = { x: fx(620), y: fx(700) };

  sim.step([{ player: 0, cmds: [
    { t: 'move', unit: eid(e, marine), ...first },
    { t: 'load', transport: eid(e, dropship), unit: eid(e, marine), queue: true },
    { t: 'move', unit: eid(e, marine), ...second, queue: true },
  ] }]);
  e.alive[dropship] = 0;

  for (let i = 0; i < 300 && e.tx[marine] !== second.x; i++) sim.step([]);

  assert.equal(e.orderQueueLen[marine], 0);
  assert.equal(e.order[marine], Order.Move);
  assert.equal(e.tx[marine], second.x);
  assert.equal(e.ty[marine], second.y);
});

test('queued load validation accepts out-of-range cargo but rejects full per-unit queues', () => {
  const { sim, state: s, spawn } = simScenario({ players: 1, seed: 183 });
  const e = s.e;
  const dropship = slotOf(spawn(Kind.Dropship, 0, fx(780), fx(700)));
  const marine = slotOf(spawn(Kind.Marine, 0, fx(500), fx(700)));

  const accepted = sim.step([{ player: 0, cmds: [
    { t: 'load', transport: eid(e, dropship), unit: eid(e, marine), queue: true },
  ] }]);
  assert.deepEqual(accepted, [{ player: 0, index: 0, t: 'load', ok: true }]);
  assert.equal(e.order[marine], Order.Load);
  assert.equal(e.target[marine], eid(e, dropship));

  const busy = slotOf(spawn(Kind.Marine, 0, fx(500), fx(740)));
  const full = sim.step([{ player: 0, cmds: [
    { t: 'move', unit: eid(e, busy), x: fx(520), y: fx(740) },
    { t: 'move', unit: eid(e, busy), x: fx(540), y: fx(740), queue: true },
    { t: 'move', unit: eid(e, busy), x: fx(560), y: fx(740), queue: true },
    { t: 'move', unit: eid(e, busy), x: fx(580), y: fx(740), queue: true },
    { t: 'move', unit: eid(e, busy), x: fx(600), y: fx(740), queue: true },
    { t: 'load', transport: eid(e, dropship), unit: eid(e, busy), queue: true },
  ] }]);

  assert.deepEqual(full.map((r) => r.ok), [true, true, true, true, true, false]);
  assert.deepEqual(full.at(-1), { player: 0, index: 5, t: 'load', ok: false, reason: 'queue-full' });
});

test('queued unload commands append and release cargo after current transport travel settles', () => {
  const { sim, state: s, spawn } = simScenario({ players: 1, seed: 184 });
  const e = s.e;
  const dropship = slotOf(spawn(Kind.Dropship, 0, fx(500), fx(700)));
  const marine = slotOf(spawn(Kind.Marine, 0, fx(520), fx(700)));
  sim.step([{ player: 0, cmds: [{ t: 'load', transport: eid(e, dropship), unit: eid(e, marine) }] }]);
  const move = { x: fx(700), y: fx(700) };
  const unload = { x: fx(700), y: fx(760) };

  const results = sim.step([{ player: 0, cmds: [
    { t: 'move', unit: eid(e, dropship), ...move },
    { t: 'unload', transport: eid(e, dropship), unit: eid(e, marine), ...unload, queue: true },
  ] }]);

  assert.deepEqual(results.map((r) => r.ok), [true, true]);
  assert.equal(e.order[dropship], Order.Move);
  assert.equal(e.orderQueueLen[dropship], 1);
  assert.equal(e.orderQueue0[dropship], Order.Unload);
  assert.equal(e.orderQueueTarget0[dropship], eid(e, marine));
  assert.equal(e.orderQueueX0[dropship], unload.x);
  assert.equal(e.orderQueueY0[dropship], unload.y);

  for (let i = 0; i < 400 && e.container[marine] !== NONE; i++) sim.step([]);

  assert.equal(e.container[marine], NONE);
  assert.equal(e.x[marine], unload.x);
  assert.equal(e.y[marine], unload.y);
  assert.equal(e.orderQueueLen[dropship], 0);
});

test('queued unload skips invalid placements and advances to the next queued order', () => {
  const { sim, state: s, spawn } = simScenario({ players: 1, seed: 185 });
  const e = s.e;
  const dropship = slotOf(spawn(Kind.Dropship, 0, fx(500), fx(700)));
  const marine = slotOf(spawn(Kind.Marine, 0, fx(520), fx(700)));
  const blocker = slotOf(spawn(Kind.Marine, 0, fx(700), fx(760)));
  sim.step([{ player: 0, cmds: [{ t: 'load', transport: eid(e, dropship), unit: eid(e, marine) }] }]);
  const move = { x: fx(700), y: fx(700) };
  const follow = { x: fx(760), y: fx(700) };

  sim.step([{ player: 0, cmds: [
    { t: 'move', unit: eid(e, dropship), ...move },
    { t: 'unload', transport: eid(e, dropship), unit: eid(e, marine), x: e.x[blocker]!, y: e.y[blocker]!, queue: true },
    { t: 'move', unit: eid(e, dropship), ...follow, queue: true },
  ] }]);

  for (let i = 0; i < 500 && e.tx[dropship] !== follow.x; i++) sim.step([]);

  assert.equal(e.container[marine], eid(e, dropship));
  assert.equal(e.orderQueueLen[dropship], 0);
  assert.equal(e.order[dropship], Order.Move);
  assert.equal(e.tx[dropship], follow.x);
  assert.equal(e.ty[dropship], follow.y);
});

test('queued unload validation accepts future points but rejects full transport queues', () => {
  const { sim, state: s, spawn } = simScenario({ players: 1, seed: 186 });
  const e = s.e;
  const dropship = slotOf(spawn(Kind.Dropship, 0, fx(500), fx(700)));
  const marine = slotOf(spawn(Kind.Marine, 0, fx(520), fx(700)));
  sim.step([{ player: 0, cmds: [{ t: 'load', transport: eid(e, dropship), unit: eid(e, marine) }] }]);

  const accepted = sim.step([{ player: 0, cmds: [
    { t: 'move', unit: eid(e, dropship), x: fx(620), y: fx(700) },
    { t: 'unload', transport: eid(e, dropship), unit: eid(e, marine), x: fx(900), y: fx(900), queue: true },
  ] }]);
  assert.deepEqual(accepted.map((r) => r.ok), [true, true]);
  assert.equal(e.order[dropship], Order.Move);
  assert.equal(e.orderQueueLen[dropship], 1);
  assert.equal(e.orderQueue0[dropship], Order.Unload);
  assert.equal(e.orderQueueTarget0[dropship], eid(e, marine));
  assert.equal(e.orderQueueX0[dropship], fx(900));
  assert.equal(e.orderQueueY0[dropship], fx(900));

  const other = slotOf(spawn(Kind.Dropship, 0, fx(500), fx(740)));
  const firebat = slotOf(spawn(Kind.Firebat, 0, fx(520), fx(740)));
  sim.step([{ player: 0, cmds: [{ t: 'load', transport: eid(e, other), unit: eid(e, firebat) }] }]);
  const full = sim.step([{ player: 0, cmds: [
    { t: 'move', unit: eid(e, other), x: fx(520), y: fx(740) },
    { t: 'move', unit: eid(e, other), x: fx(540), y: fx(740), queue: true },
    { t: 'move', unit: eid(e, other), x: fx(560), y: fx(740), queue: true },
    { t: 'move', unit: eid(e, other), x: fx(580), y: fx(740), queue: true },
    { t: 'move', unit: eid(e, other), x: fx(600), y: fx(740), queue: true },
    { t: 'unload', transport: eid(e, other), unit: eid(e, firebat), x: fx(620), y: fx(740), queue: true },
  ] }]);

  assert.deepEqual(full.map((r) => r.ok), [true, true, true, true, true, false]);
  assert.deepEqual(full.at(-1), { player: 0, index: 5, t: 'unload', ok: false, reason: 'queue-full' });
});

test('transport unload rejects blocked or occupied points without releasing cargo', () => {
  const { sim, state: s, spawn } = simScenario({ players: 1, seed: 179 });
  const e = s.e;
  const dropship = slotOf(spawn(Kind.Dropship, 0, fx(700), fx(700)));
  const marine = slotOf(spawn(Kind.Marine, 0, fx(720), fx(700)));
  const blocker = slotOf(spawn(Kind.Marine, 0, fx(740), fx(700)));
  const blockedX = fx(780);
  const blockedY = fx(700);
  s.map.walk[tileY(blockedY) * s.map.w + tileX(blockedX)] = 0;

  sim.step([{ player: 0, cmds: [{ t: 'load', transport: eid(e, dropship), unit: eid(e, marine) }] }]);
  const blocked = sim.step([{ player: 0, cmds: [{ t: 'unload', transport: eid(e, dropship), unit: eid(e, marine), x: blockedX, y: blockedY }] }]);
  assert.deepEqual(blocked, [{ player: 0, index: 0, t: 'unload', ok: false, reason: 'placement-blocked' }]);
  assert.equal(e.container[marine], eid(e, dropship));

  const occupied = sim.step([{ player: 0, cmds: [{ t: 'unload', transport: eid(e, dropship), unit: eid(e, marine), x: e.x[blocker]!, y: e.y[blocker]! }] }]);
  assert.deepEqual(occupied, [{ player: 0, index: 0, t: 'unload', ok: false, reason: 'placement-blocked' }]);
  assert.equal(e.container[marine], eid(e, dropship));

  const clearX = e.x[dropship]!;
  const clearY = e.y[dropship]! + fx(72);
  const clear = sim.step([{ player: 0, cmds: [{ t: 'unload', transport: eid(e, dropship), unit: eid(e, marine), x: clearX, y: clearY }] }]);
  assert.deepEqual(clear, [{ player: 0, index: 0, t: 'unload', ok: true }]);
  assert.equal(e.container[marine], NONE);
  assert.equal(e.x[marine], clearX);
  assert.equal(e.y[marine], clearY);
  assert.ok(topDownEdgeDistance(s, marine, blocker) > 0, 'successful unload should not overlap the occupied point blocker');
});

test('transport capacity and Overlord transport tech are validated centrally', () => {
  const { sim, state: s, grant, spawn } = simScenario({ players: 1, seed: 171 });
  const e = s.e;
  const dropship = slotOf(spawn(Kind.Dropship, 0, fx(700), fx(700)));
  const a = slotOf(spawn(Kind.SiegeTank, 0, fx(710), fx(700)));
  const b = slotOf(spawn(Kind.SiegeTank, 0, fx(720), fx(700)));
  const c = slotOf(spawn(Kind.Marine, 0, fx(730), fx(700)));

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

  const overlord = slotOf(spawn(Kind.Overlord, 0, fx(900), fx(700)));
  const drone = slotOf(spawn(Kind.Drone, 0, fx(910), fx(700)));
  const beforeTech = sim.step([{ player: 0, cmds: [{ t: 'load', transport: eid(e, overlord), unit: eid(e, drone) }] }]);
  assert.deepEqual(beforeTech, [{ player: 0, index: 0, t: 'load', ok: false, reason: 'missing-capability' }]);

  grant(0, Tech.VentralSacs);
  const afterTech = sim.step([{ player: 0, cmds: [{ t: 'load', transport: eid(e, overlord), unit: eid(e, drone) }] }]);
  assert.deepEqual(afterTech, [{ player: 0, index: 0, t: 'load', ok: true }]);
});

test('contained units cannot be attacked or seen by enemies and die with the transport', () => {
  const { sim, state: s, spawn } = simScenario({ players: 2, seed: 172, vision: true });
  const e = s.e;
  const dropship = slotOf(spawn(Kind.Dropship, 0, fx(700), fx(700)));
  const marine = slotOf(spawn(Kind.Marine, 0, fx(720), fx(700)));
  const enemy = slotOf(spawn(Kind.Marine, 1, fx(760), fx(700)));

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
  const { sim, state: s, spawn } = simScenario({ players: 1, seed: 173 });
  const e = s.e;
  const dropship = slotOf(spawn(Kind.Dropship, 0, fx(700), fx(700)));
  const marine = slotOf(spawn(Kind.Marine, 0, fx(720), fx(700)));
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
  const { sim, state: s, spawn } = simScenario({ players: 1, seed: 174 });
  const e = s.e;
  const bunker = slotOf(spawn(Kind.Bunker, 0, fx(700), fx(700)));
  const marineA = spawn(Kind.Marine, 0, fx(710), fx(700));
  const marineB = spawn(Kind.Marine, 0, fx(720), fx(700));
  const firebat = spawn(Kind.Firebat, 0, fx(730), fx(700));
  const ghost = spawn(Kind.Ghost, 0, fx(740), fx(700));
  const medic = spawn(Kind.Medic, 0, fx(750), fx(700));
  const scv = spawn(Kind.SCV, 0, fx(760), fx(700));

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
  const { sim, state: s, spawn } = simScenario({ players: 2, seed: 175, vision: true });
  const e = s.e;
  const bunker = slotOf(spawn(Kind.Bunker, 0, fx(700), fx(700)));
  const marine = slotOf(spawn(Kind.Marine, 0, fx(710), fx(700)));
  const enemy = slotOf(spawn(Kind.Marine, 1, fx(810), fx(700)));

  sim.step([{ player: 0, cmds: [{ t: 'load', transport: eid(e, bunker), unit: eid(e, marine) }] }]);
  assert.equal(e.container[marine], eid(e, bunker));
  assert.ok(!sim.observe(1).entities.some((v) => v.id === eid(e, marine)));

  const hpBefore = e.hp[enemy]!;
  for (let i = 0; i < 20; i++) sim.step([]);
  assert.ok(e.hp[enemy]! < hpBefore, 'loaded Marine should fire from the Bunker');
  assert.equal(e.container[marine], eid(e, bunker));
});

test('nydus network lets allied units teleport through teammate endpoints', () => {
  const { sim, state: s, spawn } = simScenario({ players: 3, seed: 176 });
  s.teams[1] = s.teams[0]!;
  const e = s.e;
  const entrance = slotOf(spawn(Kind.NydusCanal, 0, fx(700), fx(700)));
  const exit = slotOf(spawn(Kind.NydusCanal, 0, fx(1250), fx(700)));
  const drone = slotOf(spawn(Kind.Drone, 1, fx(720), fx(700)));

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
  const { sim, state: s, spawn } = simScenario({ players: 1, seed: 177 });
  const e = s.e;
  const entrance = slotOf(spawn(Kind.NydusCanal, 0, fx(640), fx(700)));
  spawn(Kind.NydusCanal, 0, fx(980), fx(700));
  const chosenExit = slotOf(spawn(Kind.NydusCanal, 0, fx(1320), fx(700)));
  const zergling = slotOf(spawn(Kind.Zergling, 0, fx(660), fx(700)));

  sim.step([{ player: 0, cmds: [{ t: 'load', transport: eid(e, entrance), unit: eid(e, zergling) }] }]);
  const unloadX = e.x[chosenExit]! + fx(40);
  const unload = sim.step([{ player: 0, cmds: [{ t: 'unload', transport: eid(e, entrance), unit: eid(e, zergling), x: unloadX, y: e.y[chosenExit]! }] }]);

  assert.deepEqual(unload, [{ player: 0, index: 0, t: 'unload', ok: true }]);
  assert.equal(e.container[zergling], NONE);
  assert.equal(e.x[zergling], unloadX);
});

test('isolated nydus canal rejects loading instead of trapping units', () => {
  const { sim, state: s, spawn } = simScenario({ players: 1, seed: 178 });
  const e = s.e;
  const nydus = slotOf(spawn(Kind.NydusCanal, 0, fx(700), fx(700)));
  const drone = slotOf(spawn(Kind.Drone, 0, fx(720), fx(700)));

  const load = sim.step([{ player: 0, cmds: [{ t: 'load', transport: eid(e, nydus), unit: eid(e, drone) }] }]);
  assert.deepEqual(load, [{ player: 0, index: 0, t: 'load', ok: false, reason: 'missing-capability' }]);
  assert.equal(e.container[drone], NONE);
});
