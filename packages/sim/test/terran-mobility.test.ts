import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/sim.ts';
import { sliceMap } from '../src/map.ts';
import { eid, slotOf } from '../src/world.ts';
import { spawnUnit } from '../src/factory.ts';
import { Kind, Order, Role, Units } from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import { parseReplay } from '../src/replay.ts';
import { snapBuildAnchor } from '../src/footprint.ts';

test('lifted terran buildings move, stop producing, and restore landed capabilities', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 140 });
  const s = sim.fullState();
  const e = s.e;
  const cc = slotOf(spawnUnit(s, Kind.CommandCenter, 0, fx(1_400), fx(1_400)));
  s.players.minerals[0] = 1_000;

  const lifted = sim.step([{ player: 0, cmds: [{ t: 'lift', building: eid(e, cc) }] }]);
  assert.deepEqual(lifted, [{ player: 0, index: 0, t: 'lift', ok: true }]);
  assert.equal((e.flags[cc]! & (Role.Structure | Role.Mobile | Role.Air)), Role.Structure | Role.Mobile | Role.Air);
  assert.equal((e.flags[cc]! & Role.Producer), 0);
  assert.equal((e.flags[cc]! & Role.ResourceDepot), 0);

  const trainWhileLifted = sim.step([{ player: 0, cmds: [{ t: 'train', building: eid(e, cc), kind: Kind.SCV }] }]);
  assert.deepEqual(trainWhileLifted, [{ player: 0, index: 0, t: 'train', ok: false, reason: 'missing-capability' }]);

  const beforeX = e.x[cc]!;
  const move = sim.step([{ player: 0, cmds: [{ t: 'move', unit: eid(e, cc), x: fx(1_560), y: fx(1_400) }] }]);
  assert.deepEqual(move, [{ player: 0, index: 0, t: 'move', ok: true }]);
  for (let i = 0; i < 5; i++) sim.step([]);
  assert.equal(e.order[cc], Order.Move);
  assert.ok(e.x[cc]! > beforeX, 'lifted building moves as an air unit');

  const landed = sim.step([{ player: 0, cmds: [{ t: 'land', building: eid(e, cc), x: fx(1_560), y: fx(1_400) }] }]);
  assert.deepEqual(landed, [{ player: 0, index: 0, t: 'land', ok: true }]);
  assert.equal(e.order[cc], Order.Move);
  assert.notEqual((e.flags[cc]! & Role.Air), 0);
  assert.ok(e.x[cc]! < fx(1_560), 'land command does not teleport the lifted building');

  for (let i = 0; i < 300 && (e.flags[cc]! & Role.Air) !== 0; i++) sim.step([]);
  assert.equal(e.flags[cc], Units[Kind.CommandCenter]!.roles);
  assert.equal(e.order[cc], Order.Idle);
  assert.equal(e.x[cc], snapBuildAnchor(fx(1_560), fx(1_400)).x);

  const trainAfterLanding = sim.step([{ player: 0, cmds: [{ t: 'train', building: eid(e, cc), kind: Kind.SCV }] }]);
  assert.deepEqual(trainAfterLanding, [{ player: 0, index: 0, t: 'train', ok: true }]);
});

test('landing rejects occupied footprints without changing airborne state', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 141 });
  const s = sim.fullState();
  const e = s.e;
  const cc = slotOf(spawnUnit(s, Kind.CommandCenter, 0, fx(700), fx(700)));
  const depot = slotOf(spawnUnit(s, Kind.SupplyDepot, 0, fx(900), fx(700)));

  sim.step([{ player: 0, cmds: [{ t: 'lift', building: eid(e, cc) }] }]);
  const blocked = sim.step([{ player: 0, cmds: [{ t: 'land', building: eid(e, cc), x: e.x[depot]!, y: e.y[depot]! }] }]);

  assert.deepEqual(blocked, [{ player: 0, index: 0, t: 'land', ok: false, reason: 'placement-blocked' }]);
  assert.notEqual((e.flags[cc]! & Role.Air), 0);
});

test('lift rejects non-liftable and add-on-linked buildings', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 142 });
  const s = sim.fullState();
  const e = s.e;
  const depot = slotOf(spawnUnit(s, Kind.SupplyDepot, 0, fx(700), fx(700)));
  const factory = slotOf(spawnUnit(s, Kind.Factory, 0, fx(900), fx(700)));
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  const depotLift = sim.step([{ player: 0, cmds: [{ t: 'lift', building: eid(e, depot) }] }]);
  assert.deepEqual(depotLift, [{ player: 0, index: 0, t: 'lift', ok: false, reason: 'target-not-allowed' }]);

  const addon = sim.step([{ player: 0, cmds: [{ t: 'addon', building: eid(e, factory), kind: Kind.MachineShop }] }]);
  assert.deepEqual(addon, [{ player: 0, index: 0, t: 'addon', ok: true }]);

  const factoryLift = sim.step([{ player: 0, cmds: [{ t: 'lift', building: eid(e, factory) }] }]);
  assert.deepEqual(factoryLift, [{ player: 0, index: 0, t: 'lift', ok: false, reason: 'target-not-allowed' }]);
});

test('replay parser accepts lift and land commands', () => {
  const replay = parseReplay(JSON.stringify({
    version: 1,
    map: { kind: 'slice' },
    players: 1,
    seed: 1,
    frames: [[{ player: 0, cmds: [
      { t: 'lift', building: 1 },
      { t: 'land', building: 1, x: 100, y: 200 },
    ] }]],
  }));

  assert.deepEqual(replay.frames[0]![0]!.cmds, [
    { t: 'lift', building: 1 },
    { t: 'land', building: 1, x: 100, y: 200 },
  ]);
});
