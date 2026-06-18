import type { State } from './world.ts';
import { isAlive, NONE, slotOf } from './world.ts';
import { Order, ResourceType, Role, Units } from './data.ts';

const isWorkerResourceType = (type: number): boolean =>
  type === ResourceType.Minerals || type === ResourceType.Gas;

export const isResourceRouteWorker = (s: State, slot: number): boolean => {
  const e = s.e;
  if (e.alive[slot] !== 1 || (e.flags[slot]! & Role.Worker) === 0 || e.order[slot] !== Order.Harvest) return false;
  if (e.cargo[slot]! > 0) return isWorkerResourceType(e.cargoType[slot]!);
  const targetId = e.target[slot]!;
  if (targetId === NONE || !isAlive(e, targetId)) return false;
  const target = slotOf(targetId);
  if ((e.flags[target]! & Role.Resource) === 0) return false;
  return isWorkerResourceType(Units[e.kind[target]!]?.resourceType ?? -1);
};

export const workersCanShareResourceRouteCollision = (s: State, a: number, b: number): boolean =>
  s.e.owner[a] === s.e.owner[b] && isResourceRouteWorker(s, a) && isResourceRouteWorker(s, b);
