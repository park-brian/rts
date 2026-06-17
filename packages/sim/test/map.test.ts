import test from 'node:test';
import assert from 'node:assert/strict';
import { makeState, NEUTRAL, slotOf } from '../src/world.ts';
import { spawnUnit } from '../src/factory.ts';
import { Kind, TILE, bwRange } from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import {
  BASE_GAS_EDGE_PX,
  BASE_MINERAL_EDGE_PX,
  resourceFootprintsOverlap,
  resourceSpawnCenterPx,
  resourceSpawnFootprint,
  sliceMap,
  solveBaseCluster,
} from '../src/map.ts';
import { bwApproxEdgeDistance } from '../src/spatial.ts';
import { placementForStructure } from '../src/validation.ts';

const tc = (t: number): number => fx(t * TILE + (TILE >> 1));

test('slice map start resources keep integer BW grid footprints and tight edge-distance arcs', () => {
  const map = sliceMap();
  const resourcesPerStart = 9;

  for (let startIndex = 0; startIndex < map.starts.length; startIndex++) {
    const start = map.starts[startIndex]!;
    const state = makeState(map, 1, 1);
    const depot = slotOf(spawnUnit(state, Kind.CommandCenter, 0, tc(start.x), tc(start.y)));
    const mineralDistances: number[] = [];
    const gasDistances: number[] = [];

    for (const r of map.resources.slice(startIndex * resourcesPerStart, (startIndex + 1) * resourcesPerStart)) {
      const center = resourceSpawnCenterPx(r);
      const fp = resourceSpawnFootprint(r);

      assert.equal(Number.isInteger(center.x), true);
      assert.equal(Number.isInteger(center.y), true);
      assert.equal(Number.isInteger(fp.x0), true);
      assert.equal(Number.isInteger(fp.y0), true);

      const resource = slotOf(spawnUnit(state, r.gas ? Kind.Geyser : Kind.Mineral, NEUTRAL, fx(center.x), fx(center.y)));
      const d = bwApproxEdgeDistance(state, depot, resource);
      (r.gas ? gasDistances : mineralDistances).push(d);
    }

    const minMineral = Math.min(...mineralDistances);
    const maxMineral = Math.max(...mineralDistances);
    assert.ok(maxMineral - minMineral <= bwRange(1), `mineral arc drifted by more than 1 px at start ${startIndex}`);
    assert.ok(mineralDistances.every((d) => Math.abs(d - bwRange(BASE_MINERAL_EDGE_PX)) <= bwRange(1)));
    assert.deepEqual(gasDistances, [bwRange(BASE_GAS_EDGE_PX)]);

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
