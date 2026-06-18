// Entry point: size the canvases, mount the HUD, and run the fixed-timestep loop —
// sim updates inside game.update, the world drawn imperatively on WebGL with a 2D
// overlay for chrome, HUD via Preact signals.

import { render as mount } from 'preact';
import { App } from './ui.tsx';
import { Renderer } from './render.ts';
import { startAppFromDocument } from './browser-app.ts';

startAppFromDocument({
  document,
  rendererFactory: (gameCanvas, overlayCanvas) => new Renderer(gameCanvas, overlayCanvas),
  mountUi: (game, root) => mount(<App game={game} />, root),
});
