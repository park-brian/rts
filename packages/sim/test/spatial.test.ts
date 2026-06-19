import test from 'node:test';
import assert from 'node:assert/strict';
import { Kind, Role, TILE, Units, bwRange } from '../src/data.ts';
import {
  BW_BODY_BOUNDS,
  bodyBounds,
  bwApproxEdgeDistance,
  topDownEdgeDistance,
  topDownInteractionRect,
} from '../src/spatial/geometry.ts';
import { fx, ONE } from '../src/fixed.ts';
import { makeState, slotOf } from '../src/entity/world.ts';
import { spawnUnit } from '../src/entity/factory.ts';
import type { MapDef } from '../src/map.ts';

test('current unit registry has explicit BW body bounds', () => {
  for (const kind of Object.keys(Units).map(Number)) {
    assert.ok(BW_BODY_BOUNDS[kind], `${Units[kind]!.name} is missing BW body bounds`);
  }
});

test('building and resource bodies preserve BW footprint-relevant dimensions', () => {
  assert.deepEqual(bodyBounds(Kind.Nexus), { left: fx(56), up: fx(39), right: fx(56), down: fx(39) });
  assert.deepEqual(bodyBounds(Kind.CommandCenter), { left: fx(58), up: fx(41), right: fx(58), down: fx(41) });
  assert.deepEqual(bodyBounds(Kind.Gateway), { left: fx(48), up: fx(32), right: fx(48), down: fx(40) });
  assert.deepEqual(bodyBounds(Kind.Geyser), { left: fx(64), up: fx(32), right: fx(63), down: fx(31) });
});

test('top-down structure interaction uses build footprint hulls, not smaller BW body boxes', () => {
  const x = fx(12 * TILE + (TILE >> 1));
  const y = fx(12 * TILE + (TILE >> 1));
  const rect = topDownInteractionRect(Kind.CommandCenter, x, y, Units[Kind.CommandCenter]!.roles);

  assert.deepEqual(rect, {
    x0: fx(10 * TILE),
    y0: fx(11 * TILE),
    x1: fx(14 * TILE),
    y1: fx(14 * TILE),
  });
});

test('top-down footprint actors fill their whole grid square for interaction', () => {
  const x = fx(12 * TILE + (TILE >> 1));
  const y = fx(12 * TILE + (TILE >> 1));
  const cases = [
    [Kind.CommandCenter, Units[Kind.CommandCenter]!.roles],
    [Kind.Refinery, Units[Kind.Refinery]!.roles],
    [Kind.Geyser, Units[Kind.Geyser]!.roles],
    [Kind.Mineral, Units[Kind.Mineral]!.roles],
  ] as const;

  for (const [kind, flags] of cases) {
    const rect = topDownInteractionRect(kind, x, y, flags);
    assert.equal(rect.x1 - rect.x0, fx(Units[kind]!.footprintW * TILE), Units[kind]!.name);
    assert.equal(rect.y1 - rect.y0, fx(Units[kind]!.footprintH * TILE), Units[kind]!.name);
  }
});

test('BW approximate edge distance stays distinct from top-down physical distance', () => {
  const map: MapDef = {
    name: 'open', w: 24, h: 24,
    walk: new Uint8Array(24 * 24).fill(1),
    build: new Uint8Array(24 * 24).fill(1),
    elev: new Uint8Array(24 * 24), starts: [], resources: [], teams: [],
  };
  const s = makeState(map, 2, 1);
  const a = slotOf(spawnUnit(s, Kind.Marine, 0, fx(400), fx(400)));
  const b = slotOf(spawnUnit(s, Kind.Marine, 1, fx(545), fx(400)));

  assert.equal(bwApproxEdgeDistance(s, a, b), bwRange(128));
  assert.equal(topDownEdgeDistance(s, a, b), bwRange(129));
});

test('tile centers and fixed pixels keep the coordinate contract exact', () => {
  const tile = 12;
  const center = fx(tile * TILE + (TILE >> 1));

  assert.equal(center / ONE, 400);
  assert.equal(Math.floor(center / (TILE * ONE)), tile);
  assert.equal(fx((tile + 1) * TILE) - fx(tile * TILE), fx(TILE));
  assert.notEqual(Units[Kind.CommandCenter]!.roles & Role.Structure, 0);
});
