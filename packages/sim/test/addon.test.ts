import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/sim.ts';
import { sliceMap } from '../src/map.ts';
import { eid, isAlive, slotOf } from '../src/world.ts';
import { spawnUnit } from '../src/factory.ts';
import { Kind, Units } from '../src/data.ts';
import { addonPosition } from '../src/addon.ts';
import { parseReplay } from '../src/replay.ts';
import { fx } from '../src/fixed.ts';

test('terran parent buildings construct one linked add-on', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 130 });
  const s = sim.fullState();
  const e = s.e;
  const factory = slotOf(spawnUnit(s, Kind.Factory, 0, fx(700), fx(700)));
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;
  const pos = addonPosition(s, factory, Kind.MachineShop);

  const results = sim.step([{ player: 0, cmds: [{ t: 'addon', building: eid(e, factory), kind: Kind.MachineShop }] }]);

  assert.deepEqual(results, [{ player: 0, index: 0, t: 'addon', ok: true }]);
  const shop = slotOf(e.target[factory]!);
  assert.equal(e.kind[shop], Kind.MachineShop);
  assert.equal(e.built[shop], 0);
  assert.equal(e.target[shop], eid(e, factory));
  assert.equal(e.x[shop], pos.x);
  assert.equal(e.y[shop], pos.y);
  assert.equal(s.players.minerals[0], 1_000 - Units[Kind.MachineShop]!.minerals);
  assert.equal(s.players.gas[0], 1_000 - Units[Kind.MachineShop]!.gas);

  const duplicate = sim.step([{ player: 0, cmds: [{ t: 'addon', building: eid(e, factory), kind: Kind.MachineShop }] }]);
  assert.deepEqual(duplicate, [{ player: 0, index: 0, t: 'addon', ok: false, reason: 'queue-full' }]);
});

test('add-ons enforce parent type, prerequisites, placement, and cancel refunds', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 131 });
  const s = sim.fullState();
  const e = s.e;
  const factory = slotOf(spawnUnit(s, Kind.Factory, 0, fx(700), fx(700)));
  const cc = slotOf(spawnUnit(s, Kind.CommandCenter, 0, fx(1_300), fx(700)));
  const academy = slotOf(spawnUnit(s, Kind.Academy, 0, fx(1_300), fx(900)));
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  const wrongParent = sim.step([{ player: 0, cmds: [{ t: 'addon', building: eid(e, factory), kind: Kind.ControlTower }] }]);
  assert.deepEqual(wrongParent, [{ player: 0, index: 0, t: 'addon', ok: false, reason: 'target-not-allowed' }]);

  e.built[academy] = 0;
  const missingReq = sim.step([{ player: 0, cmds: [{ t: 'addon', building: eid(e, cc), kind: Kind.ComsatStation }] }]);
  assert.deepEqual(missingReq, [{ player: 0, index: 0, t: 'addon', ok: false, reason: 'missing-requirement' }]);

  e.built[academy] = 1;
  const accepted = sim.step([{ player: 0, cmds: [{ t: 'addon', building: eid(e, cc), kind: Kind.ComsatStation }] }]);
  assert.deepEqual(accepted, [{ player: 0, index: 0, t: 'addon', ok: true }]);
  const comsat = slotOf(e.target[cc]!);
  const before = s.players.minerals[0]!;
  const canceled = sim.step([{ player: 0, cmds: [{ t: 'cancelBuild', building: eid(e, comsat) }] }]);

  assert.deepEqual(canceled, [{ player: 0, index: 0, t: 'cancelBuild', ok: true }]);
  assert.equal(isAlive(e, eid(e, comsat)), false);
  assert.equal(e.target[cc], -1);
  assert.equal(s.players.minerals[0], before + Math.trunc(Units[Kind.ComsatStation]!.minerals * 3 / 4));
});

test('replay parser accepts addon commands', () => {
  const replay = parseReplay(JSON.stringify({
    version: 1,
    map: { kind: 'slice' },
    players: 1,
    seed: 1,
    frames: [[{ player: 0, cmds: [{ t: 'addon', building: 1, kind: Kind.MachineShop }] }]],
  }));

  assert.deepEqual(replay.frames[0]![0]!.cmds[0], { t: 'addon', building: 1, kind: Kind.MachineShop });
});
