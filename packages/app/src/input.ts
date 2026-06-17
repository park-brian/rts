// Touch/mouse input. One finger = select (tap) or box-select (drag); two fingers
// = pan + pinch-zoom; wheel = zoom (desktop). Maps to the model in docs/specs/ui-mobile.md.

import type { Game } from './game.ts';
import { ui } from './store.ts';

const TAP_SLOP = 8; // px movement under which a press counts as a tap

export const attachInput = (canvas: HTMLCanvasElement, game: Game): void => {
  const pts = new Map<number, { x: number; y: number }>();
  let moved = false;
  let start = { x: 0, y: 0 };
  let pinchDist = 0;
  let panMid = { x: 0, y: 0 };
  let onMinimap = false; // dragging on the minimap to pan
  let multiTouch = false; // once true, suppress tap/box until all pointers are up
  let lastTapT = 0;
  let lastTap = { x: 0, y: 0 };
  let placing = false;

  const rect = (): DOMRect => canvas.getBoundingClientRect();
  const local = (e: PointerEvent): { x: number; y: number } => {
    const r = rect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    const p = local(e);
    pts.set(e.pointerId, p);
    if (pts.size === 1) {
      multiTouch = false;
      start = p; moved = false; game.box = null;
      placing = ui.placement.value !== 0;
      if (placing) {
        onMinimap = false;
        game.updatePlacementGhost(p.x, p.y);
      } else {
        onMinimap = game.minimapPan(p.x, p.y); // tap/drag the minimap to pan
      }
    } else if (pts.size === 2) {
      multiTouch = true;
      placing = false;
      game.cancelPlacementGhost();
      game.box = null; // cancel any box once a second finger lands
      const [a, b] = [...pts.values()];
      pinchDist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      panMid = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    const p = local(e);
    pts.set(e.pointerId, p);

    if (pts.size === 1) {
      if (multiTouch) return; // remaining finger after a pinch/pan cannot become a tap/box
      if (placing) { game.updatePlacementGhost(p.x, p.y); return; }
      if (onMinimap) { game.minimapPan(p.x, p.y); return; } // drag-pan, no box select
      if (Math.hypot(p.x - start.x, p.y - start.y) > TAP_SLOP) moved = true;
      if (moved) game.box = { x0: start.x, y0: start.y, x1: p.x, y1: p.y };
    } else if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const mid = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
      // pan
      game.camX -= (mid.x - panMid.x) / game.zoom;
      game.camY -= (mid.y - panMid.y) / game.zoom;
      // pinch zoom about the midpoint
      if (pinchDist > 0) zoomAt(game, mid.x, mid.y, dist / pinchDist);
      pinchDist = dist; panMid = mid;
      game.clampCamera();
    }
  });

  const end = (e: PointerEvent): void => {
    if (!pts.has(e.pointerId)) return;
    const wasOne = pts.size === 1;
    const p = local(e);
    pts.delete(e.pointerId);
    if (wasOne) {
      if (multiTouch) {
        multiTouch = false; onMinimap = false; placing = false; game.cancelPlacementGhost(); game.box = null;
      } else if (placing) {
        game.updatePlacementGhost(p.x, p.y);
        game.commitPlacementGhost();
        placing = false;
      } else if (onMinimap) { onMinimap = false; }
      else if (!moved) {
        const now = performance.now();
        const dbl = now - lastTapT < 300 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 24;
        lastTapT = now; lastTap = p;
        if (dbl) game.selectAllByType(p.x, p.y); // double-tap: all of this type on screen
        else game.tap(p.x, p.y);
      } else if (game.box) {
        game.boxSelect(game.box.x0, game.box.y0, game.box.x1, game.box.y1);
      }
      game.box = null;
    } else if (pts.size === 0) {
      multiTouch = false;
      onMinimap = false;
      placing = false;
      game.cancelPlacementGhost();
      game.box = null;
    }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = rect();
    zoomAt(game, e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.1 : 1 / 1.1);
    game.clampCamera();
  }, { passive: false });
};

const zoomAt = (game: Game, sx: number, sy: number, factor: number): void => {
  const [wx, wy] = game.screenToWorld(sx, sy);
  game.zoom = Math.max(0.4, Math.min(4, game.zoom * factor));
  // keep the world point under the cursor fixed
  game.camX = wx - sx / game.zoom;
  game.camY = wy - sy / game.zoom;
};
