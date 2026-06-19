import test from 'node:test';
import assert from 'node:assert/strict';
import { kill, makeState, slotOf, eid, NEUTRAL } from '../src/world.ts';
import { spawnUnit } from '../src/factory.ts';
import { stepWorld } from '../src/tick.ts';
import { setupMatch } from '../src/setup.ts';
import { resourceSpawnCenterPx, sliceMap } from '../src/map.ts';
import {
  Kind, Order, ResourceType, Role, TILE, DEPOSIT_RANGE, MINE_AMOUNT, MINE_RANGE, MINE_TICKS, GAS_MINE_TICKS, Units,
  bwRange,
} from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import { bodyBounds, bwApproxEdgeDistance, topDownDockingPoint, topDownEdgeDistance, topDownInteractionRect } from '../src/spatial.ts';
import { calibrateMineralRoute, mineralTimingProfile } from '../src/harvest-calibration.ts';
import type { MapDef } from '../src/map.ts';
import { producedUnitRallyIntent } from '../src/command-intent.ts';

const tc = (t: number): number => fx(t * TILE + (TILE >> 1));
const open = (w: number, h: number): MapDef => ({
  name: 'open', w, h, walk: new Uint8Array(w * h).fill(1), build: new Uint8Array(w * h).fill(1),
  elev: new Uint8Array(w * h), starts: [], resources: [], teams: [],
});

test('workers must physically dock before mining and deposit', () => {
  const s = makeState(open(24, 24), 1, 1);
  const e = s.e;
  const depot = slotOf(spawnUnit(s, Kind.CommandCenter, 0, tc(12), tc(12)));
  const node = slotOf(spawnUnit(s, Kind.Mineral, NEUTRAL, tc(12), tc(7)));
  e.cargo[node] = 1_000_000;

  const miner = slotOf(spawnUnit(s, Kind.SCV, 0, tc(12), tc(10)));
  e.order[miner] = Order.Harvest;
  e.target[miner] = eid(e, node);

  assert.equal(MINE_RANGE, bwRange(10));
  assert.equal(DEPOSIT_RANGE, bwRange(10));
  assert.ok(topDownEdgeDistance(s, miner, node) > 0);

  const mineStartY = e.y[miner]!;
  stepWorld(s, []);

  assert.equal(e.timer[miner], 0, 'worker did not start mining from depot range');
  assert.ok(e.y[miner]! < mineStartY, 'worker moved toward the mineral patch');

  e.x[miner] = e.x[node]!;
  e.y[miner] = e.y[node]!;
  e.cargo[miner] = MINE_AMOUNT;
  e.cargoType[miner] = ResourceType.Minerals;
  e.order[miner] = Order.Harvest;
  e.target[miner] = eid(e, node);
  e.vx[miner] = 0;
  e.vy[miner] = 0;

  assert.ok(topDownEdgeDistance(s, miner, depot) > 0);
  const depositStartY = e.y[miner]!;
  const before = s.players.minerals[0]!;
  stepWorld(s, []);

  assert.equal(s.players.minerals[0], before, 'worker did not deposit from mineral range');
  assert.ok(e.y[miner]! > depositStartY, 'worker moved back toward the depot');
});

test('returning workers ignore stale resource ids even when the slot is reused', () => {
  const s = makeState(open(24, 24), 1, 2);
  const e = s.e;
  const depot = slotOf(spawnUnit(s, Kind.CommandCenter, 0, tc(12), tc(12)));
  const oldNode = slotOf(spawnUnit(s, Kind.Mineral, NEUTRAL, tc(6), tc(12)));
  const staleId = eid(e, oldNode);
  const worker = slotOf(spawnUnit(s, Kind.SCV, 0, tc(8), tc(12)));

  kill(s, oldNode);
  const reused = slotOf(spawnUnit(s, Kind.Mineral, NEUTRAL, tc(18), tc(12)));
  assert.equal(reused, oldNode, 'test setup should reuse the killed resource slot');
  assert.notEqual(eid(e, reused), staleId, 'reused slot must have a new generation');

  e.order[worker] = Order.Harvest;
  e.target[worker] = staleId;
  e.cargo[worker] = MINE_AMOUNT;
  e.cargoType[worker] = ResourceType.Minerals;

  const before = e.x[worker]!;
  stepWorld(s, []);

  assert.ok(e.x[worker]! > before, 'worker returns toward the depot from its own side');
  assert.ok(e.x[worker]! < e.x[depot]!, 'worker should not path toward a right-side docking point from stale source data');
});

test('workers do not mine from BW-compatible detached range', () => {
  const s = makeState(open(24, 24), 1, 1);
  const e = s.e;
  spawnUnit(s, Kind.CommandCenter, 0, tc(18), tc(18));
  const node = slotOf(spawnUnit(s, Kind.Mineral, NEUTRAL, fx(400), fx(400)));
  e.cargo[node] = 1_000_000;

  const miner = slotOf(spawnUnit(s, Kind.SCV, 0, fx(400), fx(437)));
  e.order[miner] = Order.Harvest;
  e.target[miner] = eid(e, node);

  assert.equal(bwApproxEdgeDistance(s, miner, node), MINE_RANGE);
  assert.ok(topDownEdgeDistance(s, miner, node) > 0);

  stepWorld(s, []);

  assert.equal(e.timer[miner], 0, 'worker waits for visible top-down contact before mining');
  assert.ok(e.y[miner]! < fx(437), 'worker moves into actual contact');
});

test('diagonal mineral approaches dock on a face, not a point-contact corner', () => {
  const s = makeState(open(24, 24), 1, 1);
  const e = s.e;
  spawnUnit(s, Kind.CommandCenter, 0, fx(200), fx(600));
  const node = slotOf(spawnUnit(s, Kind.Mineral, NEUTRAL, fx(400), fx(400)));
  e.cargo[node] = 1_000_000;

  const dock = topDownDockingPoint(
    Kind.SCV,
    Kind.Mineral,
    e.x[node]!,
    e.y[node]!,
    e.flags[node]!,
    fx(200),
    fx(600),
  );
  const mineral = topDownInteractionRect(Kind.Mineral, e.x[node]!, e.y[node]!, e.flags[node]!);
  const scv = bodyBounds(Kind.SCV);
  const cornerX = mineral.x0 - scv.right;
  const cornerY = mineral.y1 + scv.up;
  assert.equal(dock.y, cornerY, 'the worker docks on the mineral face closest to the depot');
  assert.ok(dock.x > cornerX, 'the worker overlaps the face instead of touching only the corner');

  const miner = slotOf(spawnUnit(s, Kind.SCV, 0, dock.x, dock.y));
  e.order[miner] = Order.Harvest;
  e.target[miner] = eid(e, node);
  stepWorld(s, []);

  assert.equal(e.timer[miner], MINE_TICKS);
  assert.equal(topDownEdgeDistance(s, miner, node), 0);
});

test('workers mine and deposit at paired dock targets on inner and outer mineral arcs', () => {
  const map = sliceMap();
  const start = map.starts[0]!;
  const mineralIndices = [
    ['outer-left', 0],
    ['inner-left', 3],
    ['outer-right', 7],
  ] as const;

  for (const [label, mineralIndex] of mineralIndices) {
    const s = makeState(map, 1, 700 + mineralIndex);
    const e = s.e;
    const depot = slotOf(spawnUnit(s, Kind.CommandCenter, 0, tc(start.x), tc(start.y)));
    const spawn = map.resources[mineralIndex]!;
    const center = resourceSpawnCenterPx(spawn);
    const node = slotOf(spawnUnit(s, Kind.Mineral, NEUTRAL, fx(center.x), fx(center.y)));
    e.cargo[node] = 1_000_000;

    const mineralDock = topDownDockingPoint(
      Kind.SCV,
      Kind.Mineral,
      e.x[node]!,
      e.y[node]!,
      e.flags[node]!,
      e.x[depot]!,
      e.y[depot]!,
    );
    const depotDock = topDownDockingPoint(
      Kind.SCV,
      Kind.CommandCenter,
      e.x[depot]!,
      e.y[depot]!,
      e.flags[depot]!,
      e.x[node]!,
      e.y[node]!,
    );
    assert.notDeepEqual(mineralDock, { x: e.x[node], y: e.y[node] }, `${label} mineral dock is not the resource center`);
    assert.notDeepEqual(depotDock, { x: e.x[depot], y: e.y[depot] }, `${label} depot dock is not the depot center`);

    const worker = slotOf(spawnUnit(s, Kind.SCV, 0, depotDock.x, depotDock.y));
    e.order[worker] = Order.Harvest;
    e.target[worker] = eid(e, node);

    let startedMining = false;
    for (let t = 0; t < 1_000; t++) {
      stepWorld(s, []);
      if (e.timer[worker]! > 0) {
        startedMining = true;
        break;
      }
    }
    assert.equal(startedMining, true, `${label} worker starts mining`);
    assert.equal(e.x[worker], mineralDock.x, `${label} worker mines from mineral dock x`);
    assert.equal(e.y[worker], mineralDock.y, `${label} worker mines from mineral dock y`);
    assert.equal(topDownEdgeDistance(s, worker, node), 0, `${label} worker is physically touching mineral`);

    const before = s.players.minerals[0]!;
    let deposited = false;
    for (let t = 0; t < 2_000; t++) {
      stepWorld(s, []);
      if (s.players.minerals[0]! > before) {
        deposited = true;
        break;
      }
    }
    assert.equal(deposited, true, `${label} worker deposits`);
    assert.equal(e.x[worker], depotDock.x, `${label} worker deposits from depot dock x`);
    assert.equal(e.y[worker], depotDock.y, `${label} worker deposits from depot dock y`);
    assert.equal(topDownEdgeDistance(s, worker, depot), 0, `${label} worker is physically touching depot`);
  }

  assert.equal(map.resources.slice(0, 9).filter((r) => !r.gas).length, 8);
});

test('harvest timers use BW mineral and gas action frames', () => {
  const s = makeState(open(24, 24), 1, 1);
  const e = s.e;
  const depot = slotOf(spawnUnit(s, Kind.CommandCenter, 0, tc(12), tc(12)));
  const mineral = slotOf(spawnUnit(s, Kind.Mineral, NEUTRAL, tc(10), tc(8)));
  const refinery = slotOf(spawnUnit(s, Kind.Refinery, 0, tc(15), tc(8)));
  e.cargo[mineral] = 1_000_000;
  e.cargo[refinery] = 1_000_000;

  const mineralDock = topDownDockingPoint(
    Kind.SCV,
    Kind.Mineral,
    e.x[mineral]!,
    e.y[mineral]!,
    e.flags[mineral]!,
    e.x[depot]!,
    e.y[depot]!,
  );
  const gasDock = topDownDockingPoint(
    Kind.SCV,
    Kind.Refinery,
    e.x[refinery]!,
    e.y[refinery]!,
    e.flags[refinery]!,
    e.x[depot]!,
    e.y[depot]!,
  );
  const mineralWorker = slotOf(spawnUnit(s, Kind.SCV, 0, mineralDock.x, mineralDock.y));
  const gasWorker = slotOf(spawnUnit(s, Kind.SCV, 0, gasDock.x, gasDock.y));
  e.order[mineralWorker] = Order.Harvest;
  e.target[mineralWorker] = eid(e, mineral);
  e.order[gasWorker] = Order.Harvest;
  e.target[gasWorker] = eid(e, refinery);

  stepWorld(s, []);

  assert.equal(e.timer[mineralWorker], MINE_TICKS);
  assert.equal(e.timer[gasWorker], GAS_MINE_TICKS);
});

test('workers deposit immediately at depot docks even when route diagnostics have slack', () => {
  const map = sliceMap();
  const start = map.starts[0]!;
  const entry = calibrateMineralRoute(
    { kind: 'main', team: 0, owner: 0, x: start.x, y: start.y, resourceDir: -1 },
    { ...map.resources[0]!, px: start.x * TILE + (TILE >> 1), py: (start.y - 5) * TILE + (TILE >> 1) },
    0,
    0,
    mineralTimingProfile(Kind.SCV, Kind.CommandCenter),
  );
  assert.ok(entry.slackFrames > 1);
  const s = makeState(map, 1, 1);
  const e = s.e;
  const depot = slotOf(spawnUnit(s, entry.depotKind, 0, entry.depotCenter.x, entry.depotCenter.y));
  const mineral = slotOf(spawnUnit(s, Kind.Mineral, NEUTRAL, entry.resourceCenter.x, entry.resourceCenter.y));
  const worker = slotOf(spawnUnit(s, entry.workerKind, 0, entry.depotDock.x, entry.depotDock.y));
  e.order[worker] = Order.Harvest;
  e.target[worker] = eid(e, mineral);
  e.cargo[worker] = MINE_AMOUNT;
  e.cargoType[worker] = ResourceType.Minerals;

  const before = s.players.minerals[0]!;
  stepWorld(s, []);

  assert.equal(e.timer[worker], 0);
  assert.equal(s.players.minerals[0], before + MINE_AMOUNT);
  assert.equal(e.cargo[worker], 0);
  assert.equal(topDownEdgeDistance(s, worker, depot), 0);
});

test('a patch is reserved while mined — at most one worker extracts at a time', () => {
  const s = makeState(open(24, 24), 1, 1);
  const e = s.e;
  spawnUnit(s, Kind.CommandCenter, 0, tc(12), tc(12));
  const node = slotOf(spawnUnit(s, Kind.Mineral, NEUTRAL, tc(12), tc(8)));
  e.cargo[node] = 1_000_000; // effectively inexhaustible
  const ws: number[] = [];
  for (let i = 0; i < 5; i++) {
    const w = slotOf(spawnUnit(s, Kind.SCV, 0, tc(10 + i), tc(7)));
    e.order[w] = Order.Harvest; e.target[w] = eid(e, node);
    ws.push(w);
  }
  let maxConcurrent = 0;
  for (let t = 0; t < 1500; t++) {
    stepWorld(s, []);
    let mining = 0;
    for (const w of ws) if (e.alive[w] === 1 && e.timer[w]! > 0) mining++;
    if (mining > maxConcurrent) maxConcurrent = mining;
  }
  assert.equal(maxConcurrent, 1, 'reservation serializes extraction (rotation)');
  assert.ok(s.players.minerals[0]! > 0, 'minerals still accrue via rotation');
});

test('explicit mineral harvest commands spread over nearby patches when the target is saturated', () => {
  const s = makeState(open(24, 24), 1, 1);
  const e = s.e;
  spawnUnit(s, Kind.CommandCenter, 0, tc(12), tc(12));
  const patches = [
    slotOf(spawnUnit(s, Kind.Mineral, NEUTRAL, tc(10), tc(8))),
    slotOf(spawnUnit(s, Kind.Mineral, NEUTRAL, tc(12), tc(8))),
    slotOf(spawnUnit(s, Kind.Mineral, NEUTRAL, tc(14), tc(8))),
    slotOf(spawnUnit(s, Kind.Mineral, NEUTRAL, tc(16), tc(8))),
  ];
  for (const patch of patches) e.cargo[patch] = 1_000_000;

  const workers: number[] = [];
  for (let i = 0; i < 6; i++) {
    const w = slotOf(spawnUnit(s, Kind.SCV, 0, tc(9 + i), tc(11)));
    e.order[w] = Order.Harvest;
    e.target[w] = eid(e, patches[1]!);
    workers.push(w);
  }

  stepWorld(s, []);

  const targets = workers.map((w) => slotOf(e.target[w]!));
  assert.ok(new Set(targets).size > 1, 'workers fan out from the clicked patch');
  assert.ok(targets.filter((target) => target === patches[1]).length < workers.length, 'not every worker queues on the clicked patch');
});

test('workers re-route to another patch when theirs depletes', () => {
  const s = makeState(open(24, 24), 1, 1);
  const e = s.e;
  spawnUnit(s, Kind.CommandCenter, 0, tc(12), tc(12));
  const a = slotOf(spawnUnit(s, Kind.Mineral, NEUTRAL, tc(9), tc(8)));
  const b = slotOf(spawnUnit(s, Kind.Mineral, NEUTRAL, tc(15), tc(8)));
  e.cargo[a] = 2 * MINE_AMOUNT; // depletes quickly
  e.cargo[b] = 1_000_000;
  const ws: number[] = [];
  for (let i = 0; i < 3; i++) {
    const w = slotOf(spawnUnit(s, Kind.SCV, 0, tc(8 + i), tc(7)));
    e.order[w] = Order.Harvest; e.target[w] = eid(e, a);
    ws.push(w);
  }
  for (let t = 0; t < 1200; t++) stepWorld(s, []);
  assert.equal(e.alive[a], 0, 'the small patch is mined out');
  for (const w of ws) {
    assert.equal(e.order[w], Order.Harvest, 'workers keep harvesting');
    assert.equal(slotOf(e.target[w]!), b, 're-routed to the remaining patch');
  }
});

test('starting workers spread across the mineral line (fewest-miners-first)', () => {
  const s = setupMatch(sliceMap(), 2, 1);
  const e = s.e;
  const targets = new Set<number>();
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.owner[i] === 0 && (e.flags[i]! & Role.Worker) !== 0 && e.order[i] === Order.Harvest) {
      targets.add(slotOf(e.target[i]!));
    }
  }
  assert.equal(targets.size, 4, 'four starting workers pick four distinct patches');
});

test('a refinery built on a geyser yields harvestable gas', () => {
  const s = makeState(open(24, 24), 1, 1);
  const e = s.e;
  spawnUnit(s, Kind.CommandCenter, 0, tc(12), tc(12));
  const gy = slotOf(spawnUnit(s, Kind.Geyser, NEUTRAL, tc(12), tc(8)));
  const w = slotOf(spawnUnit(s, Kind.SCV, 0, tc(12), tc(9)));
  // Send the worker to build a refinery on the geyser.
  e.order[w] = Order.Build; e.buildKind[w] = Kind.Refinery; e.tx[w] = tc(12); e.ty[w] = tc(8);

  let refinery = -1;
  for (let t = 0; t < 3000; t++) {
    stepWorld(s, []);
    refinery = -1;
    for (let i = 0; i < e.hi; i++) if (e.alive[i] === 1 && e.kind[i] === Kind.Refinery) { refinery = i; break; }
    if (refinery >= 0 && e.built[refinery] === 1) break;
  }
  assert.ok(refinery >= 0 && e.built[refinery] === 1, 'refinery finishes building');
  assert.equal(e.alive[gy], 0, 'the geyser is consumed by the refinery');
  assert.ok(e.cargo[refinery]! > 0, 'refinery holds gas');

  // Assign the worker to gather gas; it should accrue in the gas pool.
  e.order[w] = Order.Harvest; e.target[w] = eid(e, refinery);
  const before = s.players.gas[0]!;
  for (let t = 0; t < 2000; t++) stepWorld(s, []);
  assert.ok(s.players.gas[0]! > before, 'gas accrues from the refinery');
});

test('a command center derives produced-worker mineral rally without setup state', () => {
  const s = setupMatch(sliceMap(), 2, 1);
  const e = s.e;
  let cc = -1;
  for (let i = 0; i < e.hi; i++) if (e.alive[i] === 1 && e.kind[i] === Kind.CommandCenter && e.owner[i] === 0) { cc = i; break; }
  assert.ok(cc >= 0);
  assert.equal(e.workerRallyTarget[cc], -1, 'setup does not store hidden worker rally target');

  const scv = slotOf(spawnUnit(s, Kind.SCV, 0, e.x[cc]!, e.y[cc]!));
  const intent = producedUnitRallyIntent(s, cc, scv);
  assert.equal(intent.kind, 'gather-near');
  assert.ok(
    intent.kind === 'gather-near' &&
    Array.from({ length: e.hi }, (_, i) => i).some((i) =>
      e.alive[i] === 1 &&
      (e.flags[i]! & Role.Resource) !== 0 &&
      Units[e.kind[i]!]!.resourceType === ResourceType.Minerals &&
      e.x[i] === intent.x &&
      e.y[i] === intent.y),
    'produced worker intent points at a mineral patch',
  );
});
