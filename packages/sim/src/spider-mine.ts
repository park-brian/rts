import { Kind, Order } from './data.ts';
import { trySpawnUnit } from './factory.ts';
import { consumeInternalProduct } from './internal-products.ts';
import type { State } from './world.ts';
import { NONE, canSpawnEntity, slotOf } from './world.ts';

export const laySpiderMine = (s: State, vulture: number): void => {
  const e = s.e;
  e.settled[vulture] = 0;
  e.intentTarget[vulture] = NONE;
  e.combatTarget[vulture] = NONE;
  if (!canSpawnEntity(s)) return;
  if (!consumeInternalProduct(s, vulture, Kind.SpiderMine)) return;
  const id = trySpawnUnit(s, Kind.SpiderMine, e.owner[vulture]!, e.x[vulture]!, e.y[vulture]!);
  if (id === NONE) return;
  const mine = slotOf(id);
  e.burrowed[mine] = 1;
  e.order[mine] = Order.Idle;
  e.target[mine] = NONE;
};
