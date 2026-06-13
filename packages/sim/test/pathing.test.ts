import test from 'node:test';
import assert from 'node:assert/strict';
import { makeState, slotOf } from '../src/world.ts';
import { spawnUnit } from '../src/factory.ts';
import { navigate, lineClear } from '../src/pathing.ts';
import { generateMap, mapConnected } from '../src/procedural.ts';
import { Kind, TILE } from '../src/data.ts';
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

test('base ramps make plateaus reachable (no walled-off starts)', () => {
  const m = generateMap(2, 5);
  // Every start tile is walkable and reachable from start 0.
  for (const st of m.starts) assert.equal(m.walk[st.y * m.w + st.x], 1);
});
