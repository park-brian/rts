import test from 'node:test';
import assert from 'node:assert/strict';
import { Kind, TILE, Units } from '../src/data/index.ts';
import { fx } from '../src/fixed.ts';
import { entityApproachPoint } from '../src/entity/approach.ts';
import { spawnUnit } from '../src/entity/factory.ts';
import type { MapDef } from '../src/map/core.ts';
import { bodyBounds, topDownInteractionRect } from '../src/spatial/geometry.ts';
import { makeState, slotOf } from '../src/entity/world.ts';

const tc = (t: number): number => fx(t * TILE + (TILE >> 1));
const open = (w: number, h: number): MapDef => ({
  name: 'open', w, h, walk: new Uint8Array(w * h).fill(1), build: new Uint8Array(w * h).fill(1),
  elev: new Uint8Array(w * h), starts: [], resources: [], teams: [],
});

test('entity approach points target the closest structure footprint perimeter', () => {
  const s = makeState(open(32, 32), 1, 1);
  const e = s.e;
  const hatchery = slotOf(spawnUnit(s, Kind.Hatchery, 0, tc(14), tc(14)));
  const drone = slotOf(spawnUnit(s, Kind.Drone, 0, tc(14), tc(8)));

  const p = entityApproachPoint(s, drone, hatchery);
  const hatcheryRect = topDownInteractionRect(Kind.Hatchery, e.x[hatchery]!, e.y[hatchery]!, Units[Kind.Hatchery]!.roles);
  const droneBody = bodyBounds(Kind.Drone);

  assert.equal(p.y, hatcheryRect.y0 - droneBody.down);
  assert.equal(p.x, e.x[drone]);
});

test('entity approach points choose a neighboring perimeter slot when the closest point is occupied', () => {
  const s = makeState(open(32, 32), 1, 2);
  const e = s.e;
  const commandCenter = slotOf(spawnUnit(s, Kind.CommandCenter, 0, tc(14), tc(14)));
  const marine = slotOf(spawnUnit(s, Kind.Marine, 0, tc(14), tc(8)));
  const closest = entityApproachPoint(s, marine, commandCenter);

  spawnUnit(s, Kind.Marine, 0, closest.x, closest.y);
  const next = entityApproachPoint(s, marine, commandCenter);

  assert.equal(next.y, closest.y, 'the fallback stays on the nearest face when possible');
  assert.notEqual(next.x, closest.x, 'the occupied exact perimeter point is skipped');
});
