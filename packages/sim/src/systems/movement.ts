// Generic movement: units carrying out a plain Move order path toward their target
// point and go Idle on arrival. (Harvesters/attackers move via their own systems.)

import type { State } from '../world.ts';
import { Order, Units } from '../data.ts';
import { navigate } from '../pathing.ts';
import { effectiveSpeed, isDisabled } from './status.ts';
import { commandMoveSpeed } from '../terran-mobility.ts';
import { isContained } from '../cargo.ts';

export const movement = (s: State): void => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || isContained(s, i) || e.order[i] !== Order.Move) continue;
    if (isDisabled(e, i)) continue;
    if (e.burrowed[i] === 1) {
      e.order[i] = Order.Idle;
      continue;
    }
    const def = Units[e.kind[i]!];
    const speed = commandMoveSpeed(e.kind[i]!, e.flags[i]!);
    if (!def || speed === 0) {
      e.order[i] = Order.Idle;
      continue;
    }
    if (navigate(s, i, e.tx[i]!, e.ty[i]!, effectiveSpeed(s, e, i, speed))) e.order[i] = Order.Idle;
  }
};
