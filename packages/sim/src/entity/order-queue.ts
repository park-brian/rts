import { Order } from '../data/index.ts';
import { clearVelocity } from '../spatial/motion.ts';
import { entityApproachPoint } from './approach.ts';
import { clearPatrolRoute, setPatrolOrder } from './patrol.ts';
import { isAlive, NONE, slotOf, type Entities, type State } from './world.ts';

export const ORDER_QUEUE_CAP = 4;

export type QueuedTravelOrder = {
  order: typeof Order.Move | typeof Order.AttackMove | typeof Order.Patrol;
  x: number;
  y: number;
  target?: number;
};

const orderColumn = (e: Entities, i: number): Uint8Array => {
  switch (i) {
    case 0: return e.orderQueue0;
    case 1: return e.orderQueue1;
    case 2: return e.orderQueue2;
    case 3: return e.orderQueue3;
    default: throw new Error('order queue index out of bounds');
  }
};

const targetColumn = (e: Entities, i: number): Int32Array => {
  switch (i) {
    case 0: return e.orderQueueTarget0;
    case 1: return e.orderQueueTarget1;
    case 2: return e.orderQueueTarget2;
    case 3: return e.orderQueueTarget3;
    default: throw new Error('order queue index out of bounds');
  }
};

const xColumn = (e: Entities, i: number): Int32Array => {
  switch (i) {
    case 0: return e.orderQueueX0;
    case 1: return e.orderQueueX1;
    case 2: return e.orderQueueX2;
    case 3: return e.orderQueueX3;
    default: throw new Error('order queue index out of bounds');
  }
};

const yColumn = (e: Entities, i: number): Int32Array => {
  switch (i) {
    case 0: return e.orderQueueY0;
    case 1: return e.orderQueueY1;
    case 2: return e.orderQueueY2;
    case 3: return e.orderQueueY3;
    default: throw new Error('order queue index out of bounds');
  }
};

const clearQueueSlot = (e: Entities, slot: number, i: number): void => {
  orderColumn(e, i)[slot] = 0;
  targetColumn(e, i)[slot] = NONE;
  xColumn(e, i)[slot] = 0;
  yColumn(e, i)[slot] = 0;
};

export const clearOrderQueue = (e: Entities, slot: number): void => {
  e.orderQueueLen[slot] = 0;
  for (let i = 0; i < ORDER_QUEUE_CAP; i++) clearQueueSlot(e, slot, i);
};

export const canQueueOrder = (e: Entities, slot: number): boolean =>
  e.orderQueueLen[slot]! < ORDER_QUEUE_CAP;

export const queuedTravelOrderAt = (e: Entities, slot: number, i: number): QueuedTravelOrder | undefined => {
  if (i < 0 || i >= e.orderQueueLen[slot]!) return undefined;
  const order = orderColumn(e, i)[slot]! as QueuedTravelOrder['order'];
  const target = targetColumn(e, i)[slot]!;
  const x = xColumn(e, i)[slot]!;
  const y = yColumn(e, i)[slot]!;
  return target === NONE ? { order, x, y } : { order, x, y, target };
};

export const setCurrentTravelOrder = (
  s: State,
  slot: number,
  order: QueuedTravelOrder['order'],
  x: number,
  y: number,
  targetId = NONE,
): void => {
  const e = s.e;
  if (order === Order.Patrol) {
    setPatrolOrder(s, slot, x, y);
    return;
  }
  let tx = x;
  let ty = y;
  if (targetId !== NONE && isAlive(e, targetId)) {
    const point = entityApproachPoint(s, slot, slotOf(targetId));
    tx = point.x;
    ty = point.y;
  }
  e.order[slot] = order;
  e.tx[slot] = tx;
  e.ty[slot] = ty;
  e.settled[slot] = 0;
  clearPatrolRoute(e, slot);
  e.intentTarget[slot] = targetId;
  e.target[slot] = order === Order.Move ? targetId : NONE;
  e.combatTarget[slot] = NONE;
};

export const enqueueTravelOrder = (
  s: State,
  slot: number,
  order: QueuedTravelOrder['order'],
  x: number,
  y: number,
  targetId = NONE,
): boolean => {
  const e = s.e;
  const len = e.orderQueueLen[slot]!;
  if (len >= ORDER_QUEUE_CAP) return false;
  orderColumn(e, len)[slot] = order;
  targetColumn(e, len)[slot] = targetId;
  xColumn(e, len)[slot] = x;
  yColumn(e, len)[slot] = y;
  e.orderQueueLen[slot] = len + 1;
  return true;
};

const shiftQueuedOrder = (e: Entities, slot: number): QueuedTravelOrder => {
  const order = orderColumn(e, 0)[slot]! as QueuedTravelOrder['order'];
  const target = targetColumn(e, 0)[slot]!;
  const x = xColumn(e, 0)[slot]!;
  const y = yColumn(e, 0)[slot]!;
  const len = e.orderQueueLen[slot]!;
  for (let i = 1; i < len; i++) {
    orderColumn(e, i - 1)[slot] = orderColumn(e, i)[slot]!;
    targetColumn(e, i - 1)[slot] = targetColumn(e, i)[slot]!;
    xColumn(e, i - 1)[slot] = xColumn(e, i)[slot]!;
    yColumn(e, i - 1)[slot] = yColumn(e, i)[slot]!;
  }
  clearQueueSlot(e, slot, len - 1);
  e.orderQueueLen[slot] = len - 1;
  return target === NONE ? { order, x, y } : { order, x, y, target };
};

export const startNextQueuedTravelOrder = (s: State, slot: number): boolean => {
  const e = s.e;
  while (e.orderQueueLen[slot]! > 0) {
    const next = shiftQueuedOrder(e, slot);
    if (next.target !== undefined && !isAlive(e, next.target)) continue;
    clearVelocity(e, slot);
    setCurrentTravelOrder(s, slot, next.order, next.x, next.y, next.target ?? NONE);
    return true;
  }
  return false;
};

export const currentOrderIsIdle = (e: Entities, slot: number): boolean =>
  e.order[slot] === Order.Idle && e.target[slot] === NONE && e.intentTarget[slot] === NONE && e.combatTarget[slot] === NONE;
