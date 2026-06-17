import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/sim.ts';
import { sliceMap } from '../src/map.ts';
import { count, eid, kill, makeState, NEUTRAL, slotOf } from '../src/world.ts';
import { spawnUnit } from '../src/factory.ts';
import { Kind, Order, TILE, Units, START_MINERALS, START_WORKERS } from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import { stepWorld } from '../src/tick.ts';
import type { MapDef } from '../src/map.ts';

const open = (w: number, h: number): MapDef => ({
  name: 'open', w, h, walk: new Uint8Array(w * h).fill(1), build: new Uint8Array(w * h).fill(1),
  elev: new Uint8Array(w * h), starts: [], resources: [], teams: [],
});

const tc = (t: number): number => fx(t * TILE + (TILE >> 1));

test('workers auto-mine and minerals accumulate', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 1 });
  const s = sim.fullState();
  assert.equal(s.players.minerals[0], START_MINERALS);
  assert.equal(count(s, Kind.SCV, 0), START_WORKERS);

  for (let t = 0; t < 500; t++) sim.step([]); // no commands; default auto-harvest

  assert.ok(
    s.players.minerals[0]! > START_MINERALS,
    `minerals should grow from mining (got ${s.players.minerals[0]})`,
  );
});

test('training a worker costs minerals, adds supply, and produces a unit', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 2 });
  const s = sim.fullState();

  // Mine first so we can afford it.
  for (let t = 0; t < 200; t++) sim.step([]);

  // Find the command center.
  let cc = -1;
  for (let i = 0; i < s.e.hi; i++) {
    if (s.e.alive[i] === 1 && s.e.kind[i] === Kind.CommandCenter && s.e.owner[i] === 0) cc = i;
  }
  assert.ok(cc >= 0, 'command center exists');

  const scvBefore = count(s, Kind.SCV, 0);
  const supBefore = s.players.supplyUsed[0]!;
  const minBefore = s.players.minerals[0]!;

  sim.step([{ player: 0, cmds: [{ t: 'train', building: eid(s.e, cc), kind: Kind.SCV }] }]);
  assert.equal(s.players.minerals[0], minBefore - Units[Kind.SCV]!.minerals, 'cost deducted');

  for (let t = 0; t < Units[Kind.SCV]!.buildTime + 2; t++) sim.step([]);

  assert.equal(count(s, Kind.SCV, 0), scvBefore + 1, 'one SCV produced');
  assert.equal(s.players.supplyUsed[0], supBefore + Units[Kind.SCV]!.supply, 'supply consumed on pop');
});

test('production blocks at the supply cap', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 3 });
  const s = sim.fullState();
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
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 4 });
  const s = sim.fullState();
  const e = s.e;
  const barracks = slotOf(spawnUnit(s, Kind.Barracks, 0, fx(700), fx(700)));
  s.players.minerals[0] = 1_000;

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

test('production ground rally sends new units as move', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 41 });
  const s = sim.fullState();
  const e = s.e;
  const barracks = slotOf(spawnUnit(s, Kind.Barracks, 0, fx(700), fx(700)));
  const x = fx(900);
  const y = fx(740);
  s.players.minerals[0] = 1_000;

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
  assert.equal(e.order[marine], Order.Move);
  assert.equal(e.tx[marine], x);
  assert.equal(e.ty[marine], y);
});

test('production unit-target rally follows target position when the unit spawns', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 42 });
  const s = sim.fullState();
  const e = s.e;
  const barracks = slotOf(spawnUnit(s, Kind.Barracks, 0, fx(700), fx(700)));
  const target = slotOf(spawnUnit(s, Kind.SCV, 0, fx(900), fx(740)));
  const targetId = eid(e, target);
  s.players.minerals[0] = 1_000;

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
  assert.equal(e.order[marine], Order.Move);
  assert.equal(e.tx[marine], e.x[target]);
  assert.equal(e.ty[marine], e.y[target]);
});

test('invalidated entity rally retargets to the nearest valid resource', () => {
  const s = makeState(open(64, 64), 1, 51);
  const e = s.e;
  s.players.minerals[0] = 1_000;
  spawnUnit(s, Kind.SupplyDepot, 0, tc(40), tc(40));
  const barracks = slotOf(spawnUnit(s, Kind.Barracks, 0, tc(20), tc(20)));
  const original = slotOf(spawnUnit(s, Kind.SCV, 0, tc(22), tc(20)));
  const patch = slotOf(spawnUnit(s, Kind.Mineral, NEUTRAL, tc(23), tc(20)));

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
  assert.equal(e.order[marine], Order.Move);
  assert.equal(e.tx[marine], e.x[patch]);
  assert.equal(e.ty[marine], e.y[patch]);
});
