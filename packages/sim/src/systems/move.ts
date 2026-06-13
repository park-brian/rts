// Movement primitives shared by the movement and harvest systems. Integer-only.

import type { Entities } from '../world.ts';
import { isqrt } from '../fixed.ts';

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
