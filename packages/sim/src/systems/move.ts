// Movement primitives shared by the movement and harvest systems. Integer-only.

import type { Entities } from '../world.ts';
import { isqrt } from '../fixed.ts';

/** Face slot toward (tx,ty) if the target is not exactly its current position. */
export const faceToward = (e: Entities, slot: number, tx: number, ty: number): void => {
  const dx = tx - e.x[slot]!;
  const dy = ty - e.y[slot]!;
  if (dx === 0 && dy === 0) return;
  e.faceX[slot] = dx;
  e.faceY[slot] = dy;
};

/** Move slot toward (tx,ty) by `speed` fixed px. Returns true on arrival. */
export const moveToward = (
  e: Entities,
  slot: number,
  tx: number,
  ty: number,
  speed: number,
): boolean => {
  const dx = tx - e.x[slot]!;
  const dy = ty - e.y[slot]!;
  const dist = isqrt(dx * dx + dy * dy);
  if (dist > 0) {
    e.faceX[slot] = dx;
    e.faceY[slot] = dy;
  }
  if (dist === 0 || dist <= speed) {
    e.x[slot] = tx;
    e.y[slot] = ty;
    return true;
  }
  e.x[slot] = e.x[slot]! + Math.trunc((dx * speed) / dist);
  e.y[slot] = e.y[slot]! + Math.trunc((dy * speed) / dist);
  return false;
};

/** True if slot is within `r` fixed px of (x,y) (compared on squared distance). */
export const within = (e: Entities, slot: number, x: number, y: number, r: number): boolean => {
  const dx = e.x[slot]! - x;
  const dy = e.y[slot]! - y;
  return dx * dx + dy * dy <= r * r;
};
