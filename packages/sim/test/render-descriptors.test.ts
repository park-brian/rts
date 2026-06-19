import test from 'node:test';
import assert from 'node:assert/strict';
import { EffectKind, Kind, Order, TILE, Units } from '../src/data.ts';
import { entityLifecycle } from '../src/entity/lifecycle.ts';
import { fx, ONE } from '../src/fixed.ts';
import { spawnUnit } from '../src/entity/factory.ts';
import { sliceMap } from '../src/map.ts';
import { eid, makeState, slotOf, spawnEffect } from '../src/entity/world.ts';
import { bodyBounds, topDownInteractionRect } from '../src/spatial/geometry.ts';
import {
  effectVisibilityAffordances, entityCloakOpacity, entityLifeBar, entityPresentation, entityRenderHull,
  entityMinimapVisible, entitySelectionName, illusionPresentation, selectionBase, workActivities,
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

test('entity cloak opacity exposes renderer-neutral cloak presentation policy', () => {
  const s = makeState(sliceMap(), 1, 81);
  const marine = slotOf(spawnUnit(s, Kind.Marine, 0, fx(500), fx(400)));
  const darkTemplar = slotOf(spawnUnit(s, Kind.DarkTemplar, 0, fx(540), fx(400)));
  const wraith = slotOf(spawnUnit(s, Kind.Wraith, 0, fx(580), fx(400)));

  assert.equal(entityCloakOpacity(s, marine), 1);
  assert.equal(entityCloakOpacity(s, darkTemplar), 0.5);

  s.e.cloakActive[wraith] = 1;
  assert.equal(entityCloakOpacity(s, wraith), 0.5);
});

test('entity minimap visibility is descriptor-backed and independent of render radius', () => {
  assert.equal(entityMinimapVisible(Kind.Scarab), false);
  assert.equal(entityMinimapVisible(Kind.Interceptor), true);
  assert.equal(entityMinimapVisible(Kind.Marine), true);
});

test('illusion presentation is known to owner, teammates, and spectators but hidden from enemies', () => {
  const s = makeState(sliceMap(), 3, 901);
  s.teams.set([0, 1, 0]);
  const marine = slotOf(spawnUnit(s, Kind.Marine, 0, fx(400), fx(400)));
  s.e.illusion[marine] = 1;

  assert.equal(illusionPresentation(s, 0, marine).known, true);
  assert.equal(illusionPresentation(s, 2, marine).known, true);
  assert.equal(illusionPresentation(s, -1, marine).known, true);
  assert.equal(illusionPresentation(s, 1, marine).known, false);
  assert.equal(illusionPresentation(s, 0, marine).labelPrefix, 'Hallucination ');
  assert.equal(illusionPresentation(s, 0, marine).alpha, 0.72);
  assert.deepEqual(illusionPresentation(s, 0, marine).tint, [0.62, 0.82, 1]);
  assert.deepEqual(illusionPresentation(s, 1, marine).tint, [1, 1, 1]);
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

test('entity render hulls match top-down interaction rectangles for Math mode', () => {
  const cases = [
    Kind.CommandCenter,
    Kind.Refinery,
    Kind.Geyser,
    Kind.Mineral,
    Kind.Marine,
    Kind.Zealot,
  ] as const;
  const x = fx(12 * TILE + (TILE >> 1));
  const y = fx(12 * TILE + (TILE >> 1));

  for (const kind of cases) {
    const hull = entityRenderHull(kind, x, y);
    const rect = topDownInteractionRect(kind, x, y, Units[kind]!.roles);
    assert.deepEqual(
      { x0: fx(hull.x0), y0: fx(hull.y0), x1: fx(hull.x1), y1: fx(hull.y1) },
      rect,
      Units[kind]!.name,
    );
  }
});

test('entity life bars expose selected life and lifecycle progress policy', () => {
  const s = makeState(sliceMap(), 1, 82);
  const e = s.e;
  const marine = slotOf(spawnUnit(s, Kind.Marine, 0, fx(512), fx(448)));
  const mineral = slotOf(spawnUnit(s, Kind.Mineral, 0, fx(560), fx(448)));

  assert.equal(entityLifeBar(s, marine, false), undefined);
  assert.equal(entityLifeBar(s, mineral, true), undefined);

  e.hp[marine] = Math.trunc(Units[Kind.Marine]!.hp / 2);
  const life = entityLifeBar(s, marine, true)!;
  const hull = entityRenderHull(Kind.Marine, e.x[marine]!, e.y[marine]!);
  assert.equal(life.kind, 'life');
  assert.equal(life.x, hull.cx);
  assert.equal(life.y, hull.y0);
  assert.equal(life.width, Math.max(2, hull.width));
  assert.equal(life.fraction, e.hp[marine]! / Units[Kind.Marine]!.hp);

  const depot = slotOf(spawnUnit(s, Kind.SupplyDepot, 0, fx(430), fx(400)));
  e.built[depot] = 0;
  e.ctimer[depot] = Math.trunc(Units[Kind.SupplyDepot]!.buildTime / 2);
  const construction = entityLifeBar(s, depot, true)!;
  assert.equal(construction.kind, 'construction');
  assert.equal(construction.fraction, entityLifecycle(s, depot).progress);

  const lurker = unfinished(s, Kind.Lurker, Kind.Hydralisk);
  e.ctimer[lurker] = Math.trunc(Units[Kind.Lurker]!.buildTime / 4);
  const morph = entityLifeBar(s, lurker, true)!;
  assert.equal(morph.kind, 'construction');
  assert.equal(morph.fraction, entityLifecycle(s, lurker).progress);
});

test('effect visibility affordances expose scan and nuke presentation policy', () => {
  const s = makeState(sliceMap(), 2, 78);
  const farX = fx(54 * TILE + TILE / 2);
  const farY = fx(54 * TILE + TILE / 2);
  spawnEffect(s, EffectKind.ScannerSweep, 1, farX, farY, fx(5 * TILE), 20, 0, 0);

  const hidden = effectVisibilityAffordances(s, { viewer: 0, tileVisible: () => 0 });
  assert.deepEqual(hidden, []);

  spawnEffect(s, EffectKind.ScannerSweep, 0, farX, farY, fx(5 * TILE), 20, 0, 0);
  const owned = effectVisibilityAffordances(s, { viewer: 0, tileVisible: () => 0 });
  assert.equal(owned.length, 1);
  assert.equal(owned[0]?.kind, 'scan');
  assert.equal(owned[0]?.x, farX / ONE);

  const nukeState = makeState(sliceMap(), 2, 79);
  spawnEffect(nukeState, EffectKind.NuclearStrike, 1, farX, farY, fx(6 * TILE), 40, 0, 500);
  assert.deepEqual(effectVisibilityAffordances(nukeState, { viewer: 0, tileVisible: () => 0 }), []);
  const explored = effectVisibilityAffordances(nukeState, { viewer: 0, tileVisible: () => 1 });
  assert.equal(explored.length, 1);
  assert.equal(explored[0]?.kind, 'nuke');
  assert.equal(explored[0]?.timer, 40);
});

test('work activities expose construction and repair spark policy from sim state', () => {
  const s = makeState(sliceMap(), 1, 80);
  const e = s.e;
  const scv = slotOf(spawnUnit(s, Kind.SCV, 0, fx(400), fx(400)));
  const depot = slotOf(spawnUnit(s, Kind.SupplyDepot, 0, fx(430), fx(400)));
  e.built[depot] = 0;
  e.ctimer[depot] = Units[Kind.SupplyDepot]!.buildTime;
  e.order[scv] = Order.Build;
  e.buildKind[scv] = Kind.None;
  e.target[scv] = eid(e, depot);
  e.target[depot] = eid(e, scv);

  const [build] = workActivities(s);
  assert.equal(build?.kind, 'build');
  assert.equal(build?.worker, scv);
  assert.equal(build?.target, depot);
  assert.ok(build.x <= e.x[scv]!);

  const tank = slotOf(spawnUnit(s, Kind.SiegeTank, 0, fx(410), fx(400)));
  e.hp[tank] = Units[Kind.SiegeTank]!.hp - 25;
  e.order[scv] = Order.Repair;
  e.target[scv] = eid(e, tank);

  const [repair] = workActivities(s);
  assert.equal(repair?.kind, 'repair');
  assert.equal(repair?.worker, scv);
  assert.equal(repair?.target, tank);
});
