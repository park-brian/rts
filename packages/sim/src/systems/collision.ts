// Unit collision: ground combat units can't occupy the same space — overlapping
// pairs are pushed apart so an army forms a body around its target instead of
// stacking on one pixel. Two passes (accumulate from pre-move positions, then
// apply) so pushes are symmetric and order-independent; integer math, clamped to
// walkable tiles. Deterministic.
//
// Scope: Mobile, non-Structure units that are neither Workers nor Air. Workers are
// excluded so mineral bunching/mining ranges work; Air units fly over everything.
// (Building footprints are not yet solid — units path through them; see roadmap.)

import type { State } from '../world.ts';
import { CAP } from '../world.ts';
import { Role, Units, TILE } from '../data.ts';
import { ONE, isqrt } from '../fixed.ts';
import { type Grid, forEachNear } from '../grid.ts';
import { navSolid, open } from '../flow.ts';

const PUSH_MAX = ONE * 4; // max collision displacement per tick (fixed px); bounded to stay stable
const TILE_FX = TILE * ONE;

const ndx = new Int32Array(CAP);
const ndy = new Int32Array(CAP);

/** Does this unit participate in ground collision? */
const isSolid = (fl: number): boolean =>
  (fl & Role.Mobile) !== 0 && (fl & Role.Structure) === 0 &&
  (fl & Role.Worker) === 0 && (fl & Role.Air) === 0;

export const collide = (s: State, grid: Grid): void => {
  const e = s.e;
  const m = s.map;
  const solid = navSolid(s); // fetched once; reused by the apply pass below

  for (let i = 0; i < e.hi; i++) {
    ndx[i] = 0; ndy[i] = 0;
    if (e.alive[i] !== 1 || !isSolid(e.flags[i]!)) continue;
    const ri = Units[e.kind[i]!]!.radius;
    let ax = 0; let ay = 0;
    forEachNear(s, grid, e.x[i]!, e.y[i]!, ri * 2, (j) => {
      if (j === i || e.alive[j] !== 1 || !isSolid(e.flags[j]!)) return;
      const min = ri + Units[e.kind[j]!]!.radius;
      const dx = e.x[i]! - e.x[j]!; const dy = e.y[i]! - e.y[j]!;
      const d2 = dx * dx + dy * dy;
      if (d2 === 0) { ax += i < j ? -(min >> 1) : min >> 1; return; } // exact overlap: split along x by slot
      if (d2 >= min * min) return; // not overlapping
      const d = isqrt(d2);
      const push = (min - d) >> 1; // each backs out half the penetration → they just touch
      ax += Math.trunc((dx * push) / d);
      ay += Math.trunc((dy * push) / d);
    });
    const mag2 = ax * ax + ay * ay;
    if (mag2 > PUSH_MAX * PUSH_MAX) {
      const mag = isqrt(mag2);
      ax = Math.trunc((ax * PUSH_MAX) / mag);
      ay = Math.trunc((ay * PUSH_MAX) / mag);
    }
    ndx[i] = ax; ndy[i] = ay;
  }

  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || (ndx[i] === 0 && ndy[i] === 0)) continue;
    const nx = e.x[i]! + ndx[i]!; const ny = e.y[i]! + ndy[i]!;
    // Never shove a unit into terrain or a building footprint.
    if (open(m, solid, Math.floor(nx / TILE_FX), Math.floor(ny / TILE_FX))) { e.x[i] = nx; e.y[i] = ny; }
  }
};
