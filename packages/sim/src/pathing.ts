// Navigation: line-of-sight first, A* around obstacles when blocked. Integer-only
// and deterministic. Paths are string-pulled to a few waypoints and cached per
// unit in SoA columns (see world.ts), recomputed only when the goal tile changes.

import type { State } from './world.ts';
import { MAXPATH } from './world.ts';
import type { MapDef } from './map.ts';
import { TILE } from './data.ts';
import { ONE } from './fixed.ts';
import { moveToward, within } from './systems/move.ts';

const TILE_FX = TILE * ONE;
const ARRIVE = TILE_FX >> 2; // waypoint arrival radius (fixed px)

export const tileX = (xfx: number): number => Math.floor(xfx / TILE_FX);
export const tileY = (yfx: number): number => Math.floor(yfx / TILE_FX);
const centerFx = (t: number): number => t * TILE_FX + (TILE_FX >> 1);

const passable = (m: MapDef, tx: number, ty: number): boolean =>
  tx >= 0 && ty >= 0 && tx < m.w && ty < m.h && m.walk[ty * m.w + tx] === 1;

/** Clear straight line between two tiles (supercover, no corner-cutting). */
export const lineClear = (m: MapDef, x0: number, y0: number, x1: number, y1: number): boolean => {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let x = x0;
  let y = y0;
  let err = dx - dy;
  for (;;) {
    if (!passable(m, x, y)) return false;
    if (x === x1 && y === y1) return true;
    const e2 = 2 * err;
    if (e2 > -dy && e2 < dx && !passable(m, x + sx, y) && !passable(m, x, y + sy)) return false;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
};

// 8-neighbour A* on the walk grid. Returns tile indices from start (exclusive) to
// goal (inclusive), or null. Allocates per call — fine at slice scale.
const aStar = (m: MapDef, sx: number, sy: number, gx: number, gy: number): number[] | null => {
  const W = m.w;
  const N = W * m.h;
  const start = sy * W + sx;
  const goal = gy * W + gx;
  if (!passable(m, gx, gy) || !passable(m, sx, sy)) return null;

  const g = new Int32Array(N).fill(0x7fffffff);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const heapT: number[] = [];
  const heapF: number[] = [];

  const swap = (a: number, b: number): void => {
    const tf = heapF[a]!; heapF[a] = heapF[b]!; heapF[b] = tf;
    const tt = heapT[a]!; heapT[a] = heapT[b]!; heapT[b] = tt;
  };
  const push = (tile: number, f: number): void => {
    heapT.push(tile); heapF.push(f);
    let c = heapT.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (heapF[p]! <= heapF[c]!) break;
      swap(p, c); c = p;
    }
  };
  const pop = (): number => {
    const top = heapT[0]!;
    const lt = heapT.pop()!; const lf = heapF.pop()!;
    if (heapT.length > 0) {
      heapT[0] = lt; heapF[0] = lf;
      let c = 0;
      for (;;) {
        const l = 2 * c + 1; const r = l + 1; let s = c;
        if (l < heapF.length && heapF[l]! < heapF[s]!) s = l;
        if (r < heapF.length && heapF[r]! < heapF[s]!) s = r;
        if (s === c) break;
        swap(s, c); c = s;
      }
    }
    return top;
  };
  const heur = (tx: number, ty: number): number => {
    const ax = Math.abs(tx - gx); const ay = Math.abs(ty - gy);
    return 10 * (ax + ay) - 6 * Math.min(ax, ay);
  };

  g[start] = 0;
  push(start, heur(sx, sy));
  while (heapT.length > 0) {
    const u = pop();
    if (u === goal) break;
    if (closed[u] === 1) continue;
    closed[u] = 1;
    const ux = u % W; const uy = (u - ux) / W;
    for (let dyn = -1; dyn <= 1; dyn++) {
      for (let dxn = -1; dxn <= 1; dxn++) {
        if (dxn === 0 && dyn === 0) continue;
        const nx = ux + dxn; const ny = uy + dyn;
        if (!passable(m, nx, ny)) continue;
        if (dxn !== 0 && dyn !== 0 && (!passable(m, ux + dxn, uy) || !passable(m, ux, uy + dyn))) continue;
        const v = ny * W + nx;
        if (closed[v] === 1) continue;
        const ng = g[u]! + (dxn !== 0 && dyn !== 0 ? 14 : 10);
        if (ng < g[v]!) {
          g[v] = ng; came[v] = u;
          push(v, ng + heur(nx, ny));
        }
      }
    }
  }

  if (goal !== start && came[goal] === -1) return null;
  const path: number[] = [];
  let cur = goal;
  while (cur !== start && cur !== -1) { path.push(cur); cur = came[cur]!; }
  path.reverse();
  return path;
};

/** String-pull a tile path to turning points using line-of-sight. */
const stringPull = (m: MapDef, sx: number, sy: number, path: number[]): number[] => {
  if (path.length <= 1) return path;
  const out: number[] = [];
  let ax = sx; let ay = sy;
  for (let i = 0; i < path.length - 1; i++) {
    const nx = path[i + 1]! % m.w;
    const ny = (path[i + 1]! - nx) / m.w;
    if (!lineClear(m, ax, ay, nx, ny)) {
      out.push(path[i]!);
      ax = path[i]! % m.w; ay = (path[i]! - ax) / m.w;
    }
  }
  out.push(path[path.length - 1]!);
  return out;
};

/**
 * Steer `slot` toward (gx,gy) in fixed px, avoiding terrain. Returns true once the
 * unit has reached the goal point.
 */
export const navigate = (s: State, slot: number, gx: number, gy: number, speed: number): boolean => {
  const e = s.e;
  const m = s.map;
  const stx = tileX(e.x[slot]!); const sty = tileY(e.y[slot]!);
  const gtx = tileX(gx); const gty = tileY(gy);

  if (lineClear(m, stx, sty, gtx, gty)) {
    e.pathLen[slot] = 0; e.pathGoal[slot] = -1;
    return moveToward(e, slot, gx, gy, speed);
  }

  const goalTile = gty * m.w + gtx;
  if (e.pathGoal[slot] !== goalTile || e.pathLen[slot] === 0) {
    const raw = aStar(m, stx, sty, gtx, gty);
    if (!raw || raw.length === 0) return moveToward(e, slot, gx, gy, speed); // no route: best effort
    const wp = stringPull(m, stx, sty, raw);
    const len = Math.min(wp.length, MAXPATH);
    for (let k = 0; k < len; k++) e.pathPts[slot * MAXPATH + k] = wp[k]!;
    e.pathLen[slot] = len; e.pathIdx[slot] = 0; e.pathGoal[slot] = goalTile;
  }

  // Follow the current waypoint; advance when close.
  const wi = e.pathIdx[slot]!;
  if (wi < e.pathLen[slot]!) {
    const t = e.pathPts[slot * MAXPATH + wi]!;
    const wtx = t % m.w; const wty = (t - wtx) / m.w;
    const wpx = centerFx(wtx); const wpy = centerFx(wty);
    if (within(e, slot, wpx, wpy, ARRIVE)) e.pathIdx[slot] = wi + 1;
    else moveToward(e, slot, wpx, wpy, speed);
    return false;
  }
  // Path consumed: head straight to the final goal.
  e.pathLen[slot] = 0; e.pathGoal[slot] = -1;
  return moveToward(e, slot, gx, gy, speed);
};
