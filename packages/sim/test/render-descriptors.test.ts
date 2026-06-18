import test from 'node:test';
import assert from 'node:assert/strict';
import { Kind, TILE, Units } from '../src/data.ts';
import { fx, ONE } from '../src/fixed.ts';
import { spawnUnit } from '../src/factory.ts';
import { sliceMap } from '../src/map.ts';
import { makeState, slotOf } from '../src/world.ts';
import { bodyBounds } from '../src/spatial.ts';
import {
  entityPresentation, entityRenderHull, entitySelectionName, selectionBase,
} from '../src/render-descriptors.ts';

const unfinished = (s: ReturnType<typeof makeState>, kind: number, from: number = Kind.None): number => {
  const id = spawnUnit(s, kind, 0, fx(400), fx(400));
  const slot = slotOf(id);
  s.e.built[slot] = 0;
  s.e.morphFromKind[slot] = from;
  return slot;
};

test('entity lifecycle presentation is descriptor-backed in the sim', () => {
  const s = makeState(sliceMap(), 1, 77);

  const lurker = unfinished(s, Kind.Lurker, Kind.Hydralisk);
  assert.deepEqual(entityPresentation(s, lurker), {
    state: 'zerg-combat-morph',
    artKind: Kind.Egg,
    selectionPrefix: 'Morphing ',
  });
  assert.equal(entitySelectionName(s, lurker), 'Morphing Lurker');

  const lair = unfinished(s, Kind.Lair, Kind.Hatchery);
  assert.deepEqual(entityPresentation(s, lair), {
    state: 'zerg-structure-morph',
    artKind: Kind.Lair,
    selectionPrefix: 'Morphing ',
  });

  const archon = unfinished(s, Kind.Archon);
  assert.deepEqual(entityPresentation(s, archon), {
    state: 'protoss-merge-summon',
    artKind: Kind.Archon,
    selectionPrefix: 'Summoning ',
  });

  const gateway = unfinished(s, Kind.Gateway);
  assert.deepEqual(entityPresentation(s, gateway), {
    state: 'protoss-warp-in',
    artKind: Kind.Gateway,
    selectionPrefix: 'Warping ',
  });

  const depot = unfinished(s, Kind.SupplyDepot);
  assert.deepEqual(entityPresentation(s, depot), {
    state: 'terran-construction',
    artKind: Kind.SupplyDepot,
    selectionPrefix: 'Building ',
  });

  const marine = slotOf(spawnUnit(s, Kind.Marine, 0, fx(500), fx(400)));
  assert.deepEqual(entityPresentation(s, marine), {
    state: 'normal',
    artKind: Kind.Marine,
    selectionPrefix: '',
  });
});

test('entity render hulls and selection bases expose gameplay math', () => {
  const ccX = fx(400);
  const ccY = fx(400);
  const cc = entityRenderHull(Kind.CommandCenter, ccX, ccY);
  assert.equal(cc.usesFootprint, true);
  assert.equal(cc.width, Units[Kind.CommandCenter]!.footprintW * TILE);
  assert.equal(cc.height, Units[Kind.CommandCenter]!.footprintH * TILE);
  assert.equal(cc.cx, 384);
  assert.equal(cc.cy, 400);

  const marineX = fx(512);
  const marineY = fx(448);
  const marine = entityRenderHull(Kind.Marine, marineX, marineY);
  const marineBody = bodyBounds(Kind.Marine);
  assert.equal(marine.usesFootprint, false);
  assert.equal(marine.x0, 512 - marineBody.left / ONE);
  assert.equal(marine.y0, 448 - marineBody.up / ONE);
  assert.equal(marine.x1, 512 + marineBody.right / ONE);
  assert.equal(marine.y1, 448 + marineBody.down / ONE);

  const ccBase = selectionBase(Kind.CommandCenter);
  assert.deepEqual(ccBase, {
    shape: 'rect',
    width: Units[Kind.CommandCenter]!.footprintW * TILE,
    height: Units[Kind.CommandCenter]!.footprintH * TILE,
    offsetX: -TILE / 2,
    offsetY: 0,
  });

  const marineBase = selectionBase(Kind.Marine);
  assert.deepEqual(marineBase, {
    shape: 'circle',
    radius: Units[Kind.Marine]!.radius / ONE,
    offsetX: 0,
    offsetY: 0,
  });
});
