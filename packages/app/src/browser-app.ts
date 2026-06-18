import { bootApp, type AppRuntime, type AppRuntimeHost, type AppRuntimeOptions } from './app-runtime.ts';

type BrowserDocument = Pick<Document, 'getElementById'>;

export type BrowserAppHost = {
  document: BrowserDocument;
  rendererFactory: AppRuntimeHost['rendererFactory'];
  mountUi: AppRuntimeHost['mountUi'];
  addResizeListener?: AppRuntimeHost['addResizeListener'];
  requestFrame?: AppRuntimeHost['requestFrame'];
  cancelFrame?: AppRuntimeHost['cancelFrame'];
  devicePixelRatio?: AppRuntimeHost['devicePixelRatio'];
  exposeDebug?: AppRuntimeHost['exposeDebug'];
};

const requiredElement = <T extends HTMLElement>(doc: BrowserDocument, id: string): T => {
  const el = doc.getElementById(id);
  if (!el) throw new Error(`Cannot boot app: missing #${id} element`);
  return el as T;
};

export const startAppFromDocument = (
  host: BrowserAppHost,
  options: AppRuntimeOptions = {},
): AppRuntime => {
  const gameCanvas = requiredElement<HTMLCanvasElement>(host.document, 'game');
  const overlayCanvas = requiredElement<HTMLCanvasElement>(host.document, 'overlay');
  const uiRoot = requiredElement<HTMLElement>(host.document, 'ui');

  return bootApp({
    gameCanvas,
    overlayCanvas,
    uiRoot,
    rendererFactory: host.rendererFactory,
    mountUi: host.mountUi,
    addResizeListener: host.addResizeListener,
    requestFrame: host.requestFrame,
    cancelFrame: host.cancelFrame,
    devicePixelRatio: host.devicePixelRatio,
    exposeDebug: host.exposeDebug ?? ((game) => {
      (globalThis as Record<string, unknown>).__game = game;
    }),
  }, options);
};
