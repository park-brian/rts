// Entry point: size the canvases, mount the HUD, and run the fixed-timestep loop —
// sim updates inside game.update, the world drawn imperatively on WebGL with a 2D
// overlay for chrome, HUD via Preact signals.

import { render as mount } from 'preact';
import { Game } from './game.ts';
import { App } from './ui.tsx';
import { Renderer } from './render.ts';
import { attachInput } from './input.ts';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const overlay = document.getElementById('overlay') as HTMLCanvasElement;
const uiEl = document.getElementById('ui') as HTMLElement;
const game = new Game('play');
const renderer = new Renderer(canvas, overlay);
(globalThis as Record<string, unknown>).__game = game; // handy for debugging/automation

let dpr = 1;
const resize = (): void => {
  dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width));
  const h = Math.max(1, Math.floor(rect.height));
  for (const c of [canvas, overlay]) {
    c.width = Math.floor(w * dpr);
    c.height = Math.floor(h * dpr);
  }
  game.resize(w, h);
};
globalThis.addEventListener('resize', resize);
resize();

attachInput(canvas, game);
mount(<App game={game} />, uiEl);

const loop = (t: number): void => {
  game.update(t);
  renderer.render(game, dpr);
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);
