// Canvas2D renderer — the fallback when WebGL2 is unavailable, and the source of
// the screen-space chrome (minimap + drag box) reused by the GL path's 2D overlay.
// Draws cached terrain, fog of war, resources, units/buildings, selection, minimap.

import { TILE, ONE, Units, Role, Kind, eid, slotOf, isAlive, type MapDef } from './sim.ts';
import type { Game } from './game.ts';

const OWN = ['#4ea1ff', '#ff5a5a', '#ffd24e', '#9b7bff', '#5affa0', '#ff9b4e'];
const NEUTRAL_COL = '#49d0c0';
const color = (owner: number): string => OWN[owner] ?? NEUTRAL_COL;

let terrainKey: MapDef | null = null;
let terrainCanvas: HTMLCanvasElement | null = null;

const buildTerrain = (m: MapDef): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.width = m.w * TILE; c.height = m.h * TILE;
  const g = c.getContext('2d')!;
  for (let ty = 0; ty < m.h; ty++) {
    for (let tx = 0; tx < m.w; tx++) {
      const i = ty * m.w + tx;
      const walk = m.walk[i] === 1;
      const high = m.elev[i]! >= 1;
      g.fillStyle = !walk ? '#05070d' : high ? '#0e1622' : '#090d16';
      g.fillRect(tx * TILE, ty * TILE, TILE, TILE);
    }
  }
  // Cliff edges: a glowing cyan trace below high/blocked tiles (tron sense of height).
  g.fillStyle = 'rgba(110,205,235,0.30)';
  for (let ty = 0; ty < m.h - 1; ty++) {
    for (let tx = 0; tx < m.w; tx++) {
      const a = m.walk[ty * m.w + tx] === 0 || m.elev[ty * m.w + tx]! >= 1;
      const b = m.walk[(ty + 1) * m.w + tx] === 0 || m.elev[(ty + 1) * m.w + tx]! >= 1;
      if (a && !b) g.fillRect(tx * TILE, (ty + 1) * TILE, TILE, 3);
    }
  }
  return c;
};

export const render2d = (ctx: CanvasRenderingContext2D, game: Game, dpr: number): void => {
  const m = game.map;
  if (terrainKey !== m) { terrainCanvas = buildTerrain(m); terrainKey = m; }
  const s = game.sim.fullState();
  const e = s.e;
  const z = game.zoom * dpr;

  // Clear (CSS-px space).
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, game.viewW, game.viewH);

  // World space.
  ctx.setTransform(z, 0, 0, z, -game.camX * z, -game.camY * z);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(terrainCanvas!, 0, 0);

  // Visible tile range (for fog + culling).
  const tx0 = Math.max(0, Math.floor(game.camX / TILE));
  const ty0 = Math.max(0, Math.floor(game.camY / TILE));
  const tx1 = Math.min(m.w - 1, Math.ceil((game.camX + game.viewW / game.zoom) / TILE));
  const ty1 = Math.min(m.h - 1, Math.ceil((game.camY + game.viewH / game.zoom) / TILE));

  // Entities.
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1) continue;
    const wx = e.x[i]! / ONE; const wy = e.y[i]! / ONE;
    const ttx = Math.floor(wx / TILE); const tty = Math.floor(wy / TILE);
    const vis = game.tileVisible(ttx, tty);
    const def = Units[e.kind[i]!]!;
    const isStruct = (def.roles & Role.Structure) !== 0;
    const isRes = (def.roles & Role.Resource) !== 0;
    const isGeyser = e.kind[i] === Kind.Geyser;
    const own = e.owner[i] === game.human;
    if (!own && !isRes && !isGeyser && vis !== 2) continue; // hide unseen enemies
    if ((isRes || isGeyser) && vis === 0) continue; // hide unexplored resources
    const baseR = def.radius / ONE;
    const r = isStruct || isRes || isGeyser ? baseR : Math.max(baseR, 5 / game.zoom); // keep units visible when zoomed out

    if (isGeyser) {
      ctx.fillStyle = '#56d364'; // vespene green marker
      ctx.beginPath(); ctx.arc(wx, wy, r, 0, Math.PI * 2); ctx.fill();
    } else if (isStruct) {
      ctx.globalAlpha = e.built[i] === 1 ? 1 : 0.55;
      ctx.fillStyle = e.kind[i] === Kind.Refinery ? '#3fae57' : color(e.owner[i]!); // gas building tinted green
      ctx.fillRect(wx - r, wy - r, r * 2, r * 2);
      ctx.globalAlpha = 1;
    } else if (isRes) {
      const frac = Math.max(0.3, Math.min(1, e.cargo[i]! / 1500));
      ctx.fillStyle = NEUTRAL_COL;
      ctx.fillRect(wx - r, wy - r * frac, r * 2, r * 2 * frac);
    } else {
      ctx.beginPath();
      ctx.arc(wx, wy, r, 0, Math.PI * 2);
      ctx.fillStyle = color(e.owner[i]!);
      ctx.fill();
    }

    // selection ring
    if (game.selection.has(eid(e, i))) {
      ctx.strokeStyle = '#ffe14e'; ctx.lineWidth = 2 / game.zoom;
      ctx.strokeRect(wx - r - 2, wy - r - 2, r * 2 + 4, r * 2 + 4);
    }
    // hp bar
    if (e.hp[i]! < def.hp && def.hp > 0) {
      const w = r * 2; const frac = Math.max(0, e.hp[i]! / def.hp);
      ctx.fillStyle = '#000'; ctx.fillRect(wx - r, wy - r - 5, w, 3);
      ctx.fillStyle = frac > 0.5 ? '#5aff7a' : frac > 0.25 ? '#ffd24e' : '#ff5a5a';
      ctx.fillRect(wx - r, wy - r - 5, w * frac, 3);
    }
  }

  // Rally lines for selected structures.
  for (const id of game.selection) {
    if (!isAlive(e, id)) continue;
    const i = slotOf(id);
    if ((e.flags[i]! & Role.Structure) === 0 || e.rallyX[i]! < 0) continue;
    const bx = e.x[i]! / ONE; const by = e.y[i]! / ONE;
    const rx = e.rallyX[i]! / ONE; const ry = e.rallyY[i]! / ONE;
    ctx.strokeStyle = '#ffe14e'; ctx.lineWidth = 1.5 / game.zoom;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(rx, ry); ctx.stroke();
    ctx.fillStyle = '#ffe14e';
    ctx.beginPath(); ctx.arc(rx, ry, 4 / game.zoom, 0, Math.PI * 2); ctx.fill();
  }

  // Fog overlay (only non-fully-visible tiles, within view).
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const v = game.tileVisible(tx, ty);
      if (v === 2) continue;
      ctx.fillStyle = v === 1 ? 'rgba(4,6,10,0.5)' : 'rgba(4,6,10,0.92)';
      ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
    }
  }

  // Screen space: drag box + minimap.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawDragBox(ctx, game);
  drawMinimap(ctx, game);
};

/** Live selection drag box (screen px). Shared by the GL overlay. */
export const drawDragBox = (ctx: CanvasRenderingContext2D, game: Game): void => {
  if (!game.box) return;
  const b = game.box;
  ctx.strokeStyle = '#ffe14e'; ctx.lineWidth = 1;
  ctx.strokeRect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
  ctx.fillStyle = 'rgba(255,225,78,0.12)';
  ctx.fillRect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
};

export const drawMinimap = (ctx: CanvasRenderingContext2D, game: Game): void => {
  const m = game.map;
  const size = 116;
  const pad = 8;
  const scale = size / Math.max(m.w, m.h);
  const W = m.w * scale; const H = m.h * scale;
  const ox = game.viewW - W - pad; const oy = game.viewH - H - pad;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(ox - 2, oy - 2, W + 4, H + 4);
  // terrain (coarse)
  for (let ty = 0; ty < m.h; ty += 2) {
    for (let tx = 0; tx < m.w; tx += 2) {
      const v = game.tileVisible(tx, ty);
      if (v === 0) { ctx.fillStyle = '#05070b'; }
      else { ctx.fillStyle = m.walk[ty * m.w + tx] === 0 ? '#0a0e16' : m.elev[ty * m.w + tx]! >= 1 ? '#16263a' : '#0f1622'; }
      ctx.fillRect(ox + tx * scale, oy + ty * scale, scale * 2, scale * 2);
    }
  }
  const e = game.sim.fullState().e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1) continue;
    const tx = Math.floor(e.x[i]! / ONE / TILE); const ty = Math.floor(e.y[i]! / ONE / TILE);
    if (e.owner[i] !== game.human && game.tileVisible(tx, ty) !== 2 && (Units[e.kind[i]!]!.roles & Role.Resource) === 0) continue;
    ctx.fillStyle = (Units[e.kind[i]!]!.roles & Role.Resource) !== 0 ? NEUTRAL_COL : color(e.owner[i]!);
    ctx.fillRect(ox + tx * scale, oy + ty * scale, 2, 2);
  }
  // camera rect
  ctx.strokeStyle = '#ffffff80'; ctx.lineWidth = 1;
  ctx.strokeRect(ox + (game.camX / TILE) * scale, oy + (game.camY / TILE) * scale,
    (game.viewW / game.zoom / TILE) * scale, (game.viewH / game.zoom / TILE) * scale);
};
