import test from 'node:test';
import assert from 'node:assert/strict';
import { makeState } from '../src/world.ts';
import { Kind, TILE, Units } from '../src/data.ts';
import { fx, ONE } from '../src/fixed.ts';
import {
  BASE_GAS_DOCK_DISTANCE_PX,
  BASE_MINERAL_ARC_OFFSETS,
  BASE_MINERAL_DOCK_DISTANCE_PX,
  baseResourceDockDistance,
  resourceFootprintsOverlap,
  resourceSpawnCenterPx,
  resourceSpawnFootprint,
  sliceMap,
  solveBaseCluster,
  type ResourceFootprint,
} from '../src/map.ts';
import { placementForStructure } from '../src/validation.ts';

const tc = (t: number): number => fx(t * TILE + (TILE >> 1));

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
    assert.ok(maxMineral - minMineral <= fx(24), `mineral dock arc spread exceeded 24 px at start ${startIndex}`);
    assert.ok(mineralDistances.every((d) =>
      d >= fx(BASE_MINERAL_DOCK_DISTANCE_PX - 28) && d <= fx(BASE_MINERAL_DOCK_DISTANCE_PX)),
    `mineral dock distances left the 3-worker band at start ${startIndex}: ${mineralDistances.map((d) => (d / ONE).toFixed(2)).join(', ')}`);
    const targetGasFrames = Math.trunc((2 * fx(BASE_GAS_DOCK_DISTANCE_PX) + Units[Kind.SCV]!.speed - 1) / Units[Kind.SCV]!.speed);
    assert.ok(gasDistances.every((d) => {
      const frames = Math.trunc((2 * d + Units[Kind.SCV]!.speed - 1) / Units[Kind.SCV]!.speed);
      return Math.abs(frames - targetGasFrames) <= 1;
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

test('base cluster solver repairs resource centers before rejecting an anchor', () => {
  const start = { x: 32, y: 82 };
  const cluster = solveBaseCluster(start, -1);
  const minerals = cluster.resources.filter((resource) => !resource.gas);

  assert.equal(minerals.some((resource, index) => {
    const nominal = BASE_MINERAL_ARC_OFFSETS[index]!;
    const center = resourceSpawnCenterPx(resource);
    return center.y !== (start.y - nominal.dy) * TILE + (TILE >> 1);
  }), true);
});
