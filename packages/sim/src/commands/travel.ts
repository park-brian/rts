import { Order } from '../data/index.ts';
import { entityApproachPoint } from '../entity/approach.ts';
import { eid, NONE, type State } from '../entity/world.ts';
import { kindHasDirectWeapon } from '../mechanics/capabilities.ts';
import {
  currentOrderIsIdle,
  enqueueTravelOrder,
  setCurrentTravelOrder,
  type QueuedTravelOrder,
} from '../entity/order-queue.ts';

export type TravelIntent = 'move' | 'attack-move' | 'smart';
export type TravelEndpoint = { x: number; y: number; target?: number };

export type IssuedTravel = {
  order: number;
  x: number;
  y: number;
};

const canAttackMove = (s: State, slot: number): boolean => {
  return kindHasDirectWeapon(s.e.kind[slot]!);
};

export const travelOrder = (s: State, slot: number, intent: TravelIntent): QueuedTravelOrder['order'] => {
  if (intent === 'move') return Order.Move;
  if (intent === 'attack-move') return Order.AttackMove;
  return canAttackMove(s, slot) ? Order.AttackMove : Order.Move;
};

export const travelEndpointPoint = (s: State, slot: number, endpoint: TravelEndpoint): { x: number; y: number } => {
  const target = endpoint.target ?? NONE;
  return target === NONE ? { x: endpoint.x, y: endpoint.y } : entityApproachPoint(s, slot, target);
};

export const issueTravelOrder = (
  s: State,
  slot: number,
  endpoint: TravelEndpoint,
  intent: TravelIntent,
  queue = false,
): IssuedTravel => {
  const e = s.e;
  const point = travelEndpointPoint(s, slot, endpoint);
  const order = travelOrder(s, slot, intent);
  // Movement intent owns intentTarget; transient enemy acquisition lives in combatTarget.
  const targetId = (order === Order.Move || order === Order.AttackMove) && endpoint.target !== undefined
    ? eid(e, endpoint.target)
    : NONE;
  if (queue && !currentOrderIsIdle(e, slot)) {
    enqueueTravelOrder(s, slot, order, endpoint.x, endpoint.y, targetId);
    return { order, x: point.x, y: point.y };
  }
  setCurrentTravelOrder(s, slot, order, endpoint.x, endpoint.y, targetId);
  return { order, x: point.x, y: point.y };
};
