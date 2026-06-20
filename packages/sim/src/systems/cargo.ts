import { Order, ResourceType, Units } from '../data/index.ts';
import { isAlive, NONE, slotOf, type State } from '../entity/world.ts';
import { clearVelocity } from '../spatial/motion.ts';

const isGasHarvestCycle = (s: State, unit: number, container: number): boolean =>
  s.e.order[unit] === Order.Harvest &&
  s.e.target[unit] === s.e.container[unit] &&
  Units[s.e.kind[container]!]?.resourceType === ResourceType.Gas;

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
    if (!isGasHarvestCycle(s, i, c)) {
      e.order[i] = Order.Idle;
      e.target[i] = NONE;
      e.intentTarget[i] = NONE;
    }
  }
};
