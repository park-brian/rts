// Post-collision arrival settling.
//
// Movement systems steer first, collision cleans up overlaps, then this pass marks
// units idle only if they still occupy their final reachable slot. Settled units
// tolerate tiny nudges, but a large displacement wakes them so they reclaim the
// slot instead of idling in the wrong place.

import type { State } from '../entity/world.ts';
import { NONE } from '../entity/world.ts';
import { startNextQueuedTravelOrder } from '../entity/order-queue.ts';
import { advancePatrolLeg } from '../entity/patrol.ts';
import { Order } from '../data/index.ts';
import { ONE } from '../fixed.ts';
import {
  clearancePxForKind,
  nearestPassablePathCell,
  pathCenterFx,
  pathW,
  pathX,
  pathY,
} from '../spatial/flow.ts';
import { isContained } from '../mechanics/cargo.ts';
import { isLocalAvoidanceSolid } from '../spatial/local-avoidance.ts';

const SETTLE_EPS = ONE * 4;
const SETTLE_WAKE = ONE * 8;

const closeSq = (ax: number, ay: number, bx: number, by: number, r: number): boolean => {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy <= r * r;
};

const reachableOrderPoint = (s: State, slot: number): { x: number; y: number } | null => {
  const e = s.e;
  const w = pathW(s);
  const sx = pathX(e.x[slot]!);
  const sy = pathY(e.y[slot]!);
  if (sx < 0 || sy < 0) return null;
  const gx = pathX(e.tx[slot]!);
  const gy = pathY(e.ty[slot]!);
  const goal = nearestPassablePathCell(s, clearancePxForKind(e.kind[slot]!), gx, gy, sx, sy);
  if (goal < 0) return null;
  const px = goal % w;
  const py = (goal - px) / w;
  return px === gx && py === gy ? { x: e.tx[slot]!, y: e.ty[slot]! } : { x: pathCenterFx(px), y: pathCenterFx(py) };
};

export const isSettledGroundUnit = (s: State, slot: number): boolean => {
  const e = s.e;
  return e.settled[slot] === 1 &&
    e.alive[slot] === 1 &&
    e.order[slot] === Order.Idle &&
    e.target[slot] === NONE &&
    e.intentTarget[slot] === NONE &&
    e.combatTarget[slot] === NONE &&
    e.burrowed[slot] !== 1 &&
    !isContained(s, slot) &&
    isLocalAvoidanceSolid(s, slot) &&
    closeSq(e.x[slot]!, e.y[slot]!, e.tx[slot]!, e.ty[slot]!, SETTLE_WAKE);
};

export const settleMovement = (s: State): void => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1) continue;
    if (!isLocalAvoidanceSolid(s, i)) {
      e.settled[i] = 0;
      continue;
    }
    const order = e.order[i]!;
    if (order === Order.Idle) {
      if (e.settled[i] === 1 && !isSettledGroundUnit(s, i)) {
        e.order[i] = Order.Move;
        e.target[i] = NONE;
        e.intentTarget[i] = NONE;
        e.settled[i] = 0;
      }
      continue;
    }
    if (order !== Order.Move && order !== Order.AttackMove && order !== Order.Patrol) {
      e.settled[i] = 0;
      continue;
    }

    const goal = reachableOrderPoint(s, i);
    if (!goal || !closeSq(e.x[i]!, e.y[i]!, goal.x, goal.y, SETTLE_EPS)) {
      e.settled[i] = 0;
      continue;
    }

    const liveTravelTarget = e.intentTarget[i] !== NONE ? e.intentTarget[i]! : e.target[i]!;
    const hasActiveTarget = liveTravelTarget !== NONE ||
      ((order === Order.AttackMove || order === Order.Patrol) && e.combatTarget[i] !== NONE);
    if ((order === Order.Move || order === Order.AttackMove || order === Order.Patrol) && hasActiveTarget) {
      e.tx[i] = goal.x;
      e.ty[i] = goal.y;
      e.settled[i] = 1;
      continue;
    }

    if (order === Order.Patrol) {
      advancePatrolLeg(s, i);
      continue;
    }
    if (startNextQueuedTravelOrder(s, i)) continue;
    e.order[i] = Order.Idle;
    e.target[i] = NONE;
    e.intentTarget[i] = NONE;
    e.tx[i] = goal.x;
    e.ty[i] = goal.y;
    e.settled[i] = 1;
  }
};
