// Navigation: line-of-sight first, then follow a shared flow field one tile at a
// time when the straight path is blocked. Integer-only and deterministic. The field
// is computed once per goal tile and reused by every unit heading there (see
// flow.ts), so group moves cost one Dijkstra, not one A* per unit — and navigation
// keeps no per-unit path state (the field lookup is by the order's target tile).

import type { State } from './world.ts';
import type { MapDef } from './map.ts';
import { TILE } from './data.ts';
import { ONE } from './fixed.ts';
import { moveToward } from './systems/move.ts';
import { flowField, downhill, navSolid } from './flow.ts';

const TILE_FX = TILE * ONE;

export const tileX = (xfx: number): number => Math.floor(xfx / TILE_FX);
export const tileY = (yfx: number): number => Math.floor(yfx / TILE_FX);
const centerFx = (t: number): number => t * TILE_FX + (TILE_FX >> 1);

// Supercover line check (no corner-cutting). `solid` may be null for terrain-only.
// Fully inlined — no per-call predicate closure — since it runs for every unit,
// every tick over the whole line. `blk(t)` is a blocked-tile test on a tile index.
const clearLine = (
  m: MapDef, solid: Uint8Array | null, x0: number, y0: number, x1: number, y1: number,
): boolean => {
  const W = m.w; const H = m.h; const walk = m.walk;
  const blk = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= W || y >= H) return true;
    const t = y * W + x;
    return walk[t] !== 1 || (solid !== null && solid[t] === 1);
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
  clearLine(m, null, x0, y0, x1, y1);

/**
 * Steer `slot` toward (gx,gy) in fixed px, avoiding terrain *and* buildings. Returns
 * true once the unit has reached the goal point.
 */
export const navigate = (s: State, slot: number, gx: number, gy: number, speed: number): boolean => {
  const e = s.e;
  const m = s.map;
  const solid = navSolid(s); // fetch once; reused by the per-tile checks below
  const stx = tileX(e.x[slot]!); const sty = tileY(e.y[slot]!);
  const gtx = tileX(gx); const gty = tileY(gy);

  // Straight shot when nothing (terrain or building) blocks the line.
  if (clearLine(m, solid, stx, sty, gtx, gty)) return moveToward(e, slot, gx, gy, speed);

  // Blocked: follow the shared flow field one tile downhill toward the goal.
  const next = downhill(s, solid, flowField(s, gty * m.w + gtx), stx, sty);
  if (next < 0) return moveToward(e, slot, gx, gy, speed); // at goal tile / unreachable: best effort
  const ntx = next % m.w; const nty = (next - (next % m.w)) / m.w;
  moveToward(e, slot, centerFx(ntx), centerFx(nty), speed);
  return false;
};
