import { Game } from './game.ts';
import { attachInput, type DetachInput } from './input.ts';
import { ui, type Mode } from './store.ts';
import { RuntimeCanvasSizer } from './runtime-canvas-sizer.ts';
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

export const bootApp = (host: AppRuntimeHost, options: AppRuntimeOptions = {}): AppRuntime => {
  const mode = options.mode ?? 'play';
  const game = new Game(mode, options.seed);
  const renderer = host.rendererFactory(host.gameCanvas, host.overlayCanvas);
  const detachInput = attachInput(host.gameCanvas, game);
  const canvasSizer = new RuntimeCanvasSizer(host.gameCanvas, host.overlayCanvas, host.devicePixelRatio);
  let dpr = 1;

  host.exposeDebug?.(game);

  const resize = (): void => {
    const size = canvasSizer.resize();
    dpr = size.dpr;
    game.resize(size.width, size.height);
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
