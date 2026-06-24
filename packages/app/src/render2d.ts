// Canvas2D math renderer — the fallback when WebGL2 is unavailable and the
// explicit footprint/debug view. It draws gameplay truth, not sprite art.

import {
  TILE, ONE, Units, Role, Kind, Order, NONE, eid, slotOf, isAlive, resolveUnitRallyEndpoint, resolveWorkerRallyEndpoint,
  structureFootprint, effectiveSight, isDetectorKind, isPowered, tiles, upgradedRange,
  actorRenderPresentation, entityCloakOpacity, entityLifeBar, entityMinimapVisible, entityRenderHull,
  activeOrderVectors, entityLifecycle, illusionPresentation, queuedTravelWaypoints, selectionBase, upgradedCooldown, weaponForTarget,
  type ActiveOrderVector, type MapDef, type QueuedTravelWaypoint, type State,
} from './sim.ts';
import type { Game } from './game.ts';
import { type WorkActivity, workActivities } from './activity.ts';
import {
  fieldAffordances, lastKnownEnemies, type FieldAffordance, type LastKnownAffordance, type VisibilityAffordance, visibilityAffordances,
} from './visibility-affordances.ts';
import { entityPresentation } from './entity-presentation.ts';
import { ui } from './store.ts';
import {
  placementFieldOverlays,
  queuedWaypointPresentation,
  type PlacementFieldOverlay,
  type QueuedWaypointMarker,
} from './world-overlays.ts';

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
const rgba = (rgb: readonly [number, number, number], alpha: number): string =>
  `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;

const drawEntityLabel = (
  ctx: CanvasRenderingContext2D,
  game: Game,
  label: string,
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number,
  alpha: number,
): void => {
  if (alpha <= 0) return;
  const size = Math.min(11 / game.zoom, maxWidth / Math.max(1, label.length * 0.68), maxHeight * 0.62);
  if (size < 2 / game.zoom) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `700 ${size}px ui-monospace, SFMono-Regular, Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(1 / game.zoom, size * 0.24);
  ctx.strokeStyle = 'rgba(0,0,0,0.88)';
  ctx.fillStyle = '#f8fbff';
  ctx.strokeText(label, x, y, maxWidth);
  ctx.fillText(label, x, y, maxWidth);
  ctx.restore();
};

const drawFacingDot = (
  ctx: CanvasRenderingContext2D,
  game: Game,
  x: number,
  y: number,
  radius: number,
  dx: number,
  dy: number,
  alpha: number,
): void => {
  if (alpha <= 0) return;
  if (dx === 0 && dy === 0) return;
  const len = Math.hypot(dx, dy) || 1;
  const dotX = x + (dx / len) * radius;
  const dotY = y + (dy / len) * radius;
  const dotR = Math.max(1 / game.zoom, Math.min(radius * 0.28, 2.6 / game.zoom));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#f8fbff';
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.lineWidth = Math.max(0.75 / game.zoom, dotR * 0.35);
  ctx.beginPath();
  ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
};

const lifecycleCenterLabel = (s: State, slot: number, fallback: string): string => {
  const lifecycle = entityLifecycle(s, slot);
  if (!lifecycle.busy) return fallback;
  if (
    lifecycle.state === 'training' ||
    lifecycle.state === 'constructing' ||
    lifecycle.state === 'morphing' ||
    lifecycle.state === 'merging' ||
    lifecycle.state === 'transitioning'
  ) {
    return Units[lifecycle.targetKind]?.shortName ?? fallback;
  }
  return fallback;
};

const drawStructureProgressBar = (
  ctx: CanvasRenderingContext2D,
  game: Game,
  x: number,
  y: number,
  w: number,
  progress: number,
  alpha: number,
): void => {
  const h = Math.max(2 / game.zoom, 3.5 / game.zoom);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(0,0,0,0.82)';
  ctx.fillRect(x, y - h - 1 / game.zoom, w, h);
  ctx.fillStyle = '#49d0c0';
  ctx.fillRect(x, y - h - 1 / game.zoom, w * Math.max(0, Math.min(1, progress)), h);
  ctx.restore();
};

const drawStructureMathGlyph = (
  ctx: CanvasRenderingContext2D,
  game: Game,
  kind: number,
  owner: number,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  alpha: number,
): boolean => {
  const def = Units[kind]!;
  const isBase = (def.roles & Role.ResourceDepot) !== 0;
  const isBarracks = kind === Kind.Barracks;
  if (!isBase && !isBarracks) return false;

  const cx = x + w / 2;
  const cy = y + h / 2;
  const glow = color(owner);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = glow;
  ctx.shadowBlur = Math.max(4 / game.zoom, Math.min(w, h) * 0.08);
  ctx.strokeStyle = glow;
  ctx.lineWidth = 1.8 / game.zoom;
  if (isBase) {
    ctx.beginPath();
    ctx.arc(cx, cy, Math.min(w, h) * 0.28, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(cx, y + h * 0.24);
    ctx.lineTo(x + w * 0.72, y + h * 0.72);
    ctx.lineTo(x + w * 0.28, y + h * 0.72);
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
  drawEntityLabel(ctx, game, label, cx, cy, w * 0.54, h * 0.36, alpha);
  return true;
};

let terrainKey: MapDef | null = null;
let terrainCanvas: HTMLCanvasElement | null = null;
const workScratch: WorkActivity[] = [];
const affordanceScratch: VisibilityAffordance[] = [];
const fieldScratch: FieldAffordance[] = [];
const lastKnownScratch: LastKnownAffordance[] = [];
const placementFieldScratch: PlacementFieldOverlay[] = [];
const queuedTravelScratch: QueuedTravelWaypoint[] = [];
const activeOrderScratch: ActiveOrderVector[] = [];


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

  // Math mode is the canonical gameplay-geometry view; draw the build-tile grid
  // subtly so footprint, range, and placement bugs can be compared to exact tiles.
  ctx.strokeStyle = 'rgba(125, 170, 210, 0.10)';
  ctx.lineWidth = 1 / game.zoom;
  ctx.beginPath();
  for (let x = 0; x <= m.w * TILE; x += TILE) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, m.h * TILE);
  }
  for (let y = 0; y <= m.h * TILE; y += TILE) {
    ctx.moveTo(0, y);
    ctx.lineTo(m.w * TILE, y);
  }
  ctx.stroke();

  // Visible tile range (for fog + culling).
  const tx0 = Math.max(0, Math.floor(game.camX / TILE));
  const ty0 = Math.max(0, Math.floor(game.camY / TILE));
  const tx1 = Math.min(m.w - 1, Math.ceil((game.camX + game.viewW / game.zoom) / TILE));
  const ty1 = Math.min(m.h - 1, Math.ceil((game.camY + game.viewH / game.zoom) / TILE));

  drawEffectFields(ctx, game);
  drawAttackLinks(ctx, game);
  drawOrderVectors(ctx, game);

  // Entities.
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.container[i] !== NONE) continue;
    const wx = e.x[i]! / ONE; const wy = e.y[i]! / ONE;
    const kind = e.kind[i]!;
    const def = Units[kind]!;
    const isRes = (def.roles & Role.Resource) !== 0;
    if (!game.canSeeEntity(i)) continue;
    const illusion = illusionPresentation(s, game.human, i);
    const presentation = entityPresentation(s, i);
    const morphingCocoon = presentation.state === 'zerg-combat-morph';
    const mergeSummon = presentation.state === 'protoss-merge-summon';
    const alpha = entityCloakOpacity(s, i) * illusion.alpha;
    const hull = entityRenderHull(kind, e.x[i]!, e.y[i]!);

    if (hull.usesFootprint) {
      const x = hull.x0;
      const y = hull.y0;
      const w = hull.width;
      const h = hull.height;
      ctx.globalAlpha = alpha * (e.built[i] === 1 ? 1 : 0.55);
      ctx.fillStyle = isRes || kind === Kind.Geyser
        ? 'rgba(73,208,192,0.22)'
        : presentation.state === 'protoss-warp-in'
        ? 'rgba(88,150,255,0.18)'
        : presentation.state === 'zerg-structure-morph'
        ? 'rgba(100,230,135,0.18)'
        : footprintColor(e.owner[i]!, 0.22);
      ctx.strokeStyle = isRes || kind === Kind.Geyser
        ? NEUTRAL_COL
        : presentation.state === 'protoss-warp-in'
        ? '#8fb6ff'
        : presentation.state === 'zerg-structure-morph'
        ? '#8cff92'
        : color(e.owner[i]!);
      ctx.lineWidth = 1.5 / game.zoom;
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      if (presentation.state === 'protoss-warp-in' || presentation.state === 'zerg-structure-morph') {
        ctx.strokeStyle = presentation.state === 'protoss-warp-in' ? 'rgba(120,210,255,0.65)' : 'rgba(190,255,170,0.6)';
        ctx.lineWidth = 1 / game.zoom;
        ctx.strokeRect(x + 4 / game.zoom, y + 4 / game.zoom, w - 8 / game.zoom, h - 8 / game.zoom);
      }
      const lifecycle = entityLifecycle(s, i);
      if (lifecycle.busy && lifecycle.total > 0) drawStructureProgressBar(ctx, game, x, y, w, lifecycle.progress, alpha);
      ctx.globalAlpha = 1;
      const label = lifecycleCenterLabel(s, i, def.shortName);
      if (!drawStructureMathGlyph(ctx, game, kind, e.owner[i]!, x, y, w, h, label, alpha)) {
        drawEntityLabel(ctx, game, label, x + w / 2, y + h / 2, w * 0.82, h * 0.62, alpha);
      }
    } else {
      const r = def.radius / ONE;
      const actorPresentation = actorRenderPresentation(kind, r, game.zoom);
      const projectile = actorPresentation.role === 'projectile';
      if (projectile) {
        const glowR = actorPresentation.radius;
        ctx.globalAlpha = alpha * 0.42;
        ctx.fillStyle = 'rgba(255,210,78,0.5)';
        ctx.beginPath();
        ctx.arc(wx, wy, glowR, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = alpha;
      ctx.fillStyle = morphingCocoon
        ? 'rgba(100,230,135,0.22)'
        : mergeSummon
        ? 'rgba(125,150,255,0.22)'
        : projectile
        ? 'rgba(255,225,120,0.58)'
        : illusion.known ? 'rgba(125,190,255,0.18)' : footprintColor(e.owner[i]!, 0.26);
      ctx.strokeStyle = morphingCocoon ? '#8cff92' : mergeSummon ? '#a9bcff' : projectile ? '#fff1a8' : color(e.owner[i]!);
      ctx.lineWidth = 1.5 / game.zoom;
      ctx.beginPath();
      ctx.arc(wx, wy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (morphingCocoon) {
        ctx.strokeStyle = 'rgba(190,255,170,0.75)';
        ctx.lineWidth = 1.2 / game.zoom;
        ctx.beginPath();
        ctx.ellipse(wx, wy, r * 0.62, r * 0.92, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (mergeSummon) {
        ctx.strokeStyle = kind === Kind.DarkArchon ? 'rgba(190,120,255,0.72)' : 'rgba(120,210,255,0.72)';
        ctx.lineWidth = 1.2 / game.zoom;
        for (const scale of [0.55, 0.85]) {
          ctx.beginPath();
          ctx.arc(wx, wy, r * scale, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1 / game.zoom;
      ctx.strokeRect(hull.x0, hull.y0, hull.width, hull.height);

      ctx.globalAlpha = 1;
      if (!mergeSummon) drawFacingDot(ctx, game, wx, wy, r, e.faceX[i]!, e.faceY[i]!, alpha);
      drawEntityLabel(ctx, game, def.shortName, wx, wy, r * 1.68, r * 1.28, alpha);
    }

    const selected = game.selection.has(eid(e, i));
    // Selection base: gameplay footprint, not sprite bounds.
    if (selected) {
      drawSelectedRangeOverlays(ctx, game, s, i, hull);
      const base = selectionBase(kind);
      const pad = 2 / game.zoom;
      ctx.strokeStyle = illusion.known ? '#7dbeff' : '#ffe14e';
      ctx.lineWidth = 2 / game.zoom;
      if (base.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(wx + base.offsetX, wy + base.offsetY, base.radius + pad, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeRect(
          wx + base.offsetX - base.width / 2 - pad,
          wy + base.offsetY - base.height / 2 - pad,
          base.width + pad * 2,
          base.height + pad * 2,
        );
      }
    }
    // Health/progress bar, anchored above the visible body.
    const bar = entityLifeBar(s, i, selected);
    if (bar) {
      const y = bar.y - 5;
      ctx.fillStyle = '#000'; ctx.fillRect(bar.x - bar.width / 2, y, bar.width, 3);
      ctx.fillStyle = bar.kind === 'construction' ? '#49d0c0' : bar.fraction > 0.5 ? '#5aff7a' : bar.fraction > 0.25 ? '#ffd24e' : '#ff5a5a';
      ctx.fillRect(bar.x - bar.width / 2, y, bar.width * bar.fraction, 3);
    }
  }

  drawWorkSparks(ctx, game);
  drawLastKnownEnemies(ctx, game);
  drawVisibilityAffordances(ctx, game);

  drawRallyLines(ctx, game, s);

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

type RenderHull = ReturnType<typeof entityRenderHull>;

const strokeExpandedHull = (ctx: CanvasRenderingContext2D, hull: RenderHull, range: number): void => {
  if (hull.usesFootprint) {
    ctx.strokeRect(hull.x0 - range, hull.y0 - range, hull.width + range * 2, hull.height + range * 2);
    return;
  }
  ctx.beginPath();
  ctx.ellipse(hull.cx, hull.cy, hull.width / 2 + range, hull.height / 2 + range, 0, 0, Math.PI * 2);
  ctx.stroke();
};

const drawSelectedRangeOverlays = (
  ctx: CanvasRenderingContext2D,
  game: Game,
  s: State,
  slot: number,
  hull: RenderHull,
): void => {
  const e = s.e;
  const def = Units[e.kind[slot]!]!;
  const weapons = def.weapon === def.airWeapon
    ? [{ weapon: def.weapon, color: 'rgba(255,225,78,0.30)' }]
    : [
      { weapon: def.weapon, color: 'rgba(255,225,78,0.28)' },
      { weapon: def.airWeapon, color: 'rgba(120,210,255,0.26)' },
    ];

  ctx.save();
  ctx.lineWidth = 1 / game.zoom;
  for (const { weapon, color } of weapons) {
    if (!weapon || weapon.range <= 0) continue;
    ctx.strokeStyle = color;
    strokeExpandedHull(ctx, hull, upgradedRange(s, slot, weapon) / ONE);
  }
  if (isDetectorKind(e.kind[slot]!) && e.opticalFlare[slot] !== 1 && isPowered(s, slot)) {
    ctx.setLineDash([6 / game.zoom, 5 / game.zoom]);
    ctx.strokeStyle = 'rgba(120,255,210,0.30)';
    ctx.beginPath();
    ctx.arc(e.x[slot]! / ONE, e.y[slot]! / ONE, tiles(effectiveSight(s, e, slot, def.sight)) / ONE, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
};

const attackingTarget = (e: State['e'], slot: number): number => {
  const combatTarget = e.combatTarget[slot]!;
  if (combatTarget !== NONE) return combatTarget;
  return e.order[slot] === Order.Attack ? e.target[slot]! : NONE;
};

const recentlyFiredTarget = (s: State, slot: number): number => {
  const e = s.e;
  const targetId = attackingTarget(e, slot);
  if (targetId === NONE || !isAlive(e, targetId)) return NONE;
  const target = slotOf(targetId);
  const weapon = weaponForTarget(Units[e.kind[slot]!]!, Units[e.kind[target]!]!);
  if (!weapon) return NONE;
  const cooldown = upgradedCooldown(s, slot, weapon.cooldown);
  return e.wcd[slot]! > Math.max(0, cooldown - 3) ? targetId : NONE;
};

const drawAttackLinks = (ctx: CanvasRenderingContext2D, game: Game): void => {
  const s = game.sim.fullState();
  const e = s.e;
  ctx.save();
  ctx.lineWidth = 1.2 / game.zoom;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.container[i] !== NONE || !game.canSeeEntity(i)) continue;
    const targetId = recentlyFiredTarget(s, i);
    if (targetId === NONE || !isAlive(e, targetId)) continue;
    const target = slotOf(targetId);
    if (target === i || e.container[target] !== NONE || !game.canSeeEntity(target)) continue;
    ctx.strokeStyle = footprintColor(e.owner[i]!, 0.58);
    ctx.beginPath();
    ctx.moveTo(e.x[i]! / ONE, e.y[i]! / ONE);
    ctx.lineTo(e.x[target]! / ONE, e.y[target]! / ONE);
    ctx.stroke();
  }
  ctx.restore();
};

const drawOrderVectors = (ctx: CanvasRenderingContext2D, game: Game): void => {
  const s = game.sim.fullState();
  const e = s.e;
  ctx.save();
  ctx.lineWidth = 1 / game.zoom;
  ctx.strokeStyle = 'rgba(210,230,255,0.16)';
  ctx.fillStyle = 'rgba(210,230,255,0.22)';
  for (const vector of activeOrderVectors(s, activeOrderScratch)) {
    const slot = slotOf(vector.unit);
    if (!game.canSeeEntity(slot)) continue;
    const x = e.x[slot]! / ONE;
    const y = e.y[slot]! / ONE;
    if (Math.hypot(vector.x - x, vector.y - y) < 2 / game.zoom) continue;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(vector.x, vector.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(vector.x, vector.y, Math.max(1.5 / game.zoom, 2.2 / game.zoom), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

const drawRallyCircle = (
  ctx: CanvasRenderingContext2D,
  game: Game,
  s: State,
  target: number,
  x: number,
  y: number,
): void => {
  const e = s.e;
  const targetDef = target >= 0 ? Units[e.kind[target]!] : undefined;
  const r = targetDef ? Math.max(6 / game.zoom, targetDef.radius / ONE + 5 / game.zoom) : 4 / game.zoom;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
};

const drawRallyLines = (ctx: CanvasRenderingContext2D, game: Game, s: State): void => {
  const e = s.e;
  ctx.save();
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.container[i] !== NONE || (e.flags[i]! & Role.Structure) === 0) continue;
    if (!game.canSeeEntity(i)) continue;
    const show = game.selection.has(eid(e, i)) || (e.flags[i]! & Role.ResourceDepot) !== 0;
    if (!show) continue;
    const bx = e.x[i]! / ONE;
    const by = e.y[i]! / ONE;
    for (const [rally, alpha] of [
      [resolveUnitRallyEndpoint(s, i), 1],
      [resolveWorkerRallyEndpoint(s, i), 0.72],
    ] as const) {
      if (!rally) continue;
      const rx = rally.x / ONE;
      const ry = rally.y / ONE;
      ctx.strokeStyle = `rgba(255,225,78,${alpha})`;
      ctx.lineWidth = 1.5 / game.zoom;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(rx, ry);
      ctx.stroke();
      ctx.lineWidth = 2 / game.zoom;
      drawRallyCircle(ctx, game, s, rally.target, rx, ry);
    }
  }
  ctx.restore();
};

const drawWorkSparks = (ctx: CanvasRenderingContext2D, game: Game): void => {
  const s = game.sim.fullState();
  const e = s.e;
  ctx.save();
  for (const a of workActivities(s, workScratch)) {
    if (!game.canSeeEntity(a.worker) || !game.canSeeEntity(a.target)) continue;
    const x = a.x / ONE;
    const y = a.y / ONE;
    if (a.kind === 'harvest') {
      ctx.globalAlpha = 0.42;
      ctx.strokeStyle = 'rgba(73,208,192,0.78)';
      ctx.lineWidth = 1.1 / game.zoom;
      ctx.beginPath();
      ctx.moveTo(e.x[a.worker]! / ONE, e.y[a.worker]! / ONE);
      ctx.lineTo(e.x[a.target]! / ONE, e.y[a.target]! / ONE);
      ctx.stroke();
      if (!a.active) {
        ctx.globalAlpha = 1;
        continue;
      }
    }
    const tick = s.tick + a.worker * 7;
    const color = a.kind === 'repair' ? '#8feeff' : a.kind === 'harvest' ? '#49d0c0' : '#ffd57a';
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

const drawLastKnownEnemies = (ctx: CanvasRenderingContext2D, game: Game): void => {
  const enemies = lastKnownEnemies(game, lastKnownScratch);
  if (enemies.length === 0) return;
  const dash = [5 / game.zoom, 4 / game.zoom];
  ctx.save();
  ctx.setLineDash(dash);
  ctx.lineWidth = 1.2 / game.zoom;
  for (const enemy of enemies) {
    const def = Units[enemy.kind]!;
    const hull = entityRenderHull(enemy.kind, enemy.x * ONE, enemy.y * ONE);
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = footprintColor(enemy.owner, 0.86);
    ctx.fillStyle = footprintColor(enemy.owner, 0.08);
    if (hull.usesFootprint) {
      ctx.fillRect(hull.x0, hull.y0, hull.width, hull.height);
      ctx.strokeRect(hull.x0, hull.y0, hull.width, hull.height);
    } else {
      ctx.beginPath();
      ctx.ellipse(hull.cx, hull.cy, hull.width / 2, hull.height / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.setLineDash([]);
    drawEntityLabel(ctx, game, def.shortName, hull.cx, hull.cy, hull.width * 0.82, hull.height * 0.62, 0.48);
    ctx.setLineDash(dash);
  }
  ctx.restore();
};

const drawEffectFields = (ctx: CanvasRenderingContext2D, game: Game): void => {
  const s = game.sim.fullState();
  ctx.save();
  for (const field of fieldAffordances(game, fieldScratch)) {
    const phase = ((s.tick + field.timer) % 36) / 36;
    const pulse = 0.88 + phase * 0.08;
    ctx.fillStyle = rgba(field.fill, field.alpha);
    ctx.strokeStyle = rgba(field.stroke, field.alpha * 2.8);
    ctx.lineWidth = 1.2 / game.zoom;
    ctx.beginPath();
    ctx.arc(field.x, field.y, field.radius * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
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
      if (a.hasSource) {
        ctx.strokeStyle = 'rgba(255,80,70,0.34)';
        ctx.lineWidth = 1.4 / game.zoom;
        ctx.setLineDash([8 / game.zoom, 7 / game.zoom]);
        ctx.beginPath();
        ctx.moveTo(a.sourceX, a.sourceY);
        ctx.lineTo(a.x, a.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(a.sourceX, a.sourceY, Math.max(2.5, 4 / game.zoom), 0, Math.PI * 2);
        ctx.stroke();
      }
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
  drawQueuedTravelWaypoints(ctx, game);
  drawPlacementGhost(ctx, game);
  if (!game.box) return;
  const b = game.box;
  ctx.strokeStyle = '#ffe14e'; ctx.lineWidth = 1;
  ctx.strokeRect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
  ctx.fillStyle = 'rgba(255,225,78,0.12)';
  ctx.fillRect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
};

const screenPoint = (game: Game, x: number, y: number): { x: number; y: number } => ({
  x: (x - game.camX) * game.zoom,
  y: (y - game.camY) * game.zoom,
});

const drawQueuedWaypointMarker = (
  ctx: CanvasRenderingContext2D,
  marker: QueuedWaypointMarker,
  x: number,
  y: number,
): void => {
  const r = 5;
  switch (marker) {
    case 'circle':
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      break;
    case 'attack-cross':
      ctx.moveTo(x - r, y - r);
      ctx.lineTo(x + r, y + r);
      ctx.moveTo(x + r, y - r);
      ctx.lineTo(x - r, y + r);
      break;
    case 'attack-diamond':
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r, y);
      ctx.closePath();
      break;
    case 'patrol-chevron':
      ctx.moveTo(x - r, y);
      ctx.lineTo(x, y - r);
      ctx.lineTo(x + r, y);
      break;
    case 'repair-plus':
      ctx.moveTo(x - r, y);
      ctx.lineTo(x + r, y);
      ctx.moveTo(x, y - r);
      ctx.lineTo(x, y + r);
      break;
    case 'harvest-triangle':
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y + r);
      ctx.lineTo(x - r, y + r);
      ctx.closePath();
      break;
    case 'load-square':
      ctx.rect(x - r, y - r, r * 2, r * 2);
      break;
    case 'unload-triangle':
      ctx.moveTo(x - r, y - r);
      ctx.lineTo(x + r, y - r);
      ctx.lineTo(x, y + r);
      ctx.closePath();
      break;
  }
};

const drawQueuedTravelWaypoints = (ctx: CanvasRenderingContext2D, game: Game): void => {
  const s = game.sim.fullState();
  const e = s.e;
  const waypoints = queuedTravelWaypoints(s, game.selection, queuedTravelScratch);
  if (waypoints.length === 0) return;

  ctx.save();
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 5]);
  let prevUnit = NONE;
  let from = { x: 0, y: 0 };
  for (const waypoint of waypoints) {
    if (waypoint.unit !== prevUnit) {
      const slot = slotOf(waypoint.unit);
      from = screenPoint(game, e.x[slot]! / ONE, e.y[slot]! / ONE);
      prevUnit = waypoint.unit;
    }
    const to = screenPoint(game, waypoint.x, waypoint.y);
    const presentation = queuedWaypointPresentation(waypoint.intent);
    ctx.strokeStyle = presentation.strokeStyle;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    drawQueuedWaypointMarker(ctx, presentation.marker, to.x, to.y);
    ctx.stroke();
    ctx.setLineDash([5, 5]);
    from = to;
  }
  ctx.restore();
};

export const drawPlacementGhost = (ctx: CanvasRenderingContext2D, game: Game): void => {
  const ghost = game.placementGhost;
  if (!ghost) return;
  const fields = placementFieldOverlays(game, placementFieldScratch);
  const fp = structureFootprint(ghost.kind, ghost.x, ghost.y);
  const x = (fp.x0 * TILE - game.camX) * game.zoom;
  const y = (fp.y0 * TILE - game.camY) * game.zoom;
  const w = (fp.x1 - fp.x0 + 1) * TILE * game.zoom;
  const h = (fp.y1 - fp.y0 + 1) * TILE * game.zoom;
  ctx.save();
  for (const field of fields) {
    const cx = (field.x / ONE - game.camX) * game.zoom;
    const cy = (field.y / ONE - game.camY) * game.zoom;
    const r = (field.radius / ONE) * game.zoom;
    const creep = field.kind === 'creep';
    ctx.setLineDash(field.source === 'candidate' ? [8, 8] : []);
    ctx.fillStyle = creep ? 'rgba(93,255,135,0.055)' : 'rgba(94,170,255,0.055)';
    ctx.strokeStyle = creep ? 'rgba(93,255,135,0.38)' : 'rgba(104,190,255,0.42)';
    ctx.lineWidth = field.source === 'candidate' ? 1.5 : 1.25;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.setLineDash([]);
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
    if (!entityMinimapVisible(e.kind[i]!)) continue;
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
