import test from 'node:test';
import assert from 'node:assert/strict';
import { Kind, ONE, TILE, Units, structureFootprint, fx } from '../src/sim.ts';
import { selectionBase, spritePlacement } from '../src/art/placement.ts';
import { SPRITES } from '../src/art/sprites.ts';
import type { GeneratedSpriteMeta } from '../src/art/generated-sprites.ts';

const close = (actual: number, expected: number, label: string): void => {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${label}: expected ${expected}, got ${actual}`);
};

const worldFitBounds = (meta: GeneratedSpriteMeta, scale: number, offsetX: number, offsetY: number) => {
  const [x, y, w, h] = meta.visibleBox ?? [0, 0, 64, 64];
  return {
    x0: offsetX + (x - 32) * scale,
    x1: offsetX + (x + w - 32) * scale,
    y0: offsetY + (y - 32) * scale,
    y1: offsetY + (y + h - 32) * scale,
  };
};

const assertBaseMatchesFootprint = (
  kind: number,
  meta: GeneratedSpriteMeta,
  scale: number,
  offsetX: number,
  offsetY: number,
  label: string,
) => {
  const bounds = worldFitBounds(meta, scale, offsetX, offsetY);
  const tileX = 20;
  const tileY = 20;
  const worldX = tileX * TILE + TILE / 2;
  const worldY = tileY * TILE + TILE / 2;
  const fp = structureFootprint(kind, fx(worldX), fx(worldY));
  close(worldX + bounds.x0, fp.x0 * TILE, `${label} invisible base left edge`);
  close(worldX + bounds.x1, (fp.x1 + 1) * TILE, `${label} invisible base right edge`);
  close(worldY + bounds.y0, fp.y0 * TILE, `${label} invisible base top edge`);
  close(worldY + bounds.y1, (fp.y1 + 1) * TILE, `${label} invisible base bottom edge`);
  return bounds;
};

test('generated building sprites match their sim-stamped tile footprints', () => {
  for (const [kindText, def] of Object.entries(Units)) {
    const kind = Number(kindText);
    const meta = SPRITES[def.sprite]?.meta;
    if (meta?.scaleRole !== 'building-footprint') continue;

    assert.deepEqual(meta.footprint, [def.footprintW, def.footprintH], `${def.name} sprite footprint matches sim`);
    const p = spritePlacement(kind);
    assertBaseMatchesFootprint(kind, meta, p.scale, p.offsetX, p.offsetY, def.name);
  }
});

test('canonical structures occupy the same grid areas as structureFootprint', () => {
  const depot = spritePlacement(Kind.SupplyDepot);
  close(depot.visibleWidth, 3 * TILE, 'Supply Depot width');
  close(depot.visibleHeight, 2 * TILE, 'Supply Depot height');
  close(depot.baseOffsetX, 0, 'Supply Depot odd-width base center');
  close(depot.baseOffsetY, -TILE / 2, 'Supply Depot even-height base center');

  const commandCenter = spritePlacement(Kind.CommandCenter);
  const commandCenterMeta = SPRITES.commandCenter.meta!;
  assert.deepEqual(commandCenterMeta.visibleBox, [6, 13, 52, 39], 'Command Center base box is the invisible 4x3 guide');
  const bounds = assertBaseMatchesFootprint(
    Kind.CommandCenter,
    commandCenterMeta,
    commandCenter.scale,
    commandCenter.offsetX,
    commandCenter.offsetY,
    'Command Center',
  );
  close(bounds.x0, -80, 'Command Center invisible base left edge');
  close(bounds.x1, 48, 'Command Center invisible base right edge');
  close(bounds.y0, -48, 'Command Center invisible base top edge');
  close(bounds.y1, 48, 'Command Center invisible base bottom edge');
  close(commandCenter.baseOffsetX, -TILE / 2, 'Command Center even-width base center');
  close(commandCenter.baseOffsetY, 0, 'Command Center odd-height base center');
  close(commandCenter.offsetY, -commandCenter.scale / 2, 'Command Center odd-height base center offset');

  const nexus = spritePlacement(Kind.Nexus);
  const nexusBounds = assertBaseMatchesFootprint(Kind.Nexus, SPRITES.nexus.meta!, nexus.scale, nexus.offsetX, nexus.offsetY, 'Nexus');
  close(nexusBounds.x0, -80, 'Nexus invisible base left edge');
  close(nexusBounds.x1, 48, 'Nexus invisible base right edge');

  const pylon = spritePlacement(Kind.Pylon);
  const pylonBounds = assertBaseMatchesFootprint(Kind.Pylon, SPRITES.pylon.meta!, pylon.scale, pylon.offsetX, pylon.offsetY, 'Pylon');
  close(pylonBounds.x0, -48, 'Pylon invisible base left edge');
  close(pylonBounds.x1, 16, 'Pylon invisible base right edge');
  close(pylonBounds.y0, -48, 'Pylon invisible base top edge');
  close(pylonBounds.y1, 16, 'Pylon invisible base bottom edge');

  const gateway = spritePlacement(Kind.Gateway);
  const gatewayBounds = assertBaseMatchesFootprint(Kind.Gateway, SPRITES.gateway.meta!, gateway.scale, gateway.offsetX, gateway.offsetY, 'Gateway');
  close(gatewayBounds.x0, -80, 'Gateway invisible base left edge');
  close(gatewayBounds.x1, 48, 'Gateway invisible base right edge');
});

test('neutral geysers use exactly the sim 4x2 build footprint', () => {
  const geyser = spritePlacement(Kind.Geyser);
  const bounds = assertBaseMatchesFootprint(Kind.Geyser, SPRITES.geyser.meta!, geyser.scale, geyser.offsetX, geyser.offsetY, 'Vespene Geyser');
  close(bounds.x0, -80, 'Vespene Geyser invisible base left edge');
  close(bounds.x1, 48, 'Vespene Geyser invisible base right edge');
  close(bounds.y0, -48, 'Vespene Geyser invisible base top edge');
  close(bounds.y1, 16, 'Vespene Geyser invisible base bottom edge');
  assert.equal(geyser.role, 'building-footprint');
});

test('generated unit sprites fit inside their interaction radius circle', () => {
  for (const [kindText, def] of Object.entries(Units)) {
    const meta = SPRITES[def.sprite]?.meta;
    if (meta?.scaleRole !== 'unit-radius') continue;

    const p = spritePlacement(Number(kindText));
    const bounds = worldFitBounds(meta, p.scale, p.offsetX, p.offsetY);
    const distances = [
      Math.hypot(bounds.x0, bounds.y0),
      Math.hypot(bounds.x1, bounds.y0),
      Math.hypot(bounds.x0, bounds.y1),
      Math.hypot(bounds.x1, bounds.y1),
    ];
    const radius = def.radius / ONE;
    close(Math.max(...distances), radius, `${def.name} visible box fits interaction circle`);
    close(p.radius, radius, `${def.name} selection radius stays gameplay-sized`);
    assert.ok(p.visibleWidth <= radius * 2, `${def.name} width fits interaction circle`);
    assert.ok(p.visibleHeight <= radius * 2, `${def.name} height fits interaction circle`);
  }
});

test('combat morph cocoons borrow egg art while keeping target unit radius', () => {
  const p = spritePlacement(Kind.Lurker, Kind.Egg);
  const radius = Units[Kind.Lurker]!.radius / ONE;

  assert.equal(p.sprite, Units[Kind.Egg]!.sprite);
  assert.equal(p.role, 'unit-radius');
  close(p.radius, radius, 'Lurker cocoon selection radius stays target-sized');
  assert.ok(p.visibleWidth <= radius * 2, 'Lurker cocoon width fits target circle');
  assert.ok(p.visibleHeight <= radius * 2, 'Lurker cocoon height fits target circle');
});

test('selection bases match gameplay unit radius and build footprints', () => {
  const marine = selectionBase(Kind.Marine);
  assert.equal(marine.shape, 'circle');
  if (marine.shape === 'circle') {
    close(marine.radius, Units[Kind.Marine]!.radius / ONE, 'Marine selection circle uses unit radius');
    close(marine.offsetX, 0, 'Marine selection circle x offset');
    close(marine.offsetY, 0, 'Marine selection circle y offset');
  }

  const commandCenter = selectionBase(Kind.CommandCenter);
  assert.equal(commandCenter.shape, 'rect');
  if (commandCenter.shape === 'rect') {
    close(commandCenter.width, Units[Kind.CommandCenter]!.footprintW * TILE, 'Command Center selection base width');
    close(commandCenter.height, Units[Kind.CommandCenter]!.footprintH * TILE, 'Command Center selection base height');
    close(commandCenter.offsetX, -TILE / 2, 'Command Center selection base x offset');
    close(commandCenter.offsetY, 0, 'Command Center selection base y offset');
  }

  const geyser = selectionBase(Kind.Geyser);
  assert.equal(geyser.shape, 'rect');
  if (geyser.shape === 'rect') {
    close(geyser.width, 4 * TILE, 'Geyser selection base width');
    close(geyser.height, 2 * TILE, 'Geyser selection base height');
    close(geyser.offsetX, -TILE / 2, 'Geyser selection base x offset');
    close(geyser.offsetY, -TILE / 2, 'Geyser selection base y offset');
  }
});
