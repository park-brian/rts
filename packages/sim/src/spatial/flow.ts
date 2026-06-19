// Flow-field group pathfinding + dynamic pathing context.
//
// The public map/building model is build-tile based, but routing uses a derived
// finer path lattice. That lets small units pass one-build-tile openings while
// wider bodies reject gaps they cannot actually fit through. Flow fields are still
// shared per goal, now keyed by the unit clearance class as well.

import { NONE, type State } from '../entity/world.ts';
import { Role, Size, TILE, Units } from '../data.ts';
import { ONE } from '../fixed.ts';
import { fold, FNV_OFFSET } from '../io/hash.ts';
import { structureFootprint } from './footprint.ts';
import { isPathingAnchor } from './pathing-anchor.ts';
import { bodyBounds } from './geometry.ts';

export const INF = 0x7fffffff;
export const PATH_CELLS_PER_TILE = 2;
export const PATH_CELL = TILE / PATH_CELLS_PER_TILE;

const LIMIT = 24; // cached fields per State (LRU by insertion order)
const FIELD_KEY_STRIDE = 128;
const RAW_CLEARANCE_PX = (TILE >> 1) - 1;
const PATH_CELL_FX = PATH_CELL * ONE;

type Nav = {
  sig: number;
  solid: Uint8Array;
  pathSolid: Uint8Array;
  pathOpen: Uint8Array;
  clearance: Map<number, Uint8Array>;
  fields: Map<number, Int32Array>;
  unitTick: number;
  unitSolid: Uint8Array;
  unitTiles: Int32Array;
  unitTileCount: number;
  unitHasSolid: boolean;
};

const navByState = new WeakMap<State, Nav>();

const bodyExtentPx = (kind: number): number => {
  const b = bodyBounds(kind);
  const max = Math.max(b.left, b.right, b.up, b.down);
  return Math.trunc((max + ONE - 1) / ONE);
};

export const pathW = (s: State): number => s.map.w * PATH_CELLS_PER_TILE;
export const pathH = (s: State): number => s.map.h * PATH_CELLS_PER_TILE;
export const pathX = (xfx: number): number => Math.floor(xfx / PATH_CELL_FX);
export const pathY = (yfx: number): number => Math.floor(yfx / PATH_CELL_FX);
export const pathCenterFx = (t: number): number => t * PATH_CELL_FX + (PATH_CELL_FX >> 1);

/** Solid = grounded structures that aren't resources (a refinery on a geyser stays walkable). */
const blocks = (fl: number): boolean => (fl & Role.Structure) !== 0 && (fl & (Role.Resource | Role.Air)) === 0;

/** A cheap, deterministic fingerprint of the building layout (slot order). */
const buildSig = (s: State): number => {
  const e = s.e;
  let h = FNV_OFFSET;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.container[i] !== NONE || !blocks(e.flags[i]!)) continue;
    h = fold(h, i); h = fold(h, e.gen[i]!); h = fold(h, e.kind[i]!); h = fold(h, e.x[i]!); h = fold(h, e.y[i]!);
  }
  return h >>> 0;
};

const stampPathTile = (pathSolid: Uint8Array, pw: number, tx: number, ty: number): void => {
  const px0 = tx * PATH_CELLS_PER_TILE;
  const py0 = ty * PATH_CELLS_PER_TILE;
  for (let oy = 0; oy < PATH_CELLS_PER_TILE; oy++) {
    const row = (py0 + oy) * pw;
    for (let ox = 0; ox < PATH_CELLS_PER_TILE; ox++) pathSolid[row + px0 + ox] = 1;
  }
};

const buildPathOpen = (s: State, pathSolid: Uint8Array, pathOpen: Uint8Array): void => {
  const m = s.map;
  const pw = pathW(s);
  const ph = pathH(s);
  for (let py = 0; py < ph; py++) {
    const ty = Math.floor(py / PATH_CELLS_PER_TILE);
    for (let px = 0; px < pw; px++) {
      const tx = Math.floor(px / PATH_CELLS_PER_TILE);
      const t = py * pw + px;
      pathOpen[t] = m.walk[ty * m.w + tx] === 1 && pathSolid[t] === 0 ? 1 : 0;
    }
  }
};

const stampSolid = (s: State, solid: Uint8Array, pathSolid: Uint8Array, pathOpen: Uint8Array): void => {
  const m = s.map;
  const pw = pathW(s);
  solid.fill(0);
  pathSolid.fill(0);
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.container[i] !== NONE || !blocks(e.flags[i]!)) continue;
    const fp = structureFootprint(e.kind[i]!, e.x[i]!, e.y[i]!);
    for (let ty = Math.max(0, fp.y0); ty <= Math.min(m.h - 1, fp.y1); ty++) {
      for (let tx = Math.max(0, fp.x0); tx <= Math.min(m.w - 1, fp.x1); tx++) {
        solid[ty * m.w + tx] = 1;
        stampPathTile(pathSolid, pw, tx, ty);
      }
    }
  }
  buildPathOpen(s, pathSolid, pathOpen);
};

/** Refresh a State's pathing context; rebuild the solid grid + drop stale fields if buildings changed. */
export const prepareNav = (s: State): Nav => {
  let nav = navByState.get(s);
  if (!nav) {
    const pathCells = pathW(s) * pathH(s);
    nav = {
      sig: -1,
      solid: new Uint8Array(s.map.w * s.map.h),
      pathSolid: new Uint8Array(pathCells),
      pathOpen: new Uint8Array(pathCells),
      clearance: new Map(),
      fields: new Map(),
      unitTick: -1,
      unitSolid: new Uint8Array(pathCells),
      unitTiles: new Int32Array(pathCells),
      unitTileCount: 0,
      unitHasSolid: false,
    };
    navByState.set(s, nav);
  }
  const sig = buildSig(s);
  if (sig !== nav.sig) {
    nav.sig = sig;
    stampSolid(s, nav.solid, nav.pathSolid, nav.pathOpen);
    nav.clearance.clear();
    nav.fields.clear();
  }
  return nav;
};

const navOf = (s: State): Nav => navByState.get(s) ?? prepareNav(s);

// The solid grid's array reference is stable across ticks (prepareNav refills it in
// place), so memoize the per-State lookup: every navigate() in a tick shares one
// State, turning a WeakMap.get per call into a pointer compare.
let memoState: State | null = null;
let memoSolid: Uint8Array = new Uint8Array(0);

/** The current build-tile building-footprint grid. */
export const navSolid = (s: State): Uint8Array => {
  if (s !== memoState) { memoState = s; memoSolid = navOf(s).solid; }
  return memoSolid;
};

/** Walkable terrain AND free of a building footprint, given a fetched build-tile solid grid. */
export const open = (m: State['map'], solid: Uint8Array, tx: number, ty: number): boolean =>
  tx >= 0 && ty >= 0 && tx < m.w && ty < m.h && m.walk[ty * m.w + tx] === 1 && solid[ty * m.w + tx] === 0;

/** Single build-tile passability check (does its own lookup; for occasional callers). */
export const navPassable = (s: State, tx: number, ty: number): boolean => open(s.map, navOf(s).solid, tx, ty);

export const clearancePxForKind = (kind: number): number => {
  const def = Units[kind];
  if (!def || (def.roles & Role.Air) !== 0 || (def.roles & Role.Mobile) === 0) return 0;
  const px = bodyExtentPx(kind);
  if (px <= RAW_CLEARANCE_PX) return 0;
  return px + (def.size === Size.Large || px >= (TILE >> 1) ? 1 : 0);
};

const bodyFits = (s: State, raw: Uint8Array, px: number, py: number, clearancePx: number): boolean => {
  const pw = pathW(s);
  const ph = pathH(s);
  if (px < 0 || py < 0 || px >= pw || py >= ph) return false;
  if (raw[py * pw + px] !== 1) return false;

  const cx = px * PATH_CELL + (PATH_CELL >> 1);
  const cy = py * PATH_CELL + (PATH_CELL >> 1);
  const left = cx - clearancePx;
  const right = cx + clearancePx;
  const top = cy - clearancePx;
  const bottom = cy + clearancePx;
  if (left < 0 || top < 0 || right > s.map.w * TILE || bottom > s.map.h * TILE) return false;

  const span = Math.trunc((clearancePx + PATH_CELL - 1) / PATH_CELL) + 1;
  for (let by = Math.max(0, py - span); by <= Math.min(ph - 1, py + span); by++) {
    const blockTop = by * PATH_CELL;
    const blockBottom = blockTop + PATH_CELL;
    if (bottom <= blockTop || top >= blockBottom) continue;
    for (let bx = Math.max(0, px - span); bx <= Math.min(pw - 1, px + span); bx++) {
      if (raw[by * pw + bx] === 1) continue;
      const blockLeft = bx * PATH_CELL;
      const blockRight = blockLeft + PATH_CELL;
      if (right > blockLeft && left < blockRight) return false;
    }
  }
  return true;
};

export const pathPass = (s: State, clearancePx: number): Uint8Array => {
  const nav = navOf(s);
  if (clearancePx <= RAW_CLEARANCE_PX) return nav.pathOpen;
  const cached = nav.clearance.get(clearancePx);
  if (cached) return cached;
  const pass = new Uint8Array(nav.pathOpen.length);
  const pw = pathW(s);
  const ph = pathH(s);
  for (let py = 0; py < ph; py++) {
    for (let px = 0; px < pw; px++) pass[py * pw + px] = bodyFits(s, nav.pathOpen, px, py, clearancePx) ? 1 : 0;
  }
  nav.clearance.set(clearancePx, pass);
  return pass;
};

export const pathPassable = (s: State, clearancePx: number, px: number, py: number): boolean => {
  const pw = pathW(s);
  return px >= 0 && py >= 0 && px < pw && py < pathH(s) && pathPass(s, clearancePx)[py * pw + px] === 1;
};

export const navPassableForKind = (s: State, kind: number, tx: number, ty: number): boolean => {
  const clearancePx = clearancePxForKind(kind);
  const px0 = tx * PATH_CELLS_PER_TILE;
  const py0 = ty * PATH_CELLS_PER_TILE;
  for (let oy = 0; oy < PATH_CELLS_PER_TILE; oy++) {
    for (let ox = 0; ox < PATH_CELLS_PER_TILE; ox++) {
      if (pathPassable(s, clearancePx, px0 + ox, py0 + oy)) return true;
    }
  }
  return false;
};

const stampPathBody = (
  s: State,
  solid: Uint8Array,
  touched: Int32Array,
  count: number,
  xfx: number,
  yfx: number,
  radiusPx: number,
): number => {
  const W = pathW(s);
  const H = pathH(s);
  const cx = Math.trunc(xfx / ONE);
  const cy = Math.trunc(yfx / ONE);
  const left = cx - radiusPx;
  const right = cx + radiusPx;
  const top = cy - radiusPx;
  const bottom = cy + radiusPx;
  const x0 = Math.max(0, Math.trunc(left / PATH_CELL) - 1);
  const y0 = Math.max(0, Math.trunc(top / PATH_CELL) - 1);
  const x1 = Math.min(W - 1, Math.trunc((right + PATH_CELL - 1) / PATH_CELL) + 1);
  const y1 = Math.min(H - 1, Math.trunc((bottom + PATH_CELL - 1) / PATH_CELL) + 1);
  for (let py = y0; py <= y1; py++) {
    const blockTop = py * PATH_CELL;
    const blockBottom = blockTop + PATH_CELL;
    if (bottom <= blockTop || top >= blockBottom) continue;
    for (let px = x0; px <= x1; px++) {
      const blockLeft = px * PATH_CELL;
      const blockRight = blockLeft + PATH_CELL;
      if (right <= blockLeft || left >= blockRight) continue;
      const tile = py * W + px;
      if (solid[tile] === 1) continue;
      solid[tile] = 1;
      touched[count++] = tile;
    }
  }
  return count;
};

const refreshUnitSolid = (s: State): Nav => {
  const nav = navOf(s);
  if (nav.unitTick === s.tick) return nav;
  nav.unitTick = s.tick;
  for (let i = 0; i < nav.unitTileCount; i++) nav.unitSolid[nav.unitTiles[i]!] = 0;
  nav.unitTileCount = 0;
  nav.unitHasSolid = false;
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (!isPathingAnchor(s, i)) continue;
    nav.unitTileCount = stampPathBody(
      s,
      nav.unitSolid,
      nav.unitTiles,
      nav.unitTileCount,
      e.x[i]!,
      e.y[i]!,
      bodyExtentPx(e.kind[i]!),
    );
    nav.unitHasSolid = true;
  }
  return nav;
};

export const navUnitSolid = (s: State): Uint8Array => refreshUnitSolid(s).unitSolid;
export const navHasUnitSolid = (s: State): boolean => refreshUnitSolid(s).unitHasSolid;

/** Integer Dijkstra from `goal` over combined terrain+building passability. */
const compute = (s: State, pass: Uint8Array, goal: number): Int32Array => {
  const W = pathW(s);
  const H = pathH(s);
  const dist = new Int32Array(W * H).fill(INF);
  const gx = goal % W; const gy = (goal - gx) / W;
  if (gx < 0 || gy < 0 || gx >= W || gy >= H || pass[goal] !== 1) return dist;

  const heapT: number[] = []; const heapK: number[] = [];
  const swap = (a: number, b: number): void => {
    const t = heapT[a]!; heapT[a] = heapT[b]!; heapT[b] = t;
    const k = heapK[a]!; heapK[a] = heapK[b]!; heapK[b] = k;
  };
  const push = (tile: number, k: number): void => {
    heapT.push(tile); heapK.push(k);
    let c = heapT.length - 1;
    while (c > 0) { const p = (c - 1) >> 1; if (heapK[p]! <= heapK[c]!) break; swap(p, c); c = p; }
  };
  const pop = (): number => {
    const top = heapT[0]!; const lt = heapT.pop()!; const lk = heapK.pop()!;
    if (heapT.length > 0) {
      heapT[0] = lt; heapK[0] = lk;
      let c = 0;
      for (;;) {
        const l = 2 * c + 1; const r = l + 1; let sm = c;
        if (l < heapK.length && heapK[l]! < heapK[sm]!) sm = l;
        if (r < heapK.length && heapK[r]! < heapK[sm]!) sm = r;
        if (sm === c) break; swap(sm, c); c = sm;
      }
    }
    return top;
  };

  dist[goal] = 0; push(goal, 0);
  while (heapT.length > 0) {
    const k = heapK[0]!; const u = pop();
    if (k > dist[u]!) continue;
    const ux = u % W; const uy = (u - ux) / W;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = ux + dx; const ny = uy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || pass[ny * W + nx] !== 1) continue;
        if (dx !== 0 && dy !== 0 && (pass[uy * W + ux + dx] !== 1 || pass[(uy + dy) * W + ux] !== 1)) continue;
        const v = ny * W + nx;
        const nd = dist[u]! + (dx !== 0 && dy !== 0 ? 14 : 10);
        if (nd < dist[v]!) { dist[v] = nd; push(v, nd); }
      }
    }
  }
  return dist;
};

/** Distance field to a path-cell goal for State `s`, cached until the building layout changes. */
export const flowField = (s: State, goalCell: number, clearancePx = 0): Int32Array => {
  const nav = navOf(s);
  const key = goalCell * FIELD_KEY_STRIDE + Math.min(clearancePx, FIELD_KEY_STRIDE - 1);
  const hit = nav.fields.get(key);
  if (hit) return hit;
  const field = compute(s, pathPass(s, clearancePx), goalCell);
  nav.fields.set(key, field);
  if (nav.fields.size > LIMIT) nav.fields.delete(nav.fields.keys().next().value!);
  return field;
};

/** Neighbour path cell one step downhill toward the goal, or -1 at the goal/unreachable. */
export const downhill = (
  s: State,
  field: Int32Array,
  tx: number,
  ty: number,
  unitSolid: Uint8Array | null = null,
  clearancePx = 0,
): number => {
  const W = pathW(s);
  const H = pathH(s);
  const pass = pathPass(s, clearancePx);
  const here = field[ty * W + tx]!;
  if (here === INF || here === 0) return -1;
  let best = -1; let bestD = here;
  let fallback = -1; let fallbackD = INF;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = tx + dx; const ny = ty + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || pass[ny * W + nx] !== 1) continue;
      if (unitSolid !== null && unitSolid[ny * W + nx] === 1) continue;
      if (dx !== 0 && dy !== 0) {
        const sideA = ty * W + tx + dx;
        const sideB = (ty + dy) * W + tx;
        if (pass[sideA] !== 1 || pass[sideB] !== 1) continue;
        if (unitSolid !== null && (unitSolid[sideA] === 1 || unitSolid[sideB] === 1)) continue;
      }
      const v = ny * W + nx;
      if (field[v]! < bestD) { bestD = field[v]!; best = v; }
      if (field[v]! < fallbackD) { fallbackD = field[v]!; fallback = v; }
    }
  }
  return best >= 0 ? best : fallback;
};

const flowVectorAt = (
  s: State,
  field: Int32Array,
  pass: Uint8Array,
  unitSolid: Uint8Array | null,
  tx: number,
  ty: number,
  clearancePx: number,
): { x: number; y: number; valid: boolean } => {
  const W = pathW(s);
  const H = pathH(s);
  if (tx < 0 || ty < 0 || tx >= W || ty >= H) return { x: 0, y: 0, valid: false };
  const here = field[ty * W + tx]!;
  if (here === INF || here === 0 || pass[ty * W + tx] !== 1) return { x: 0, y: 0, valid: false };
  const next = downhill(s, field, tx, ty, unitSolid, clearancePx);
  if (next < 0) return { x: 0, y: 0, valid: false };
  return { x: (next % W) - tx, y: Math.trunc(next / W) - ty, valid: true };
};

/**
 * Smooth flow direction in path-cell units, scaled by ONE. Invalid sample corners
 * are ignored rather than blended through walls; direct passability still gates
 * the actual step in pathing.ts.
 */
export const sampleFlowDirection = (
  s: State,
  field: Int32Array,
  pass: Uint8Array,
  unitSolid: Uint8Array | null,
  xfx: number,
  yfx: number,
  clearancePx = 0,
): { x: number; y: number } => {
  const px = pathX(xfx);
  const py = pathY(yfx);
  const gx = Math.trunc(((xfx - px * PATH_CELL_FX) * ONE) / PATH_CELL_FX);
  const gy = Math.trunc(((yfx - py * PATH_CELL_FX) * ONE) / PATH_CELL_FX);
  let sx = 0;
  let sy = 0;
  let sw = 0;
  const add = (ox: number, oy: number, wx: number, wy: number): void => {
    const weight = Math.trunc((wx * wy) / ONE);
    if (weight <= 0) return;
    const v = flowVectorAt(s, field, pass, unitSolid, px + ox, py + oy, clearancePx);
    if (!v.valid) return;
    sx += v.x * weight;
    sy += v.y * weight;
    sw += weight;
  };

  add(0, 0, ONE - gx, ONE - gy);
  add(1, 0, gx, ONE - gy);
  add(0, 1, ONE - gx, gy);
  add(1, 1, gx, gy);
  if (sw <= 0) return { x: 0, y: 0 };
  return {
    x: Math.trunc((sx * ONE) / sw),
    y: Math.trunc((sy * ONE) / sw),
  };
};

export const nearestPassablePathCell = (
  s: State,
  clearancePx: number,
  goalX: number,
  goalY: number,
  startX: number,
  startY: number,
): number => {
  const W = pathW(s);
  const H = pathH(s);
  const pass = pathPass(s, clearancePx);
  if (goalX >= 0 && goalY >= 0 && goalX < W && goalY < H && pass[goalY * W + goalX] === 1) return goalY * W + goalX;
  const maxR = PATH_CELLS_PER_TILE * 8;
  for (let r = 1; r <= maxR; r++) {
    let best = -1;
    let bestStartD = INF;
    for (let y = goalY - r; y <= goalY + r; y++) {
      for (let x = goalX - r; x <= goalX + r; x++) {
        if (x !== goalX - r && x !== goalX + r && y !== goalY - r && y !== goalY + r) continue;
        if (x < 0 || y < 0 || x >= W || y >= H || pass[y * W + x] !== 1) continue;
        const dx = x - startX;
        const dy = y - startY;
        const d = dx * dx + dy * dy;
        const tile = y * W + x;
        if (d < bestStartD || (d === bestStartD && tile < best)) {
          best = tile;
          bestStartD = d;
        }
      }
    }
    if (best >= 0) return best;
  }
  return -1;
};
