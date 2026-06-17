import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/sim.ts';
import { sliceMap, type MapDef } from '../src/map.ts';
import { count, eid, kill, makeState, NEUTRAL, slotOf } from '../src/world.ts';
import { spawnUnit } from '../src/factory.ts';
import { Kind, Order, Role, TILE, Units } from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import { snapBuildAnchor } from '../src/footprint.ts';
import { placementForStructure } from '../src/validation.ts';

const findSlot = (sim: Sim, pred: (slot: number) => boolean): number => {
  const e = sim.fullState().e;
  for (let i = 0; i < e.hi; i++) if (e.alive[i] === 1 && pred(i)) return i;
  throw new Error('slot not found');
};

const snapped = (px: number): number => fx(Math.floor(px / TILE) * TILE + TILE / 2);
const tc = (t: number): number => fx(t * TILE + (TILE >> 1));
const open = (resources: MapDef['resources'] = []): MapDef => {
  const w = 32;
  const h = 32;
  return {
    name: 'open',
    w,
    h,
    walk: new Uint8Array(w * h).fill(1),
    build: new Uint8Array(w * h).fill(1),
    elev: new Uint8Array(w * h),
    starts: [],
    resources,
    teams: [],
  };
};

test('invalid commands do not mutate incompatible recipients', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 101 });
  const s = sim.fullState();
  const marine = slotOf(spawnUnit(s, Kind.Marine, 0, fx(360), fx(360)));
  const ownScv = findSlot(sim, (i) => s.e.kind[i] === Kind.SCV && s.e.owner[i] === 0);
  const cc = findSlot(sim, (i) => s.e.kind[i] === Kind.CommandCenter && s.e.owner[i] === 0);
  const mineral = findSlot(sim, (i) => s.e.kind[i] === Kind.Mineral);

  sim.step([{ player: 0, cmds: [
    { t: 'harvest', unit: eid(s.e, marine), patch: eid(s.e, mineral) },
    { t: 'move', unit: eid(s.e, cc), x: fx(100), y: fx(100) },
    { t: 'attack', unit: eid(s.e, marine), target: eid(s.e, ownScv) },
  ] }]);

  assert.equal(s.e.order[marine], Order.Idle, 'marine ignored invalid harvest/own attack');
  assert.equal(s.e.order[cc], Order.Idle, 'structure ignored move command');
});

test('build placement rejects occupied structures and resources without spending minerals', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 102 });
  const s = sim.fullState();
  s.players.minerals[0] = 1_000;
  const scv = findSlot(sim, (i) => s.e.kind[i] === Kind.SCV && s.e.owner[i] === 0);
  const cc = findSlot(sim, (i) => s.e.kind[i] === Kind.CommandCenter && s.e.owner[i] === 0);
  const mineral = findSlot(sim, (i) => s.e.kind[i] === Kind.Mineral);
  const before = s.players.minerals[0]!;

  sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(s.e, scv), kind: Kind.SupplyDepot, x: s.e.x[cc]!, y: s.e.y[cc]! },
    { t: 'build', unit: eid(s.e, scv), kind: Kind.SupplyDepot, x: s.e.x[mineral]!, y: s.e.y[mineral]! },
  ] }]);

  assert.equal(s.players.minerals[0], before, 'rejected placements do not spend');
  assert.equal(s.e.order[scv], Order.Harvest, 'worker keeps previous order');
  assert.equal(count(s, Kind.SupplyDepot, 0), 0);
});

test('refinery placement snaps to a nearby geyser and rejects non-geyser placement', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 103 });
  const s = sim.fullState();
  s.players.minerals[0] = 1_000;
  const scv = findSlot(sim, (i) => s.e.kind[i] === Kind.SCV && s.e.owner[i] === 0);
  const cc = findSlot(sim, (i) => s.e.kind[i] === Kind.CommandCenter && s.e.owner[i] === 0);
  const geyser = findSlot(sim, (i) => s.e.kind[i] === Kind.Geyser);

  sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(s.e, scv), kind: Kind.Refinery, x: s.e.x[cc]!, y: s.e.y[cc]! },
  ] }]);
  assert.notEqual(s.e.buildKind[scv], Kind.Refinery, 'refinery cannot start away from a geyser');

  sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(s.e, scv), kind: Kind.Refinery, x: s.e.x[geyser]! + fx(8), y: s.e.y[geyser]! },
  ] }]);
  assert.equal(s.e.buildKind[scv], Kind.Refinery);
  assert.equal(s.e.tx[scv], s.e.x[geyser], 'build target snapped to geyser x');
  assert.equal(s.e.ty[scv], s.e.y[geyser], 'build target snapped to geyser y');
});

test('build placement snaps raw cursor coordinates to the build grid anchor', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 116 });
  const s = sim.fullState();
  const e = s.e;
  s.players.minerals[0] = 1_000;
  const scv = findSlot(sim, (i) => e.kind[i] === Kind.SCV && e.owner[i] === 0);

  const rawX = 901;
  const rawY = 923;
  const results = sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(e, scv), kind: Kind.SupplyDepot, x: fx(rawX), y: fx(rawY) },
  ] }]);

  assert.deepEqual(results, [{ player: 0, index: 0, t: 'build', ok: true }]);
  assert.equal(e.tx[scv], snapped(rawX));
  assert.equal(e.ty[scv], snapped(rawY));
});

test('land placement snaps raw cursor coordinates to the build grid anchor', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 117 });
  const s = sim.fullState();
  const e = s.e;
  const cc = findSlot(sim, (i) => e.kind[i] === Kind.CommandCenter && e.owner[i] === 0);

  assert.deepEqual(sim.step([{ player: 0, cmds: [{ t: 'lift', building: eid(e, cc) }] }]), [
    { player: 0, index: 0, t: 'lift', ok: true },
  ]);

  const rawX = 1600;
  const rawY = 1600;
  const results = sim.step([{ player: 0, cmds: [
    { t: 'land', building: eid(e, cc), x: fx(rawX), y: fx(rawY) },
  ] }]);

  assert.deepEqual(results, [{ player: 0, index: 0, t: 'land', ok: true }]);
  const target = snapBuildAnchor(fx(rawX), fx(rawY));
  assert.equal(e.order[cc], Order.Move);
  assert.notEqual((e.flags[cc]! & Role.Air), 0);
  assert.notEqual(e.x[cc], target.x, 'land command should not teleport lifted structures');

  for (let i = 0; i < 2_000 && (e.flags[cc]! & Role.Air) !== 0; i++) sim.step([]);

  assert.equal(e.order[cc], Order.Idle);
  assert.equal(e.flags[cc], Units[Kind.CommandCenter]!.roles);
  assert.equal(e.x[cc], target.x);
  assert.equal(e.y[cc], target.y);
});

test('resource depots use BWAPI mineral placement exclusion boundaries', () => {
  const depotKinds = [Kind.CommandCenter, Kind.Nexus, Kind.Hatchery];
  for (const kind of depotKinds) {
    const blocked = makeState(open([{ x: 6, y: 8, amount: 1500, gas: false }]), 1, 1);
    assert.deepEqual(placementForStructure(blocked, kind, tc(12), tc(12)), { ok: false, reason: 'placement-blocked' });

    const leftBoundary = makeState(open([{ x: 5, y: 8, amount: 1500, gas: false }]), 1, 1);
    assert.equal(placementForStructure(leftBoundary, kind, tc(12), tc(12)).ok, true);

    const topBoundary = makeState(open([{ x: 6, y: 7, amount: 1500, gas: false }]), 1, 1);
    assert.equal(placementForStructure(topBoundary, kind, tc(12), tc(12)).ok, true);
  }
});

test('resource depots use BWAPI geyser placement exclusion boundaries', () => {
  const depotKinds = [Kind.CommandCenter, Kind.Nexus, Kind.Hatchery];
  for (const kind of depotKinds) {
    const blocked = makeState(open([{ x: 4, y: 7, amount: 0, gas: true }]), 1, 1);
    assert.deepEqual(placementForStructure(blocked, kind, tc(12), tc(12)), { ok: false, reason: 'placement-blocked' });

    const leftBoundary = makeState(open([{ x: 3, y: 7, amount: 0, gas: true }]), 1, 1);
    assert.equal(placementForStructure(leftBoundary, kind, tc(12), tc(12)).ok, true);

    const topBoundary = makeState(open([{ x: 4, y: 6, amount: 0, gas: true }]), 1, 1);
    assert.equal(placementForStructure(topBoundary, kind, tc(12), tc(12)).ok, true);
  }
});

test('resource depot placement follows live resources after map setup', () => {
  const s = makeState(open([{ x: 6, y: 8, amount: 1500, gas: false }]), 1, 1);
  const mineral = slotOf(spawnUnit(s, Kind.Mineral, NEUTRAL, fx(7 * TILE), fx(8.5 * TILE)));

  assert.deepEqual(placementForStructure(s, Kind.CommandCenter, tc(12), tc(12)), { ok: false, reason: 'placement-blocked' });

  kill(s, mineral);

  assert.equal(placementForStructure(s, Kind.CommandCenter, tc(12), tc(12)).ok, true);
});

test('same-tick production reserves supply across multiple producers', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 104 });
  const s = sim.fullState();
  const e = s.e;
  const b1 = slotOf(spawnUnit(s, Kind.Barracks, 0, fx(700), fx(700)));
  const b2 = slotOf(spawnUnit(s, Kind.Barracks, 0, fx(820), fx(700)));
  for (let i = 0; i < 5; i++) spawnUnit(s, Kind.Marine, 0, fx(900 + i * 20), fx(760));
  s.players.minerals[0] = 1_000;

  sim.step([{ player: 0, cmds: [
    { t: 'train', building: eid(e, b1), kind: Kind.Marine },
    { t: 'train', building: eid(e, b2), kind: Kind.Marine },
  ] }]);

  const queued = (e.prodKind[b1] === Kind.Marine ? 1 : 0) + (e.prodKind[b2] === Kind.Marine ? 1 : 0);
  assert.equal(queued, 1, 'only one marine can be queued with one free supply');
});

test('tech requirements gate production even when the producer can make the unit', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 111 });
  const s = sim.fullState();
  const e = s.e;
  const barracks = slotOf(spawnUnit(s, Kind.Barracks, 0, fx(700), fx(700)));
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  const blocked = sim.step([{ player: 0, cmds: [{ t: 'train', building: eid(e, barracks), kind: Kind.Firebat }] }]);
  assert.deepEqual(blocked, [{ player: 0, index: 0, t: 'train', ok: false, reason: 'missing-requirement' }]);
  assert.equal(e.prodKind[barracks], Kind.None);

  spawnUnit(s, Kind.Academy, 0, fx(820), fx(700));
  const allowed = sim.step([{ player: 0, cmds: [{ t: 'train', building: eid(e, barracks), kind: Kind.Firebat }] }]);
  assert.deepEqual(allowed, [{ player: 0, index: 0, t: 'train', ok: true }]);
  assert.equal(e.prodKind[barracks], Kind.Firebat);
});

test('tech requirements gate new structures', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 112 });
  const s = sim.fullState();
  const e = s.e;
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;
  const scv = findSlot(sim, (i) => e.kind[i] === Kind.SCV && e.owner[i] === 0);

  const blocked = sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(e, scv), kind: Kind.Factory, x: fx(900), y: fx(900) },
  ] }]);

  assert.deepEqual(blocked, [{ player: 0, index: 0, t: 'build', ok: false, reason: 'missing-requirement' }]);
  assert.equal(e.buildKind[scv], Kind.None);
});

test('zerg worker builds respect completed tech tree and exclude structure morph upgrades', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 113 });
  const s = sim.fullState();
  const e = s.e;
  s.players.minerals[0] = 2_000;
  s.players.gas[0] = 2_000;
  const drone = slotOf(spawnUnit(s, Kind.Drone, 0, fx(760), fx(700)));
  spawnUnit(s, Kind.Hatchery, 0, fx(700), fx(700));
  spawnUnit(s, Kind.SpawningPool, 0, fx(700), fx(860));

  const earlySpire = sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(e, drone), kind: Kind.Spire, x: fx(900), y: fx(700) },
  ] }]);
  assert.deepEqual(earlySpire, [{ player: 0, index: 0, t: 'build', ok: false, reason: 'missing-requirement' }]);
  assert.equal(e.buildKind[drone], Kind.None);

  const illegalLair = sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(e, drone), kind: Kind.Lair, x: fx(900), y: fx(700) },
  ] }]);
  assert.deepEqual(illegalLair, [{ player: 0, index: 0, t: 'build', ok: false, reason: 'missing-capability' }]);
  assert.equal(e.buildKind[drone], Kind.None);

  spawnUnit(s, Kind.Lair, 0, fx(700), fx(540));
  const allowedSpire = sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(e, drone), kind: Kind.Spire, x: fx(900), y: fx(700) },
  ] }]);
  assert.deepEqual(allowedSpire, [{ player: 0, index: 0, t: 'build', ok: true }]);
  assert.equal(e.buildKind[drone], Kind.Spire);
});

test('stopping a pending worker build refunds the full cost', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 105 });
  const s = sim.fullState();
  const e = s.e;
  s.players.minerals[0] = 1_000;
  const scv = findSlot(sim, (i) => e.kind[i] === Kind.SCV && e.owner[i] === 0);
  const before = s.players.minerals[0]!;

  sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(e, scv), kind: Kind.SupplyDepot, x: fx(900), y: fx(900) },
  ] }]);
  assert.equal(s.players.minerals[0], before - Units[Kind.SupplyDepot]!.minerals);
  assert.equal(e.buildCostMinerals[scv], Units[Kind.SupplyDepot]!.minerals);

  sim.step([{ player: 0, cmds: [{ t: 'stop', unit: eid(e, scv) }] }]);

  assert.equal(s.players.minerals[0], before);
  assert.equal(e.order[scv], Order.Idle);
  assert.equal(e.buildKind[scv], Kind.None);
  assert.equal(e.buildCostMinerals[scv], 0);
  assert.equal(count(s, Kind.SupplyDepot, 0), 0);
});

test('retargeting a pending build refunds the old ledger before spending the new one', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 106 });
  const s = sim.fullState();
  const e = s.e;
  s.players.minerals[0] = Units[Kind.SupplyDepot]!.minerals;
  const scv = findSlot(sim, (i) => e.kind[i] === Kind.SCV && e.owner[i] === 0);

  sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(e, scv), kind: Kind.SupplyDepot, x: fx(900), y: fx(900) },
  ] }]);
  assert.equal(s.players.minerals[0], 0);

  sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(e, scv), kind: Kind.SupplyDepot, x: fx(1_050), y: fx(900) },
  ] }]);

  assert.equal(s.players.minerals[0], 0, 'old cost was refunded before the replacement spent');
  assert.equal(e.buildKind[scv], Kind.SupplyDepot);
  assert.equal(e.tx[scv], snapped(1_050));
  assert.equal(e.buildCostMinerals[scv], Units[Kind.SupplyDepot]!.minerals);
});

test('killing a worker before foundation placement refunds its pending build', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 107 });
  const s = sim.fullState();
  const e = s.e;
  s.players.minerals[0] = 1_000;
  const scv = findSlot(sim, (i) => e.kind[i] === Kind.SCV && e.owner[i] === 0);
  const before = s.players.minerals[0]!;

  sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(e, scv), kind: Kind.SupplyDepot, x: fx(900), y: fx(900) },
  ] }]);
  kill(s, scv);

  assert.equal(s.players.minerals[0], before);
  assert.equal(e.buildCostMinerals[scv], 0);
});

test('canceling an unfinished foundation refunds 75 percent and removes it', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 108 });
  const s = sim.fullState();
  const e = s.e;
  s.players.minerals[0] = 1_000;
  const scv = slotOf(spawnUnit(s, Kind.SCV, 0, fx(900), fx(900)));
  const before = s.players.minerals[0]!;

  sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(e, scv), kind: Kind.SupplyDepot, x: fx(912), y: fx(900) },
  ] }]);

  const depot = findSlot(sim, (i) => e.kind[i] === Kind.SupplyDepot && e.owner[i] === 0 && e.built[i] === 0);
  assert.equal(e.buildCostMinerals[depot], Units[Kind.SupplyDepot]!.minerals);

  const foundationId = eid(e, depot);
  const results = sim.step([{ player: 0, cmds: [
    { t: 'cancelBuild', building: foundationId },
    { t: 'cancelBuild', building: foundationId },
  ] }]);

  assert.equal(s.players.minerals[0], before - 25);
  assert.equal(count(s, Kind.SupplyDepot, 0), 0);
  assert.deepEqual(results, [
    { player: 0, index: 0, t: 'cancelBuild', ok: true },
    { player: 0, index: 1, t: 'cancelBuild', ok: false, reason: 'stale-entity' },
  ]);
});

test('terran SCVs stay committed and paused foundations need their builder', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 113 });
  const s = sim.fullState();
  const e = s.e;
  s.players.minerals[0] = 1_000;
  const scv = slotOf(spawnUnit(s, Kind.SCV, 0, fx(900), fx(900)));

  sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(e, scv), kind: Kind.SupplyDepot, x: fx(912), y: fx(900) },
  ] }]);

  const depot = findSlot(sim, (i) => e.kind[i] === Kind.SupplyDepot && e.owner[i] === 0 && e.built[i] === 0);
  assert.equal(e.order[scv], Order.Build);
  assert.equal(e.target[scv], eid(e, depot));

  const before = e.ctimer[depot]!;
  sim.step([{ player: 0, cmds: [{ t: 'stop', unit: eid(e, scv) }] }]);
  for (let i = 0; i < 5; i++) sim.step([]);

  assert.equal(e.ctimer[depot], before, 'foundation pauses without its SCV');
});

test('terran SCVs are released when their structure completes', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 114 });
  const s = sim.fullState();
  const e = s.e;
  s.players.minerals[0] = 1_000;
  const scv = slotOf(spawnUnit(s, Kind.SCV, 0, fx(900), fx(900)));

  sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(e, scv), kind: Kind.SupplyDepot, x: fx(912), y: fx(900) },
  ] }]);
  const depot = findSlot(sim, (i) => e.kind[i] === Kind.SupplyDepot && e.owner[i] === 0 && e.built[i] === 0);
  e.ctimer[depot] = 1;
  sim.step([]);

  assert.equal(e.built[depot], 1);
  assert.notEqual(e.order[scv], Order.Build);
  assert.equal(e.target[depot], -1);
  assert.equal(e.buildCostMinerals[depot], 0);
});

test('another SCV can resume a paused Terran foundation', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 115 });
  const s = sim.fullState();
  const e = s.e;
  s.players.minerals[0] = 1_000;
  const builder = slotOf(spawnUnit(s, Kind.SCV, 0, fx(900), fx(900)));

  sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(e, builder), kind: Kind.Barracks, x: fx(940), y: fx(900) },
  ] }]);
  let barracks = -1;
  for (let t = 0; t < 80 && barracks < 0; t++) {
    sim.step([]);
    for (let i = 0; i < e.hi; i++) {
      if (e.alive[i] === 1 && e.kind[i] === Kind.Barracks && e.owner[i] === 0 && e.built[i] === 0) barracks = i;
    }
  }
  assert.notEqual(barracks, -1, 'foundation was placed');
  sim.step([{ player: 0, cmds: [{ t: 'stop', unit: eid(e, builder) }] }]);
  const pausedAt = e.ctimer[barracks]!;
  for (let i = 0; i < 5; i++) sim.step([]);
  assert.equal(e.ctimer[barracks], pausedAt, 'foundation is paused without an active SCV');

  const replacement = slotOf(spawnUnit(s, Kind.SCV, 0, fx(980), fx(900)));
  const results = sim.step([{ player: 0, cmds: [
    { t: 'repair', unit: eid(e, replacement), target: eid(e, barracks) },
  ] }]);

  assert.deepEqual(results, [{ player: 0, index: 0, t: 'repair', ok: true }]);
  assert.equal(e.order[replacement], Order.Build);
  assert.equal(e.target[replacement], eid(e, barracks));
  assert.equal(e.target[barracks], eid(e, replacement));
  assert.equal(e.order[builder], Order.Idle);

  for (let i = 0; i < 5; i++) sim.step([]);
  assert.ok(e.ctimer[barracks]! < pausedAt, 'replacement SCV advances construction');
});

test('pending build footprints reserve space before foundations are placed', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 109 });
  const s = sim.fullState();
  const e = s.e;
  s.players.minerals[0] = 1_000;
  const scvA = slotOf(spawnUnit(s, Kind.SCV, 0, fx(700), fx(700)));
  const scvB = slotOf(spawnUnit(s, Kind.SCV, 0, fx(740), fx(700)));

  sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(e, scvA), kind: Kind.SupplyDepot, x: fx(1_000), y: fx(1_000) },
    { t: 'build', unit: eid(e, scvB), kind: Kind.SupplyDepot, x: fx(1_000), y: fx(1_000) },
  ] }]);

  const pending = [scvA, scvB].filter((slot) => e.buildKind[slot] === Kind.SupplyDepot).length;
  assert.equal(pending, 1);
  assert.equal(s.players.minerals[0], 1_000 - Units[Kind.SupplyDepot]!.minerals);
});

test('step returns deterministic command acceptance and rejection results', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 110 });
  const s = sim.fullState();
  const e = s.e;
  s.players.minerals[0] = 1_000;
  const scv = findSlot(sim, (i) => e.kind[i] === Kind.SCV && e.owner[i] === 0);
  const cc = findSlot(sim, (i) => e.kind[i] === Kind.CommandCenter && e.owner[i] === 0);

  const results = sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(e, scv), kind: Kind.SupplyDepot, x: e.x[cc]!, y: e.y[cc]! },
    { t: 'move', unit: eid(e, scv), x: fx(700), y: fx(700) },
  ] }]);

  assert.deepEqual(results, [
    { player: 0, index: 0, t: 'build', ok: false, reason: 'placement-blocked' },
    { player: 0, index: 1, t: 'move', ok: true },
  ]);
  assert.deepEqual(sim.lastCommandResults, results);
});
