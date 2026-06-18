import type { State } from './world.ts';
import { isAlive, NONE, slotOf } from './world.ts';
import { Order, ResourceType, Role, Units } from './data.ts';

export const isMineralHarvestRouteWorker = (s: State, slot: number): boolean => {
  const e = s.e;
  if (e.alive[slot] !== 1 || (e.flags[slot]! & Role.Worker) === 0 || e.order[slot] !== Order.Harvest) return false;
  if (e.cargo[slot]! > 0) return e.cargoType[slot]! === ResourceType.Minerals;
  const targetId = e.target[slot]!;
  if (targetId === NONE || !isAlive(e, targetId)) return false;
  const target = slotOf(targetId);
  if ((e.flags[target]! & Role.Resource) === 0) return false;
  return Units[e.kind[target]!]?.resourceType === ResourceType.Minerals;
};

export const workersCanShareMineralWalkCollision = (s: State, a: number, b: number): boolean =>
  isMineralHarvestRouteWorker(s, a) && isMineralHarvestRouteWorker(s, b);
