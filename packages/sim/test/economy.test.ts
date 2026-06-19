import test from 'node:test';
import assert from 'node:assert/strict';
import { count, eid, kill, makeState, NEUTRAL, NONE, slotOf } from '../src/entity/world.ts';
import { spawnUnit } from '../src/entity/factory.ts';
import { Kind, Order, TILE, Units, START_MINERALS, START_WORKERS } from '../src/data.ts';
import { entityApproachPoint } from '../src/entity/approach.ts';
import { fx } from '../src/fixed.ts';
import { stepWorld } from '../src/tick.ts';
import type { MapDef } from '../src/map/core.ts';
import { simScenario } from '../test-support/scenario.ts';

const open = (w: number, h: number): MapDef => ({
  name: 'open', w, h, walk: new Uint8Array(w * h).fill(1), build: new Uint8Array(w * h).fill(1),
  elev: new Uint8Array(w * h), starts: [], resources: [], teams: [],
});

const tc = (t: number): number => fx(t * TILE + (TILE >> 1));

test('workers auto-mine and minerals accumulate', () => {
  const { sim, state: s } = simScenario({ players: 1, seed: 1 });
  assert.equal(s.players.minerals[0], START_MINERALS);
  assert.equal(count(s, Kind.SCV, 0), START_WORKERS);

  for (let t = 0; t < 500; t++) sim.step([]); // no commands; default auto-harvest

  assert.ok(
    s.players.minerals[0]! > START_MINERALS,
    `minerals should grow from mining (got ${s.players.minerals[0]})`,
  );
});

test('training a worker costs minerals, adds supply, and produces a unit', () => {
  const { sim, state: s, entity } = simScenario({ players: 1, seed: 2 });

  // Mine first so we can afford it.
  for (let t = 0; t < 200; t++) sim.step([]);

  const cc = slotOf(entity(Kind.CommandCenter, 0));

  const scvBefore = count(s, Kind.SCV, 0);
  const supBefore = s.players.supplyUsed[0]!;
  const minBefore = s.players.minerals[0]!;
  const beforeSlots = new Set<number>();
  for (let i = 0; i < s.e.hi; i++) {
    if (s.e.alive[i] === 1 && s.e.owner[i] === 0 && s.e.kind[i] === Kind.SCV) beforeSlots.add(i);
  }

  sim.step([{ player: 0, cmds: [{ t: 'train', building: eid(s.e, cc), kind: Kind.SCV }] }]);
  assert.equal(s.players.minerals[0], minBefore - Units[Kind.SCV]!.minerals, 'cost deducted');

  for (let t = 0; t < Units[Kind.SCV]!.buildTime + 2; t++) sim.step([]);

  assert.equal(count(s, Kind.SCV, 0), scvBefore + 1, 'one SCV produced');
  assert.equal(s.players.supplyUsed[0], supBefore + Units[Kind.SCV]!.supply, 'supply consumed on pop');
  let produced = -1;
  for (let i = 0; i < s.e.hi; i++) {
    if (s.e.alive[i] === 1 && s.e.owner[i] === 0 && s.e.kind[i] === Kind.SCV && !beforeSlots.has(i)) produced = i;
  }
  assert.ok(produced >= 0, 'new SCV found');
  assert.equal(s.e.order[produced], Order.Harvest, 'new SCV auto-gathers from default worker rally');
  assert.notEqual(s.e.target[produced], NONE, 'new SCV has a harvest target');
});

test('production blocks at the supply cap', () => {
  const { sim, state: s } = simScenario({ players: 1, seed: 3 });
  // Run a long time mining; without supply depots, supply caps at the CC's supply.
  for (let t = 0; t < 6000; t++) {
    // train whenever possible
    let cc = -1;
    for (let i = 0; i < s.e.hi; i++) {
      if (s.e.alive[i] === 1 && s.e.kind[i] === Kind.CommandCenter && s.e.owner[i] === 0) cc = i;
    }
    const scv = Units[Kind.SCV]!;
    const canTrain =
      cc >= 0 &&
      s.e.prodKind[cc] === Kind.None &&
      s.players.minerals[0]! >= scv.minerals &&
      s.players.supplyUsed[0]! + scv.supply <= s.players.supplyMax[0]!;
    sim.step(canTrain ? [{ player: 0, cmds: [{ t: 'train', building: eid(s.e, cc), kind: Kind.SCV }] }] : []);
  }
  assert.ok(s.players.supplyUsed[0]! <= s.players.supplyMax[0]!, 'never exceeds cap');
  assert.equal(s.players.supplyMax[0], Units[Kind.CommandCenter]!.provides, 'CC provides supply');
});

test('new production buildings default to no rally point', () => {
  const { sim, state: s, spawn, resources } = simScenario({ players: 1, seed: 4 });
  const e = s.e;
  const barracks = slotOf(spawn(Kind.Barracks, 0, fx(700), fx(700)));
  resources(0, 1_000);

  assert.equal(e.rallyX[barracks], -1);
  sim.step([{ player: 0, cmds: [{ t: 'train', building: eid(e, barracks), kind: Kind.Marine }] }]);
  for (let t = 0; t < Units[Kind.Marine]!.buildTime + 2; t++) sim.step([]);

  let marine = -1;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.kind[i] === Kind.Marine && e.owner[i] === 0) marine = i;
  }
  assert.ok(marine >= 0, 'marine produced');
  assert.equal(e.order[marine], Order.Idle, 'no default move order to map origin');
});

test('production ground rally sends armed units as attack-move', () => {
  const { sim, state: s, spawn, resources } = simScenario({ players: 1, seed: 41 });
  const e = s.e;
  const barracks = slotOf(spawn(Kind.Barracks, 0, fx(700), fx(700)));
  const x = fx(900);
  const y = fx(740);
  resources(0, 1_000);

  sim.step([{ player: 0, cmds: [
    { t: 'rally', building: eid(e, barracks), x, y },
    { t: 'train', building: eid(e, barracks), kind: Kind.Marine },
  ] }]);
  for (let t = 0; t < Units[Kind.Marine]!.buildTime + 2; t++) sim.step([]);

  let marine = -1;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.kind[i] === Kind.Marine && e.owner[i] === 0) marine = i;
  }
  assert.ok(marine >= 0, 'marine produced');
  assert.equal(e.order[marine], Order.AttackMove);
  assert.equal(e.tx[marine], x);
  assert.equal(e.ty[marine], y);
});

test('production unit-target rally follows target position when the unit spawns', () => {
  const { sim, state: s, spawn, resources } = simScenario({ players: 1, seed: 42 });
  const e = s.e;
  const barracks = slotOf(spawn(Kind.Barracks, 0, fx(700), fx(700)));
  const target = slotOf(spawn(Kind.SCV, 0, fx(900), fx(740)));
  const targetId = eid(e, target);
  resources(0, 1_000);

  sim.step([{ player: 0, cmds: [
    { t: 'rally', building: eid(e, barracks), x: e.x[target]!, y: e.y[target]!, target: targetId },
    { t: 'train', building: eid(e, barracks), kind: Kind.Marine },
  ] }]);
  assert.equal(e.rallyTarget[barracks], targetId);
  e.x[target] = fx(980);
  e.y[target] = fx(760);

  for (let t = 0; t < Units[Kind.Marine]!.buildTime + 2; t++) sim.step([]);

  let marine = -1;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.kind[i] === Kind.Marine && e.owner[i] === 0) marine = i;
  }
  assert.ok(marine >= 0, 'marine produced');
  const p = entityApproachPoint(s, marine, target);
  assert.equal(e.order[marine], Order.AttackMove);
  assert.equal(e.intentTarget[marine], targetId);
  assert.equal(e.target[marine], NONE);
  assert.equal(e.combatTarget[marine], NONE);
  assert.equal(e.tx[marine], p.x);
  assert.equal(e.ty[marine], p.y);

  e.x[target] = fx(1040);
  e.y[target] = fx(780);
  const moved = entityApproachPoint(s, marine, target);
  sim.step([]);

  assert.equal(e.order[marine], Order.AttackMove);
  assert.equal(e.intentTarget[marine], targetId);
  assert.equal(e.tx[marine], moved.x);
  assert.equal(e.ty[marine], moved.y);
});

test('resource rally is worker-only and does not overwrite hatchery unit rally', () => {
  const s = makeState(open(64, 64), 1, 421);
  const e = s.e;
  const hatchery = slotOf(spawnUnit(s, Kind.Hatchery, 0, tc(20), tc(20)));
  const mineral = slotOf(spawnUnit(s, Kind.Mineral, NEUTRAL, tc(24), tc(20)));
  const unitX = tc(28);
  const unitY = tc(22);
  e.cargo[mineral] = 1_000_000;
  e.rallyX[hatchery] = unitX;
  e.rallyY[hatchery] = unitY;

  assert.deepEqual(stepWorld(s, [{ player: 0, cmds: [{
    t: 'rally',
    building: eid(e, hatchery),
    x: e.x[mineral]!,
    y: e.y[mineral]!,
    target: eid(e, mineral),
  }] }]), [{ player: 0, index: 0, t: 'rally', ok: true }]);

  assert.equal(e.rallyX[hatchery], unitX, 'resource rally does not overwrite unit rally x');
  assert.equal(e.rallyY[hatchery], unitY, 'resource rally does not overwrite unit rally y');
  assert.equal(e.workerRallyTarget[hatchery], eid(e, mineral));

  const droneEgg = slotOf(spawnUnit(s, Kind.Egg, 0, tc(20), tc(21)));
  e.prodKind[droneEgg] = Kind.Drone;
  e.prodTimer[droneEgg] = 1;
  stepWorld(s, []);

  assert.equal(e.kind[droneEgg], Kind.Drone);
  assert.equal(e.order[droneEgg], Order.Harvest);
  assert.equal(e.target[droneEgg], eid(e, mineral));

  const zerglingEgg = slotOf(spawnUnit(s, Kind.Egg, 0, tc(20), tc(22)));
  e.prodKind[zerglingEgg] = Kind.Zergling;
  e.prodTimer[zerglingEgg] = 1;
  stepWorld(s, []);

  assert.equal(e.kind[zerglingEgg], Kind.Zergling);
  assert.equal(e.order[zerglingEgg], Order.AttackMove);
  assert.equal(e.tx[zerglingEgg], unitX);
  assert.equal(e.ty[zerglingEgg], unitY);
});

test('non-worker producers cannot store resource rally targets', () => {
  const s = makeState(open(64, 64), 1, 422);
  const e = s.e;
  const barracks = slotOf(spawnUnit(s, Kind.Barracks, 0, tc(20), tc(20)));
  const mineral = slotOf(spawnUnit(s, Kind.Mineral, NEUTRAL, tc(24), tc(20)));

  assert.deepEqual(stepWorld(s, [{ player: 0, cmds: [{
    t: 'rally',
    building: eid(e, barracks),
    x: e.x[mineral]!,
    y: e.y[mineral]!,
    target: eid(e, mineral),
  }] }]), [{ player: 0, index: 0, t: 'rally', ok: false, reason: 'target-not-allowed' }]);

  assert.equal(e.rallyTarget[barracks], -1);
  assert.equal(e.workerRallyTarget[barracks], -1);

  assert.deepEqual(stepWorld(s, [{ player: 0, cmds: [{
    t: 'rally',
    building: eid(e, barracks),
    x: e.x[mineral]!,
    y: e.y[mineral]!,
  }] }]), [{ player: 0, index: 0, t: 'rally', ok: true }]);

  assert.equal(e.rallyTarget[barracks], -1, 'near-resource point rally should stay a point for barracks');
  assert.equal(e.rallyX[barracks], e.x[mineral]);
  assert.equal(e.rallyY[barracks], e.y[mineral]);
  assert.equal(e.workerRallyTarget[barracks], -1);
});

test('same-target production rallies use deterministic ground destination slots', () => {
  const s = makeState(open(64, 64), 1, 52);
  const e = s.e;
  const a = slotOf(spawnUnit(s, Kind.Barracks, 0, tc(20), tc(20)));
  const b = slotOf(spawnUnit(s, Kind.Barracks, 0, tc(23), tc(20)));
  const x = tc(35);
  const y = tc(35);
  for (const barracks of [a, b]) {
    e.rallyX[barracks] = x;
    e.rallyY[barracks] = y;
    e.prodKind[barracks] = Kind.Marine;
    e.prodTimer[barracks] = 1;
  }

  stepWorld(s, []);

  const marines: number[] = [];
  for (let i = 0; i < e.hi; i++) if (e.alive[i] === 1 && e.kind[i] === Kind.Marine) marines.push(i);
  assert.equal(marines.length, 2);
  assert.equal(e.order[marines[0]!], Order.AttackMove);
  assert.equal(e.order[marines[1]!], Order.AttackMove);
  assert.notEqual(`${e.tx[marines[0]!]},${e.ty[marines[0]!]}`, `${e.tx[marines[1]!]},${e.ty[marines[1]!]}`);
  assert.ok(marines.some((slot) => e.tx[slot] === x && e.ty[slot] === y), 'one unit owns the exact rally point');
});

test('sequential production rallies reserve existing destination slots', () => {
  const s = makeState(open(64, 64), 1, 521);
  const e = s.e;
  const barracks = slotOf(spawnUnit(s, Kind.Barracks, 0, tc(20), tc(20)));
  const x = tc(35);
  const y = tc(35);
  e.rallyX[barracks] = x;
  e.rallyY[barracks] = y;

  e.prodKind[barracks] = Kind.Marine;
  e.prodTimer[barracks] = 1;
  stepWorld(s, []);

  const first = (() => {
    for (let i = 0; i < e.hi; i++) if (e.alive[i] === 1 && e.kind[i] === Kind.Marine) return i;
    return -1;
  })();
  assert.ok(first >= 0, 'first marine produced');
  assert.equal(e.tx[first], x);
  assert.equal(e.ty[first], y);

  e.prodKind[barracks] = Kind.Marine;
  e.prodTimer[barracks] = 1;
  stepWorld(s, []);

  const marines: number[] = [];
  for (let i = 0; i < e.hi; i++) if (e.alive[i] === 1 && e.kind[i] === Kind.Marine) marines.push(i);
  assert.equal(marines.length, 2);
  assert.equal(e.tx[first], x, 'existing rally destination is not re-slotted');
  assert.equal(e.ty[first], y, 'existing rally destination is not re-slotted');
  assert.equal(new Set(marines.map((slot) => `${e.tx[slot]},${e.ty[slot]}`)).size, 2, 'the second marine gets the next rally slot');
});

test('production rally to a loadable structure loads eligible spawned units', () => {
  const s = makeState(open(64, 64), 1, 53);
  const e = s.e;
  const barracks = slotOf(spawnUnit(s, Kind.Barracks, 0, tc(20), tc(20)));
  const bunker = slotOf(spawnUnit(s, Kind.Bunker, 0, tc(30), tc(20)));
  e.rallyTarget[barracks] = eid(e, bunker);
  e.rallyX[barracks] = e.x[bunker]!;
  e.rallyY[barracks] = e.y[bunker]!;
  e.prodKind[barracks] = Kind.Marine;
  e.prodTimer[barracks] = 1;

  stepWorld(s, []);

  let marine = -1;
  for (let i = 0; i < e.hi; i++) if (e.alive[i] === 1 && e.kind[i] === Kind.Marine) marine = i;
  assert.ok(marine >= 0, 'marine produced');
  assert.equal(e.container[marine], NONE);
  assert.equal(e.order[marine], Order.Move);
  assert.equal(e.intentTarget[marine], eid(e, bunker));
  e.target[marine] = NONE;

  for (let t = 0; t < 180 && e.container[marine] === NONE; t++) stepWorld(s, []);

  assert.equal(e.container[marine], eid(e, bunker));
});

test('zerg resource rally gives newly morphed workers a gather order', () => {
  const s = makeState(open(64, 64), 1, 54);
  const e = s.e;
  const hatchery = slotOf(spawnUnit(s, Kind.Hatchery, 0, tc(20), tc(20)));
  const mineral = slotOf(spawnUnit(s, Kind.Mineral, NEUTRAL, tc(24), tc(20)));
  const egg = slotOf(spawnUnit(s, Kind.Egg, 0, tc(20), tc(21)));
  e.cargo[mineral] = 1_000_000;
  e.workerRallyTarget[hatchery] = eid(e, mineral);
  e.workerRallyX[hatchery] = e.x[mineral]!;
  e.workerRallyY[hatchery] = e.y[mineral]!;
  e.prodKind[egg] = Kind.Drone;
  e.prodTimer[egg] = 1;

  stepWorld(s, []);

  assert.equal(e.kind[egg], Kind.Drone);
  assert.equal(e.order[egg], Order.Harvest);
  assert.equal(e.target[egg], eid(e, mineral));
});

test('invalidated unit rally retargets to the nearest valid friendly entity', () => {
  const s = makeState(open(64, 64), 1, 51);
  const e = s.e;
  s.players.minerals[0] = 1_000;
  spawnUnit(s, Kind.SupplyDepot, 0, tc(40), tc(40));
  const fallback = slotOf(spawnUnit(s, Kind.SCV, 0, tc(23), tc(20)));
  const barracks = slotOf(spawnUnit(s, Kind.Barracks, 0, tc(20), tc(20)));
  const original = slotOf(spawnUnit(s, Kind.SCV, 0, tc(22), tc(20)));
  spawnUnit(s, Kind.Mineral, NEUTRAL, tc(21), tc(20));

  stepWorld(s, [{ player: 0, cmds: [
    { t: 'rally', building: eid(e, barracks), x: e.x[original]!, y: e.y[original]!, target: eid(e, original) },
    { t: 'train', building: eid(e, barracks), kind: Kind.Marine },
  ] }]);
  kill(s, original);
  for (let t = 0; t < Units[Kind.Marine]!.buildTime + 2; t++) stepWorld(s, []);

  let marine = -1;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.kind[i] === Kind.Marine && e.owner[i] === 0) marine = i;
  }
  assert.ok(marine >= 0, 'marine produced');
  const p = entityApproachPoint(s, marine, fallback);
  assert.equal(e.order[marine], Order.AttackMove);
  assert.equal(e.tx[marine], p.x);
  assert.equal(e.ty[marine], p.y);
});
