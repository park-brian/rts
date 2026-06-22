import { Game } from './game.ts';
import { attachInput, type DetachInput } from './input.ts';
import { ui, type Mode } from './store.ts';
import { RuntimeFrameLoop } from './runtime-frame-loop.ts';

export type RuntimeRenderer = {
  render(game: Game, dpr: number): void;
};

export type RuntimeCanvas = HTMLCanvasElement;
export type RuntimeRoot = HTMLElement;

export type AppRuntimeHost = {
  gameCanvas: RuntimeCanvas;
  overlayCanvas: RuntimeCanvas;
  uiRoot: RuntimeRoot;
  rendererFactory: (gameCanvas: RuntimeCanvas, overlayCanvas: RuntimeCanvas) => RuntimeRenderer;
  mountUi: (game: Game, uiRoot: RuntimeRoot) => void;
  addResizeListener?: (fn: () => void) => DetachInput;
  requestFrame?: (fn: FrameRequestCallback) => number;
  cancelFrame?: (id: number) => void;
  devicePixelRatio?: () => number;
  exposeDebug?: (game: Game) => void;
};

export type AppRuntimeOptions = {
  mode?: Mode;
  seed?: number;
  autoStart?: boolean;
};

export type AppRuntime = {
  game: Game;
  renderer: RuntimeRenderer;
  resize(): void;
  step(now: number): void;
  start(): void;
  stop(): void;
};

const defaultDevicePixelRatio = (): number => Math.min(2, globalThis.devicePixelRatio || 1);

export const bootApp = (host: AppRuntimeHost, options: AppRuntimeOptions = {}): AppRuntime => {
  const mode = options.mode ?? 'play';
  const game = new Game(mode, options.seed);
  const renderer = host.rendererFactory(host.gameCanvas, host.overlayCanvas);
  const detachInput = attachInput(host.gameCanvas, game);
  let dpr = 1;

  host.exposeDebug?.(game);

  const resize = (): void => {
    dpr = host.devicePixelRatio?.() ?? defaultDevicePixelRatio();
    const rect = host.gameCanvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    for (const c of [host.gameCanvas, host.overlayCanvas]) {
      c.width = Math.floor(w * dpr);
      c.height = Math.floor(h * dpr);
    }
    game.resize(w, h);
  };

  const step = (now: number): void => {
    game.update(now);
    renderer.render(game, dpr);
  };

  const frameLoop = new RuntimeFrameLoop(
    step,
    host.requestFrame ?? globalThis.requestAnimationFrame,
    host.cancelFrame ?? globalThis.cancelAnimationFrame,
  );

  const detachResize = host.addResizeListener
    ? host.addResizeListener(resize)
    : (() => {
      globalThis.addEventListener?.('resize', resize);
      return () => {
        globalThis.removeEventListener?.('resize', resize);
      };
    })();
  resize();
  host.mountUi(game, host.uiRoot);

  const runtime: AppRuntime = {
    game,
    renderer,
    resize,
    step,
    start: () => {
      frameLoop.start();
    },
    stop: () => {
      if (!frameLoop.stop()) return;
      detachInput();
      detachResize();
    },
  };

  if (options.autoStart ?? true) runtime.start();
  (globalThis as Record<string, unknown>).__ui = ui;
  return runtime;
};
