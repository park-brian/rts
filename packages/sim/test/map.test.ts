import test from 'node:test';
import assert from 'node:assert/strict';
import { makeState, NEUTRAL, slotOf } from '../src/world.ts';
import { spawnUnit } from '../src/factory.ts';
import { Kind, TILE, bwRange } from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import { sliceMap, resourceSpawnCenterPx, resourceSpawnFootprint } from '../src/map.ts';
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
    assert.ok(mineralDistances.every((d) => Math.abs(d - bwRange(115)) <= bwRange(1)));
    assert.deepEqual(gasDistances, [bwRange(112)]);

    const placement = placementForStructure(makeState(map, 1, 1), Kind.CommandCenter, tc(start.x), tc(start.y));
    assert.equal(placement.ok, true, 'start depot remains legal against its resource grid');
  }
});
