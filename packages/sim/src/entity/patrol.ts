import { Order } from '../data/index.ts';
import { clearVelocity } from '../spatial/motion.ts';
import { NONE, type Entities, type State } from './world.ts';

export const clearPatrolRoute = (e: Entities, slot: number): void => {
  e.patrolX[slot] = NONE;
  e.patrolY[slot] = NONE;
};

export const setPatrolOrder = (s: State, slot: number, x: number, y: number): void => {
  const e = s.e;
  e.order[slot] = Order.Patrol;
  e.tx[slot] = x;
  e.ty[slot] = y;
  e.patrolX[slot] = e.x[slot]!;
  e.patrolY[slot] = e.y[slot]!;
  e.target[slot] = NONE;
  e.intentTarget[slot] = NONE;
  e.combatTarget[slot] = NONE;
  e.settled[slot] = 0;
};

export const advancePatrolLeg = (s: State, slot: number): boolean => {
  const e = s.e;
  const px = e.patrolX[slot]!;
  const py = e.patrolY[slot]!;
  if (px === NONE || py === NONE) {
    clearVelocity(e, slot);
    e.order[slot] = Order.Idle;
    clearPatrolRoute(e, slot);
    return false;
  }
  e.patrolX[slot] = e.tx[slot]!;
  e.patrolY[slot] = e.ty[slot]!;
  e.tx[slot] = px;
  e.ty[slot] = py;
  e.target[slot] = NONE;
  e.intentTarget[slot] = NONE;
  e.combatTarget[slot] = NONE;
  e.settled[slot] = 0;
  clearVelocity(e, slot);
  return true;
};
