import test from 'node:test';
import assert from 'node:assert/strict';
import { makeState } from '../src/entity/world.ts';
import { Kind, TILE, Units } from '../src/data/index.ts';
import { fx, ONE } from '../src/fixed.ts';
import {
  BASE_EAST_MINERAL_ARC_OFFSETS,
  BASE_GAS_DOCK_DISTANCE_PX,
  BASE_MINERAL_ARC_OFFSETS,
  BASE_MINERAL_DOCK_DISTANCE_PX,
  BASE_WEST_MINERAL_ARC_OFFSETS,
  baseResourceDockDistance,
  resourceDirVector,
  resourceFootprintsOverlap,
  resourceSpawnCenterPx,
  resourceSpawnFootprint,
  sliceMap,
  solveBaseCluster,
  type BaseResourceDir,
  type ResourceFootprint,
} from '../src/map/core.ts';
import { placementForStructure } from '../src/commands/validate.ts';

const tc = (t: number): number => fx(t * TILE + (TILE >> 1));
const tileCenter = (t: number): number => t * TILE + (TILE >> 1);

const localCenter = (
  start: { x: number; y: number },
  dir: BaseResourceDir,
  offset: { dx: number; dy: number },
): { x: number; y: number } => {
  const f = resourceDirVector(dir);
  const side = f.x === 0 ? { x: 1, y: 0 } : { x: 0, y: 1 };
  return {
    x: tileCenter(start.x + side.x * offset.dx + f.x * offset.dy),
    y: tileCenter(start.y + side.y * offset.dx + f.y * offset.dy),
  };
};

const assertClusterCadence = (start: { x: number; y: number }, dir: BaseResourceDir, spreadLimit = 24): void => {
  const cluster = solveBaseCluster(start, dir);
  const f = resourceDirVector(dir);
  const depot = { x: tileCenter(start.x), y: tileCenter(start.y) };
  const mineralDistances: number[] = [];
  const footprints: ResourceFootprint[] = [cluster.depotFootprint];
  let gasDistance = 0;

  for (const resource of cluster.resources) {
    const center = resourceSpawnCenterPx(resource);
    const fp = resourceSpawnFootprint(resource);
    assert.equal(footprints.some((other) => resourceFootprintsOverlap(other, fp)), false);
    footprints.push(fp);
    assert.ok((center.x - depot.x) * f.x + (center.y - depot.y) * f.y > 0, `${dir} resource is behind the depot`);
    const d = baseResourceDockDistance(resource.gas ? Kind.Refinery : Kind.Mineral, start.x, start.y, center.x, center.y);
    if (resource.gas) gasDistance = d;
    else mineralDistances.push(d);
  }

  const avgMineral = mineralDistances.reduce((sum, d) => sum + d, 0) / mineralDistances.length;
  assert.equal(mineralDistances.length, 8);
  assert.ok(Math.max(...mineralDistances) - Math.min(...mineralDistances) <= fx(spreadLimit));
  assert.ok(Math.abs(avgMineral - fx(BASE_MINERAL_DOCK_DISTANCE_PX)) <= fx(3),
    `${dir} mineral average ${(avgMineral / ONE).toFixed(2)} px`);
  const targetGasFrames = Math.trunc((2 * fx(BASE_GAS_DOCK_DISTANCE_PX) + Units[Kind.SCV]!.speed - 1) / Units[Kind.SCV]!.speed);
  const gasFrames = Math.trunc((2 * gasDistance + Units[Kind.SCV]!.speed - 1) / Units[Kind.SCV]!.speed);
  assert.ok(Math.abs(gasFrames - targetGasFrames) <= 2, `${dir} gas frames ${gasFrames}`);
};

test('slice map start resources keep integer grid footprints and bounded top-down dock arcs', () => {
  const map = sliceMap();
  const resourcesPerStart = 9;
  const allFootprints: ResourceFootprint[] = [];

  for (let startIndex = 0; startIndex < map.starts.length; startIndex++) {
    const start = map.starts[startIndex]!;
    const mineralDistances: number[] = [];
    const gasDistances: number[] = [];

    for (const r of map.resources.slice(startIndex * resourcesPerStart, (startIndex + 1) * resourcesPerStart)) {
      const center = resourceSpawnCenterPx(r);
      const fp = resourceSpawnFootprint(r);

      assert.equal(Number.isInteger(center.x), true);
      assert.equal(Number.isInteger(center.y), true);
      assert.equal(Number.isInteger(fp.x0), true);
      assert.equal(Number.isInteger(fp.y0), true);
      assert.equal(allFootprints.some((other) => resourceFootprintsOverlap(other, fp)), false);
      allFootprints.push(fp);

      const d = baseResourceDockDistance(r.gas ? Kind.Refinery : Kind.Mineral, start.x, start.y, center.x, center.y);
      (r.gas ? gasDistances : mineralDistances).push(d);
    }

    const minMineral = Math.min(...mineralDistances);
    const maxMineral = Math.max(...mineralDistances);
    assert.equal(mineralDistances.length, 8);
    assert.equal(gasDistances.length, 1);
    const avgMineral = mineralDistances.reduce((sum, d) => sum + d, 0) / mineralDistances.length;
    assert.ok(maxMineral - minMineral <= fx(24), `mineral dock arc spread exceeded 24 px at start ${startIndex}`);
    assert.ok(Math.abs(avgMineral - fx(BASE_MINERAL_DOCK_DISTANCE_PX)) <= fx(1),
      `mineral dock average left the 3-worker band at start ${startIndex}: ${(avgMineral / ONE).toFixed(2)} px`);
    const targetGasFrames = Math.trunc((2 * fx(BASE_GAS_DOCK_DISTANCE_PX) + Units[Kind.SCV]!.speed - 1) / Units[Kind.SCV]!.speed);
    assert.ok(gasDistances.every((d) => {
      const frames = Math.trunc((2 * d + Units[Kind.SCV]!.speed - 1) / Units[Kind.SCV]!.speed);
      return Math.abs(frames - targetGasFrames) <= 2;
    }));

    const placement = placementForStructure(makeState(map, 1, 1), Kind.CommandCenter, tc(start.x), tc(start.y));
    assert.equal(placement.ok, true, 'start depot remains legal against its resource grid');
  }
});

test('base cluster solver exposes exact depot and whole-cluster footprints', () => {
  const cluster = solveBaseCluster({ x: 32, y: 82 }, -1);
  assert.deepEqual(cluster.depotFootprint, { x0: 30, y0: 81, x1: 33, y1: 83 });
  assert.equal(cluster.resources.length, 9);
  assert.equal(cluster.resourceFootprints.length, 9);

  for (const fp of [cluster.depotFootprint, ...cluster.resourceFootprints]) {
    assert.equal(resourceFootprintsOverlap(cluster.reservation, fp), true);
  }
});

test('base cluster solver keeps the readable local mineral arc order', () => {
  const start = { x: 32, y: 82 };
  const cluster = solveBaseCluster(start, -1);
  const minerals = cluster.resources.filter((resource) => !resource.gas);

  assert.equal(minerals.every((resource, index) => {
    const nominal = BASE_MINERAL_ARC_OFFSETS[index]!;
    const center = resourceSpawnCenterPx(resource);
    return center.x === (start.x + nominal.dx) * TILE + (TILE >> 1) &&
      center.y === (start.y - nominal.dy) * TILE + (TILE >> 1);
  }), true);
});

test('named north/south resource directions preserve the legacy vertical clusters', () => {
  assert.deepEqual(solveBaseCluster({ x: 32, y: 82 }, 'north').resources, solveBaseCluster({ x: 32, y: 82 }, -1).resources);
  assert.deepEqual(solveBaseCluster({ x: 32, y: 12 }, 'south').resources, solveBaseCluster({ x: 32, y: 12 }, 1).resources);
});

test('side-facing base clusters keep whole footprints and average harvest cadence', () => {
  const start = { x: 48, y: 48 };

  assertClusterCadence(start, 'east');
  assertClusterCadence(start, 'west');
});

test('side-facing base clusters use explicit 2x1 mineral arc tables', () => {
  const start = { x: 48, y: 48 };
  const eastMinerals = solveBaseCluster(start, 'east').resources.filter((resource) => !resource.gas);
  const westMinerals = solveBaseCluster(start, 'west').resources.filter((resource) => !resource.gas);

  assert.deepEqual(eastMinerals.map(resourceSpawnCenterPx), BASE_EAST_MINERAL_ARC_OFFSETS.map((offset) =>
    localCenter(start, 'east', offset),
  ));
  assert.deepEqual(westMinerals.map(resourceSpawnCenterPx), BASE_WEST_MINERAL_ARC_OFFSETS.map((offset) =>
    localCenter(start, 'west', offset),
  ));
});
