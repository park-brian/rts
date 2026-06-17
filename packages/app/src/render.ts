// Render orchestrator. The world is drawn on a WebGL2 canvas (terrain + a single
// instanced sprite pass + fog — see gl/renderer.ts); screen-space chrome (minimap,
// drag box) is drawn on a thin 2D overlay stacked above it. The sprite atlas bakes
// asynchronously at startup; until it's ready (or if WebGL2 is unavailable) we draw
// everything with the Canvas2D fallback, so the game is never blank.

import type { Game } from './game.ts';
import { render2d, drawMinimap, drawDragBox } from './render2d.ts';
import { GlRenderer } from './gl/renderer.ts';
import { Gl } from './gl/gl.ts';
import { buildAtlas } from './gl/atlas.ts';
import { ui } from './store.ts';

export class Renderer {
  private gl: GlRenderer | null = null;
  private overlay: CanvasRenderingContext2D;

  constructor(worldCanvas: HTMLCanvasElement, overlayCanvas: HTMLCanvasElement) {
    this.overlay = overlayCanvas.getContext('2d')!;
    // Acquire the WebGL2 context once (a canvas can host only one context kind, so
    // if it's missing the Canvas2D fallback owns the overlay and we never touch GL).
    const ctx = worldCanvas.getContext('webgl2', {
      alpha: false, antialias: true, premultipliedAlpha: false, depth: false,
    });
    if (ctx) {
      const core = new Gl(ctx);
      void buildAtlas()
        .then((atlas) => { this.gl = new GlRenderer(core, atlas); })
        .catch((err) => { console.warn('atlas/GL init failed, using Canvas2D', err); });
    }
  }

  render(game: Game, dpr: number): void {
    if (this.gl && !ui.mathRenderer.value) {
      this.gl.render(game, dpr);
      // overlay: clear + screen-space chrome only.
      this.overlay.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.overlay.clearRect(0, 0, game.viewW, game.viewH);
      drawDragBox(this.overlay, game);
      if (ui.controlScheme.value !== 'desktop') drawMinimap(this.overlay, game);
    } else {
      // Fallback: the 2D renderer draws the full scene (incl. minimap) on the overlay.
      render2d(this.overlay, game, dpr);
    }
  }
}
