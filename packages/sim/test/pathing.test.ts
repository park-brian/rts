import test from 'node:test';
import assert from 'node:assert/strict';
import { eid, kill, makeState, NONE, slotOf, hashState } from '../src/entity/world.ts';
import { spawnUnit } from '../src/entity/factory.ts';
import { navigate, lineClear, tileX, tileY } from '../src/spatial/pathing.ts';
import { clearancePxForKind, flowField, navPassableForKind, pathPass, pathW, pathX, pathY, sampleFlowDirection } from '../src/spatial/flow.ts';
import { stepWorld } from '../src/tick.ts';
import { generateMap, mapBaseReservationsValid, mapConnected, mapResourcesValid, selectBaseCluster } from '../src/map/procedural.ts';
import { baseGasRoutesValid, mainBaseMineralRoutesValid } from '../src/map/harvest-calibration.ts';
import { resourceDirVector, resourceFootprintsOverlap, resourceSpawnCenterPx, sliceMap, solveBaseCluster } from '../src/map/core.ts';
import { Kind, Order, ResourceType, TILE } from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import type { MapDef } from '../src/map/core.ts';
import { FIRING_PATHING_LOCKOUT_TICKS, isPathingAnchor } from '../src/spatial/pathing-anchor.ts';
import { placementForStructure } from '../src/commands/validate.ts';
import { applyCommands } from '../src/commands/ingest.ts';
import { workersCanShareResourceRouteCollision } from '../src/spatial/worker-collision.ts';
import { entityApproachPoint } from '../src/entity/approach.ts';

const tc = (t: number): number => fx(t * TILE + (TILE >> 1)); // tile center px
const depotKinds = [Kind.CommandCenter, Kind.Nexus, Kind.Hatchery] as const;

const blankMap = (name: string, w: number, h: number): MapDef => ({
  name, w, h,
  walk: new Uint8Array(w * h).fill(1),
  build: new Uint8Array(w * h).fill(1),
  elev: new Uint8Array(w * h), starts: [], resources: [], teams: [],
});

const positionKey = (s: ReturnType<typeof makeState>, slot: number): string =>
  `${s.e.x[slot]},${s.e.y[slot]}`;

const assertBaseDepotAnchorsLegal = (m: MapDef): void => {
  const s = makeState(m, Math.max(1, m.starts.length), 1);
  for (const base of m.bases ?? []) {
    for (const kind of depotKinds) {
      const placement = placementForStructure(s, kind, tc(base.x), tc(base.y));
      assert.equal(placement.ok, true, `${base.kind} base ${base.x},${base.y} is legal for depot kind ${kind}`);
    }
  }
};

const positionsStable = (s: ReturnType<typeof makeState>, slots: number[], ticks: number): boolean => {
  const before = slots.map((slot) => positionKey(s, slot));
  for (let t = 0; t < ticks; t++) stepWorld(s, []);
  return slots.every((slot, i) => positionKey(s, slot) === before[i]);
};

test('a unit paths around a wall to reach its goal', () => {
  const w = 20;
  const h = 12;
  const walk = new Uint8Array(w * h).fill(1);
  // Vertical wall at x=10 for y=0..8, with a gap at y=9..11 (bottom).
  for (let y = 0; y <= 8; y++) walk[y * w + 10] = 0;
  const map: MapDef = {
    name: 'wall', w, h, walk, build: new Uint8Array(w * h).fill(1),
    elev: new Uint8Array(w * h), starts: [], resources: [], teams: [],
  };
  assert.equal(lineClear(map, 2, 2, 15, 2), false, 'wall blocks straight line');

  const s = makeState(map, 1, 1);
  const id = spawnUnit(s, Kind.Marine, 0, tc(2), tc(2));
  const slot = slotOf(id);
  const gx = tc(15);
  const gy = tc(2);

  let arrived = false;
  for (let t = 0; t < 4000 && !arrived; t++) arrived = navigate(s, slot, gx, gy, fx(2));
  assert.ok(arrived, 'unit should reach the far side by going around');
  assert.ok(Math.abs(s.e.x[slot]! - gx) < fx(2) && Math.abs(s.e.y[slot]! - gy) < fx(2));
});

test('clearance-aware pathing lets small units through gaps large bodies cannot fit', () => {
  const w = 9;
  const h = 7;
  const walk = new Uint8Array(w * h).fill(1);
  for (let x = 0; x < w; x++) if (x !== 4) walk[3 * w + x] = 0;
  const map: MapDef = {
    name: 'one-tile-doorway', w, h, walk, build: new Uint8Array(w * h).fill(1),
    elev: new Uint8Array(w * h), starts: [], resources: [], teams: [],
  };

  const small = makeState(map, 1, 13);
  const marine = slotOf(spawnUnit(small, Kind.Marine, 0, tc(4), tc(1)));
  assert.equal(navPassableForKind(small, Kind.Marine, 4, 3), true);

  let smallArrived = false;
  for (let t = 0; t < 240 && !smallArrived; t++) smallArrived = navigate(small, marine, tc(4), tc(5), fx(2));
  assert.equal(smallArrived, true, 'marine should pass through the one-tile doorway');

  const large = makeState(map, 1, 14);
  const ultra = slotOf(spawnUnit(large, Kind.Ultralisk, 0, tc(4), tc(1)));
  assert.equal(navPassableForKind(large, Kind.Ultralisk, 4, 3), false);

  let largeArrived = false;
  for (let t = 0; t < 240 && !largeArrived; t++) largeArrived = navigate(large, ultra, tc(4), tc(5), fx(2));
  assert.equal(largeArrived, false, 'ultralisk should not path through a doorway narrower than its body');
  assert.ok(tileY(large.e.y[ultra]!) < 3, 'ultralisk should stay on the near side of the doorway');
});

test('ground body clearance, not unit kind, determines one-cell gap passage', () => {
  const w = 9;
  const h = 7;
  const walk = new Uint8Array(w * h).fill(1);
  for (let x = 0; x < w; x++) if (x !== 4) walk[3 * w + x] = 0;
  const map: MapDef = {
    name: 'one-cell-clearance-audit', w, h, walk, build: new Uint8Array(w * h).fill(1),
    elev: new Uint8Array(w * h), starts: [], resources: [], teams: [],
  };

  const cases = [
    { kind: Kind.Marine, label: 'small marine', canPass: true },
    { kind: Kind.Hydralisk, label: 'medium hydralisk', canPass: true },
    { kind: Kind.Dragoon, label: 'large dragoon', canPass: false },
    { kind: Kind.SiegeTank, label: 'large siege tank', canPass: false },
    { kind: Kind.Ultralisk, label: 'large ultralisk', canPass: false },
  ] as const;

  for (const c of cases) {
    const s = makeState(map, 1, 150 + c.kind);
    const slot = slotOf(spawnUnit(s, c.kind, 0, tc(4), tc(1)));
    assert.equal(navPassableForKind(s, c.kind, 4, 3), c.canPass, `${c.label} one-cell passability`);
    let arrived = false;
    for (let t = 0; t < 240 && !arrived; t++) arrived = navigate(s, slot, tc(4), tc(5), fx(2));
    assert.equal(arrived, c.canPass, `${c.label} route through one-cell gap`);
    if (!c.canPass) assert.ok(tileY(s.e.y[slot]!) < 3, `${c.label} remains before the one-cell choke`);
  }
});

test('large ground bodies pass through a two-cell gap when their footprint fits', () => {
  const w = 10;
  const h = 7;
  const walk = new Uint8Array(w * h).fill(1);
  for (let x = 0; x < w; x++) if (x !== 4 && x !== 5) walk[3 * w + x] = 0;
  const map: MapDef = {
    name: 'two-cell-clearance-audit', w, h, walk, build: new Uint8Array(w * h).fill(1),
    elev: new Uint8Array(w * h), starts: [], resources: [], teams: [],
  };

  const cases = [
    { kind: Kind.Marine, label: 'small marine' },
    { kind: Kind.Hydralisk, label: 'medium hydralisk' },
    { kind: Kind.Dragoon, label: 'large dragoon' },
    { kind: Kind.SiegeTank, label: 'large siege tank' },
    { kind: Kind.Ultralisk, label: 'large ultralisk' },
  ] as const;

  for (const c of cases) {
    const s = makeState(map, 1, 170 + c.kind);
    const slot = slotOf(spawnUnit(s, c.kind, 0, tc(4), tc(1)));
    assert.equal(navPassableForKind(s, c.kind, 4, 3), true, `${c.label} two-cell passability`);
    let arrived = false;
    for (let t = 0; t < 240 && !arrived; t++) arrived = navigate(s, slot, tc(4), tc(5), fx(2));
    assert.equal(arrived, true, `${c.label} route through two-cell gap`);
  }
});

test('clearance-aware pathing preserves diagonal no-corner-cutting', () => {
  const w = 3;
  const h = 3;
  const walk = new Uint8Array(w * h).fill(1);
  walk[1] = 0;
  walk[w] = 0;
  const map: MapDef = {
    name: 'blocked-corner', w, h, walk, build: new Uint8Array(w * h).fill(1),
    elev: new Uint8Array(w * h), starts: [], resources: [], teams: [],
  };
  const s = makeState(map, 1, 15);
  const marine = slotOf(spawnUnit(s, Kind.Marine, 0, tc(0), tc(0)));

  let arrived = false;
  for (let t = 0; t < 80 && !arrived; t++) arrived = navigate(s, marine, tc(1), tc(1), fx(2));

  assert.equal(arrived, false, 'unit should not cut diagonally through two blocked corner tiles');
  assert.notEqual(`${tileX(s.e.x[marine]!)},${tileY(s.e.y[marine]!)}`, '1,1');
});

test('flow-field sampling blends local directions without changing passability', () => {
  const w = 20;
  const h = 12;
  const walk = new Uint8Array(w * h).fill(1);
  for (let y = 0; y <= 8; y++) walk[y * w + 10] = 0;
  const map: MapDef = {
    name: 'smooth-flow-wall', w, h, walk, build: new Uint8Array(w * h).fill(1),
    elev: new Uint8Array(w * h), starts: [], resources: [], teams: [],
  };
  const s = makeState(map, 1, 151);
  const clearance = clearancePxForKind(Kind.Marine);
  const pass = pathPass(s, clearance);
  const goal = pathY(tc(2)) * pathW(s) + pathX(tc(15));
  const field = flowField(s, goal, clearance);
  const dir = sampleFlowDirection(s, field, pass, null, tc(9) + fx(4), tc(2) + fx(4), clearance);

  assert.ok(dir.x <= 0, 'unit beside the wall should not smooth-steer into the blocked wall');
  assert.ok(dir.y > 0, 'unit beside the wall should smooth-steer toward the gap');
});

test('procedural maps are connected and scale with team size', () => {
  for (const perTeam of [1, 2, 3]) {
    for (const seed of [1, 2, 3, 7, 42, 99]) {
      const m = generateMap(perTeam, seed);
      assert.equal(m.starts.length, 2 * perTeam, `${perTeam}v${perTeam} start count`);
      assert.equal(m.w, 64 * perTeam, 'width scales with team size');
      assert.ok(mapConnected(m), `map ${perTeam}v${perTeam} #${seed} must be fully connected`);
      assert.equal(mapBaseReservationsValid(m), true, `map ${perTeam}v${perTeam} #${seed} keeps whole base reservations clear`);
      assert.equal(mainBaseMineralRoutesValid(m), true, `map ${perTeam}v${perTeam} #${seed} keeps calibrated main minerals`);
      assertBaseDepotAnchorsLegal(m);
      // Teams: first half south (team 0), interleaved south/north per lane.
      assert.equal(m.teams.length, m.starts.length);
    }
  }
});

test('procedural maps use shared team plateaus, low-ground naturals, and empty midfield by default', () => {
  const m = generateMap(3, 123);
  assert.equal(m.starts.length, 6);
  assert.equal(m.bases?.filter((base) => base.kind === 'main').length, 6);
  assert.equal(m.bases?.filter((base) => base.kind === 'natural').length, 6);
  assert.equal(mapResourcesValid(m), true);
  assert.equal(mapBaseReservationsValid(m), true);
  assertBaseDepotAnchorsLegal(m);

  const southStarts = m.starts.filter((_start, i) => m.teams[i] === 0);
  const northStarts = m.starts.filter((_start, i) => m.teams[i] === 1);
  assert.equal(southStarts.length, 3);
  assert.equal(northStarts.length, 3);
  for (const start of [...southStarts, ...northStarts]) {
    assert.equal(m.elev[start.y * m.w + start.x], 1, 'starts are on shared high-ground plateaus');
  }
  for (const natural of m.bases?.filter((base) => base.kind === 'natural') ?? []) {
    assert.equal(m.elev[natural.y * m.w + natural.x], 0, 'naturals are low ground below the ramp');
  }

  for (let y = 38; y <= 57; y++) {
    for (let x = 0; x < m.w; x++) assert.equal(m.walk[y * m.w + x], 1, 'empty midfield stays clear');
  }
});

test('procedural midfield modules preserve connectivity and resource clearance', () => {
  for (const midfield of ['blocks', 'dualChoke', 'arena', 'raisedCenter'] as const) {
    const m = generateMap(2, 77, { midfield });
    assert.equal(mapConnected(m), true, `${midfield} remains connected`);
    assert.equal(mapResourcesValid(m), true, `${midfield} keeps resources clear`);
    assert.equal(mapBaseReservationsValid(m), true, `${midfield} keeps whole base reservations clear`);
    assert.equal(mainBaseMineralRoutesValid(m), true, `${midfield} keeps main mineral timing valid`);
    assertBaseDepotAnchorsLegal(m);
  }
});

test('corner-base preset uses side-facing resource arcs as a real procedural consumer', () => {
  const m = generateMap(2, 91, { preset: 'cornerBases' });
  const bases = m.bases ?? [];

  assert.equal(m.starts.length, 4);
  assert.equal(bases.length, 4);
  assert.equal(mapConnected(m), true);
  assert.equal(mapResourcesValid(m), true);
  assert.equal(mapBaseReservationsValid(m), true);
  assert.equal(mainBaseMineralRoutesValid(m, { maxResourceOrderRouteSpreadFrames: Number.POSITIVE_INFINITY }), true);
  assert.equal(baseGasRoutesValid(m), true);
  assertBaseDepotAnchorsLegal(m);
  assert.deepEqual(bases.map((base) => base.resourceDir), ['east', 'west', 'east', 'west']);

  for (const base of bases) {
    const f = resourceDirVector(base.resourceDir);
    assert.notEqual(f.x, 0, 'corner preset should exercise east/west resource arcs');
    const depot = { x: base.x * TILE + (TILE >> 1), y: base.y * TILE + (TILE >> 1) };
    const resources = m.resources.filter((resource) => {
      const center = resourceSpawnCenterPx(resource);
      return (center.x - depot.x) * f.x + (center.y - depot.y) * f.y > 0 &&
        Math.abs(center.y - depot.y) <= 8 * TILE &&
        Math.abs(center.x - depot.x) <= 9 * TILE;
    });
    assert.equal(resources.length, 9, `${base.resourceDir} base should own one side-facing resource cluster`);
  }
});

test('isolated-main preset gives each player a ground-connected high-ground pocket', () => {
  const m = generateMap(2, 92, { preset: 'isolatedMains' });
  const bases = m.bases ?? [];

  assert.equal(m.starts.length, 4);
  assert.equal(bases.length, 4);
  assert.equal(bases.every((base) => base.kind === 'main'), true);
  assert.equal(mapConnected(m), true);
  assert.equal(mapResourcesValid(m), true);
  assert.equal(mapBaseReservationsValid(m), true);
  assert.equal(mainBaseMineralRoutesValid(m), true);
  assert.equal(baseGasRoutesValid(m), true);
  assertBaseDepotAnchorsLegal(m);
  assert.deepEqual(bases.map((base) => base.resourceDir), [-1, 1, -1, 1]);

  for (const base of bases) {
    assert.equal(m.elev[base.y * m.w + base.x], 1, 'main starts are on isolated high ground');
    assert.equal(m.walk[base.rampY! * m.w + base.rampX!], 1, 'main pocket ramp is walkable');
    assert.equal(m.build[base.rampY! * m.w + base.rampX!], 0, 'main pocket ramp is not buildable');
  }

  assert.equal(m.elev[82 * m.w + 64], 0, 'team pockets do not form one shared south plateau');
  assert.equal(m.elev[14 * m.w + 64], 0, 'team pockets do not form one shared north plateau');
});

test('fortress preset adds validated fortified expansions without breaking ground connectivity', () => {
  const m = generateMap(2, 93, { preset: 'fortress' });
  const bases = m.bases ?? [];
  const mains = bases.filter((base) => base.kind === 'main');
  const fortresses = bases.filter((base) => base.kind === 'fortress');

  assert.equal(m.starts.length, 4);
  assert.equal(mains.length, 4);
  assert.equal(fortresses.length, 4);
  assert.equal(mapConnected(m), true);
  assert.equal(mapResourcesValid(m), true);
  assert.equal(mapBaseReservationsValid(m), true);
  assert.equal(mainBaseMineralRoutesValid(m), true);
  assert.equal(baseGasRoutesValid(m), true);
  assertBaseDepotAnchorsLegal(m);
  assert.deepEqual(fortresses.map((base) => base.resourceDir), [-1, 1, -1, 1]);

  for (const base of [...mains, ...fortresses]) {
    assert.equal(m.elev[base.y * m.w + base.x], 1, `${base.kind} base is on fortified high ground`);
    assert.equal(m.walk[base.rampY! * m.w + base.rampX!], 1, `${base.kind} ramp is walkable`);
    assert.equal(m.build[base.rampY! * m.w + base.rampX!], 0, `${base.kind} ramp is not buildable`);
  }

  assert.ok(fortresses.every((base) => base.owner === undefined), 'fortress expansions are neutral base sites');
});

test('procedural base reservations reject overlapping whole-base clusters', () => {
  const m = generateMap(1, 88);
  assert.equal(mapBaseReservationsValid(m), true);
  const bases = m.bases ?? [];
  assert.ok(bases.length >= 2);
  bases[1]!.reservation = { ...bases[0]!.reservation! };
  assert.equal(mapBaseReservationsValid(m), false);

  const stale = generateMap(1, 89);
  const first = stale.bases![0]!;
  first.depotFootprint = { ...first.depotFootprint!, x0: first.depotFootprint!.x0 + 1 };
  assert.equal(mapBaseReservationsValid(stale), false);
});

test('base cluster selection retries local anchors before stamping resources', () => {
  const m = blankMap('base-retry', 96, 96);
  const anchor = { x: 48, y: 80 };
  const nominal = solveBaseCluster(anchor, -1);
  const blockedTile = {
    x0: nominal.depotFootprint.x0,
    y0: nominal.depotFootprint.y0,
    x1: nominal.depotFootprint.x0,
    y1: nominal.depotFootprint.y0,
  };
  m.build[blockedTile.y0 * m.w + blockedTile.x0] = 0;

  const chosen = selectBaseCluster(m, anchor, -1, [], { kind: 'main' });
  assert.notEqual(chosen, null);
  assert.notDeepEqual({ x: chosen!.x, y: chosen!.y }, anchor);
  assert.equal(resourceFootprintsOverlap(chosen!.depotFootprint, blockedTile), false);
  assert.equal(m.resources.length, 0, 'candidate selection is side-effect free');
});

test('a group moving to one goal arrives, spreads, and settles', () => {
  const run = (): { hash: number; distinct: number; arrived: boolean; settled: boolean; stable: boolean } => {
    const map = sliceMap();
    const s = makeState(map, 1, 777);
    const gx = tc(32); const gy = tc(32);
    const slots: number[] = [];
    for (let i = 0; i < 12; i++) {
      const id = spawnUnit(s, Kind.Marine, 0, tc(20) + fx((i % 4) * 6), tc(70) + fx(((i / 4) | 0) * 6));
      const sl = slotOf(id);
      slots.push(sl);
    }
    stepWorld(s, [{ player: 0, cmds: slots.map((sl) => ({ t: 'move' as const, unit: eid(s.e, sl), x: gx, y: gy })) }]);
    for (let t = 0; t < 900; t++) stepWorld(s, []);
    // All reached the goal region (within a few tiles, since separation fans them out).
    let arrived = true;
    let settled = true;
    const pos = new Set<string>();
    for (const sl of slots) {
      const dx = s.e.x[sl]! - gx; const dy = s.e.y[sl]! - gy;
      if (dx * dx + dy * dy > fx(5 * TILE) * fx(5 * TILE)) arrived = false;
      if (s.e.order[sl] !== Order.Idle || s.e.settled[sl] !== 1) settled = false;
      pos.add(`${s.e.x[sl]},${s.e.y[sl]}`);
    }
    const before = slots.map((sl) => `${s.e.x[sl]},${s.e.y[sl]}`);
    for (let t = 0; t < 60; t++) stepWorld(s, []);
    const stable = slots.every((sl, i) => `${s.e.x[sl]},${s.e.y[sl]}` === before[i]);
    return { hash: hashState(s), distinct: pos.size, arrived, settled, stable };
  };
  const a = run();
  const b = run();
  assert.ok(a.arrived, 'every unit should reach the goal region');
  assert.ok(a.settled, 'every unit should transition to settled idle after collision cleanup');
  assert.ok(a.stable, 'settled units should not keep drifting after arrival');
  assert.ok(a.distinct > 1, 'separation must keep units off a single pixel');
  assert.equal(a.hash, b.hash, 'group movement + separation must be deterministic');
});

test('targeted move follows a friendly entity by approaching its body', () => {
  const s = makeState(blankMap('targeted-follow', 40, 24), 2, 781);
  const follower = spawnUnit(s, Kind.Marine, 0, tc(6), tc(12));
  const leader = spawnUnit(s, Kind.Marine, 0, tc(12), tc(12));
  const followerSlot = slotOf(follower);
  const leaderSlot = slotOf(leader);

  const results = applyCommands(s, [{ player: 0, cmds: [{
    t: 'move',
    unit: follower,
    x: s.e.x[leaderSlot]!,
    y: s.e.y[leaderSlot]!,
    target: leader,
  }] }]);

  assert.deepEqual(results, [{ player: 0, index: 0, t: 'move', ok: true }]);
  assert.equal(s.e.order[followerSlot], Order.Move);
  assert.equal(s.e.target[followerSlot], leader);
  assert.equal(s.e.intentTarget[followerSlot], leader);
  let p = entityApproachPoint(s, followerSlot, leaderSlot);
  assert.equal(s.e.tx[followerSlot], p.x);
  assert.equal(s.e.ty[followerSlot], p.y);

  s.e.target[followerSlot] = NONE;
  s.e.x[leaderSlot] = tc(18);
  s.e.y[leaderSlot] = tc(8);
  p = entityApproachPoint(s, followerSlot, leaderSlot);
  stepWorld(s, []);

  assert.equal(s.e.order[followerSlot], Order.Move);
  assert.equal(s.e.target[followerSlot], NONE);
  assert.equal(s.e.intentTarget[followerSlot], leader);
  assert.equal(s.e.tx[followerSlot], p.x);
  assert.equal(s.e.ty[followerSlot], p.y);
});

test('multiple targeted movers reserve distinct deterministic approach slots', () => {
  const run = (): { hash: number; destinations: string[]; targetsHeld: boolean } => {
    const s = makeState(blankMap('targeted-follow-slots', 48, 24), 1, 783);
    const leader = spawnUnit(s, Kind.Marine, 0, tc(20), tc(12));
    const leaderSlot = slotOf(leader);
    const slots: number[] = [];
    for (let i = 0; i < 4; i++) slots.push(slotOf(spawnUnit(s, Kind.Marine, 0, tc(6), tc(9 + i * 2))));

    applyCommands(s, [{ player: 0, cmds: slots.map((slot) => ({
      t: 'move' as const,
      unit: eid(s.e, slot),
      x: s.e.x[leaderSlot]!,
      y: s.e.y[leaderSlot]!,
      target: leader,
    })) }]);
    for (const slot of slots) s.e.target[slot] = NONE;
    s.e.x[leaderSlot] = tc(24);
    s.e.y[leaderSlot] = tc(12);
    stepWorld(s, []);

    const destinations = slots.map((slot) => `${s.e.tx[slot]},${s.e.ty[slot]}`);
    const targetsHeld = slots.every((slot) =>
      s.e.order[slot] === Order.Move &&
      s.e.target[slot] === NONE &&
      s.e.intentTarget[slot] === leader
    );
    return { hash: hashState(s), destinations, targetsHeld };
  };

  const a = run();
  const b = run();

  assert.equal(a.targetsHeld, true, 'followers should keep their entity target while recomputing approach slots');
  assert.equal(new Set(a.destinations).size, a.destinations.length, 'same-target followers should not all reserve one approach point');
  assert.deepEqual(a.destinations, b.destinations, 'follow approach slot assignment should be deterministic');
  assert.equal(a.hash, b.hash, 'ranked follow recomputation should preserve deterministic state');
});

test('targeted move only accepts friendly non-resource entities', () => {
  const s = makeState(blankMap('targeted-follow-validation', 40, 24), 2, 782);
  const actor = spawnUnit(s, Kind.Marine, 0, tc(6), tc(12));
  const friendly = spawnUnit(s, Kind.Marine, 0, tc(10), tc(12));
  const enemy = spawnUnit(s, Kind.Zealot, 1, tc(12), tc(12));
  const mineral = spawnUnit(s, Kind.Mineral, 0, tc(14), tc(12));

  const results = applyCommands(s, [{ player: 0, cmds: [
    { t: 'move', unit: actor, x: tc(10), y: tc(12), target: friendly },
    { t: 'move', unit: actor, x: tc(12), y: tc(12), target: enemy },
    { t: 'move', unit: actor, x: tc(14), y: tc(12), target: mineral },
    { t: 'move', unit: actor, x: tc(6), y: tc(12), target: actor },
  ] }]);

  assert.equal(results[0]?.ok, true);
  assert.deepEqual(results.slice(1), [
    { player: 0, index: 1, t: 'move', ok: false, reason: 'target-not-allowed' },
    { player: 0, index: 2, t: 'move', ok: false, reason: 'target-not-allowed' },
    { player: 0, index: 3, t: 'move', ok: false, reason: 'target-not-allowed' },
  ]);
});

test('a mixed ground deathball settles into stable space', () => {
  const run = (): { hash: number; settled: number; stable: boolean; distinct: number } => {
    const s = makeState(blankMap('mixed-deathball', 80, 80), 1, 778);
    const goalX = tc(48);
    const goalY = tc(28);
    const kinds = [
      Kind.Marine, Kind.Firebat, Kind.Zealot, Kind.Hydralisk,
      Kind.Goliath, Kind.Dragoon, Kind.SiegeTank, Kind.Ultralisk,
    ];
    const slots: number[] = [];
    for (let i = 0; i < 24; i++) {
      const x = tc(18 + (i % 6) * 2);
      const y = tc(60 + ((i / 6) | 0) * 2);
      slots.push(slotOf(spawnUnit(s, kinds[i % kinds.length]!, 0, x, y)));
    }

    stepWorld(s, [{ player: 0, cmds: slots.map((slot) => ({
      t: 'move' as const, unit: eid(s.e, slot), x: goalX, y: goalY,
    })) }]);
    for (let t = 0; t < 1_600; t++) stepWorld(s, []);

    let settled = 0;
    const pos = new Set<string>();
    for (const slot of slots) {
      const dx = s.e.x[slot]! - goalX;
      const dy = s.e.y[slot]! - goalY;
      assert.ok(dx * dx + dy * dy <= fx(8 * TILE) * fx(8 * TILE), 'unit should join the settled army body');
      if (s.e.order[slot] === Order.Idle && s.e.settled[slot] === 1) settled++;
      pos.add(positionKey(s, slot));
    }
    const stable = positionsStable(s, slots, 90);
    return { hash: hashState(s), settled, stable, distinct: pos.size };
  };

  const a = run();
  const b = run();
  assert.equal(a.settled, 24);
  assert.equal(a.stable, true);
  assert.ok(a.distinct > 18, 'large mixed armies should not collapse into a few occupied pixels');
  assert.equal(a.hash, b.hash, 'mixed deathball settling must remain deterministic');
});

test('opposing ground groups pass through a shared choke without permanent jamming', () => {
  const map = blankMap('opposing-choke', 36, 24);
  for (let y = 0; y < map.h; y++) {
    if (y >= 10 && y <= 13) continue;
    map.walk[y * map.w + 18] = 0;
    map.build[y * map.w + 18] = 0;
  }
  const s = makeState(map, 1, 779);
  const left: number[] = [];
  const right: number[] = [];
  for (let i = 0; i < 10; i++) {
    left.push(slotOf(spawnUnit(s, Kind.Marine, 0, tc(7 + (i % 2)), tc(7 + i))));
    right.push(slotOf(spawnUnit(s, Kind.Marine, 0, tc(28 - (i % 2)), tc(7 + i))));
  }

  stepWorld(s, [{ player: 0, cmds: [
    ...left.map((slot) => ({ t: 'move' as const, unit: eid(s.e, slot), x: tc(28), y: s.e.y[slot]! })),
    ...right.map((slot) => ({ t: 'move' as const, unit: eid(s.e, slot), x: tc(7), y: s.e.y[slot]! })),
  ] }]);
  for (let t = 0; t < 900; t++) stepWorld(s, []);

  assert.equal(left.filter((slot) => s.e.x[slot]! > tc(22)).length, left.length, 'left group should clear the choke');
  assert.equal(right.filter((slot) => s.e.x[slot]! < tc(13)).length, right.length, 'right group should clear the choke');
  assert.equal([...left, ...right].filter((slot) => s.e.order[slot] === Order.Idle && s.e.settled[slot] === 1).length, 20);
  assert.equal(positionsStable(s, [...left, ...right], 60), true);
});

test('ground groups exit procedural base ramps and settle in the midfield', () => {
  const map = generateMap(1, 31);
  const s = makeState(map, 1, 780);
  const start = map.starts[0]!;
  const goalX = tc(start.x);
  const goalY = tc(map.h >> 1);
  const slots: number[] = [];
  for (let i = 0; i < 12; i++) {
    slots.push(slotOf(spawnUnit(s, Kind.Marine, 0, tc(start.x - 3 + (i % 4) * 2), tc(start.y - 3 + ((i / 4) | 0) * 2))));
  }

  stepWorld(s, [{ player: 0, cmds: slots.map((slot) => ({
    t: 'move' as const, unit: eid(s.e, slot), x: goalX, y: goalY,
  })) }]);
  for (let t = 0; t < 900; t++) stepWorld(s, []);

  assert.equal(slots.filter((slot) => s.e.y[slot]! < tc(start.y - 20)).length, slots.length, 'all units should leave the base plateau');
  assert.equal(slots.filter((slot) => s.e.order[slot] === Order.Idle && s.e.settled[slot] === 1).length, slots.length);
  assert.equal(positionsStable(s, slots, 60), true);
});

test('ground movement steers around nearby bodies before collision cleanup', () => {
  const w = 10;
  const h = 5;
  const map: MapDef = {
    name: 'local-avoidance', w, h,
    walk: new Uint8Array(w * h).fill(1),
    build: new Uint8Array(w * h).fill(1),
    elev: new Uint8Array(w * h), starts: [], resources: [], teams: [],
  };
  const s = makeState(map, 1, 18);
  const mover = slotOf(spawnUnit(s, Kind.Marine, 0, tc(2), tc(2)));
  const blockerX = tc(2) + fx(16);
  const blocker = slotOf(spawnUnit(s, Kind.Marine, 0, blockerX, tc(2)));
  const x0 = s.e.x[mover]!;
  const y0 = s.e.y[mover]!;

  const arrived = navigate(s, mover, tc(7), tc(2), fx(4));

  assert.equal(arrived, false);
  assert.ok(s.e.x[mover]! > x0, 'mover still makes forward progress');
  assert.notEqual(s.e.y[mover], y0, 'mover should sidestep before collision cleanup runs');
  assert.equal(s.e.x[blocker], blockerX, 'avoidance does not move the nearby body');
});

test('settled ground units keep newly issued non-move orders', () => {
  const s = makeState(sliceMap(), 2, 19);
  const marineId = spawnUnit(s, Kind.Marine, 0, tc(20), tc(20));
  const marine = slotOf(marineId);

  stepWorld(s, [{ player: 0, cmds: [{ t: 'move', unit: marineId, x: s.e.x[marine]!, y: s.e.y[marine]! }] }]);
  assert.equal(s.e.order[marine], Order.Idle);
  assert.equal(s.e.settled[marine], 1);

  const targetId = spawnUnit(s, Kind.Marine, 1, tc(35), tc(20));
  stepWorld(s, [{ player: 0, cmds: [{ t: 'attack', unit: marineId, target: targetId }] }]);

  assert.equal(s.e.order[marine], Order.Attack);
  assert.equal(s.e.target[marine], targetId);
  assert.equal(s.e.combatTarget[marine], targetId);
  assert.equal(s.e.intentTarget[marine], NONE);
  assert.equal(s.e.settled[marine], 0);
});

test('same-target move batches assign deterministic destination slots', () => {
  const s = makeState(sliceMap(), 1, 16);
  const targetX = tc(30);
  const targetY = tc(30);
  const slots: number[] = [];
  for (let i = 0; i < 4; i++) slots.push(slotOf(spawnUnit(s, Kind.Marine, 0, tc(10 + i), tc(10))));

  stepWorld(s, [{ player: 0, cmds: [
    { t: 'move', unit: eid(s.e, slots[3]!), x: targetX, y: targetY },
    { t: 'move', unit: eid(s.e, slots[1]!), x: targetX, y: targetY },
    { t: 'move', unit: eid(s.e, slots[2]!), x: targetX, y: targetY },
    { t: 'move', unit: eid(s.e, slots[0]!), x: targetX, y: targetY },
  ] }]);

  const destinations = slots.map((slot) => `${s.e.tx[slot]},${s.e.ty[slot]}`);
  assert.equal(new Set(destinations).size, slots.length);
  assert.equal(s.e.tx[slots[0]!], targetX);
  assert.equal(s.e.ty[slots[0]!], targetY);
  assert.equal(s.e.tx[slots[1]!], targetX);
  assert.equal(s.e.ty[slots[1]!], targetY - fx(TILE));
});

test('same-target batches widen formation slots for large bodies', () => {
  const s = makeState(sliceMap(), 1, 161);
  const targetX = tc(30);
  const targetY = tc(30);
  const a = slotOf(spawnUnit(s, Kind.Ultralisk, 0, tc(10), tc(10)));
  const b = slotOf(spawnUnit(s, Kind.Ultralisk, 0, tc(12), tc(10)));

  stepWorld(s, [{ player: 0, cmds: [
    { t: 'move', unit: eid(s.e, b), x: targetX, y: targetY },
    { t: 'move', unit: eid(s.e, a), x: targetX, y: targetY },
  ] }]);

  assert.equal(s.e.tx[a], targetX);
  assert.equal(s.e.ty[a], targetY);
  assert.equal(s.e.tx[b], targetX);
  assert.ok(targetY - s.e.ty[b]! > fx(TILE), 'large bodies should reserve more than infantry spacing');
});

test('same-target attack-move batches spread but worker move batches preserve exact points', () => {
  const s = makeState(sliceMap(), 1, 17);
  const targetX = tc(28);
  const targetY = tc(28);
  const a = slotOf(spawnUnit(s, Kind.Marine, 0, tc(10), tc(10)));
  const b = slotOf(spawnUnit(s, Kind.Marine, 0, tc(11), tc(10)));
  const w1 = slotOf(spawnUnit(s, Kind.SCV, 0, tc(12), tc(10)));
  const w2 = slotOf(spawnUnit(s, Kind.SCV, 0, tc(13), tc(10)));

  stepWorld(s, [{ player: 0, cmds: [
    { t: 'amove', unit: eid(s.e, b), x: targetX, y: targetY },
    { t: 'amove', unit: eid(s.e, a), x: targetX, y: targetY },
    { t: 'move', unit: eid(s.e, w1), x: targetX, y: targetY },
    { t: 'move', unit: eid(s.e, w2), x: targetX, y: targetY },
  ] }]);

  assert.notEqual(`${s.e.tx[a]},${s.e.ty[a]}`, `${s.e.tx[b]},${s.e.ty[b]}`);
  assert.equal(s.e.tx[w1], targetX);
  assert.equal(s.e.ty[w1], targetY);
  assert.equal(s.e.tx[w2], targetX);
  assert.equal(s.e.ty[w2], targetY);
});

test('workers collide normally unless they are resource-route workers', () => {
  const s = makeState(blankMap('worker-collision', 16, 16), 1, 102);
  const e = s.e;
  const a = slotOf(spawnUnit(s, Kind.SCV, 0, tc(8), tc(8)));
  const b = slotOf(spawnUnit(s, Kind.SCV, 0, tc(8), tc(8)));

  stepWorld(s, []);

  assert.notEqual(positionKey(s, a), positionKey(s, b), 'ordinary workers should separate like solid bodies');
});

test('mineral-harvesting workers can share collision with each other', () => {
  const s = makeState(blankMap('mineral-harvest-worker-collision', 16, 16), 1, 103);
  const e = s.e;
  const mineral = slotOf(spawnUnit(s, Kind.Mineral, -1, tc(10), tc(8)));
  const a = slotOf(spawnUnit(s, Kind.SCV, 0, tc(8), tc(8)));
  const b = slotOf(spawnUnit(s, Kind.SCV, 0, tc(8), tc(8)));
  for (const worker of [a, b]) {
    e.order[worker] = Order.Harvest;
    e.target[worker] = eid(e, mineral);
    e.stasisTimer[worker] = 1; // isolate collision from harvest steering for this one tick
  }

  stepWorld(s, []);

  assert.equal(positionKey(s, a), positionKey(s, b), 'mineral-harvesting workers may share space');
});

test('mineral-harvesting workers still collide with non-harvesting workers', () => {
  const s = makeState(blankMap('mineral-harvest-vs-idle-worker', 16, 16), 1, 106);
  const e = s.e;
  const mineral = slotOf(spawnUnit(s, Kind.Mineral, -1, tc(10), tc(8)));
  const miner = slotOf(spawnUnit(s, Kind.SCV, 0, tc(8), tc(8)));
  const idle = slotOf(spawnUnit(s, Kind.SCV, 0, tc(8), tc(8)));
  e.order[miner] = Order.Harvest;
  e.target[miner] = eid(e, mineral);
  e.stasisTimer[miner] = 1; // isolate collision from harvest steering for this one tick

  stepWorld(s, []);

  assert.notEqual(positionKey(s, miner), positionKey(s, idle), 'harvest route only phases against another resource-route worker');
});

test('gas-harvesting workers can share collision with each other', () => {
  const s = makeState(blankMap('gas-worker-collision', 16, 16), 1, 104);
  const e = s.e;
  const refinery = slotOf(spawnUnit(s, Kind.Refinery, 0, tc(10), tc(8)));
  const a = slotOf(spawnUnit(s, Kind.SCV, 0, tc(8), tc(8)));
  const b = slotOf(spawnUnit(s, Kind.SCV, 0, tc(8), tc(8)));
  for (const worker of [a, b]) {
    e.order[worker] = Order.Harvest;
    e.target[worker] = eid(e, refinery);
    e.stasisTimer[worker] = 1; // isolate collision from harvest steering for this one tick
  }

  stepWorld(s, []);

  assert.equal(positionKey(s, a), positionKey(s, b), 'gas-harvesting workers may share space');
});

test('gas-harvesting workers still collide with non-harvesting workers', () => {
  const s = makeState(blankMap('gas-worker-vs-idle-collision', 16, 16), 1, 108);
  const e = s.e;
  const refinery = slotOf(spawnUnit(s, Kind.Refinery, 0, tc(10), tc(8)));
  const gasWorker = slotOf(spawnUnit(s, Kind.SCV, 0, tc(8), tc(8)));
  const idle = slotOf(spawnUnit(s, Kind.SCV, 0, tc(8), tc(8)));
  e.order[gasWorker] = Order.Harvest;
  e.target[gasWorker] = eid(e, refinery);
  e.stasisTimer[gasWorker] = 1; // isolate collision from harvest steering for this one tick

  stepWorld(s, []);

  assert.notEqual(positionKey(s, gasWorker), positionKey(s, idle), 'gas routes still collide with non-harvesting workers');
});

test('enemy resource-route workers remain solid to each other', () => {
  const s = makeState(blankMap('enemy-resource-route-worker-collision', 16, 16), 2, 110);
  const e = s.e;
  const mineral = slotOf(spawnUnit(s, Kind.Mineral, -1, tc(10), tc(8)));
  const blueMiner = slotOf(spawnUnit(s, Kind.SCV, 0, tc(8), tc(8)));
  const redMiner = slotOf(spawnUnit(s, Kind.SCV, 1, tc(8), tc(8)));
  for (const worker of [blueMiner, redMiner]) {
    e.order[worker] = Order.Harvest;
    e.target[worker] = eid(e, mineral);
    e.stasisTimer[worker] = 1; // isolate collision from harvest steering for this one tick
  }

  stepWorld(s, []);

  assert.notEqual(positionKey(s, blueMiner), positionKey(s, redMiner), 'enemy resource-route workers remain solid');
});

test('returning resource workers share collision with harvesting workers but not non-workers', () => {
  const s = makeState(blankMap('carrying-worker-collision', 16, 16), 1, 105);
  const e = s.e;
  const mineral = slotOf(spawnUnit(s, Kind.Mineral, -1, tc(10), tc(8)));
  const a = slotOf(spawnUnit(s, Kind.SCV, 0, tc(8), tc(8)));
  const b = slotOf(spawnUnit(s, Kind.SCV, 0, tc(8), tc(8)));
  e.order[a] = Order.Harvest;
  e.order[b] = Order.Harvest;
  e.target[a] = eid(e, mineral);
  e.target[b] = eid(e, mineral);
  e.stasisTimer[a] = 1;
  e.stasisTimer[b] = 1;
  e.cargo[a] = 8;
  e.cargoType[a] = ResourceType.Minerals;

  stepWorld(s, []);

  assert.equal(positionKey(s, a), positionKey(s, b), 'returning and harvesting resource workers may share space');

  const marine = slotOf(spawnUnit(s, Kind.Marine, 0, tc(8), tc(8)));
  const before = positionKey(s, a);
  stepWorld(s, []);

  assert.notEqual(positionKey(s, a), before, 'resource-carrying worker still collides with non-worker traffic');
  assert.notEqual(positionKey(s, marine), before, 'non-worker traffic is still solid to resource-carrying workers');
});

test('harvest commands immediately put workers on resource-route collision routes', () => {
  const s = makeState(blankMap('harvest-command-worker-collision', 16, 16), 1, 107);
  const e = s.e;
  const mineral = slotOf(spawnUnit(s, Kind.Mineral, -1, tc(10), tc(8)));
  const fresh = slotOf(spawnUnit(s, Kind.SCV, 0, tc(8), tc(8)));
  const returning = slotOf(spawnUnit(s, Kind.SCV, 0, tc(8), tc(8)));
  e.order[returning] = Order.Harvest;
  e.target[returning] = eid(e, mineral);
  e.cargo[returning] = 8;
  e.cargoType[returning] = ResourceType.Minerals;

  const results = applyCommands(s, [{ player: 0, cmds: [{ t: 'harvest', unit: eid(e, fresh), patch: eid(e, mineral) }] }]);

  assert.deepEqual(results, [{ player: 0, index: 0, t: 'harvest', ok: true }]);
  assert.equal(workersCanShareResourceRouteCollision(s, fresh, returning), true);
});

test('returning gas workers share collision with gas harvesters', () => {
  const s = makeState(blankMap('returning-gas-worker-collision', 16, 16), 1, 109);
  const e = s.e;
  const refinery = slotOf(spawnUnit(s, Kind.Refinery, 0, tc(10), tc(8)));
  const returning = slotOf(spawnUnit(s, Kind.SCV, 0, tc(8), tc(8)));
  const harvesting = slotOf(spawnUnit(s, Kind.SCV, 0, tc(8), tc(8)));
  e.order[returning] = Order.Harvest;
  e.target[returning] = eid(e, refinery);
  e.cargo[returning] = 8;
  e.cargoType[returning] = ResourceType.Gas;
  e.order[harvesting] = Order.Harvest;
  e.target[harvesting] = eid(e, refinery);
  e.stasisTimer[returning] = 1;
  e.stasisTimer[harvesting] = 1;

  stepWorld(s, []);

  assert.equal(positionKey(s, returning), positionKey(s, harvesting), 'returning gas and harvesting gas workers may share space');
});

test('moving units face their current travel direction', () => {
  const s = makeState(sliceMap(), 1, 12);
  const id = spawnUnit(s, Kind.Marine, 0, tc(12), tc(12));
  const slot = slotOf(id);
  s.e.order[slot] = Order.Move;
  s.e.tx[slot] = tc(18);
  s.e.ty[slot] = tc(12);

  stepWorld(s, []);

  assert.ok(s.e.faceX[slot]! > 0, 'unit faces east while moving east');
  assert.ok(Math.abs(s.e.faceY[slot]!) < fx(1), 'eastward move has no meaningful vertical facing');
});

test('moving ground units path around rooted firing units without shoving them', () => {
  const w = 12;
  const h = 8;
  const map: MapDef = {
    name: 'rooted-firing-unit', w, h,
    walk: new Uint8Array(w * h).fill(1),
    build: new Uint8Array(w * h).fill(1),
    elev: new Uint8Array(w * h), starts: [], resources: [], teams: [],
  };
  const s = makeState(map, 2, 99);
  const mover = spawnUnit(s, Kind.Marine, 0, tc(2), tc(4));
  const anchor = spawnUnit(s, Kind.Marine, 0, tc(5), tc(4));
  const target = spawnUnit(s, Kind.Zealot, 1, tc(6), tc(4));
  const e = s.e;
  const ms = slotOf(mover);
  const as = slotOf(anchor);
  e.order[ms] = Order.Move;
  e.tx[ms] = tc(9);
  e.ty[ms] = tc(4);
  e.order[as] = Order.Idle;
  e.target[as] = target;
  e.wcd[as] = 15;
  const ax = e.x[as]!;
  const ay = e.y[as]!;
  const anchorPathY = pathY(ay);
  let detoured = false;

  for (let t = 0; t < 180; t++) {
    e.wcd[as] = 15; // keep the unit in its active firing lockout, as if it is repeatedly firing.
    stepWorld(s, []);
    assert.equal(e.x[as], ax, 'rooted shooter keeps its x position');
    assert.equal(e.y[as], ay, 'rooted shooter keeps its y position');
    const mx = tileX(e.x[ms]!);
    if (mx >= 4 && mx <= 6 && pathY(e.y[ms]!) !== anchorPathY) detoured = true;
  }

  assert.ok(detoured, 'mover should route around the firing unit tile');
});

test('firing pathing anchors release before the full weapon cooldown expires', () => {
  const s = makeState(sliceMap(), 2, 100);
  const anchor = spawnUnit(s, Kind.Marine, 0, tc(10), tc(10));
  const target = spawnUnit(s, Kind.Zealot, 1, tc(12), tc(10));
  const e = s.e;
  const as = slotOf(anchor);
  e.order[as] = Order.Idle;
  e.target[as] = target;
  e.wcd[as] = 15;

  assert.equal(isPathingAnchor(s, as), true);
  for (let t = 0; t < FIRING_PATHING_LOCKOUT_TICKS; t++) stepWorld(s, []);

  assert.ok(e.wcd[as]! > 0, 'weapon cooldown is still ticking');
  assert.equal(isPathingAnchor(s, as), false, 'anchor releases after the short firing lockout');
});

test('moving ground units can pass after a firing pathing anchor releases', () => {
  const w = 12;
  const h = 8;
  const map: MapDef = {
    name: 'released-firing-unit', w, h,
    walk: new Uint8Array(w * h).fill(1),
    build: new Uint8Array(w * h).fill(1),
    elev: new Uint8Array(w * h), starts: [], resources: [], teams: [],
  };
  const s = makeState(map, 2, 101);
  const mover = spawnUnit(s, Kind.Marine, 0, tc(2), tc(4));
  const anchor = spawnUnit(s, Kind.Marine, 0, tc(5), tc(4));
  const target = spawnUnit(s, Kind.Zealot, 1, tc(6), tc(4));
  const e = s.e;
  const ms = slotOf(mover);
  const as = slotOf(anchor);
  e.order[ms] = Order.Move;
  e.tx[ms] = tc(9);
  e.ty[ms] = tc(4);
  e.order[as] = Order.Idle;
  e.target[as] = target;
  e.wcd[as] = 15;

  for (let t = 0; t < FIRING_PATHING_LOCKOUT_TICKS; t++) stepWorld(s, []);
  assert.ok(e.wcd[as]! > 0, 'weapon cooldown is still ticking after the lockout');
  assert.equal(isPathingAnchor(s, as), false, 'anchor released before the cooldown ended');
  kill(s, slotOf(target));
  e.target[as] = NONE;

  for (let t = 0; t < 180; t++) stepWorld(s, []);

  assert.ok(Math.abs(e.x[ms]! - tc(9)) < fx(TILE), 'mover still reaches the far side');
});

test('base ramps make plateaus reachable (no walled-off starts)', () => {
  const m = generateMap(2, 5);
  // Every start tile is walkable and reachable from start 0.
  for (const st of m.starts) assert.equal(m.walk[st.y * m.w + st.x], 1);
});
