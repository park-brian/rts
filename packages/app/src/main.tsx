// Entry point: size the canvas, mount the HUD, and run the fixed-timestep loop —
// sim updates inside game.update, world drawn imperatively, HUD via Preact signals.

import { render as mount } from 'preact';
import { Game } from './game.ts';
import { App } from './ui.tsx';
import { render as draw } from './render.ts';
import { attachInput } from './input.ts';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const uiEl = document.getElementById('ui') as HTMLElement;
const ctx = canvas.getContext('2d')!;
const game = new Game('play');
(globalThis as Record<string, unknown>).__game = game; // handy for debugging/automation

let dpr = 1;
const resize = (): void => {
  dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  const w = globalThis.innerWidth;
  const h = globalThis.innerHeight;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  game.resize(w, h);
};
globalThis.addEventListener('resize', resize);
resize();

attachInput(canvas, game);
mount(<App game={game} />, uiEl);

const loop = (t: number): void => {
  game.update(t);
  draw(ctx, game, dpr);
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);
