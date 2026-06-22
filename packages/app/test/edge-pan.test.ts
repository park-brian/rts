import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { ui } from '../src/store.ts';

test('desktop edge pan moves the camera while the cursor rests near a screen edge', () => {
  const g = new Game('play', 91);
  g.resize(800, 600);
  g.camX = 1000;
  g.camY = 1000;
  g.zoom = 1;
  ui.controlScheme.value = 'desktop';

  g.setEdgePanPointer(1, 300);
  g.update(1000);
  g.update(1100);

  assert.ok(g.camX < 1000, 'left-edge hover pans camera left');
  assert.equal(g.camY, 1000);

  g.clearEdgePan();
  const x = g.camX;
  g.update(1200);

  assert.equal(g.camX, x);
});

test('desktop edge pan can use viewport edges instead of stale playfield bounds', () => {
  const g = new Game('play', 92);
  g.resize(800, 420);
  g.camX = 1000;
  g.camY = 1000;
  g.zoom = 1;
  ui.controlScheme.value = 'desktop';

  g.setEdgePanPointerInRect(960, 350, 960, 540);
  g.update(1000);
  g.update(1100);

  assert.ok(g.camX > 1000, 'right window edge pans camera right');
  assert.equal(g.camY, 1000);
});

test('minimap interaction geometry and panning stay camera-backed', () => {
  const g = new Game('play', 93);
  g.resize(800, 600);
  g.zoom = 1;
  const map = g.map;
  const rect = g.minimapRect();
  const scale = 116 / Math.max(map.w, map.h);

  assert.deepEqual(rect, {
    ox: 800 - map.w * scale - 8,
    oy: 600 - map.h * scale - 8,
    W: map.w * scale,
    H: map.h * scale,
    scale,
  });

  assert.equal(g.minimapPan(rect.ox - 3, rect.oy), false);
  const handled = g.minimapPan(rect.ox + rect.W / 2, rect.oy + rect.H / 2);

  assert.equal(handled, true);
  assert.ok(g.camX >= 0);
  assert.ok(g.camY >= 0);
  assert.ok(g.camX <= map.w * 32 - g.viewW / g.zoom);
  assert.ok(g.camY <= map.h * 32 - g.viewH / g.zoom);
});
