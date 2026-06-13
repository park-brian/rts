// Flow-field group pathfinding. A single integer Dijkstra from the goal tile over
// the walk grid yields a distance field; *every* unit heading to that goal follows
// its gradient downhill. N units to one destination cost one field, not N A* runs.
//
// Fields are a pure function of (map, goalTile), so they live in a module-level
// cache — NOT in game State — keyed by the (immutable) map. The cache is therefore
// shared across forks/snapshots of the same map (great for parallel RL envs) and
// never affects the state hash or determinism: re-deriving a field is reproducible.

import type { MapDef } from './map.ts';

export const INF = 0x7fffffff;
const LIMIT = 24; // cached fields per map (LRU by insertion order)

const cache = new WeakMap<MapDef, Map<number, Int32Array>>();

const passable = (m: MapDef, tx: number, ty: number): boolean =>
  tx >= 0 && ty >= 0 && tx < m.w && ty < m.h && m.walk[ty * m.w + tx] === 1;

/** Integer Dijkstra from `goal` over the walk grid (8-dir, 10/14, no corner-cut). */
const compute = (m: MapDef, goal: number): Int32Array => {
  const W = m.w;
  const dist = new Int32Array(W * m.h).fill(INF);
  const gx = goal % W;
  const gy = (goal - gx) / W;
  if (!passable(m, gx, gy)) return dist; // goal blocked → field stays INF everywhere

  // Binary min-heap of tiles, keyed by the distance recorded at push time; stale
  // entries are skipped on pop (lazy deletion). Deterministic: fixed neighbour order.
  const heapT: number[] = [];
  const heapK: number[] = [];
  const swap = (a: number, b: number): void => {
    const t = heapT[a]!; heapT[a] = heapT[b]!; heapT[b] = t;
    const k = heapK[a]!; heapK[a] = heapK[b]!; heapK[b] = k;
  };
  const push = (tile: number, k: number): void => {
    heapT.push(tile); heapK.push(k);
    let c = heapT.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (heapK[p]! <= heapK[c]!) break;
      swap(p, c); c = p;
    }
  };
  const pop = (): number => {
    const top = heapT[0]!;
    const lt = heapT.pop()!; const lk = heapK.pop()!;
    if (heapT.length > 0) {
      heapT[0] = lt; heapK[0] = lk;
      let c = 0;
      for (;;) {
        const l = 2 * c + 1; const r = l + 1; let s = c;
        if (l < heapK.length && heapK[l]! < heapK[s]!) s = l;
        if (r < heapK.length && heapK[r]! < heapK[s]!) s = r;
        if (s === c) break;
        swap(s, c); c = s;
      }
    }
    return top;
  };

  dist[goal] = 0;
  push(goal, 0);
  while (heapT.length > 0) {
    const k = heapK[0]!;
    const u = pop();
    if (k > dist[u]!) continue; // stale
    const ux = u % W; const uy = (u - ux) / W;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = ux + dx; const ny = uy + dy;
        if (!passable(m, nx, ny)) continue;
        if (dx !== 0 && dy !== 0 && (!passable(m, ux + dx, uy) || !passable(m, ux, uy + dy))) continue;
        const v = ny * W + nx;
        const nd = dist[u]! + (dx !== 0 && dy !== 0 ? 14 : 10);
        if (nd < dist[v]!) { dist[v] = nd; push(v, nd); }
      }
    }
  }
  return dist;
};

/** Distance field to `goalTile` for `m`, cached and shared across same-map sims. */
export const flowField = (m: MapDef, goalTile: number): Int32Array => {
  let byGoal = cache.get(m);
  if (!byGoal) { byGoal = new Map(); cache.set(m, byGoal); }
  const hit = byGoal.get(goalTile);
  if (hit) return hit;
  const field = compute(m, goalTile);
  byGoal.set(goalTile, field);
  if (byGoal.size > LIMIT) byGoal.delete(byGoal.keys().next().value!); // evict oldest
  return field;
};

/**
 * The neighbour tile (8-dir) with the strictly-lowest field distance — i.e. one
 * step downhill toward the goal. Returns its tile index, or -1 if `(tx,ty)` is the
 * goal/unreachable (caller then heads straight to the goal point).
 */
export const downhill = (m: MapDef, field: Int32Array, tx: number, ty: number): number => {
  const W = m.w;
  const here = field[ty * W + tx]!;
  if (here === INF || here === 0) return -1;
  let best = -1; let bestD = here;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = tx + dx; const ny = ty + dy;
      if (!passable(m, nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (!passable(m, tx + dx, ty) || !passable(m, tx, ty + dy))) continue;
      const v = ny * W + nx;
      if (field[v]! < bestD) { bestD = field[v]!; best = v; }
    }
  }
  return best;
};
