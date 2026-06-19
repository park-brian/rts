import { Order } from '../data/index.ts';
import { isAlive, NONE, slotOf, type State } from '../entity/world.ts';
import { clearVelocity } from '../spatial/motion.ts';

export const cargo = (s: State): void => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.container[i] === NONE) continue;
    if (!isAlive(e, e.container[i]!)) {
      e.container[i] = NONE;
      clearVelocity(e, i);
      continue;
    }
    const c = slotOf(e.container[i]!);
    e.x[i] = e.x[c]!;
    e.y[i] = e.y[c]!;
    clearVelocity(e, i);
    e.order[i] = Order.Idle;
    e.target[i] = NONE;
    e.intentTarget[i] = NONE;
  }
};
