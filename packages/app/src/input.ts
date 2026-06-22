// Touch/mouse input. One finger = select (tap) or box-select (drag); two fingers
// = pan + pinch-zoom; wheel = zoom (desktop). Maps to the model in docs/specs/ui-mobile.md.

import type { Game } from './game.ts';
import { ui } from './store.ts';
import { dispatchHotkey } from './hotkeys.ts';
import { InputGestureController, type InputPointer } from './input-controller.ts';

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
  const rect = (): DOMRect => canvas.getBoundingClientRect();
  const localPoint = (clientX: number, clientY: number): { x: number; y: number } => {
    const r = rect();
    return { x: clientX - r.left, y: clientY - r.top };
  };
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
  const gestures = new InputGestureController(game, { isDesktop, viewportEdgePan });
  const pointerData = (event: PointerEvent): InputPointer => {
    const p = localPoint(event.clientX, event.clientY);
    return {
      pointerId: event.pointerId,
      x: p.x,
      y: p.y,
      clientX: event.clientX,
      clientY: event.clientY,
      button: buttonOf(event),
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
    };
  };

  on(canvas, 'pointerdown', (e) => {
    const event = e as PointerEvent;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    gestures.pointerDown(pointerData(event));
  });

  on(canvas, 'pointermove', (e) => {
    const event = e as PointerEvent;
    gestures.pointerMove(pointerData(event));
  });

  const end = (event: PointerEvent): void => {
    gestures.pointerEnd(pointerData(event));
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
    if (ui.controlScheme.value === 'desktop' && event.code === 'Tab' && ui.selectionView.value.subgroups.length > 1) {
      if (game.cycleSelectionSubgroup(event.shiftKey ? -1 : 1)) event.preventDefault();
      return;
    }
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
    gestures.reset();
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
