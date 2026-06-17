// Canvas2D math renderer — the fallback when WebGL2 is unavailable and the
// explicit footprint/debug view. It draws gameplay truth, not sprite art.

import {
  TILE, ONE, Units, Role, Kind, NONE, eid, slotOf, isAlive, resolveRallyEndpoint,
  structureFootprint, bodyBounds, isCloaked, type MapDef,
} from './sim.ts';
import type { Game } from './game.ts';
import { type WorkActivity, workActivities } from './activity.ts';
import { type VisibilityAffordance, visibilityAffordances } from './visibility-affordances.ts';
import { ui } from './store.ts';

const OWN = ['#4ea1ff', '#ff5a5a', '#ffd24e', '#9b7bff', '#5affa0', '#ff9b4e'];
const NEUTRAL_COL = '#49d0c0';
const color = (owner: number): string => OWN[owner] ?? NEUTRAL_COL;
const footprintColor = (owner: number, alpha: number): string => {
  const hex = color(owner);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

let terrainKey: MapDef | null = null;
let terrainCanvas: HTMLCanvasElement | null = null;
const workScratch: WorkActivity[] = [];
const affordanceScratch: VisibilityAffordance[] = [];

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
    if (e.alive[i] !== 1 || e.container[i] !== NONE) continue;
    const wx = e.x[i]! / ONE; const wy = e.y[i]! / ONE;
    const kind = e.kind[i]!;
    const def = Units[kind]!;
    const isStruct = (def.roles & Role.Structure) !== 0;
    const isRes = (def.roles & Role.Resource) !== 0;
    const isFootprint = isStruct || isRes || kind === Kind.Geyser;
    if (!game.canSeeEntity(i)) continue;
    const alpha = isCloaked(s, i) ? 0.5 : 1;

    let overlayX = wx;
    let overlayY = wy;
    let overlayW = Math.max(2, def.radius / ONE * 2);
    let overlayH = overlayW;
    if (isFootprint) {
      const fp = structureFootprint(kind, e.x[i]!, e.y[i]!);
      const x = fp.x0 * TILE;
      const y = fp.y0 * TILE;
      const w = (fp.x1 - fp.x0 + 1) * TILE;
      const h = (fp.y1 - fp.y0 + 1) * TILE;
      overlayX = x + w / 2;
      overlayY = y + h / 2;
      overlayW = w;
      overlayH = h;
      ctx.globalAlpha = alpha * (e.built[i] === 1 ? 1 : 0.55);
      ctx.fillStyle = isRes || kind === Kind.Geyser ? 'rgba(73,208,192,0.22)' : footprintColor(e.owner[i]!, 0.22);
      ctx.strokeStyle = isRes || kind === Kind.Geyser ? NEUTRAL_COL : color(e.owner[i]!);
      ctx.lineWidth = 1.5 / game.zoom;
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      ctx.globalAlpha = 1;
    } else {
      const r = def.radius / ONE;
      overlayW = r * 2;
      overlayH = r * 2;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = footprintColor(e.owner[i]!, 0.26);
      ctx.strokeStyle = color(e.owner[i]!);
      ctx.lineWidth = 1.5 / game.zoom;
      ctx.beginPath();
      ctx.arc(wx, wy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      const b = bodyBounds(kind);
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1 / game.zoom;
      ctx.strokeRect(wx - b.left / ONE, wy - b.up / ONE, (b.left + b.right) / ONE, (b.up + b.down) / ONE);

      const dx = e.faceX[i]!;
      const dy = e.faceY[i]!;
      if (dx !== 0 || dy !== 0) {
        const len = Math.hypot(dx, dy) || 1;
        ctx.strokeStyle = '#ffffffb0';
        ctx.beginPath();
        ctx.moveTo(wx, wy);
        ctx.lineTo(wx + (dx / len) * r, wy + (dy / len) * r);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    const selected = game.selection.has(eid(e, i));
    // selection ring
    if (selected) {
      ctx.strokeStyle = '#ffe14e'; ctx.lineWidth = 2 / game.zoom;
      ctx.strokeRect(overlayX - overlayW / 2 - 2, overlayY - overlayH / 2 - 2, overlayW + 4, overlayH + 4);
    }
    // Health/progress bar, anchored above the visible body.
    const maxLife = def.hp + def.shields;
    const life = e.hp[i]! + e.shield[i]!;
    if (selected && !isRes && kind !== Kind.Geyser && maxLife > 0) {
      const progress = e.built[i] !== 1 && def.buildTime > 0
        ? 1 - Math.max(0, e.ctimer[i]!) / def.buildTime
        : Math.max(0, life / maxLife);
      const w = overlayW;
      const frac = Math.max(0, Math.min(1, progress));
      ctx.fillStyle = '#000'; ctx.fillRect(overlayX - w / 2, overlayY - overlayH / 2 - 5, w, 3);
      ctx.fillStyle = e.built[i] !== 1 ? '#49d0c0' : frac > 0.5 ? '#5aff7a' : frac > 0.25 ? '#ffd24e' : '#ff5a5a';
      ctx.fillRect(overlayX - w / 2, overlayY - overlayH / 2 - 5, w * frac, 3);
    }
  }

  drawWorkSparks(ctx, game);
  drawVisibilityAffordances(ctx, game);

  // Rally lines for selected structures.
  for (const id of game.selection) {
    if (!isAlive(e, id)) continue;
    const i = slotOf(id);
    if ((e.flags[i]! & Role.Structure) === 0 || e.rallyX[i]! < 0) continue;
    const rally = resolveRallyEndpoint(s, i);
    if (!rally) continue;
    const bx = e.x[i]! / ONE; const by = e.y[i]! / ONE;
    const rx = rally.x / ONE;
    const ry = rally.y / ONE;
    ctx.strokeStyle = '#ffe14e'; ctx.lineWidth = 1.5 / game.zoom;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(rx, ry); ctx.stroke();
    ctx.strokeStyle = '#ffe14e';
    ctx.lineWidth = 2 / game.zoom;
    const targetDef = rally.target >= 0 ? Units[e.kind[rally.target]!] : undefined;
    const r = targetDef ? Math.max(6 / game.zoom, targetDef.radius / ONE + 5 / game.zoom) : 4 / game.zoom;
    ctx.beginPath(); ctx.arc(rx, ry, r, 0, Math.PI * 2); ctx.stroke();
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
  if (ui.controlScheme.value !== 'desktop') drawMinimap(ctx, game);
};

const drawWorkSparks = (ctx: CanvasRenderingContext2D, game: Game): void => {
  const s = game.sim.fullState();
  ctx.save();
  for (const a of workActivities(s, workScratch)) {
    if (!game.canSeeEntity(a.worker) || !game.canSeeEntity(a.target)) continue;
    const x = a.x / ONE;
    const y = a.y / ONE;
    const tick = s.tick + a.worker * 7;
    const color = a.kind === 'repair' ? '#8feeff' : '#ffd57a';
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.2 / game.zoom;
    for (let n = 0; n < 3; n++) {
      const phase = ((tick + n * 4) % 12) / 12;
      const angle = phase * Math.PI * 2 + n * 2.1;
      const len = (5 + n * 1.5) / game.zoom;
      const ox = Math.cos(angle) * len;
      const oy = Math.sin(angle) * len;
      ctx.globalAlpha = 0.35 + (1 - phase) * 0.45;
      ctx.beginPath();
      ctx.moveTo(x - ox * 0.25, y - oy * 0.25);
      ctx.lineTo(x + ox, y + oy);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1.2, 2.1 / game.zoom), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

const drawVisibilityAffordances = (ctx: CanvasRenderingContext2D, game: Game): void => {
  const s = game.sim.fullState();
  ctx.save();
  for (const a of visibilityAffordances(game, affordanceScratch)) {
    const phase = ((s.tick + a.timer) % 24) / 24;
    if (a.kind === 'scan') {
      ctx.strokeStyle = 'rgba(100,210,255,0.78)';
      ctx.lineWidth = 1.8 / game.zoom;
      ctx.beginPath();
      ctx.arc(a.x, a.y, a.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(100,210,255,0.24)';
      ctx.lineWidth = 6 / game.zoom;
      ctx.beginPath();
      ctx.arc(a.x, a.y, a.radius * (0.92 + phase * 0.08), 0, Math.PI * 2);
      ctx.stroke();
    } else {
      const r = a.radius * (0.94 + phase * 0.08);
      ctx.strokeStyle = 'rgba(255,80,70,0.9)';
      ctx.lineWidth = 2.2 / game.zoom;
      ctx.beginPath();
      ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(a.x - r * 0.35, a.y);
      ctx.lineTo(a.x + r * 0.35, a.y);
      ctx.moveTo(a.x, a.y - r * 0.35);
      ctx.lineTo(a.x, a.y + r * 0.35);
      ctx.stroke();
    }
  }
  ctx.restore();
};

/** Live selection drag box (screen px). Shared by the GL overlay. */
export const drawDragBox = (ctx: CanvasRenderingContext2D, game: Game): void => {
  drawPlacementGhost(ctx, game);
  if (!game.box) return;
  const b = game.box;
  ctx.strokeStyle = '#ffe14e'; ctx.lineWidth = 1;
  ctx.strokeRect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
  ctx.fillStyle = 'rgba(255,225,78,0.12)';
  ctx.fillRect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
};

export const drawPlacementGhost = (ctx: CanvasRenderingContext2D, game: Game): void => {
  const ghost = game.placementGhost;
  if (!ghost) return;
  const fp = structureFootprint(ghost.kind, ghost.x, ghost.y);
  const x = (fp.x0 * TILE - game.camX) * game.zoom;
  const y = (fp.y0 * TILE - game.camY) * game.zoom;
  const w = (fp.x1 - fp.x0 + 1) * TILE * game.zoom;
  const h = (fp.y1 - fp.y0 + 1) * TILE * game.zoom;
  ctx.save();
  ctx.fillStyle = ghost.ok ? 'rgba(90,255,122,0.20)' : 'rgba(255,90,90,0.22)';
  ctx.strokeStyle = ghost.ok ? '#5aff7a' : '#ff5a5a';
  ctx.lineWidth = 2;
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
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
    if (e.alive[i] !== 1 || e.container[i] !== NONE) continue;
    const tx = Math.floor(e.x[i]! / ONE / TILE); const ty = Math.floor(e.y[i]! / ONE / TILE);
    if (!game.canSeeEntity(i)) continue;
    ctx.fillStyle = (Units[e.kind[i]!]!.roles & Role.Resource) !== 0 ? NEUTRAL_COL : color(e.owner[i]!);
    ctx.fillRect(ox + tx * scale, oy + ty * scale, 2, 2);
  }
  // camera rect
  ctx.strokeStyle = '#ffffff80'; ctx.lineWidth = 1;
  ctx.strokeRect(ox + (game.camX / TILE) * scale, oy + (game.camY / TILE) * scale,
    (game.viewW / game.zoom / TILE) * scale, (game.viewH / game.zoom / TILE) * scale);
};
