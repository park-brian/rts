import test from 'node:test';
import assert from 'node:assert/strict';
import { generateMap } from '../src/procedural.ts';
import { spawnUnit } from '../src/factory.ts';
import {
  calibrateMineralRoute,
  mainBaseMineralRouteCalibrations,
  mineralTimingProfile,
  type HarvestCalibrationBase,
} from '../src/harvest-calibration.ts';
import { resourceSpawnCenterPx, sliceMap, type ResourceSpawn } from '../src/map.ts';
import { Kind, TILE } from '../src/data.ts';
import { makeState, NEUTRAL, slotOf } from '../src/world.ts';
import { topDownEdgeDistance } from '../src/spatial.ts';

test('main-base mineral calibration exposes positive-only BW route timing data', () => {
  const map = sliceMap();
  const profile = mineralTimingProfile(Kind.SCV, Kind.CommandCenter);
  const entries = mainBaseMineralRouteCalibrations(map, profile);

  assert.equal(entries.length, map.starts.length * 8);
  for (const entry of entries) {
    assert.equal(entry.workerKind, Kind.SCV);
    assert.equal(entry.depotKind, Kind.CommandCenter);
    assert.equal(entry.mineFrames, 80);
    assert.equal(entry.targetRouteFrames, 97);
    assert.equal(entry.actualRouteFrames <= entry.targetRouteFrames, true);
    assert.equal(entry.waitFrames, entry.targetRouteFrames - entry.actualRouteFrames);
    assert.equal(entry.waitFrames >= 0, true);
    assert.equal(entry.valid, true);
    assert.equal(entry.routeDistanceFx > 0, true);
  }

  for (const base of map.starts.keys()) {
    assert.equal(entries.filter((entry) => entry.baseIndex === base).length, 8);
  }
});

test('generated main bases produce calibration rows for every main mineral patch', () => {
  const map = generateMap(2, 44, { midfield: 'blocks' });
  const mainBases = map.bases?.filter((base) => base.kind === 'main') ?? [];
  const entries = mainBaseMineralRouteCalibrations(map, mineralTimingProfile(Kind.SCV, Kind.CommandCenter));

  assert.equal(mainBases.length, 4);
  assert.equal(entries.length, mainBases.length * 8);
  assert.equal(entries.every((entry) => entry.valid), true);
  for (const base of mainBases.keys()) {
    assert.equal(entries.filter((entry) => entry.baseIndex === base).length, 8);
  }
});

test('calibration dock points are physical contact points, not detached BW range', () => {
  const map = sliceMap();
  const entries = mainBaseMineralRouteCalibrations(map);
  const sample = [entries[0]!, entries[3]!, entries[7]!];

  for (const entry of sample) {
    const s = makeState(map, 1, 1);
    const e = s.e;
    const depot = slotOf(spawnUnit(s, entry.depotKind, 0, entry.depotCenter.x, entry.depotCenter.y));
    const mineral = slotOf(spawnUnit(s, Kind.Mineral, NEUTRAL, entry.resourceCenter.x, entry.resourceCenter.y));
    const mineWorker = slotOf(spawnUnit(s, entry.workerKind, 0, entry.mineralDock.x, entry.mineralDock.y));
    const depositWorker = slotOf(spawnUnit(s, entry.workerKind, 0, entry.depotDock.x, entry.depotDock.y));

    assert.equal(topDownEdgeDistance(s, mineWorker, mineral), 0);
    assert.equal(topDownEdgeDistance(s, depositWorker, depot), 0);
    assert.notDeepEqual(entry.mineralDock, entry.resourceCenter);
    assert.notDeepEqual(entry.depotDock, entry.depotCenter);
    assert.equal(e.kind[mineWorker], entry.workerKind);
  }
});

test('routes longer than the BW target are invalid instead of receiving negative wait frames', () => {
  const map = sliceMap();
  const start = map.starts[0]!;
  const base: HarvestCalibrationBase = {
    kind: 'main',
    team: 0,
    owner: 0,
    x: start.x,
    y: start.y,
    resourceDir: -1,
  };
  const farMineral: ResourceSpawn = {
    ...map.resources[0]!,
    px: start.x * TILE + (TILE >> 1),
    py: (start.y - 12) * TILE + (TILE >> 1),
  };
  const entry = calibrateMineralRoute(base, farMineral, 0, 0, mineralTimingProfile(Kind.SCV, Kind.CommandCenter));
  const center = resourceSpawnCenterPx(farMineral);

  assert.equal(center.y < start.y * TILE, true);
  assert.equal(entry.actualRouteFrames > entry.targetRouteFrames + entry.toleranceFrames, true);
  assert.equal(entry.valid, false);
  assert.equal(entry.waitFrames, 0);
});
