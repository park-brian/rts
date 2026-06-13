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

import type { State } from './world.ts';
import { Role, Units, TILE } from './data.ts';
import { ONE } from './fixed.ts';
import { fold, FNV_OFFSET } from './hash.ts';

export const INF = 0x7fffffff;
const LIMIT = 24; // cached fields per State (LRU by insertion order)
const TILE_FX = TILE * ONE;

type Nav = { sig: number; solid: Uint8Array; fields: Map<number, Int32Array> };
const navByState = new WeakMap<State, Nav>();

const tileOf = (xfx: number): number => Math.floor(xfx / TILE_FX);

/** Solid = structures that aren't also resources (a refinery on a geyser stays walkable). */
const blocks = (fl: number): boolean => (fl & Role.Structure) !== 0 && (fl & Role.Resource) === 0;

/** A cheap, deterministic fingerprint of the building layout (slot order). */
const buildSig = (s: State): number => {
  const e = s.e;
  let h = FNV_OFFSET;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || !blocks(e.flags[i]!)) continue;
    h = fold(h, i); h = fold(h, e.x[i]!); h = fold(h, e.y[i]!);
  }
  return h >>> 0;
};

const stampSolid = (s: State, solid: Uint8Array): void => {
  const m = s.map;
  solid.fill(0);
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || !blocks(e.flags[i]!)) continue;
    const cx = tileOf(e.x[i]!); const cy = tileOf(e.y[i]!);
    const rt = Math.max(1, Math.floor(Units[e.kind[i]!]!.radius / ONE / TILE));
    for (let ty = Math.max(0, cy - rt); ty <= Math.min(m.h - 1, cy + rt); ty++) {
      for (let tx = Math.max(0, cx - rt); tx <= Math.min(m.w - 1, cx + rt); tx++) solid[ty * m.w + tx] = 1;
    }
  }
};

/** Refresh a State's pathing context; rebuild the solid grid + drop stale fields if buildings changed. */
export const prepareNav = (s: State): Nav => {
  let nav = navByState.get(s);
  if (!nav) { nav = { sig: -1, solid: new Uint8Array(s.map.w * s.map.h), fields: new Map() }; navByState.set(s, nav); }
  const sig = buildSig(s);
  if (sig !== nav.sig) { nav.sig = sig; stampSolid(s, nav.solid); nav.fields.clear(); }
  return nav;
};

const navOf = (s: State): Nav => navByState.get(s) ?? prepareNav(s);

/** The current building-footprint grid (fetch once, then use `open` in hot loops). */
export const navSolid = (s: State): Uint8Array => navOf(s).solid;

/** Walkable terrain AND free of a building footprint, given a fetched solid grid. */
export const open = (m: State['map'], solid: Uint8Array, tx: number, ty: number): boolean =>
  tx >= 0 && ty >= 0 && tx < m.w && ty < m.h && m.walk[ty * m.w + tx] === 1 && solid[ty * m.w + tx] === 0;

/** Single-tile passability check (does its own lookup; for occasional callers). */
export const navPassable = (s: State, tx: number, ty: number): boolean => open(s.map, navOf(s).solid, tx, ty);

/** Integer Dijkstra from `goal` over combined terrain+building passability. */
const compute = (s: State, solid: Uint8Array, goal: number): Int32Array => {
  const m = s.map; const W = m.w;
  const dist = new Int32Array(W * m.h).fill(INF);
  const gx = goal % W; const gy = (goal - gx) / W;
  if (!open(m, solid, gx, gy)) return dist;

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
        if (!open(m, solid, nx, ny)) continue;
        if (dx !== 0 && dy !== 0 && (!open(m, solid, ux + dx, uy) || !open(m, solid, ux, uy + dy))) continue;
        const v = ny * W + nx;
        const nd = dist[u]! + (dx !== 0 && dy !== 0 ? 14 : 10);
        if (nd < dist[v]!) { dist[v] = nd; push(v, nd); }
      }
    }
  }
  return dist;
};

/** Distance field to `goalTile` for State `s`, cached until the building layout changes. */
export const flowField = (s: State, goalTile: number): Int32Array => {
  const nav = navOf(s);
  const hit = nav.fields.get(goalTile);
  if (hit) return hit;
  const field = compute(s, nav.solid, goalTile);
  nav.fields.set(goalTile, field);
  if (nav.fields.size > LIMIT) nav.fields.delete(nav.fields.keys().next().value!);
  return field;
};

/** Neighbour tile one step downhill toward the goal, or -1 at the goal/unreachable. */
export const downhill = (s: State, solid: Uint8Array, field: Int32Array, tx: number, ty: number): number => {
  const m = s.map; const W = m.w;
  const here = field[ty * W + tx]!;
  if (here === INF || here === 0) return -1;
  let best = -1; let bestD = here;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = tx + dx; const ny = ty + dy;
      if (!open(m, solid, nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (!open(m, solid, tx + dx, ty) || !open(m, solid, tx, ty + dy))) continue;
      const v = ny * W + nx;
      if (field[v]! < bestD) { bestD = field[v]!; best = v; }
    }
  }
  return best;
};
