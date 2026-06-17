// Flow-field group pathfinding + dynamic pathing context.
//
// A single integer Dijkstra from the goal tile yields a distance field that every
// unit heading there follows downhill — N units to one goal cost one field, not N
// A* runs. Routing must also avoid *buildings*, which are dynamic, so each State
// carries a transient "solid" grid (building footprints over the static terrain).
// Flow fields therefore depend on (terrain + solid) and are cached per-State; the
// cache is invalidated when the building layout changes (a cheap signature check).
// Re-deriving a field is a pure function of that input, so determinism holds and
// forks/snapshots rebuild their own context.
//
// Perf note: callers fetch the solid grid ONCE (navSolid) and pass it into the
// hot per-tile checks — a per-tile WeakMap lookup in line-of-sight scans (every
// unit, every tick) was a real throughput sink.

import { NONE, type State } from './world.ts';
import { Role, TILE } from './data.ts';
import { ONE } from './fixed.ts';
import { fold, FNV_OFFSET } from './hash.ts';
import { structureFootprint } from './footprint.ts';
import { isPathingAnchor } from './pathing-anchor.ts';
import { bodyBounds } from './spatial.ts';

export const INF = 0x7fffffff;
const LIMIT = 24; // cached fields per State (LRU by insertion order)
const CLEARANCE_CLASSES = 4;
const TILE_FX = TILE * ONE;
const HALF_TILE_FX = TILE_FX >> 1;
type Dilation = { left: number; right: number; up: number; down: number };
const DILATIONS: readonly Dilation[] = [
  { left: 0, right: 0, up: 0, down: 0 },
  { left: 1, right: 1, up: 0, down: 0 },
  { left: 0, right: 0, up: 0, down: 1 },
  { left: 1, right: 1, up: 1, down: 1 },
];
type Nav = {
  sig: number;
  solid: Uint8Array;
  clearanceSolid: Uint8Array[];
  fields: Map<number, Int32Array>;
  unitTick: number[];
  unitSolid: Uint8Array[];
  unitTiles: Int32Array[];
  unitTileCount: number[];
  unitHasSolid: boolean[];
};
const navByState = new WeakMap<State, Nav>();

const newMasks = (count: number, size: number): Uint8Array[] =>
  Array.from({ length: count }, () => new Uint8Array(size));

const newTileLists = (count: number, size: number): Int32Array[] =>
  Array.from({ length: count }, () => new Int32Array(size));

const extraTiles = (extent: number): number => Math.max(0, Math.ceil((extent - HALF_TILE_FX) / TILE_FX));

export const navClearanceClass = (kind: number): number => {
  const b = bodyBounds(kind);
  const left = extraTiles(b.left);
  const right = extraTiles(b.right);
  const up = extraTiles(b.up);
  const down = extraTiles(b.down);
  if (left === 0 && right === 0 && up === 0 && down === 0) return 0;
  if (left <= 1 && right <= 1 && up === 0 && down === 0) return 1;
  if (left === 0 && right === 0 && up === 0 && down <= 1) return 2;
  return 3;
};

const stampDilated = (
  m: State['map'],
  mask: Uint8Array,
  tx: number,
  ty: number,
  d: Dilation,
  touched?: Int32Array,
  count = 0,
): number => {
  for (let y = Math.max(0, ty - d.down); y <= Math.min(m.h - 1, ty + d.up); y++) {
    for (let x = Math.max(0, tx - d.right); x <= Math.min(m.w - 1, tx + d.left); x++) {
      const tile = y * m.w + x;
      if (mask[tile] === 1) continue;
      mask[tile] = 1;
      if (touched) touched[count++] = tile;
    }
  }
  return count;
};

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

const stampSolid = (s: State, solid: Uint8Array): void => {
  const m = s.map;
  solid.fill(0);
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.container[i] !== NONE || !blocks(e.flags[i]!)) continue;
    const fp = structureFootprint(e.kind[i]!, e.x[i]!, e.y[i]!);
    for (let ty = Math.max(0, fp.y0); ty <= Math.min(m.h - 1, fp.y1); ty++) {
      for (let tx = Math.max(0, fp.x0); tx <= Math.min(m.w - 1, fp.x1); tx++) solid[ty * m.w + tx] = 1;
    }
  }
};

const stampClearanceSolids = (s: State, nav: Nav): void => {
  const m = s.map;
  for (const mask of nav.clearanceSolid) mask.fill(0);
  for (let tile = 0; tile < m.walk.length; tile++) {
    if (m.walk[tile] === 1 && nav.solid[tile] === 0) continue;
    const tx = tile % m.w;
    const ty = (tile - tx) / m.w;
    for (let cls = 0; cls < CLEARANCE_CLASSES; cls++) {
      stampDilated(m, nav.clearanceSolid[cls]!, tx, ty, DILATIONS[cls]!);
    }
  }
};

/** Refresh a State's pathing context; rebuild the solid grid + drop stale fields if buildings changed. */
export const prepareNav = (s: State): Nav => {
  let nav = navByState.get(s);
  if (!nav) {
    nav = {
      sig: -1,
      solid: new Uint8Array(s.map.w * s.map.h),
      clearanceSolid: newMasks(CLEARANCE_CLASSES, s.map.w * s.map.h),
      fields: new Map(),
      unitTick: Array(CLEARANCE_CLASSES).fill(-1),
      unitSolid: newMasks(CLEARANCE_CLASSES, s.map.w * s.map.h),
      unitTiles: newTileLists(CLEARANCE_CLASSES, s.map.w * s.map.h),
      unitTileCount: Array(CLEARANCE_CLASSES).fill(0),
      unitHasSolid: Array(CLEARANCE_CLASSES).fill(false),
    };
    navByState.set(s, nav);
  }
  const sig = buildSig(s);
  if (sig !== nav.sig) {
    nav.sig = sig;
    stampSolid(s, nav.solid);
    stampClearanceSolids(s, nav);
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

/** The current building-footprint grid (fetch once, then use `open` in hot loops). */
export const navSolid = (s: State): Uint8Array => {
  if (s !== memoState) { memoState = s; memoSolid = navOf(s).solid; }
  return memoSolid;
};

export const navClearanceSolid = (s: State, cls: number): Uint8Array => navOf(s).clearanceSolid[cls]!;

/** Walkable terrain AND free of a building footprint, given a fetched solid grid. */
export const open = (m: State['map'], solid: Uint8Array, tx: number, ty: number): boolean =>
  tx >= 0 && ty >= 0 && tx < m.w && ty < m.h && m.walk[ty * m.w + tx] === 1 && solid[ty * m.w + tx] === 0;

const openClearance = (m: State['map'], solid: Uint8Array, tx: number, ty: number): boolean =>
  tx >= 0 && ty >= 0 && tx < m.w && ty < m.h && solid[ty * m.w + tx] === 0;

/** Single-tile passability check (does its own lookup; for occasional callers). */
export const navPassable = (s: State, tx: number, ty: number): boolean => open(s.map, navOf(s).solid, tx, ty);

export const navPassableForKind = (s: State, kind: number, tx: number, ty: number): boolean =>
  openClearance(s.map, navClearanceSolid(s, navClearanceClass(kind)), tx, ty);

const refreshUnitSolid = (s: State, cls: number): Nav => {
  const nav = navOf(s);
  if (nav.unitTick[cls] === s.tick) return nav;
  nav.unitTick[cls] = s.tick;
  const tiles = nav.unitTiles[cls]!;
  const solid = nav.unitSolid[cls]!;
  for (let i = 0; i < nav.unitTileCount[cls]!; i++) solid[tiles[i]!] = 0;
  nav.unitTileCount[cls] = 0;
  nav.unitHasSolid[cls] = false;
  const e = s.e; const m = s.map;
  for (let i = 0; i < e.hi; i++) {
    if (!isPathingAnchor(s, i)) continue;
    const tx = Math.floor(e.x[i]! / TILE_FX);
    const ty = Math.floor(e.y[i]! / TILE_FX);
    if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) continue;
    nav.unitTileCount[cls] = stampDilated(m, solid, tx, ty, DILATIONS[cls]!, tiles, nav.unitTileCount[cls]!);
    nav.unitHasSolid[cls] = true;
  }
  return nav;
};

export const navUnitSolid = (s: State, cls = 0): Uint8Array => refreshUnitSolid(s, cls).unitSolid[cls]!;
export const navHasUnitSolid = (s: State, cls = 0): boolean => refreshUnitSolid(s, cls).unitHasSolid[cls]!;

/** Integer Dijkstra from `goal` over combined terrain+building passability. */
const compute = (s: State, solid: Uint8Array, goal: number): Int32Array => {
  const m = s.map; const W = m.w;
  const dist = new Int32Array(W * m.h).fill(INF);
  const gx = goal % W; const gy = (goal - gx) / W;
  if (!openClearance(m, solid, gx, gy)) return dist;

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
        if (!openClearance(m, solid, nx, ny)) continue;
        if (dx !== 0 && dy !== 0 && (!openClearance(m, solid, ux + dx, uy) || !openClearance(m, solid, ux, uy + dy))) continue;
        const v = ny * W + nx;
        const nd = dist[u]! + (dx !== 0 && dy !== 0 ? 14 : 10);
        if (nd < dist[v]!) { dist[v] = nd; push(v, nd); }
      }
    }
  }
  return dist;
};

/** Distance field to `goalTile` for State `s`, cached until the building layout changes. */
export const flowField = (s: State, goalTile: number, cls = 0): Int32Array => {
  const nav = navOf(s);
  const key = goalTile * CLEARANCE_CLASSES + cls;
  const hit = nav.fields.get(key);
  if (hit) return hit;
  const field = compute(s, nav.clearanceSolid[cls]!, goalTile);
  nav.fields.set(key, field);
  if (nav.fields.size > LIMIT) nav.fields.delete(nav.fields.keys().next().value!);
  return field;
};

/** Neighbour tile one step downhill toward the goal, or -1 at the goal/unreachable. */
export const downhill = (
  s: State,
  solid: Uint8Array,
  field: Int32Array,
  tx: number,
  ty: number,
  unitSolid: Uint8Array | null = null,
): number => {
  const m = s.map; const W = m.w;
  const here = field[ty * W + tx]!;
  if (here === INF || here === 0) return -1;
  let best = -1; let bestD = here;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = tx + dx; const ny = ty + dy;
      if (!openClearance(m, solid, nx, ny)) continue;
      if (unitSolid !== null && unitSolid[ny * W + nx] === 1) continue;
      if (dx !== 0 && dy !== 0 && (!openClearance(m, solid, tx + dx, ty) || !openClearance(m, solid, tx, ty + dy))) continue;
      const v = ny * W + nx;
      if (field[v]! < bestD) { bestD = field[v]!; best = v; }
    }
  }
  return best;
};
