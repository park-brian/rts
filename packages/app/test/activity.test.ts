import test from 'node:test';
import assert from 'node:assert/strict';
import { workActivities } from '../src/activity.ts';
import { Kind, NONE, Order, Sim, Units, eid, fx, sliceMap, slotOf, spawnUnit } from '../src/sim.ts';

test('workActivities reports active Terran construction at the foundation edge', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 501 });
  const s = sim.fullState();
  const e = s.e;
  const scv = slotOf(spawnUnit(s, Kind.SCV, 0, fx(400), fx(400)));
  const depot = slotOf(spawnUnit(s, Kind.SupplyDepot, 0, fx(430), fx(400)));
  e.built[depot] = 0;
  e.ctimer[depot] = Units[Kind.SupplyDepot]!.buildTime;
  e.order[scv] = Order.Build;
  e.buildKind[scv] = Kind.None;
  e.target[scv] = eid(e, depot);
  e.target[depot] = eid(e, scv);

  const [activity] = workActivities(s);

  assert.ok(activity);
  assert.equal(activity?.kind, 'build');
  assert.equal(activity?.worker, scv);
  assert.equal(activity?.target, depot);
  assert.ok(activity.x <= e.x[scv]!);
});

test('workActivities ignores workers still walking to an unplaced build site', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 502 });
  const s = sim.fullState();
  const e = s.e;
  const scv = slotOf(spawnUnit(s, Kind.SCV, 0, fx(400), fx(400)));
  e.order[scv] = Order.Build;
  e.buildKind[scv] = Kind.SupplyDepot;
  e.tx[scv] = fx(900);
  e.ty[scv] = fx(900);
  e.target[scv] = NONE;

  assert.deepEqual(workActivities(s), []);
});

test('workActivities reports useful in-range repair but not idle repair orders', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 503 });
  const s = sim.fullState();
  const e = s.e;
  const scv = slotOf(spawnUnit(s, Kind.SCV, 0, fx(400), fx(400)));
  const tank = slotOf(spawnUnit(s, Kind.SiegeTank, 0, fx(410), fx(400)));
  e.hp[tank] = Units[Kind.SiegeTank]!.hp - 12;
  e.order[scv] = Order.Repair;
  e.target[scv] = eid(e, tank);

  assert.equal(workActivities(s)[0]?.kind, 'repair');

  e.hp[tank] = Units[Kind.SiegeTank]!.hp;

  assert.deepEqual(workActivities(s), []);
});
