import { Order, Units, hasAnyWeapon } from './data.ts';
import { entityApproachPoint } from './entity-approach.ts';
import { eid, NONE, type State } from './world.ts';

export type TravelIntent = 'move' | 'attack-move' | 'smart';
export type TravelEndpoint = { x: number; y: number; target?: number };

export type IssuedTravel = {
  order: number;
  x: number;
  y: number;
};

const canAttackMove = (s: State, slot: number): boolean => {
  const def = Units[s.e.kind[slot]!];
  return !!def && hasAnyWeapon(def);
};

export const travelOrder = (s: State, slot: number, intent: TravelIntent): number => {
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
): IssuedTravel => {
  const e = s.e;
  const point = travelEndpointPoint(s, slot, endpoint);
  const order = travelOrder(s, slot, intent);
  e.order[slot] = order;
  e.tx[slot] = point.x;
  e.ty[slot] = point.y;
  // Move can safely retain an entity destination because the movement system owns
  // that target. Attack-move uses the same field for transient combat targets.
  e.target[slot] = order === Order.Move && endpoint.target !== undefined ? eid(e, endpoint.target) : NONE;
  return { order, x: point.x, y: point.y };
};
