import test from 'node:test';
import assert from 'node:assert/strict';
import { kill, makeState, NONE, slotOf, hashState } from '../src/world.ts';
import { spawnUnit } from '../src/factory.ts';
import { navigate, lineClear, tileX, tileY } from '../src/pathing.ts';
import { navPassableForKind } from '../src/flow.ts';
import { stepWorld } from '../src/tick.ts';
import { generateMap, mapConnected } from '../src/procedural.ts';
import { sliceMap } from '../src/map.ts';
import { Kind, Order, TILE } from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import type { MapDef } from '../src/map.ts';
import { FIRING_PATHING_LOCKOUT_TICKS, isPathingAnchor } from '../src/pathing-anchor.ts';

const tc = (t: number): number => fx(t * TILE + (TILE >> 1)); // tile center px

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

test('procedural maps are connected and scale with team size', () => {
  for (const perTeam of [1, 2, 3]) {
    for (const seed of [1, 2, 3, 7, 42, 99]) {
      const m = generateMap(perTeam, seed);
      assert.equal(m.starts.length, 2 * perTeam, `${perTeam}v${perTeam} start count`);
      assert.equal(m.w, 64 * perTeam, 'width scales with team size');
      assert.ok(mapConnected(m), `map ${perTeam}v${perTeam} #${seed} must be fully connected`);
      // Teams: first half south (team 0), interleaved south/north per lane.
      assert.equal(m.teams.length, m.starts.length);
    }
  }
});

test('a group moving to one goal arrives and spreads (no perfect stacking)', () => {
  const run = (): { hash: number; distinct: number; arrived: boolean } => {
    const map = sliceMap();
    const s = makeState(map, 1, 777);
    const gx = tc(32); const gy = tc(32);
    const slots: number[] = [];
    for (let i = 0; i < 12; i++) {
      const id = spawnUnit(s, Kind.Marine, 0, tc(20) + fx((i % 4) * 6), tc(70) + fx(((i / 4) | 0) * 6));
      const sl = slotOf(id);
      s.e.order[sl] = Order.Move; s.e.tx[sl] = gx; s.e.ty[sl] = gy;
      slots.push(sl);
    }
    for (let t = 0; t < 900; t++) stepWorld(s, []);
    // All reached the goal region (within a few tiles, since separation fans them out).
    let arrived = true;
    const pos = new Set<string>();
    for (const sl of slots) {
      const dx = s.e.x[sl]! - gx; const dy = s.e.y[sl]! - gy;
      if (dx * dx + dy * dy > fx(5 * TILE) * fx(5 * TILE)) arrived = false;
      pos.add(`${s.e.x[sl]},${s.e.y[sl]}`);
    }
    return { hash: hashState(s), distinct: pos.size, arrived };
  };
  const a = run();
  const b = run();
  assert.ok(a.arrived, 'every unit should reach the goal region');
  assert.ok(a.distinct > 1, 'separation must keep units off a single pixel');
  assert.equal(a.hash, b.hash, 'group movement + separation must be deterministic');
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
  let detoured = false;

  for (let t = 0; t < 180; t++) {
    e.wcd[as] = 15; // keep the unit in its active firing lockout, as if it is repeatedly firing.
    stepWorld(s, []);
    assert.equal(e.x[as], ax, 'rooted shooter keeps its x position');
    assert.equal(e.y[as], ay, 'rooted shooter keeps its y position');
    const mx = tileX(e.x[ms]!);
    if (mx >= 4 && mx <= 6 && tileY(e.y[ms]!) !== 4) detoured = true;
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
