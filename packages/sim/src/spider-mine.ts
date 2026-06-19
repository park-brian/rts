import { Kind, Order } from './data.ts';
import { trySpawnUnit } from './entity/factory.ts';
import { consumeInternalProduct } from './mechanics/internal-products.ts';
import type { State } from './entity/world.ts';
import { NONE, canSpawnEntity, slotOf } from './entity/world.ts';

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
