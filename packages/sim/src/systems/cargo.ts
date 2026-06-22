import { Order, ResourceType, Units } from '../data/index.ts';
import { isAlive, NONE, slotOf, type State } from '../entity/world.ts';
import { clearVelocity } from '../spatial/motion.ts';
import { startNextQueuedOrder } from '../entity/order-queue.ts';
import { UNLOAD_RANGE, canUnloadAt, containedBy, unloadAnchorSlot, unloadUnit } from '../mechanics/cargo.ts';
import { withinRangeSq } from '../spatial/geometry.ts';

const isGasHarvestCycle = (s: State, unit: number, container: number): boolean =>
  s.e.order[unit] === Order.Harvest &&
  s.e.target[unit] === s.e.container[unit] &&
  Units[s.e.kind[container]!]?.resourceType === ResourceType.Gas;

const finishUnloadOrder = (s: State, transport: number): void => {
  const e = s.e;
  e.target[transport] = NONE;
  e.intentTarget[transport] = NONE;
  e.combatTarget[transport] = NONE;
  e.timer[transport] = 0;
  if (!startNextQueuedOrder(s, transport)) e.order[transport] = Order.Idle;
};

const dispatchQueuedUnload = (s: State, transport: number): void => {
  const e = s.e;
  const unitId = e.target[transport]!;
  const unit = isAlive(e, unitId) ? slotOf(unitId) : NONE;
  const anchor = unit === NONE ? NONE : unloadAnchorSlot(s, transport, e.tx[transport]!, e.ty[transport]!);
  if (unit !== NONE && containedBy(s, unit, transport) &&
      anchor !== NONE && withinRangeSq(e.x[anchor]!, e.y[anchor]!, e.tx[transport]!, e.ty[transport]!, UNLOAD_RANGE) &&
      canUnloadAt(s, unit, e.tx[transport]!, e.ty[transport]!, anchor)) {
    unloadUnit(s, unit, e.tx[transport]!, e.ty[transport]!);
  }
  finishUnloadOrder(s, transport);
};
export const cargo = (s: State): void => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.order[i] === Order.Unload) dispatchQueuedUnload(s, i);
  }
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
