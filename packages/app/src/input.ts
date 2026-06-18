// Touch/mouse input. One finger = select (tap) or box-select (drag); two fingers
// = pan + pinch-zoom; wheel = zoom (desktop). Maps to the model in docs/specs/ui-mobile.md.

import type { Game } from './game.ts';
import { ui } from './store.ts';
import { dispatchHotkey } from './hotkeys.ts';

const TAP_SLOP = 8; // px movement under which a press counts as a tap

export type DetachInput = () => void;
type OptionalEventTarget = {
  addEventListener?: (...args: any[]) => void;
  removeEventListener?: (...args: any[]) => void;
};

export const attachInput = (canvas: HTMLCanvasElement, game: Game): DetachInput => {
  const cleanups: DetachInput[] = [];
  const on = (
    target: { addEventListener: (...args: any[]) => void; removeEventListener?: (...args: any[]) => void },
    type: string,
    fn: EventListener,
    options?: AddEventListenerOptions | boolean,
  ): void => {
    target.addEventListener(type, fn, options);
    cleanups.push(() => target.removeEventListener?.(type, fn, options));
  };
  const pts = new Map<number, { x: number; y: number }>();
  const buttons = new Map<number, number>();
  let moved = false;
  let start = { x: 0, y: 0 };
  let pinchDist = 0;
  let panMid = { x: 0, y: 0 };
  let onMinimap = false; // dragging on the minimap to pan
  let multiTouch = false; // once true, suppress tap/box until all pointers are up
  let lastTapT = 0;
  let lastTap = { x: 0, y: 0 };
  let placing = false;
  let middlePanId = -1;
  let middlePanLast = { x: 0, y: 0 };
  let pressHit = -1;

  const rect = (): DOMRect => canvas.getBoundingClientRect();
  const localPoint = (clientX: number, clientY: number): { x: number; y: number } => {
    const r = rect();
    return { x: clientX - r.left, y: clientY - r.top };
  };
  const local = (e: PointerEvent): { x: number; y: number } => localPoint(e.clientX, e.clientY);
  const isDesktop = (): boolean => ui.controlScheme.value === 'desktop';
  const buttonOf = (e: PointerEvent): number => typeof e.button === 'number' ? e.button : 0;
  const optionalGlobalEvents = globalThis as OptionalEventTarget;
  const globalEvents = optionalGlobalEvents.addEventListener
    ? optionalGlobalEvents as { addEventListener: (...args: any[]) => void; removeEventListener?: (...args: any[]) => void }
    : null;
  const viewportEdgePan = (clientX: number, clientY: number): void => {
    const r = rect();
    const w = typeof globalThis.innerWidth === 'number' ? globalThis.innerWidth : typeof r.width === 'number' ? r.width : game.viewW;
    const h = typeof globalThis.innerHeight === 'number' ? globalThis.innerHeight : typeof r.height === 'number' ? r.height : game.viewH;
    game.setEdgePanPointerInRect(clientX, clientY, Math.max(1, w), Math.max(1, h));
  };

  on(canvas, 'pointerdown', (e) => {
    const event = e as PointerEvent;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    const p = local(event);
    const desktop = isDesktop();
    const button = buttonOf(event);
    if (desktop) viewportEdgePan(event.clientX, event.clientY);
    pts.set(event.pointerId, p);
    buttons.set(event.pointerId, button);
    if (pts.size === 1) {
      multiTouch = false;
      start = p; moved = false; game.box = null; pressHit = -1;
      if (desktop && button === 1) {
        middlePanId = event.pointerId;
        middlePanLast = p;
        placing = false;
        onMinimap = false;
        game.cancelPlacementGhost();
        return;
      }
      placing = ui.placement.value !== 0;
      if (placing) {
        onMinimap = false;
        game.updatePlacementGhost(p.x, p.y);
      } else if (!desktop || button === 0) {
        onMinimap = game.minimapPan(p.x, p.y); // tap/drag the minimap to pan
      } else {
        onMinimap = false;
      }
      if (!placing && !onMinimap && (!desktop || button === 0 || button === 2)) {
        const [wx, wy] = game.screenToWorld(p.x, p.y);
        pressHit = game.hitTest(wx, wy);
      }
    } else if (pts.size === 2) {
      multiTouch = true;
      pressHit = -1;
      placing = false;
      game.cancelPlacementGhost();
      game.box = null; // cancel any box once a second finger lands
      const [a, b] = [...pts.values()];
      pinchDist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      panMid = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
    }
  });

  on(canvas, 'pointermove', (e) => {
    const event = e as PointerEvent;
    if (!pts.has(event.pointerId)) return;
    const p = local(event);
    if (isDesktop()) viewportEdgePan(event.clientX, event.clientY);
    pts.set(event.pointerId, p);

    if (pts.size === 1) {
      if (multiTouch) return; // remaining finger after a pinch/pan cannot become a tap/box
      if (middlePanId === event.pointerId) {
        game.camX -= (p.x - middlePanLast.x) / game.zoom;
        game.camY -= (p.y - middlePanLast.y) / game.zoom;
        middlePanLast = p;
        moved = true;
        game.clampCamera();
        return;
      }
      if (placing) { game.updatePlacementGhost(p.x, p.y); return; }
      if (onMinimap) { game.minimapPan(p.x, p.y); return; } // drag-pan, no box select
      if (isDesktop() && (buttons.get(event.pointerId) ?? 0) !== 0) return;
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

  const end = (event: PointerEvent): void => {
    if (!pts.has(event.pointerId)) return;
    const wasOne = pts.size === 1;
    const p = local(event);
    const button = buttons.get(event.pointerId) ?? buttonOf(event);
    pts.delete(event.pointerId);
    buttons.delete(event.pointerId);
    if (wasOne) {
      if (middlePanId === event.pointerId) {
        middlePanId = -1; onMinimap = false; placing = false; game.box = null;
      } else if (multiTouch) {
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
        const hitOpts = { preferredHit: pressHit };
        if (isDesktop() && button === 2) game.desktopSmartTap(p.x, p.y, hitOpts);
        else if (isDesktop()) {
          if (dbl) game.selectAllByType(p.x, p.y, hitOpts);
          else game.desktopSelectTap(p.x, p.y, { shift: event.shiftKey, ctrl: event.ctrlKey || event.metaKey, preferredHit: pressHit });
        } else if (dbl) game.selectAllByType(p.x, p.y, hitOpts); // double-tap: all of this type on screen
        else game.tap(p.x, p.y, hitOpts);
      } else if (game.box) {
        game.boxSelect(game.box.x0, game.box.y0, game.box.x1, game.box.y1);
      }
      pressHit = -1;
      game.box = null;
    } else if (pts.size === 0) {
      multiTouch = false;
      middlePanId = -1;
      pressHit = -1;
      onMinimap = false;
      placing = false;
      game.cancelPlacementGhost();
      game.box = null;
    }
  };
  on(canvas, 'pointerup', (e) => end(e as PointerEvent));
  on(canvas, 'pointercancel', (e) => end(e as PointerEvent));
  on(canvas, 'contextmenu', (e) => e.preventDefault());
  on(canvas, 'mousemove', (e) => {
    const event = e as MouseEvent;
    if (!isDesktop()) return;
    viewportEdgePan(event.clientX, event.clientY);
  });
  on(canvas, 'mouseleave', () => game.clearEdgePan());
  if (globalEvents) on(globalEvents, 'mousemove', (e) => {
    const event = e as MouseEvent;
    if (!isDesktop()) return;
    viewportEdgePan(event.clientX, event.clientY);
  });
  if (globalEvents) on(globalEvents, 'blur', () => game.clearEdgePan());

  on(canvas, 'wheel', (e) => {
    const event = e as WheelEvent;
    event.preventDefault();
    const r = rect();
    zoomAt(game, event.clientX - r.left, event.clientY - r.top, event.deltaY < 0 ? 1.1 : 1 / 1.1);
    game.clampCamera();
  }, { passive: false });

  if (globalEvents) on(globalEvents, 'keydown', (e) => {
    const event = e as KeyboardEvent;
    const target = event.target as HTMLElement | null;
    if (target && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)) return;
    const group = controlGroupIndex(event.code);
    if (ui.controlScheme.value === 'desktop' && group >= 0) {
      const handled = event.ctrlKey || event.metaKey
        ? game.assignControlGroup(group)
        : game.recallControlGroup(group, event.shiftKey);
      if (handled) event.preventDefault();
      return;
    }
    if (dispatchHotkey(game, event.code)) event.preventDefault();
  });

  return () => {
    for (let i = cleanups.length - 1; i >= 0; i--) cleanups[i]!();
    pts.clear();
    buttons.clear();
    game.clearEdgePan();
    game.box = null;
  };
};

const controlGroupIndex = (code: string): number => {
  if (code === 'Digit0') return 9;
  if (/^Digit[1-9]$/.test(code)) return Number(code.slice(5)) - 1;
  return -1;
};

const zoomAt = (game: Game, sx: number, sy: number, factor: number): void => {
  const [wx, wy] = game.screenToWorld(sx, sy);
  game.zoom = Math.max(0.4, Math.min(4, game.zoom * factor));
  // keep the world point under the cursor fixed
  game.camX = wx - sx / game.zoom;
  game.camY = wy - sy / game.zoom;
};
