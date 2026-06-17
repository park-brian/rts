import { Order } from '../data.ts';
import { isAlive, NONE, slotOf, type State } from '../world.ts';

export const cargo = (s: State): void => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.container[i] === NONE) continue;
    if (!isAlive(e, e.container[i]!)) {
      e.container[i] = NONE;
      continue;
    }
    const c = slotOf(e.container[i]!);
    e.x[i] = e.x[c]!;
    e.y[i] = e.y[c]!;
    e.order[i] = Order.Idle;
    e.target[i] = NONE;
  }
};
