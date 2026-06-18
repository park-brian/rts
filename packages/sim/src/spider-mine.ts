import { Kind, Order } from './data.ts';
import { spawnUnit } from './factory.ts';
import type { State } from './world.ts';
import { NONE, slotOf } from './world.ts';

export const laySpiderMine = (s: State, vulture: number): void => {
  const e = s.e;
  e.settled[vulture] = 0;
  e.specialAmmo[vulture] = e.specialAmmo[vulture]! - 1;
  const mine = slotOf(spawnUnit(s, Kind.SpiderMine, e.owner[vulture]!, e.x[vulture]!, e.y[vulture]!));
  e.burrowed[mine] = 1;
  e.order[mine] = Order.Idle;
  e.target[mine] = NONE;
};
