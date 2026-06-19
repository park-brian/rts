// Deterministic pre-move steering around nearby ground bodies.
//
// Collision remains the final overlap cleanup, but movement should prefer a legal
// velocity that does not create the overlap in the first place. This module keeps a
// compact one-tile spatial index of solid ground units for the current tick and
// scores candidate positions by predicted crowding.

import type { State } from '../entity/world.ts';
import { CAP } from '../entity/world.ts';
import { Kind, Role, TILE, Units } from '../data.ts';
import { ONE, isqrt } from '../fixed.ts';
import { isContained } from '../cargo.ts';
import { isPathingAnchor } from '../pathing-anchor.ts';
import { workersCanShareResourceRouteCollision } from '../worker-collision.ts';

const TILE_FX = TILE * ONE;
const AVOID_MARGIN = ONE * 6;
const MAX_NEIGHBOR_RADIUS = ONE * 32;
const LOOKAHEAD_TICKS = 2;

let gridState: State | null = null;
let gridTick = -1;
let cols = 0;
let rows = 0;
let head = new Int32Array(0);
const next = new Int32Array(CAP);

const cell = (coord: number, n: number): number =>
  Math.min(n - 1, Math.max(0, Math.trunc(coord / TILE_FX)));

export const isLocalAvoidanceSolidKind = (kind: number, fl: number): boolean =>
  kind !== Kind.Scarab &&
  (fl & Role.Mobile) !== 0 && (fl & Role.Structure) === 0 &&
  (fl & Role.Air) === 0;

export const isLocalAvoidanceSolid = (s: State, slot: number): boolean => {
  const e = s.e;
  return e.alive[slot] === 1 &&
    e.burrowed[slot] !== 1 &&
    !isContained(s, slot) &&
    isLocalAvoidanceSolidKind(e.kind[slot]!, e.flags[slot]!);
};

export const usesLocalAvoidance = isLocalAvoidanceSolid;

const clampVelocity = (x: number, y: number, maxSpeed: number): { x: number; y: number } => {
  const d = isqrt(x * x + y * y);
  if (d === 0 || d <= maxSpeed) return { x, y };
  return { x: Math.trunc((x * maxSpeed) / d), y: Math.trunc((y * maxSpeed) / d) };
};

export const prepareLocalAvoidance = (s: State): void => {
  if (gridState === s && gridTick === s.tick) return;
  gridState = s;
  gridTick = s.tick;
  cols = s.map.w;
  rows = s.map.h;
  const cells = cols * rows;
  if (head.length < cells) head = new Int32Array(cells);
  head.fill(-1, 0, cells);
  const e = s.e;
  for (let i = e.hi - 1; i >= 0; i--) {
    if (!usesLocalAvoidance(s, i)) continue;
    const c = cell(e.y[i]!, rows) * cols + cell(e.x[i]!, cols);
    next[i] = head[c]!;
    head[c] = i;
  }
};

export const localAvoidancePenalty = (s: State, slot: number, nx: number, ny: number): number => {
  if (!usesLocalAvoidance(s, slot)) return 0;
  prepareLocalAvoidance(s);
  const e = s.e;
  const ri = Units[e.kind[slot]!]!.radius;
  const span = Math.ceil((ri + MAX_NEIGHBOR_RADIUS + AVOID_MARGIN) / TILE_FX);
  const cx = cell(nx, cols);
  const cy = cell(ny, rows);
  let penalty = 0;
  for (let gy = Math.max(0, cy - span); gy <= Math.min(rows - 1, cy + span); gy++) {
    const row = gy * cols;
    for (let gx = Math.max(0, cx - span); gx <= Math.min(cols - 1, cx + span); gx++) {
      for (let j = head[row + gx]!; j >= 0; j = next[j]!) {
        if (j === slot || !usesLocalAvoidance(s, j)) continue;
        if (workersCanShareResourceRouteCollision(s, slot, j)) continue;
        const min = ri + Units[e.kind[j]!]!.radius;
        const avoid = min + AVOID_MARGIN;
        const dx = nx - e.x[j]!;
        const dy = ny - e.y[j]!;
        const d2 = dx * dx + dy * dy;
        if (d2 >= avoid * avoid) continue;
        if (d2 === 0) {
          penalty += avoid * (isPathingAnchor(s, j) ? 6 : 3);
          continue;
        }
        const d = isqrt(d2);
        const close = avoid - d;
        const overlap = Math.max(0, min - d);
        penalty += close * 4 + overlap * (isPathingAnchor(s, j) ? 64 : 32);
      }
    }
  }
  return penalty;
};

// Prototype reciprocal layer: adjust the preferred velocity for predicted
// opposing/anchored interactions, but do not make it the source of truth yet.
// The candidate scorer below still chooses a passable step, and collision remains
// the residual guard, because current benchmark counters are mixed.
export const localAvoidanceVelocity = (
  s: State,
  slot: number,
  vx: number,
  vy: number,
  maxSpeed: number,
): { x: number; y: number } => {
  if (!usesLocalAvoidance(s, slot) || (vx === 0 && vy === 0)) return { x: vx, y: vy };
  prepareLocalAvoidance(s);
  const e = s.e;
  const ri = Units[e.kind[slot]!]!.radius;
  const span = Math.ceil((ri + MAX_NEIGHBOR_RADIUS + AVOID_MARGIN + maxSpeed * LOOKAHEAD_TICKS) / TILE_FX);
  const futureX = e.x[slot]! + vx * LOOKAHEAD_TICKS;
  const futureY = e.y[slot]! + vy * LOOKAHEAD_TICKS;
  const cx = cell(futureX, cols);
  const cy = cell(futureY, rows);
  let ax = 0;
  let ay = 0;

  for (let gy = Math.max(0, cy - span); gy <= Math.min(rows - 1, cy + span); gy++) {
    const row = gy * cols;
    for (let gx = Math.max(0, cx - span); gx <= Math.min(cols - 1, cx + span); gx++) {
      for (let j = head[row + gx]!; j >= 0; j = next[j]!) {
        if (j === slot || !usesLocalAvoidance(s, j)) continue;
        if (workersCanShareResourceRouteCollision(s, slot, j)) continue;
        const min = ri + Units[e.kind[j]!]!.radius;
        const avoid = min + AVOID_MARGIN;
        const anchored = isPathingAnchor(s, j);
        if (!anchored && vx * e.vx[j]! + vy * e.vy[j]! >= 0) continue;
        const closing =
          (e.x[j]! - e.x[slot]!) * (vx - e.vx[j]!) +
          (e.y[j]! - e.y[slot]!) * (vy - e.vy[j]!);
        if (closing <= 0) continue;
        const jx = e.x[j]! + e.vx[j]! * LOOKAHEAD_TICKS;
        const jy = e.y[j]! + e.vy[j]! * LOOKAHEAD_TICKS;
        let dx = futureX - jx;
        let dy = futureY - jy;
        const d2 = dx * dx + dy * dy;
        if (d2 >= avoid * avoid) continue;
        if (d2 === 0) {
          dx = slot < j ? -ONE : ONE;
          dy = 0;
        }
        const d = isqrt(dx * dx + dy * dy);
        const close = avoid - d;
        const weight = anchored ? 3 : 1;
        const denom = Math.max(1, d);
        ax += Math.trunc((dx * close * weight) / (denom * 2));
        if (Math.abs(dy) <= ONE) {
          ay += ((slot + j) & 1) === 0 ? -close * weight : close * weight;
        } else {
          ay += Math.trunc((dy * close * weight) / denom);
        }
      }
    }
  }

  if (ax === 0 && ay === 0) return { x: vx, y: vy };
  return clampVelocity(vx + Math.trunc(ax / 4), vy + Math.trunc(ay / 2), maxSpeed);
};
