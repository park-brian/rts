import { Order, Role } from './data.ts';
import { isContained } from './cargo.ts';
import { isAlive, type State } from './world.ts';

/** Ground units in a weapon cycle hold their space; movers must route around them. */
export const isPathingAnchor = (s: State, slot: number): boolean => {
  const e = s.e;
  if (e.alive[slot] !== 1 || e.built[slot] !== 1 || isContained(s, slot) || e.burrowed[slot] === 1) return false;
  const flags = e.flags[slot]!;
  if ((flags & Role.Mobile) === 0 || (flags & (Role.Structure | Role.Air)) !== 0) return false;
  if (e.wcd[slot]! <= 0 || !isAlive(e, e.target[slot]!)) return false;
  const order = e.order[slot]!;
  return order === Order.Attack || order === Order.AttackMove || order === Order.Idle;
};
