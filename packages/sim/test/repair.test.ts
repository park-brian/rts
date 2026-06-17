import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/sim.ts';
import { sliceMap } from '../src/map.ts';
import { eid, slotOf } from '../src/world.ts';
import { spawnUnit } from '../src/factory.ts';
import { Kind, Order, Units } from '../src/data.ts';
import { repairCost } from '../src/repair.ts';
import { parseReplay } from '../src/replay.ts';
import { fx } from '../src/fixed.ts';

test('SCVs repair damaged mechanical units and spend resources', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 120 });
  const s = sim.fullState();
  const e = s.e;
  const scv = slotOf(spawnUnit(s, Kind.SCV, 0, fx(400), fx(400)));
  const tank = slotOf(spawnUnit(s, Kind.SiegeTank, 0, fx(408), fx(400)));
  e.hp[tank] = Units[Kind.SiegeTank]!.hp - 8;
  s.players.minerals[0] = 100;
  s.players.gas[0] = 100;
  const cost = repairCost(Kind.SiegeTank, 4);

  const results = sim.step([{ player: 0, cmds: [{ t: 'repair', unit: eid(e, scv), target: eid(e, tank) }] }]);

  assert.deepEqual(results, [{ player: 0, index: 0, t: 'repair', ok: true }]);
  assert.equal(e.order[scv], Order.Repair);
  assert.equal(e.hp[tank], Units[Kind.SiegeTank]!.hp - 4);
  assert.equal(s.players.minerals[0], 100 - cost.minerals);
  assert.equal(s.players.gas[0], 100 - cost.gas);
});

test('repair rejects invalid targets but allows SCVs to resume Terran foundations', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 121 });
  const s = sim.fullState();
  const e = s.e;
  const scv = slotOf(spawnUnit(s, Kind.SCV, 0, fx(400), fx(400)));
  const marine = slotOf(spawnUnit(s, Kind.Marine, 0, fx(430), fx(400)));
  const depot = slotOf(spawnUnit(s, Kind.SupplyDepot, 0, fx(470), fx(400)));
  const pylon = slotOf(spawnUnit(s, Kind.Pylon, 0, fx(490), fx(400)));
  const tank = slotOf(spawnUnit(s, Kind.SiegeTank, 0, fx(510), fx(400)));
  e.hp[marine] = Units[Kind.Marine]!.hp - 5;
  e.hp[tank] = Units[Kind.SiegeTank]!.hp - 5;
  e.built[depot] = 0;
  e.hp[depot] = Units[Kind.SupplyDepot]!.hp - 5;
  e.built[pylon] = 0;
  s.players.minerals[0] = 0;
  s.players.gas[0] = 0;

  const results = sim.step([{ player: 0, cmds: [
    { t: 'repair', unit: eid(e, scv), target: eid(e, marine) },
    { t: 'repair', unit: eid(e, scv), target: eid(e, depot) },
    { t: 'repair', unit: eid(e, scv), target: eid(e, pylon) },
    { t: 'repair', unit: eid(e, scv), target: eid(e, tank) },
  ] }]);

  assert.deepEqual(results, [
    { player: 0, index: 0, t: 'repair', ok: false, reason: 'target-not-allowed' },
    { player: 0, index: 1, t: 'repair', ok: true },
    { player: 0, index: 2, t: 'repair', ok: false, reason: 'target-not-allowed' },
    { player: 0, index: 3, t: 'repair', ok: false, reason: 'not-affordable' },
  ]);
  assert.equal(e.order[scv], Order.Build);
  assert.equal(e.target[scv], eid(e, depot));
});

test('replay parser accepts repair commands', () => {
  const replay = parseReplay(JSON.stringify({
    version: 1,
    map: { kind: 'slice' },
    players: 1,
    seed: 1,
    frames: [[{ player: 0, cmds: [{ t: 'repair', unit: 1, target: 2 }] }]],
  }));

  assert.deepEqual(replay.frames[0]![0]!.cmds[0], { t: 'repair', unit: 1, target: 2 });
});
