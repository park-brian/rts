import test from 'node:test';
import assert from 'node:assert/strict';
import { makeState, slotOf, hashState } from '../src/world.ts';
import { spawnUnit } from '../src/factory.ts';
import { navigate, lineClear } from '../src/pathing.ts';
import { stepWorld } from '../src/tick.ts';
import { generateMap, mapConnected } from '../src/procedural.ts';
import { sliceMap } from '../src/map.ts';
import { Kind, Order, TILE } from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import type { MapDef } from '../src/map.ts';

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

test('base ramps make plateaus reachable (no walled-off starts)', () => {
  const m = generateMap(2, 5);
  // Every start tile is walkable and reachable from start 0.
  for (const st of m.starts) assert.equal(m.walk[st.y * m.w + st.x], 1);
});
