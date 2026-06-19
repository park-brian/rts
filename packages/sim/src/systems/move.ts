// Movement primitives shared by the movement and harvest systems. Integer-only.

import type { Entities } from '../entity/world.ts';
import { isqrt } from '../fixed.ts';

/** Clear persistent movement velocity at hard order/state boundaries. */
export const clearVelocity = (e: Entities, slot: number): void => {
  e.vx[slot] = 0;
  e.vy[slot] = 0;
};

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

const clampVector = (x: number, y: number, limit: number): { x: number; y: number } => {
  const d = isqrt(x * x + y * y);
  if (d === 0) return { x: 0, y: 0 };
  if (d <= limit) return { x, y };
  return { x: Math.trunc((x * limit) / d), y: Math.trunc((y * limit) / d) };
};

export const acceleratedStep = (
  e: Entities,
  slot: number,
  desiredX: number,
  desiredY: number,
  maxSpeed: number,
  exactArrival: boolean,
): { x: number; y: number } => {
  if (desiredX === 0 && desiredY === 0) {
    clearVelocity(e, slot);
    return { x: 0, y: 0 };
  }

  const accel = Math.max(1, maxSpeed >> 1);
  const delta = clampVector(desiredX - e.vx[slot]!, desiredY - e.vy[slot]!, accel);
  let next = clampVector(e.vx[slot]! + delta.x, e.vy[slot]! + delta.y, maxSpeed);
  if (exactArrival) {
    const desiredDist = isqrt(desiredX * desiredX + desiredY * desiredY);
    const nextDist = isqrt(next.x * next.x + next.y * next.y);
    if (nextDist >= desiredDist && next.x * desiredX + next.y * desiredY > 0) {
      next = { x: desiredX, y: desiredY };
    }
  }

  e.vx[slot] = next.x;
  e.vy[slot] = next.y;
  return next;
};

/** True if slot is within `r` fixed px of (x,y) (compared on squared distance). */
export const within = (e: Entities, slot: number, x: number, y: number, r: number): boolean => {
  const dx = e.x[slot]! - x;
  const dy = e.y[slot]! - y;
  return dx * dx + dy * dy <= r * r;
};
