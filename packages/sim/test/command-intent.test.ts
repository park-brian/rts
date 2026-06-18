import test from 'node:test';
import assert from 'node:assert/strict';
import { Kind, TILE, Units } from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import type { MapDef } from '../src/map.ts';
import {
  attackModeCandidates, harvestModeCandidates, loadSelectionCandidates, producedUnitRallyIntent,
  rallyModeCandidates, repairModeCandidates, smartCommandCandidates,
} from '../src/command-intent.ts';
import { spawnUnit } from '../src/factory.ts';
import { eid, makeState, NEUTRAL, NONE, slotOf } from '../src/world.ts';

const tc = (t: number): number => fx(t * TILE + (TILE >> 1));

const open = (): MapDef => {
  const w = 24;
  const h = 24;
  return {
    name: 'smart-command-open',
    w,
    h,
    walk: new Uint8Array(w * h).fill(1),
    build: new Uint8Array(w * h).fill(1),
    elev: new Uint8Array(w * h),
    starts: [],
    resources: [],
    teams: [],
  };
};

test('smart command attacks enemy entities', () => {
  const s = makeState(open(), 2, 1201);
  const marine = spawnUnit(s, Kind.Marine, 0, tc(8), tc(8));
  const enemy = spawnUnit(s, Kind.Marine, 1, tc(10), tc(8));

  assert.deepEqual(smartCommandCandidates(s, 0, marine, { hit: enemy, x: tc(10), y: tc(8) }, 'desktop'), [
    { t: 'attack', unit: marine, target: enemy },
  ]);
});

test('smart command harvests legal resources and not bare geysers', () => {
  const s = makeState(open(), 1, 1202);
  const scv = spawnUnit(s, Kind.SCV, 0, tc(8), tc(8));
  const mineral = spawnUnit(s, Kind.Mineral, NEUTRAL, tc(10), tc(8));
  const geyser = spawnUnit(s, Kind.Geyser, NEUTRAL, tc(12), tc(8));

  assert.deepEqual(smartCommandCandidates(s, 0, scv, { hit: mineral, x: tc(10), y: tc(8) }, 'desktop'), [
    { t: 'harvest', unit: scv, patch: mineral },
  ]);
  assert.deepEqual(smartCommandCandidates(s, 0, scv, { hit: geyser, x: tc(12), y: tc(8) }, 'desktop'), [
    { t: 'move', unit: scv, x: tc(12), y: tc(8) },
  ]);
});

test('smart command attacks hostile gas collectors instead of harvesting them', () => {
  const s = makeState(open(), 2, 1203);
  const scv = spawnUnit(s, Kind.SCV, 0, tc(8), tc(8));
  const refinery = spawnUnit(s, Kind.Refinery, 1, tc(10), tc(8));

  assert.deepEqual(smartCommandCandidates(s, 0, scv, { hit: refinery, x: tc(10), y: tc(8) }, 'desktop'), [
    { t: 'attack', unit: scv, target: refinery },
  ]);
});

test('smart command repairs damaged friendly mechanical targets', () => {
  const s = makeState(open(), 1, 1204);
  s.players.minerals[0] = 500;
  const scv = spawnUnit(s, Kind.SCV, 0, tc(8), tc(8));
  const bunker = spawnUnit(s, Kind.Bunker, 0, tc(10), tc(8));
  s.e.hp[slotOf(bunker)] = Units[Kind.Bunker]!.hp - 40;

  assert.deepEqual(smartCommandCandidates(s, 0, scv, { hit: bunker, x: tc(10), y: tc(8) }, 'desktop'), [
    { t: 'repair', unit: scv, target: bunker },
  ]);
});

test('smart command loads valid cargo into transports and structures', () => {
  const s = makeState(open(), 1, 1205);
  const marine = spawnUnit(s, Kind.Marine, 0, tc(8), tc(8));
  const bunker = spawnUnit(s, Kind.Bunker, 0, tc(9), tc(8));

  assert.deepEqual(smartCommandCandidates(s, 0, marine, { hit: bunker, x: tc(9), y: tc(8) }, 'desktop'), [
    { t: 'load', transport: bunker, unit: marine },
  ]);
});

test('smart command follows ordinary friendly entities', () => {
  const s = makeState(open(), 1, 1206);
  const marine = spawnUnit(s, Kind.Marine, 0, tc(8), tc(8));
  const leader = spawnUnit(s, Kind.Marine, 0, tc(10), tc(8));

  assert.deepEqual(smartCommandCandidates(s, 0, marine, { hit: leader, x: tc(10), y: tc(8) }, 'desktop'), [
    { t: 'move', unit: marine, x: tc(10), y: tc(8), target: leader },
  ]);
});

test('smart command gives structures targeted rally or point rally', () => {
  const s = makeState(open(), 1, 1207);
  const cc = spawnUnit(s, Kind.CommandCenter, 0, tc(8), tc(8));
  const marine = spawnUnit(s, Kind.Marine, 0, tc(12), tc(8));

  assert.deepEqual(smartCommandCandidates(s, 0, cc, { hit: marine, x: tc(12), y: tc(8) }, 'desktop'), [
    { t: 'rally', building: cc, x: tc(12), y: tc(8), target: marine },
  ]);
  assert.deepEqual(smartCommandCandidates(s, 0, cc, { hit: -1, x: tc(14), y: tc(8) }, 'desktop'), [
    { t: 'rally', building: cc, x: tc(14), y: tc(8) },
  ]);
});

test('armed attack mode attacks enemies, amoves points, and rejects friendly targets', () => {
  const s = makeState(open(), 2, 1211);
  const marine = spawnUnit(s, Kind.Marine, 0, tc(8), tc(8));
  const enemy = spawnUnit(s, Kind.Marine, 1, tc(10), tc(8));
  const leader = spawnUnit(s, Kind.Marine, 0, tc(12), tc(8));
  const mineral = spawnUnit(s, Kind.Mineral, NEUTRAL, tc(14), tc(8));

  assert.deepEqual(attackModeCandidates(s, 0, marine, { hit: enemy, x: tc(10), y: tc(8) }), [
    { t: 'attack', unit: marine, target: enemy },
  ]);
  assert.deepEqual(attackModeCandidates(s, 0, marine, { hit: -1, x: tc(11), y: tc(8) }), [
    { t: 'amove', unit: marine, x: tc(11), y: tc(8) },
  ]);
  assert.deepEqual(attackModeCandidates(s, 0, marine, { hit: mineral, x: tc(14), y: tc(8) }), [
    { t: 'amove', unit: marine, x: tc(14), y: tc(8) },
  ]);
  assert.deepEqual(attackModeCandidates(s, 0, marine, { hit: leader, x: tc(12), y: tc(8) }), []);
});

test('armed harvest mode queues every selected valid worker for a gather target', () => {
  const s = makeState(open(), 1, 1212);
  const a = spawnUnit(s, Kind.SCV, 0, tc(8), tc(8));
  const b = spawnUnit(s, Kind.SCV, 0, tc(9), tc(8));
  const marine = spawnUnit(s, Kind.Marine, 0, tc(10), tc(8));
  const mineral = spawnUnit(s, Kind.Mineral, NEUTRAL, tc(12), tc(8));

  assert.deepEqual(harvestModeCandidates(s, 0, [a, b, marine], mineral), [
    { t: 'harvest', unit: a, patch: mineral },
    { t: 'harvest', unit: b, patch: mineral },
  ]);
});

test('armed repair mode queues all valid repairers for built targets', () => {
  const s = makeState(open(), 1, 1213);
  s.players.minerals[0] = 500;
  const a = spawnUnit(s, Kind.SCV, 0, tc(8), tc(8));
  const b = spawnUnit(s, Kind.SCV, 0, tc(9), tc(8));
  const marine = spawnUnit(s, Kind.Marine, 0, tc(10), tc(8));
  const bunker = spawnUnit(s, Kind.Bunker, 0, tc(12), tc(8));
  s.e.hp[slotOf(bunker)] = Units[Kind.Bunker]!.hp - 40;

  assert.deepEqual(repairModeCandidates(s, 0, [a, b, marine], bunker), [
    { t: 'repair', unit: a, target: bunker },
    { t: 'repair', unit: b, target: bunker },
  ]);
});

test('armed repair mode picks the nearest valid worker for unfinished construction', () => {
  const s = makeState(open(), 1, 1214);
  const far = spawnUnit(s, Kind.SCV, 0, tc(6), tc(8));
  const near = spawnUnit(s, Kind.SCV, 0, tc(11), tc(8));
  const depot = spawnUnit(s, Kind.SupplyDepot, 0, tc(12), tc(8));
  s.e.built[slotOf(depot)] = 0;
  s.e.ctimer[slotOf(depot)] = 100;

  assert.deepEqual(repairModeCandidates(s, 0, [far, near], depot), [
    { t: 'repair', unit: near, target: depot },
  ]);
});

test('load command-card candidates load selected cargo into selected transports', () => {
  const s = makeState(open(), 1, 1215);
  const marine = spawnUnit(s, Kind.Marine, 0, tc(8), tc(8));
  const firebat = spawnUnit(s, Kind.Firebat, 0, tc(9), tc(8));
  const dropship = spawnUnit(s, Kind.Dropship, 0, tc(10), tc(8));
  const bunker = spawnUnit(s, Kind.Bunker, 0, tc(11), tc(8));

  assert.deepEqual(loadSelectionCandidates(s, 0, [dropship, bunker, marine, firebat]), [
    { t: 'load', transport: dropship, unit: marine },
    { t: 'load', transport: dropship, unit: firebat },
    { t: 'load', transport: bunker, unit: marine },
    { t: 'load', transport: bunker, unit: firebat },
  ]);
});

test('load command-card candidates ignore invalid cargo and non-selected transports', () => {
  const s = makeState(open(), 1, 1216);
  const marine = spawnUnit(s, Kind.Marine, 0, tc(8), tc(8));
  const tank = spawnUnit(s, Kind.SiegeTank, 0, tc(9), tc(8));
  const dropship = spawnUnit(s, Kind.Dropship, 0, tc(10), tc(8));
  const bunker = spawnUnit(s, Kind.Bunker, 0, tc(11), tc(8));

  assert.deepEqual(loadSelectionCandidates(s, 0, [dropship, bunker, marine, tank]), [
    { t: 'load', transport: dropship, unit: marine },
    { t: 'load', transport: dropship, unit: tank },
    { t: 'load', transport: bunker, unit: marine },
  ]);
});

test('armed rally mode targets valid friendly units and gather targets', () => {
  const s = makeState(open(), 1, 1217);
  const cc = spawnUnit(s, Kind.CommandCenter, 0, tc(8), tc(8));
  const barracks = spawnUnit(s, Kind.Barracks, 0, tc(9), tc(8));
  const marine = spawnUnit(s, Kind.Marine, 0, tc(12), tc(8));
  const mineral = spawnUnit(s, Kind.Mineral, NEUTRAL, tc(14), tc(8));

  assert.deepEqual(rallyModeCandidates(s, 0, [cc, barracks, marine], { hit: marine, x: tc(12), y: tc(8) }), [
    { t: 'rally', building: cc, x: tc(12), y: tc(8), target: marine },
    { t: 'rally', building: barracks, x: tc(12), y: tc(8), target: marine },
  ]);
  assert.deepEqual(rallyModeCandidates(s, 0, [cc], { hit: mineral, x: tc(14), y: tc(8) }), [
    { t: 'rally', building: cc, x: tc(14), y: tc(8), target: mineral },
  ]);
});

test('armed rally mode falls back to point rally for invalid entity targets', () => {
  const s = makeState(open(), 1, 1218);
  const barracks = spawnUnit(s, Kind.Barracks, 0, tc(8), tc(8));
  const mineral = spawnUnit(s, Kind.Mineral, NEUTRAL, tc(14), tc(8));

  assert.deepEqual(rallyModeCandidates(s, 0, [barracks], { hit: mineral, x: tc(14), y: tc(8) }), [
    { t: 'rally', building: barracks, x: tc(14), y: tc(8) },
  ]);
});

test('produced worker rally intent distinguishes mineral spread from gas target harvest', () => {
  const s = makeState(open(), 1, 1208);
  const e = s.e;
  const cc = slotOf(spawnUnit(s, Kind.CommandCenter, 0, tc(8), tc(8)));
  const scv = slotOf(spawnUnit(s, Kind.SCV, 0, tc(8), tc(9)));
  const mineral = slotOf(spawnUnit(s, Kind.Mineral, NEUTRAL, tc(11), tc(8)));
  const refinery = slotOf(spawnUnit(s, Kind.Refinery, 0, tc(13), tc(8)));

  e.workerRallyTarget[cc] = eid(e, mineral);
  e.workerRallyX[cc] = e.x[mineral]!;
  e.workerRallyY[cc] = e.y[mineral]!;

  assert.deepEqual(producedUnitRallyIntent(s, cc, scv), {
    kind: 'gather-near',
    x: e.x[mineral]!,
    y: e.y[mineral]!,
  });

  e.workerRallyTarget[cc] = eid(e, refinery);
  e.workerRallyX[cc] = e.x[refinery]!;
  e.workerRallyY[cc] = e.y[refinery]!;

  assert.deepEqual(producedUnitRallyIntent(s, cc, scv), {
    kind: 'gather-target',
    target: refinery,
  });
});

test('produced non-workers use unit rally instead of worker resource rally', () => {
  const s = makeState(open(), 1, 1209);
  const e = s.e;
  const hatchery = slotOf(spawnUnit(s, Kind.Hatchery, 0, tc(8), tc(8)));
  const zergling = slotOf(spawnUnit(s, Kind.Zergling, 0, tc(8), tc(9)));
  const mineral = slotOf(spawnUnit(s, Kind.Mineral, NEUTRAL, tc(11), tc(8)));
  const leader = slotOf(spawnUnit(s, Kind.Zergling, 0, tc(14), tc(8)));

  e.workerRallyTarget[hatchery] = eid(e, mineral);
  e.workerRallyX[hatchery] = e.x[mineral]!;
  e.workerRallyY[hatchery] = e.y[mineral]!;
  e.rallyTarget[hatchery] = eid(e, leader);
  e.rallyX[hatchery] = e.x[leader]!;
  e.rallyY[hatchery] = e.y[leader]!;

  assert.deepEqual(producedUnitRallyIntent(s, hatchery, zergling), {
    kind: 'travel',
    endpoint: { x: e.x[leader]!, y: e.y[leader]!, target: leader },
    intent: 'smart',
  });
});

test('town halls derive default worker mineral rally without storing hidden rally state', () => {
  const cases = [
    [Kind.CommandCenter, Kind.SCV],
    [Kind.Nexus, Kind.Probe],
    [Kind.Hatchery, Kind.Drone],
  ] as const;

  cases.forEach(([producerKind, workerKind], index) => {
    const s = makeState(open(), 1, 1220 + index);
    const e = s.e;
    const producer = slotOf(spawnUnit(s, producerKind, 0, tc(8), tc(8)));
    const worker = slotOf(spawnUnit(s, workerKind, 0, tc(8), tc(9)));
    const mineral = slotOf(spawnUnit(s, Kind.Mineral, NEUTRAL, tc(11), tc(8)));

    assert.equal(e.workerRallyTarget[producer], NONE);
    assert.deepEqual(producedUnitRallyIntent(s, producer, worker), {
      kind: 'gather-near',
      x: e.x[mineral]!,
      y: e.y[mineral]!,
    });
  });
});

test('default worker mineral rally yields to explicit unit rally and ignores combat units', () => {
  const s = makeState(open(), 1, 1223);
  const e = s.e;
  const cc = slotOf(spawnUnit(s, Kind.CommandCenter, 0, tc(8), tc(8)));
  const scv = slotOf(spawnUnit(s, Kind.SCV, 0, tc(8), tc(9)));
  const leader = slotOf(spawnUnit(s, Kind.Marine, 0, tc(12), tc(8)));
  spawnUnit(s, Kind.Mineral, NEUTRAL, tc(10), tc(8));

  e.rallyTarget[cc] = eid(e, leader);
  e.rallyX[cc] = e.x[leader]!;
  e.rallyY[cc] = e.y[leader]!;

  assert.deepEqual(producedUnitRallyIntent(s, cc, scv), {
    kind: 'travel',
    endpoint: { x: e.x[leader]!, y: e.y[leader]!, target: leader },
    intent: 'move',
  });

  const hatchery = slotOf(spawnUnit(s, Kind.Hatchery, 0, tc(16), tc(8)));
  const zergling = slotOf(spawnUnit(s, Kind.Zergling, 0, tc(16), tc(9)));
  spawnUnit(s, Kind.Mineral, NEUTRAL, tc(18), tc(8));

  assert.deepEqual(producedUnitRallyIntent(s, hatchery, zergling), { kind: 'none' });
});

test('produced units can instantiate load rally or default worker gather intent', () => {
  const s = makeState(open(), 1, 1210);
  const e = s.e;
  const barracks = slotOf(spawnUnit(s, Kind.Barracks, 0, tc(8), tc(8)));
  const marine = slotOf(spawnUnit(s, Kind.Marine, 0, tc(8), tc(9)));
  const bunker = slotOf(spawnUnit(s, Kind.Bunker, 0, tc(9), tc(8)));
  const cc = slotOf(spawnUnit(s, Kind.CommandCenter, 0, tc(14), tc(8)));
  const scv = slotOf(spawnUnit(s, Kind.SCV, 0, tc(14), tc(9)));

  e.rallyTarget[barracks] = eid(e, bunker);
  e.rallyX[barracks] = e.x[bunker]!;
  e.rallyY[barracks] = e.y[bunker]!;

  assert.deepEqual(producedUnitRallyIntent(s, barracks, marine), {
    kind: 'load',
    transport: bunker,
    endpoint: { x: e.x[bunker]!, y: e.y[bunker]!, target: bunker },
  });
  assert.deepEqual(producedUnitRallyIntent(s, cc, scv), {
    kind: 'gather-near',
    x: e.x[scv]!,
    y: e.y[scv]!,
  });
});
