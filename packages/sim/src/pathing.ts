// Navigation: line-of-sight first, then follow a shared flow field when the
// straight path is blocked. The external map remains build-tile based, but
// movement routes over the finer path lattice exported by flow.ts.

import type { State } from './world.ts';
import type { MapDef } from './map.ts';
import { Role, TILE } from './data.ts';
import { ONE, isqrt } from './fixed.ts';
import { moveToward } from './systems/move.ts';
import { localAvoidancePenalty, usesLocalAvoidance } from './local-avoidance.ts';
import {
  clearancePxForKind,
  downhill,
  flowField,
  nearestPassablePathCell,
  navHasUnitSolid,
  navUnitSolid,
  pathCenterFx,
  pathH,
  pathPass,
  pathW,
  pathX,
  pathY,
} from './flow.ts';

const TILE_FX = TILE * ONE;

export const tileX = (xfx: number): number => Math.floor(xfx / TILE_FX);
export const tileY = (yfx: number): number => Math.floor(yfx / TILE_FX);

const clearPathLine = (
  pass: Uint8Array,
  w: number,
  h: number,
  unitSolid: Uint8Array | null,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): boolean => {
  const start = y0 * w + x0;
  const goal = y1 * w + x1;
  const blk = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= w || y >= h) return true;
    const t = y * w + x;
    return pass[t] !== 1 || (unitSolid !== null && t !== start && t !== goal && unitSolid[t] === 1);
  };
  const dx = Math.abs(x1 - x0); const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1; const sy = y0 < y1 ? 1 : -1;
  let x = x0; let y = y0; let err = dx - dy;
  for (;;) {
    if (blk(x, y)) return false;
    if (x === x1 && y === y1) return true;
    const e2 = 2 * err;
    if (e2 > -dy && e2 < dx && blk(x + sx, y) && blk(x, y + sy)) return false;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
};

// Terrain-only build-tile line check retained for tests/tools.
const clearBuildLine = (
  m: MapDef,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): boolean => {
  const W = m.w; const H = m.h; const walk = m.walk;
  const blk = (x: number, y: number): boolean =>
    x < 0 || y < 0 || x >= W || y >= H || walk[y * W + x] !== 1;
  const dx = Math.abs(x1 - x0); const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1; const sy = y0 < y1 ? 1 : -1;
  let x = x0; let y = y0; let err = dx - dy;
  for (;;) {
    if (blk(x, y)) return false;
    if (x === x1 && y === y1) return true;
    const e2 = 2 * err;
    if (e2 > -dy && e2 < dx && blk(x + sx, y) && blk(x, y + sy)) return false;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
};

/** Clear straight line over terrain only (no buildings); used by tests/tools. */
export const lineClear = (m: MapDef, x0: number, y0: number, x1: number, y1: number): boolean =>
  clearBuildLine(m, x0, y0, x1, y1);

const canStand = (
  pass: Uint8Array,
  w: number,
  h: number,
  unitSolid: Uint8Array | null,
  xfx: number,
  yfx: number,
): boolean => {
  const px = pathX(xfx);
  const py = pathY(yfx);
  if (px < 0 || py < 0 || px >= w || py >= h) return false;
  const tile = py * w + px;
  return pass[tile] === 1 && (unitSolid === null || unitSolid[tile] !== 1);
};

const normalizedStep = (vx: number, vy: number, limit: number): { x: number; y: number } => {
  const d = isqrt(vx * vx + vy * vy);
  if (d === 0) return { x: 0, y: 0 };
  if (d <= limit) return { x: vx, y: vy };
  return { x: Math.trunc((vx * limit) / d), y: Math.trunc((vy * limit) / d) };
};

const moveTowardPass = (
  s: State,
  pass: Uint8Array,
  w: number,
  h: number,
  unitSolid: Uint8Array | null,
  slot: number,
  tx: number,
  ty: number,
  speed: number,
): boolean => {
  const e = s.e;
  const ox = e.x[slot]!;
  const oy = e.y[slot]!;
  const dx = tx - ox;
  const dy = ty - oy;
  const dist = isqrt(dx * dx + dy * dy);
  if (dist === 0) return true;

  const limit = dist <= speed ? dist : speed;
  const baseX = dist <= speed ? dx : Math.trunc((dx * speed) / dist);
  const baseY = dist <= speed ? dy : Math.trunc((dy * speed) / dist);
  const avoid = usesLocalAvoidance(s, slot);
  let bestX = 0;
  let bestY = 0;
  let bestArrived = false;
  let bestScore = -0x7fffffff;

  const consider = (vx: number, vy: number, arrived: boolean, rank: number): void => {
    const step = normalizedStep(vx, vy, limit);
    if (step.x === 0 && step.y === 0) return;
    const nx = ox + step.x;
    const ny = oy + step.y;
    if (!canStand(pass, w, h, unitSolid, nx, ny)) return;
    const progress = Math.trunc((step.x * dx + step.y * dy) / dist);
    const penalty = avoid ? localAvoidancePenalty(s, slot, nx, ny) : 0;
    const score = progress * 32 - penalty - rank;
    if (score > bestScore) {
      bestScore = score;
      bestX = step.x;
      bestY = step.y;
      bestArrived = arrived;
    }
  };

  consider(baseX, baseY, dist <= speed, 0);

  if (avoid) {
    const px = -baseY;
    const py = baseX;
    const leftFirst = (slot & 1) === 0;
    const rankA = leftFirst ? 1 : 2;
    const rankB = leftFirst ? 2 : 1;
    consider((baseX >> 1) + px, (baseY >> 1) + py, false, rankA);
    consider((baseX >> 1) - px, (baseY >> 1) - py, false, rankB);
    consider(baseX + (px >> 1), baseY + (py >> 1), false, rankA + 2);
    consider(baseX - (px >> 1), baseY - (py >> 1), false, rankB + 2);
  }

  const firstX = Math.abs(dx) >= Math.abs(dy);
  consider(firstX ? baseX : 0, firstX ? 0 : baseY, false, 7);
  consider(firstX ? 0 : baseX, firstX ? baseY : 0, false, 8);

  if (bestScore === -0x7fffffff) return false;
  e.x[slot] = ox + bestX;
  e.y[slot] = oy + bestY;
  e.faceX[slot] = bestX;
  e.faceY[slot] = bestY;
  return bestArrived;
};

/**
 * Steer `slot` toward (gx,gy) in fixed px, avoiding terrain and buildings. Returns
 * true once the unit has reached the goal point.
 */
export const navigate = (s: State, slot: number, gx: number, gy: number, speed: number): boolean => {
  const e = s.e;
  if ((e.flags[slot]! & Role.Air) !== 0) return moveToward(e, slot, gx, gy, speed);

  const clearancePx = clearancePxForKind(e.kind[slot]!);
  const pass = pathPass(s, clearancePx);
  const w = pathW(s);
  const h = pathH(s);
  const unitSolid = navHasUnitSolid(s) ? navUnitSolid(s) : null;
  const spx = pathX(e.x[slot]!); const spy = pathY(e.y[slot]!);
  const gpx = pathX(gx); const gpy = pathY(gy);
  if (spx < 0 || spy < 0 || spx >= w || spy >= h) return false;
  if (pass[spy * w + spx] !== 1) {
    const escape = nearestPassablePathCell(s, clearancePx, spx, spy, spx, spy);
    if (escape < 0) return false;
    const epx = escape % w;
    const epy = (escape - epx) / w;
    moveToward(e, slot, pathCenterFx(epx), pathCenterFx(epy), speed);
    return false;
  }
  const routeGoal = nearestPassablePathCell(s, clearancePx, gpx, gpy, spx, spy);
  if (routeGoal < 0) return false;

  const rpx = routeGoal % w;
  const rpy = (routeGoal - rpx) / w;
  const targetX = rpx === gpx && rpy === gpy ? gx : pathCenterFx(rpx);
  const targetY = rpx === gpx && rpy === gpy ? gy : pathCenterFx(rpy);

  if (clearPathLine(pass, w, h, unitSolid, spx, spy, rpx, rpy)) {
    return moveTowardPass(s, pass, w, h, unitSolid, slot, targetX, targetY, speed);
  }

  const field = flowField(s, routeGoal, clearancePx);
  const next = downhill(s, field, spx, spy, unitSolid, clearancePx);
  if (next < 0) {
    if (spx === rpx && spy === rpy) return moveTowardPass(s, pass, w, h, unitSolid, slot, targetX, targetY, speed);
    return false;
  }

  const npx = next % w;
  const npy = (next - npx) / w;
  moveTowardPass(s, pass, w, h, unitSolid, slot, pathCenterFx(npx), pathCenterFx(npy), speed);
  return false;
};
