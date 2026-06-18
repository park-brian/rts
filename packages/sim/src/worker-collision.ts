import type { State } from './world.ts';
import { isAlive, NONE, slotOf } from './world.ts';
import { Order, ResourceType, Role, Units } from './data.ts';

export const isMineralWalkingWorker = (s: State, slot: number): boolean => {
  const e = s.e;
  if (e.alive[slot] !== 1 || (e.flags[slot]! & Role.Worker) === 0 || e.order[slot] !== Order.Harvest) return false;
  const targetId = e.target[slot]!;
  if (targetId === NONE || !isAlive(e, targetId)) return false;
  const target = slotOf(targetId);
  if ((e.flags[target]! & Role.Resource) === 0) return false;
  return Units[e.kind[target]!]?.resourceType === ResourceType.Minerals;
};
