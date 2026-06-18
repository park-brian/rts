// Navigation: line-of-sight first, then follow a shared flow field when the
// straight path is blocked. The external map remains build-tile based, but
// movement routes over the finer path lattice exported by flow.ts.

import type { State } from './world.ts';
import type { MapDef } from './map.ts';
import { Role, TILE, Units } from './data.ts';
import { ONE, isqrt } from './fixed.ts';
import { acceleratedStep, moveToward } from './systems/move.ts';
import { localAvoidancePenalty, localAvoidanceVelocity, usesLocalAvoidance } from './local-avoidance.ts';
import {
  clearancePxForKind,
  downhill,
  flowField,
  INF,
  nearestPassablePathCell,
  navHasUnitSolid,
  navUnitSolid,
  PATH_CELLS_PER_TILE,
  pathCenterFx,
  pathH,
  pathPass,
  sampleFlowDirection,
  pathW,
  pathX,
  pathY,
} from './flow.ts';

const TILE_FX = TILE * ONE;
const PATH_CELL_FX = TILE_FX / PATH_CELLS_PER_TILE;

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

const distFx = (x0: number, y0: number, x1: number, y1: number): number => {
  const dx = x1 - x0;
  const dy = y1 - y0;
  return isqrt(dx * dx + dy * dy);
};

const latticeCostToFx = (cost: number): number => Math.trunc((cost * PATH_CELL_FX + 5) / 10);

const arrivalSpeed = (speed: number, dist: number, radius: number): number => {
  const band = Math.max(radius, speed * 3);
  if (dist >= band) return speed;
  return Math.max(1, Math.trunc((speed * dist) / band));
};

/**
 * Deterministic terrain/building route length between exact fixed-point locations
 * over the same path lattice used by movement. Unit bodies are ignored: this is
 * for static map validation, not live traffic simulation.
 */
export const pathRouteDistance = (
  s: State,
  kind: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number | null => {
  if ((Units[kind]?.roles ?? 0) & Role.Air) return distFx(x0, y0, x1, y1);

  const clearancePx = clearancePxForKind(kind);
  const pass = pathPass(s, clearancePx);
  const w = pathW(s);
  const h = pathH(s);
  const sx = pathX(x0);
  const sy = pathY(y0);
  const gx = pathX(x1);
  const gy = pathY(y1);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h || gx < 0 || gy < 0 || gx >= w || gy >= h) return null;

  if (pass[sy * w + sx] === 1 && pass[gy * w + gx] === 1 && clearPathLine(pass, w, h, null, sx, sy, gx, gy)) {
    return distFx(x0, y0, x1, y1);
  }

  const start = pass[sy * w + sx] === 1 ? sy * w + sx : nearestPassablePathCell(s, clearancePx, sx, sy, sx, sy);
  const goal = nearestPassablePathCell(s, clearancePx, gx, gy, sx, sy);
  if (start < 0 || goal < 0) return null;

  const field = flowField(s, goal, clearancePx);
  const cost = field[start]!;
  if (cost === INF) return null;

  const startX = start % w;
  const startY = (start - startX) / w;
  const goalX = goal % w;
  const goalY = (goal - goalX) / w;
  return (
    distFx(x0, y0, pathCenterFx(startX), pathCenterFx(startY)) +
    latticeCostToFx(cost) +
    distFx(pathCenterFx(goalX), pathCenterFx(goalY), x1, y1)
  );
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
  shapeArrival: boolean,
): boolean => {
  const e = s.e;
  const ox = e.x[slot]!;
  const oy = e.y[slot]!;
  const dx = tx - ox;
  const dy = ty - oy;
  const dist = isqrt(dx * dx + dy * dy);
  if (dist === 0) return true;

  const shapedSpeed = shapeArrival && dist > speed ? arrivalSpeed(speed, dist, Units[e.kind[slot]!]!.radius) : speed;
  const limit = dist <= shapedSpeed ? dist : shapedSpeed;
  const baseX = dist <= shapedSpeed ? dx : Math.trunc((dx * shapedSpeed) / dist);
  const baseY = dist <= shapedSpeed ? dy : Math.trunc((dy * shapedSpeed) / dist);
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

  const pref = avoid ? localAvoidanceVelocity(s, slot, baseX, baseY, speed) : { x: baseX, y: baseY };
  const prefArrives = dist <= shapedSpeed && pref.x === baseX && pref.y === baseY;
  consider(pref.x, pref.y, prefArrives, 0);
  if (pref.x !== baseX || pref.y !== baseY) consider(baseX, baseY, dist <= shapedSpeed, 3);

  if (avoid) {
    const px = -pref.y;
    const py = pref.x;
    const leftFirst = (slot & 1) === 0;
    const rankA = leftFirst ? 1 : 2;
    const rankB = leftFirst ? 2 : 1;
    consider((pref.x >> 1) + px, (pref.y >> 1) + py, false, rankA);
    consider((pref.x >> 1) - px, (pref.y >> 1) - py, false, rankB);
    consider(pref.x + (px >> 1), pref.y + (py >> 1), false, rankA + 2);
    consider(pref.x - (px >> 1), pref.y - (py >> 1), false, rankB + 2);
  }

  const firstX = Math.abs(pref.x) >= Math.abs(pref.y);
  consider(firstX ? baseX : 0, firstX ? 0 : baseY, false, 7);
  consider(firstX ? 0 : baseX, firstX ? baseY : 0, false, 8);

  if (bestScore === -0x7fffffff) return false;
  const step = acceleratedStep(e, slot, bestX, bestY, speed, bestArrived);
  let nx = ox + step.x;
  let ny = oy + step.y;
  let arrived = bestArrived && step.x === bestX && step.y === bestY;
  if (step.x === 0 && step.y === 0) return false;
  if (!canStand(pass, w, h, unitSolid, nx, ny)) {
    e.vx[slot] = bestX;
    e.vy[slot] = bestY;
    nx = ox + bestX;
    ny = oy + bestY;
    arrived = bestArrived;
  }
  e.x[slot] = nx;
  e.y[slot] = ny;
  e.faceX[slot] = e.x[slot]! - ox;
  e.faceY[slot] = e.y[slot]! - oy;
  if (arrived) {
    e.vx[slot] = 0;
    e.vy[slot] = 0;
  }
  return arrived;
};

const fieldProgress = (field: Int32Array, w: number, h: number, sx: number, sy: number, tx: number, ty: number): number => {
  if (tx < 0 || ty < 0 || tx >= w || ty >= h) return -1;
  const from = field[sy * w + sx]!;
  const to = field[ty * w + tx];
  if (to === undefined || from === INF || to === INF) return -1;
  return from - to;
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
    return moveTowardPass(s, pass, w, h, unitSolid, slot, targetX, targetY, speed, rpx === gpx && rpy === gpy);
  }

  const field = flowField(s, routeGoal, clearancePx);
  const next = downhill(s, field, spx, spy, unitSolid, clearancePx);
  if (next < 0) {
    if (spx === rpx && spy === rpy) return moveTowardPass(s, pass, w, h, unitSolid, slot, targetX, targetY, speed, rpx === gpx && rpy === gpy);
    return false;
  }

  const npx = next % w;
  const npy = (next - npx) / w;
  const flow = sampleFlowDirection(s, field, pass, unitSolid, e.x[slot]!, e.y[slot]!, clearancePx);
  const smoothTx = e.x[slot]! + Math.trunc((flow.x * PATH_CELL_FX) / ONE);
  const smoothTy = e.y[slot]! + Math.trunc((flow.y * PATH_CELL_FX) / ONE);
  const smx = pathX(smoothTx);
  const smy = pathY(smoothTy);
  const discreteProgress = fieldProgress(field, w, h, spx, spy, npx, npy);
  const smoothProgress = fieldProgress(field, w, h, spx, spy, smx, smy);
  if ((flow.x !== 0 || flow.y !== 0) && smoothProgress >= discreteProgress) {
    moveTowardPass(s, pass, w, h, unitSolid, slot, smoothTx, smoothTy, speed, false);
  } else {
    moveTowardPass(s, pass, w, h, unitSolid, slot, pathCenterFx(npx), pathCenterFx(npy), speed, false);
  }
  return false;
};
