import test from 'node:test';
import assert from 'node:assert/strict';
import { generateMap } from '../src/map/procedural.ts';
import { mapDiagnosticsOverlay } from '../src/map/diagnostics.ts';
import { sliceMap } from '../src/map/core.ts';

const sliceWithWalkBarrier = (): ReturnType<typeof sliceMap> => {
  const map = sliceMap();
  map.walk = new Uint8Array(map.walk);
  map.build = new Uint8Array(map.build);
  for (let x = 20; x < map.w; x++) {
    const y = 81;
    map.walk[y * map.w + x] = 0;
    map.build[y * map.w + x] = 0;
  }
  return map;
};

test('map diagnostics expose serializable base, resource, hull, dock, and timing primitives', () => {
  const map = generateMap(2, 44, { midfield: 'blocks' });
  const overlay = mapDiagnosticsOverlay(map);
  const mainBases = map.bases?.filter((base) => base.kind === 'main') ?? [];

  assert.equal(overlay.mapName, map.name);
  assert.equal(overlay.rects.some((rect) => rect.kind === 'base-reservation'), true);
  assert.equal(overlay.rects.some((rect) => rect.kind === 'depot-footprint'), true);
  assert.equal(overlay.rects.filter((rect) => rect.kind === 'resource-footprint').length, map.resources.length);
  assert.equal(overlay.rects.some((rect) => rect.kind === 'interaction-hull' && rect.units === 'px'), true);
  assert.equal(overlay.points.some((point) => point.kind === 'dock-point'), true);
  assert.equal(overlay.points.some((point) => point.kind === 'route-target'), true);
  assert.equal(overlay.lines.some((line) => line.kind === 'route' && line.resourceType === 'mineral'), true);
  assert.equal(overlay.lines.some((line) => line.kind === 'route' && line.resourceType === 'gas'), true);
  assert.equal(overlay.markers.length, overlay.lines.length);
  assert.equal(overlay.markers.every((marker) => marker.valid), true);
  assert.equal(overlay.lines.filter((line) => line.resourceType === 'mineral').length, mainBases.length * 8);
  assert.doesNotThrow(() => JSON.stringify(overlay));
});

test('map diagnostics mark blocked harvest routes as invalid without UI coupling', () => {
  const overlay = mapDiagnosticsOverlay(sliceWithWalkBarrier());
  const invalidMineral = overlay.markers.find((marker) => marker.resourceType === 'mineral' && !marker.valid);
  const invalidGas = overlay.markers.find((marker) => marker.resourceType === 'gas' && !marker.valid);

  assert.ok(invalidMineral);
  assert.ok(invalidGas);
  assert.equal(invalidMineral.actualRouteFrames > invalidMineral.targetRouteFrames + invalidMineral.toleranceFrames, true);
  assert.equal(Math.abs(invalidGas.actualRouteFrames - invalidGas.targetRouteFrames) > invalidGas.toleranceFrames, true);
  assert.equal(overlay.lines.some((line) =>
    line.resourceIndex === invalidMineral.resourceIndex &&
    line.resourceType === 'mineral' &&
    !line.valid
  ), true);
});
