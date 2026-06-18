import test from 'node:test';
import assert from 'node:assert/strict';
import { Kind } from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import { spawnUnit } from '../src/factory.ts';
import { sliceMap } from '../src/map.ts';
import { makeState, slotOf } from '../src/world.ts';
import { entityPresentation, entitySelectionName } from '../src/render-descriptors.ts';

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
