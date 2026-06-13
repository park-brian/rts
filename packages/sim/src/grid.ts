// Uniform spatial bucket grid (typed-array backed), rebuilt each tick. Replaces the
// O(n) linear scans for the per-tick hot queries (target acquisition, separation),
// turning combat's O(n²) acquire into O(n·k_local). Determinism: entities bin in
// ascending-slot traversal order, and queries tie-break by (distance, then slot),
// so the result never depends on grid bucketing.
//
// The scratch buffers are module-level and reused across ticks/sims: `stepWorld` is
// synchronous and consumes the grid (combat + separation) within the same step
// before any other sim steps, so there's no aliasing — and zero per-tick allocation.

import type { State } from './world.ts';
import { CAP, NONE, isEnemy } from './world.ts';
import { TILE } from './data.ts';
import { ONE } from './fixed.ts';

const CELL_TILES = 4;
const CELL_FX = CELL_TILES * TILE * ONE; // cell size in fixed px

export type Grid = {
  cols: number;
  rows: number;
  head: Int32Array; // per cell: first slot, or -1
  next: Int32Array; // per slot: next slot in the same cell, or -1
};

let sHead = new Int32Array(0); // reused, sized to the largest map seen
const sNext = new Int32Array(CAP); // reused; only alive slots are written/followed

const cell = (coord: number, n: number): number =>
  Math.min(n - 1, Math.max(0, Math.trunc(coord / CELL_FX)));

export const buildGrid = (s: State): Grid => {
  const m = s.map;
  const cols = Math.max(1, Math.ceil(m.w / CELL_TILES));
  const rows = Math.max(1, Math.ceil(m.h / CELL_TILES));
  const cells = cols * rows;
  if (sHead.length < cells) sHead = new Int32Array(cells);
  sHead.fill(-1, 0, cells);
  const e = s.e;
  // Scan slots descending and head-insert, so per-cell traversal yields ascending slots.
  for (let i = e.hi - 1; i >= 0; i--) {
    if (e.alive[i] !== 1) continue;
    const c = cell(e.y[i]!, rows) * cols + cell(e.x[i]!, cols);
    sNext[i] = sHead[c]!;
    sHead[c] = i;
  }
  return { cols, rows, head: sHead, next: sNext };
};

/** Nearest enemy of slot `i` within `range` fixed px; slot index or NONE. Inlined (no closure: hot path). */
export const nearestEnemy = (s: State, g: Grid, i: number, range: number): number => {
  const e = s.e;
  const ox = e.x[i]!; const oy = e.y[i]!; const owner = e.owner[i]!;
  const r2 = range * range;
  const span = Math.ceil(range / CELL_FX); // exactly sufficient: ⌊q/c⌋−⌊p/c⌋ ≤ ⌈r/c⌉
  const cx = cell(ox, g.cols); const cy = cell(oy, g.rows);
  const x0 = Math.max(0, cx - span); const x1 = Math.min(g.cols - 1, cx + span);
  let best = NONE; let bestD = r2 + 1;
  for (let gy = Math.max(0, cy - span); gy <= Math.min(g.rows - 1, cy + span); gy++) {
    const row = gy * g.cols;
    for (let gx = x0; gx <= x1; gx++) {
      for (let j = g.head[row + gx]!; j >= 0; j = g.next[j]!) {
        if (j === i || !isEnemy(s, owner, e.owner[j]!)) continue;
        const dx = e.x[j]! - ox; const dy = e.y[j]! - oy;
        const d = dx * dx + dy * dy;
        if (d <= r2 && (d < bestD || (d === bestD && j < best))) { bestD = d; best = j; }
      }
    }
  }
  return best;
};
