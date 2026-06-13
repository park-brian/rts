// Unit collision: ground combat units can't occupy the same space — overlapping
// pairs are pushed apart so an army forms a body around its target instead of
// stacking on one pixel. Two passes (accumulate from pre-move positions, then
// apply) so pushes are symmetric and order-independent; integer math, clamped to
// walkable tiles. Deterministic.
//
// Scope: Mobile, non-Structure units that are neither Workers nor Air. Workers are
// excluded so mineral bunching/mining ranges work; Air units fly over everything.
//
// Performance: collision uses its OWN one-tile grid (not the coarse combat grid).
// The interaction radius (≈ sum of two unit radii) is well under a tile, so a 3×3
// cell scan is provably sufficient, and a fine grid keeps few units per cell — which
// avoids the O(n²) blowup when a death-ball packs many units into one coarse cell.
// The grid bins solids only and is built lazily, so the economy path (no army) and
// idle frames pay nothing. No per-unit closure (it ran for every unit, every tick).

import type { State } from '../world.ts';
import { CAP } from '../world.ts';
import { Role, Units, TILE } from '../data.ts';
import { ONE, isqrt } from '../fixed.ts';
import { navSolid, open } from '../flow.ts';

const PUSH_MAX = ONE * 4; // max collision displacement per tick (fixed px); bounded to stay stable
const TILE_FX = TILE * ONE;

const ndx = new Int32Array(CAP);
const ndy = new Int32Array(CAP);
const list = new Int32Array(CAP); // solid slots this tick (reused)
const next = new Int32Array(CAP); // intrusive linked list within a grid cell
let head = new Int32Array(0); // one cell per tile; grown to the largest map seen

const isSolid = (fl: number): boolean =>
  (fl & Role.Mobile) !== 0 && (fl & Role.Structure) === 0 &&
  (fl & Role.Worker) === 0 && (fl & Role.Air) === 0;

export const collide = (s: State): void => {
  const e = s.e; const m = s.map; const W = m.w; const H = m.h;

  // 1) Gather the solid (colliding) units, resetting their nudges.
  let nl = 0;
  for (let i = 0; i < e.hi; i++) {
    ndx[i] = 0; ndy[i] = 0;
    if (e.alive[i] === 1 && isSolid(e.flags[i]!)) list[nl++] = i;
  }
  if (nl === 0) return; // nothing collides (e.g. an economy game) — skip the grid build entirely

  // 2) Bin solids into a one-tile grid.
  const cells = W * H;
  if (head.length < cells) head = new Int32Array(cells);
  head.fill(-1, 0, cells);
  for (let k = 0; k < nl; k++) {
    const i = list[k]!;
    const c = Math.floor(e.y[i]! / TILE_FX) * W + Math.floor(e.x[i]! / TILE_FX);
    next[i] = head[c]!; head[c] = i;
  }

  // 3) Accumulate the push from the 3×3 neighbourhood (every entry here is solid).
  for (let k = 0; k < nl; k++) {
    const i = list[k]!;
    const ri = Units[e.kind[i]!]!.radius;
    const cx = Math.floor(e.x[i]! / TILE_FX); const cy = Math.floor(e.y[i]! / TILE_FX);
    let ax = 0; let ay = 0;
    const y1 = Math.min(H - 1, cy + 1); const x1 = Math.min(W - 1, cx + 1);
    for (let gy = Math.max(0, cy - 1); gy <= y1; gy++) {
      for (let gx = Math.max(0, cx - 1); gx <= x1; gx++) {
        for (let j = head[gy * W + gx]!; j >= 0; j = next[j]!) {
          if (j === i) continue;
          const min = ri + Units[e.kind[j]!]!.radius;
          const dx = e.x[i]! - e.x[j]!; const dy = e.y[i]! - e.y[j]!;
          const d2 = dx * dx + dy * dy;
          if (d2 === 0) { ax += i < j ? -(min >> 1) : min >> 1; continue; } // exact overlap: split by slot
          if (d2 >= min * min) continue; // not overlapping
          const d = isqrt(d2);
          const push = (min - d) >> 1; // each backs out half the penetration → they just touch
          ax += Math.trunc((dx * push) / d);
          ay += Math.trunc((dy * push) / d);
        }
      }
    }
    const mag2 = ax * ax + ay * ay;
    if (mag2 > PUSH_MAX * PUSH_MAX) {
      const mag = isqrt(mag2);
      ax = Math.trunc((ax * PUSH_MAX) / mag);
      ay = Math.trunc((ay * PUSH_MAX) / mag);
    }
    ndx[i] = ax; ndy[i] = ay;
  }

  // 4) Apply, never shoving a unit into terrain or a building footprint.
  const solid = navSolid(s);
  for (let k = 0; k < nl; k++) {
    const i = list[k]!;
    if (ndx[i] === 0 && ndy[i] === 0) continue;
    const nx = e.x[i]! + ndx[i]!; const ny = e.y[i]! + ndy[i]!;
    if (open(m, solid, Math.floor(nx / TILE_FX), Math.floor(ny / TILE_FX))) { e.x[i] = nx; e.y[i] = ny; }
  }
};
