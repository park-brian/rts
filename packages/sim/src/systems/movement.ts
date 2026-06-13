// Generic movement: units carrying out a plain Move order path toward their target
// point and go Idle on arrival. (Harvesters/attackers move via their own systems.)

import type { State } from '../world.ts';
import { Order, Units } from '../data.ts';
import { navigate } from '../pathing.ts';

export const movement = (s: State): void => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.order[i] !== Order.Move) continue;
    const def = Units[e.kind[i]!];
    if (!def || def.speed === 0) {
      e.order[i] = Order.Idle;
      continue;
    }
    if (navigate(s, i, e.tx[i]!, e.ty[i]!, def.speed)) e.order[i] = Order.Idle;
  }
};
