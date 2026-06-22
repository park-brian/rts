import test from 'node:test';
import assert from 'node:assert/strict';
import { startAppFromDocument } from '../src/browser-app.ts';
import type { RuntimeRenderer } from '../src/app-runtime.ts';
import { eid, ONE, Role, slotOf } from '../src/sim.ts';
import type { Game } from '../src/game.ts';

type Listener = (event: unknown) => void;

class FakeCanvas {
  width = 0;
  height = 0;
  readonly listeners = new Map<string, Set<Listener>>();
  private readonly rect: { width: number; height: number };

  constructor(rect: { width: number; height: number }) {
    this.rect = rect;
  }

  getBoundingClientRect(): DOMRect {
    return {
      left: 0,
      top: 0,
      right: this.rect.width,
      bottom: this.rect.height,
      width: this.rect.width,
      height: this.rect.height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    };
  }

  setPointerCapture(): void {}

  addEventListener(type: string, fn: Listener): void {
    const list = this.listeners.get(type) ?? new Set<Listener>();
    list.add(fn);
    this.listeners.set(type, list);
  }

  removeEventListener(type: string, fn: Listener): void {
    this.listeners.get(type)?.delete(fn);
  }

  fire(type: string, event: unknown): void {
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn(event);
  }

  listenerCount(): number {
    let total = 0;
    for (const listeners of this.listeners.values()) total += listeners.size;
    return total;
  }
}

class FakeDocument {
  private readonly elements: Record<string, HTMLElement | null>;

  constructor(elements: Record<string, HTMLElement | null>) {
    this.elements = elements;
  }

  getElementById(id: string): HTMLElement | null {
    return this.elements[id] ?? null;
  }
}

const pointer = (pointerId: number, clientX: number, clientY: number, extra: Record<string, unknown> = {}): unknown => ({
  pointerId,
  clientX,
  clientY,
  button: 0,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  preventDefault() {},
  ...extra,
});

const firstOwnedWorker = (game: Game): number => {
  const e = game.sim.fullState().e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.owner[i] === game.human && (e.flags[i]! & Role.Worker) !== 0) return eid(e, i);
  }
  throw new Error('Expected the startup scenario to include an owned worker');
};

const screenPointFor = (game: Game, id: number): { x: number; y: number } => {
  const e = game.sim.fullState().e;
  const slot = slotOf(id);
  return {
    x: (e.x[slot]! / ONE - game.camX) * game.zoom,
    y: (e.y[slot]! / ONE - game.camY) * game.zoom,
  };
};

test('browser document boot exercises startup, resize, input, mount, update, render, and cleanup', () => {
  const gameCanvas = new FakeCanvas({ width: 800, height: 600 }) as unknown as HTMLCanvasElement & FakeCanvas;
  const overlayCanvas = new FakeCanvas({ width: 800, height: 600 }) as unknown as HTMLCanvasElement & FakeCanvas;
  const uiRoot = {} as HTMLElement;
  const document = new FakeDocument({ game: gameCanvas, overlay: overlayCanvas, ui: uiRoot });
  const frames: FrameRequestCallback[] = [];
  let mounted: Game | null = null;
  let renders = 0;
  let detachedResize = false;
  let cancelledFrame: number | null = null;

  const renderer: RuntimeRenderer = {
    render: (game, dpr) => {
      renders++;
      assert.equal(game.viewW, 800);
      assert.equal(game.viewH, 600);
      assert.equal(dpr, 1.5);
    },
  };

  const runtime = startAppFromDocument({
    document,
    rendererFactory: (worldCanvas, chromeCanvas) => {
      assert.equal(worldCanvas, gameCanvas);
      assert.equal(chromeCanvas, overlayCanvas);
      return renderer;
    },
    mountUi: (game, root) => {
      assert.equal(root, uiRoot);
      mounted = game;
    },
    devicePixelRatio: () => 1.5,
    addResizeListener: () => () => { detachedResize = true; },
    requestFrame: (fn) => {
      frames.push(fn);
      return frames.length;
    },
    cancelFrame: (id) => { cancelledFrame = id; },
  }, { seed: 1234, autoStart: false });

  assert.equal(gameCanvas.width, 1200);
  assert.equal(gameCanvas.height, 900);
  assert.equal(overlayCanvas.width, 1200);
  assert.equal(overlayCanvas.height, 900);
  assert.equal(mounted, runtime.game);
  assert.ok(gameCanvas.listenerCount() > 0);

  const worker = firstOwnedWorker(runtime.game);
  const p = screenPointFor(runtime.game, worker);
  gameCanvas.fire('pointerdown', pointer(1, p.x, p.y));
  gameCanvas.fire('pointerup', pointer(1, p.x, p.y));
  assert.deepEqual([...runtime.game.selection], [worker]);

  runtime.step(0);
  assert.equal(renders, 1);

  runtime.start();
  const frame = frames.shift();
  assert.ok(frame);
  frame(16);
  assert.equal(renders, 2);

  runtime.stop();
  assert.equal(detachedResize, true);
  assert.equal(cancelledFrame, 1);
  assert.equal(gameCanvas.listenerCount(), 0);

  runtime.stop();
  assert.equal(gameCanvas.listenerCount(), 0);
});

test('browser document boot fails before half-wiring when required DOM nodes are missing', () => {
  const gameCanvas = new FakeCanvas({ width: 800, height: 600 }) as unknown as HTMLElement;
  const document = new FakeDocument({ game: gameCanvas, overlay: null, ui: null });
  let rendererCreated = false;

  assert.throws(() => startAppFromDocument({
    document,
    rendererFactory: () => {
      rendererCreated = true;
      return { render: () => {} };
    },
    mountUi: () => {},
  }, { seed: 1234, autoStart: false }), /missing #overlay element/);

  assert.equal(rendererCreated, false);
});
