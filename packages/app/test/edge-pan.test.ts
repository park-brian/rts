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
