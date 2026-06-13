// Boids-lite separation: army units that overlap get pushed apart so a group spreads
// into a blob instead of stacking on a single pixel (the flow field steers them all
// to the same goal). Two passes — accumulate, then apply — so pushes are symmetric
// and order-independent; integer math, clamped to walkable tiles. Deterministic.
//
// Scope: Mobile, non-Worker, non-Structure units. Workers are excluded so mining
// ranges and the harvest economy are untouched.

import type { State } from '../world.ts';
import { CAP } from '../world.ts';
import { Role, Units, TILE } from '../data.ts';
import { ONE, isqrt } from '../fixed.ts';
import { type Grid, forEachNear } from '../grid.ts';

const SEP_MAX = ONE * 2; // max push per tick (fixed px); small to avoid jitter
const TILE_FX = TILE * ONE;

const ndx = new Int32Array(CAP);
const ndy = new Int32Array(CAP);

const isArmy = (fl: number): boolean =>
  (fl & Role.Mobile) !== 0 && (fl & Role.Worker) === 0 && (fl & Role.Structure) === 0;

const walkAt = (s: State, xfx: number, yfx: number): boolean => {
  const m = s.map;
  const tx = Math.floor(xfx / TILE_FX); const ty = Math.floor(yfx / TILE_FX);
  return tx >= 0 && ty >= 0 && tx < m.w && ty < m.h && m.walk[ty * m.w + tx] === 1;
};

export const separation = (s: State, grid: Grid): void => {
  const e = s.e;

  for (let i = 0; i < e.hi; i++) {
    ndx[i] = 0; ndy[i] = 0;
    if (e.alive[i] !== 1 || !isArmy(e.flags[i]!)) continue;
    const ri = Units[e.kind[i]!]!.radius;
    let ax = 0; let ay = 0;
    forEachNear(s, grid, e.x[i]!, e.y[i]!, ri * 2, (j) => {
      if (j === i || e.alive[j] !== 1 || !isArmy(e.flags[j]!)) return;
      const min = ri + Units[e.kind[j]!]!.radius;
      const dx = e.x[i]! - e.x[j]!; const dy = e.y[i]! - e.y[j]!;
      const d2 = dx * dx + dy * dy;
      if (d2 === 0) { ax += i < j ? -min : min; return; } // exact overlap: split along x by slot
      if (d2 >= min * min) return; // not overlapping
      const d = isqrt(d2);
      const push = min - d; // how far inside each other
      ax += Math.trunc((dx * push) / d);
      ay += Math.trunc((dy * push) / d);
    });
    const mag2 = ax * ax + ay * ay;
    if (mag2 > SEP_MAX * SEP_MAX) {
      const mag = isqrt(mag2);
      ax = Math.trunc((ax * SEP_MAX) / mag);
      ay = Math.trunc((ay * SEP_MAX) / mag);
    }
    ndx[i] = ax; ndy[i] = ay;
  }

  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || (ndx[i] === 0 && ndy[i] === 0)) continue;
    const nx = e.x[i]! + ndx[i]!; const ny = e.y[i]! + ndy[i]!;
    if (walkAt(s, nx, ny)) { e.x[i] = nx; e.y[i] = ny; } // skip pushes into terrain
  }
};
