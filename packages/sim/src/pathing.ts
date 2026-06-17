// Navigation: line-of-sight first, then follow a shared flow field one tile at a
// time when the straight path is blocked. Integer-only and deterministic. The field
// is computed once per goal tile and reused by every unit heading there (see
// flow.ts), so group moves cost one Dijkstra, not one A* per unit — and navigation
// keeps no per-unit path state (the field lookup is by the order's target tile).

import type { State } from './world.ts';
import type { MapDef } from './map.ts';
import { Role, TILE } from './data.ts';
import { ONE } from './fixed.ts';
import { moveToward } from './systems/move.ts';
import {
  flowField, downhill, navClearanceClass, navClearanceSolid, navHasUnitSolid, navUnitSolid,
} from './flow.ts';

const TILE_FX = TILE * ONE;

export const tileX = (xfx: number): number => Math.floor(xfx / TILE_FX);
export const tileY = (yfx: number): number => Math.floor(yfx / TILE_FX);
const centerFx = (t: number): number => t * TILE_FX + (TILE_FX >> 1);

const openTile = (m: MapDef, solid: Uint8Array, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < m.w && y < m.h && solid[y * m.w + x] === 0;

const routeGoalTile = (m: MapDef, solid: Uint8Array, fromX: number, fromY: number, goalX: number, goalY: number): number => {
  if (openTile(m, solid, goalX, goalY)) return goalY * m.w + goalX;
  let best = -1;
  let bestD = Infinity;
  for (let r = 1; r <= 8; r++) {
    for (let y = goalY - r; y <= goalY + r; y++) {
      for (let x = goalX - r; x <= goalX + r; x++) {
        if (Math.abs(x - goalX) !== r && Math.abs(y - goalY) !== r) continue;
        if (!openTile(m, solid, x, y)) continue;
        const dx = x - fromX;
        const dy = y - fromY;
        const d = dx * dx + dy * dy;
        const tile = y * m.w + x;
        if (d < bestD || (d === bestD && tile < best)) { bestD = d; best = tile; }
      }
    }
    if (best >= 0) return best;
  }
  return -1;
};

const moveTowardOpen = (
  s: State,
  solid: Uint8Array,
  slot: number,
  tx: number,
  ty: number,
  speed: number,
): boolean => {
  const e = s.e;
  const ox = e.x[slot]!;
  const oy = e.y[slot]!;
  const arrived = moveToward(e, slot, tx, ty, speed);
  if (openTile(s.map, solid, tileX(e.x[slot]!), tileY(e.y[slot]!))) return arrived;

  e.x[slot] = ox;
  e.y[slot] = oy;
  const firstX = Math.abs(tx - ox) >= Math.abs(ty - oy);
  let ax = firstX ? tx : ox;
  let ay = firstX ? oy : ty;
  let axisArrived = moveToward(e, slot, ax, ay, speed);
  if (openTile(s.map, solid, tileX(e.x[slot]!), tileY(e.y[slot]!))) return axisArrived && ax === tx && ay === ty;
  e.x[slot] = ox;
  e.y[slot] = oy;
  ax = firstX ? ox : tx;
  ay = firstX ? ty : oy;
  axisArrived = moveToward(e, slot, ax, ay, speed);
  if (openTile(s.map, solid, tileX(e.x[slot]!), tileY(e.y[slot]!))) return axisArrived && ax === tx && ay === ty;
  e.x[slot] = ox;
  e.y[slot] = oy;
  return false;
};

const navigateLoose = (s: State, slot: number, gx: number, gy: number, speed: number): boolean => {
  const e = s.e;
  const m = s.map;
  const solid = navClearanceSolid(s, 0);
  const unitSolid = navHasUnitSolid(s, 0) ? navUnitSolid(s, 0) : null;
  const stx = tileX(e.x[slot]!); const sty = tileY(e.y[slot]!);
  const gtx = tileX(gx); const gty = tileY(gy);
  if (clearLine(m, solid, unitSolid, stx, sty, gtx, gty)) return moveToward(e, slot, gx, gy, speed);
  const next = downhill(s, solid, flowField(s, gty * m.w + gtx, 0), stx, sty, unitSolid);
  if (next < 0) return moveToward(e, slot, gx, gy, speed);
  const ntx = next % m.w; const nty = (next - (next % m.w)) / m.w;
  moveToward(e, slot, centerFx(ntx), centerFx(nty), speed);
  return false;
};

// Supercover line check (no corner-cutting). `solid` may be null for terrain-only.
// Fully inlined — no per-call predicate closure — since it runs for every unit,
// every tick over the whole line. `blk(t)` is a blocked-tile test on a tile index.
const clearLine = (
  m: MapDef,
  solid: Uint8Array | null,
  unitSolid: Uint8Array | null,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): boolean => {
  const W = m.w; const H = m.h; const walk = m.walk;
  const start = y0 * W + x0;
  const goal = y1 * W + x1;
  const blk = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= W || y >= H) return true;
    const t = y * W + x;
    return walk[t] !== 1 ||
      (solid !== null && solid[t] === 1) ||
      (unitSolid !== null && t !== start && t !== goal && unitSolid[t] === 1);
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

/** Clear straight line over terrain only (no buildings); used by tests/tools. */
export const lineClear = (m: MapDef, x0: number, y0: number, x1: number, y1: number): boolean =>
  clearLine(m, null, null, x0, y0, x1, y1);

/**
 * Steer `slot` toward (gx,gy) in fixed px, avoiding terrain *and* buildings. Returns
 * true once the unit has reached the goal point.
 */
export const navigate = (s: State, slot: number, gx: number, gy: number, speed: number): boolean => {
  const e = s.e;
  if ((e.flags[slot]! & Role.Air) !== 0) return moveToward(e, slot, gx, gy, speed);
  if ((e.flags[slot]! & Role.Worker) !== 0) return navigateLoose(s, slot, gx, gy, speed);
  const m = s.map;
  const cls = navClearanceClass(e.kind[slot]!);
  const solid = navClearanceSolid(s, cls); // fetch once; reused by the per-tile checks below
  const unitSolid = navHasUnitSolid(s, cls) ? navUnitSolid(s, cls) : null;
  const stx = tileX(e.x[slot]!); const sty = tileY(e.y[slot]!);
  const gtx = tileX(gx); const gty = tileY(gy);
  const routeGoal = routeGoalTile(m, solid, stx, sty, gtx, gty);
  if (routeGoal < 0) return false;
  const rtx = routeGoal % m.w;
  const rty = (routeGoal - rtx) / m.w;
  const rgx = rtx === gtx && rty === gty ? gx : centerFx(rtx);
  const rgy = rtx === gtx && rty === gty ? gy : centerFx(rty);

  // Straight shot when nothing (terrain or building) blocks the line.
  if (clearLine(m, solid, unitSolid, stx, sty, rtx, rty)) return moveTowardOpen(s, solid, slot, rgx, rgy, speed);

  // Blocked: follow the shared flow field one tile downhill toward the goal.
  const next = downhill(s, solid, flowField(s, routeGoal, cls), stx, sty, unitSolid);
  if (next < 0) {
    if (stx === rtx && sty === rty) return moveTowardOpen(s, solid, slot, rgx, rgy, speed);
    return false;
  }
  const ntx = next % m.w; const nty = (next - (next % m.w)) / m.w;
  moveTowardOpen(s, solid, slot, centerFx(ntx), centerFx(nty), speed);
  return false;
};
