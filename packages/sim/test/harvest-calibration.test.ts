import test from 'node:test';
import assert from 'node:assert/strict';
import { generateMap } from '../src/procedural.ts';
import { spawnUnit } from '../src/entity/factory.ts';
import {
  baseGasRouteCalibrations,
  baseGasRouteQuality,
  baseGasRoutesValid,
  calibrateMineralRoute,
  gasTimingProfile,
  mainBaseMineralRouteQuality,
  mainBaseMineralRouteCalibrations,
  mainBaseMineralRoutesValid,
  mineralTimingProfile,
  type HarvestCalibrationBase,
} from '../src/map/harvest-calibration.ts';
import { resourceSpawnCenterPx, sliceMap, solveBaseCluster, type BaseResourceDir, type MapDef, type ResourceSpawn } from '../src/map/core.ts';
import { Kind, TILE } from '../src/data.ts';
import { makeState, NEUTRAL, slotOf } from '../src/entity/world.ts';
import { topDownEdgeDistance } from '../src/spatial/geometry.ts';

const withWalkBarrier = (map: ReturnType<typeof sliceMap>): ReturnType<typeof sliceMap> => ({
  ...map,
  walk: new Uint8Array(map.walk),
  build: new Uint8Array(map.build),
  elev: new Uint8Array(map.elev),
  starts: map.starts.map((start) => ({ ...start })),
  resources: map.resources.map((resource) => ({ ...resource })),
  teams: [...map.teams],
  bases: map.bases?.map((base) => ({ ...base })),
});

const sideBaseMap = (dir: Extract<BaseResourceDir, 'east' | 'west'>): MapDef => {
  const w = 96;
  const h = 96;
  const start = { x: 48, y: 48 };
  const cluster = solveBaseCluster(start, dir);
  return {
    name: `side-base-${dir}`,
    w,
    h,
    walk: new Uint8Array(w * h).fill(1),
    build: new Uint8Array(w * h).fill(1),
    elev: new Uint8Array(w * h),
    starts: [start],
    resources: cluster.resources,
    teams: [0],
    bases: [{
      kind: 'main',
      team: 0,
      owner: 0,
      x: start.x,
      y: start.y,
      depotFootprint: cluster.depotFootprint,
      reservation: cluster.reservation,
      resourceDir: dir,
    }],
  };
};

test('main-base mineral diagnostics expose positive-only BW route slack data', () => {
  const map = sliceMap();
  const profile = mineralTimingProfile(Kind.SCV, Kind.CommandCenter);
  const entries = mainBaseMineralRouteCalibrations(map, profile);

  assert.equal(entries.length, map.starts.length * 8);
  for (const entry of entries) {
    assert.equal(entry.workerKind, Kind.SCV);
    assert.equal(entry.depotKind, Kind.CommandCenter);
    assert.equal(entry.mineFrames, 80);
    assert.equal(entry.targetRouteFrames, 97);
    assert.equal(entry.actualRouteFrames <= entry.targetRouteFrames + entry.toleranceFrames, true);
    assert.equal(entry.slackFrames, Math.max(0, entry.targetRouteFrames - entry.actualRouteFrames));
    assert.equal(entry.slackFrames >= 0, true);
    assert.equal(entry.valid, true);
    assert.equal(entry.routeDistanceFx > 0, true);
  }

  for (const base of map.starts.keys()) {
    assert.equal(entries.filter((entry) => entry.baseIndex === base).length, 8);
  }
});

test('harvest route diagnostics use path-lattice detours instead of straight distance', () => {
  const baseline = sliceMap();
  const baselineMinerals = mainBaseMineralRouteCalibrations(baseline);
  const baselineGas = baseGasRouteCalibrations(baseline);
  const blocked = withWalkBarrier(sliceMap());

  for (let x = 20; x < blocked.w; x++) {
    const y = 81;
    blocked.walk[y * blocked.w + x] = 0;
    blocked.build[y * blocked.w + x] = 0;
  }

  const mineralQuality = mainBaseMineralRouteQuality(blocked);
  const gasQuality = baseGasRouteQuality(blocked);
  const blockedMinerals = mineralQuality.entries.filter((entry) => entry.baseIndex === 0);
  const blockedGas = gasQuality.entries.find((entry) => entry.baseIndex === 0)!;

  assert.equal(baselineMinerals.every((entry) => entry.valid), true);
  assert.equal(baselineGas.every((entry) => entry.valid), true);
  assert.equal(blockedMinerals.some((entry) =>
    entry.actualRouteFrames > baselineMinerals[entry.resourceOrder]!.actualRouteFrames + 4,
  ), true);
  assert.equal(mineralQuality.issues.some((issue) => issue.kind === 'invalid-route' && issue.baseIndex === 0), true);
  assert.equal(blockedGas.actualRouteFrames > baselineGas.find((entry) => entry.baseIndex === 0)!.actualRouteFrames + 4, true);
  assert.equal(gasQuality.issues.some((issue) => issue.kind === 'invalid-gas-route' && issue.baseIndex === 0), true);
});

test('generated main bases produce calibration rows for every main mineral patch', () => {
  const map = generateMap(2, 44, { midfield: 'blocks' });
  const mainBases = map.bases?.filter((base) => base.kind === 'main') ?? [];
  const entries = mainBaseMineralRouteCalibrations(map, mineralTimingProfile(Kind.SCV, Kind.CommandCenter));

  assert.equal(mainBases.length, 4);
  assert.equal(entries.length, mainBases.length * 8);
  assert.equal(entries.every((entry) => entry.valid), true);
  assert.equal(mainBaseMineralRoutesValid(map), true);
  for (const base of mainBases.keys()) {
    assert.equal(entries.filter((entry) => entry.baseIndex === base).length, 8);
  }
});

test('harvest diagnostics support side-facing base resource directions', () => {
  for (const dir of ['east', 'west'] as const) {
    const map = sideBaseMap(dir);
    const minerals = mainBaseMineralRouteCalibrations(map, mineralTimingProfile(Kind.SCV, Kind.CommandCenter));
    const gas = baseGasRouteQuality(map, { profile: gasTimingProfile(Kind.SCV, Kind.CommandCenter) });

    assert.equal(minerals.length, 8, dir);
    assert.equal(minerals.every((entry) => entry.valid), true, dir);
    assert.equal(mainBaseMineralRoutesValid(map), true, dir);
    assert.equal(gas.ok, true, dir);
  }
});

test('base gas diagnostics validate the three-worker refinery cadence target', () => {
  const map = generateMap(2, 44, { midfield: 'blocks' });
  const bases = map.bases ?? [];
  const profile = gasTimingProfile(Kind.SCV, Kind.CommandCenter);
  const entries = baseGasRouteCalibrations(map, profile);

  assert.equal(entries.length, bases.length);
  assert.equal(baseGasRoutesValid(map), true);
  for (const entry of entries) {
    assert.equal(entry.workerKind, Kind.SCV);
    assert.equal(entry.depotKind, Kind.CommandCenter);
    assert.equal(entry.gasKind, Kind.Refinery);
    assert.equal(entry.targetWorkers, 3);
    assert.equal(entry.mineFrames, 37);
    assert.equal(entry.targetRouteFrames, 89);
    assert.equal(Math.abs(entry.actualRouteFrames - entry.targetRouteFrames) <= entry.toleranceFrames, true);
    assert.equal(entry.valid, true);
    assert.equal(entry.routeDistanceFx > 0, true);
  }
});

test('main-base route quality reports missing and overly asymmetric layouts', () => {
  const invalid = sliceMap();
  invalid.resources = invalid.resources.map((resource, index) =>
    index === 0
      ? { ...resource, px: invalid.starts[0]!.x * TILE + (TILE >> 1), py: (invalid.starts[0]!.y - 10) * TILE + (TILE >> 1) }
      : resource,
  );
  const invalidQuality = mainBaseMineralRouteQuality(invalid);
  assert.equal(invalidQuality.ok, false);
  assert.equal(invalidQuality.issues.some((issue) => issue.kind === 'missing-main-minerals'), true);

  const asymmetric = sliceMap();
  asymmetric.resources = asymmetric.resources.map((resource, index) =>
    index === 0
      ? { ...resource, px: asymmetric.starts[0]!.x * TILE + (TILE >> 1), py: (asymmetric.starts[0]!.y - 4) * TILE + (TILE >> 1) }
      : resource,
  );
  const asymmetricQuality = mainBaseMineralRouteQuality(asymmetric);
  assert.equal(asymmetricQuality.ok, false);
  assert.equal(asymmetricQuality.issues.some((issue) => issue.kind === 'base-route-spread'), true);
  assert.equal(asymmetricQuality.issues.some((issue) => issue.kind === 'resource-order-route-spread'), true);
});

test('gas route quality reports invalid refinery cadence layouts', () => {
  const invalid = sliceMap();
  const start = invalid.starts[0]!;
  invalid.resources = invalid.resources.map((resource, index) =>
    index === 8
      ? { ...resource, px: start.x * TILE + (TILE >> 1), py: (start.y - 3) * TILE + (TILE >> 1) }
      : resource,
  );
  const quality = baseGasRouteQuality(invalid);

  assert.equal(quality.ok, false);
  assert.equal(quality.issues.some((issue) => issue.kind === 'invalid-gas-route'), true);
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

test('routes longer than the BW target are invalid instead of receiving negative slack', () => {
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
  assert.equal(entry.slackFrames, 0);
});
