import {
  Kind,
  NONE,
  ONE,
  Order,
  TILE,
  distanceSq,
  withinRangeSq,
  type State,
} from '@rts/sim';
import { tacticalResponseBudget, type TacticalIncident } from './macro-incidents.ts';

const EMERGENCY_WORKER_RESPONSE_TILES = 10;

export const incidentTarget = (s: State, incident: TacticalIncident): number => {
  const e = s.e;
  let best = NONE;
  let bestD = Infinity;
  for (const enemy of incident.enemies ?? []) {
    if (enemy < 0 || enemy >= e.hi || e.alive[enemy] !== 1) continue;
    const d = distanceSq(incident.x, incident.y, e.x[enemy]!, e.y[enemy]!);
    if (d >= bestD) continue;
    best = enemy;
    bestD = d;
  }
  return best;
};

const canEmergencyPullWorker = (s: State, slot: number, x: number, y: number): boolean => {
  const e = s.e;
  if (e.alive[slot] !== 1 || e.container[slot] !== NONE) return false;
  if (e.buildKind[slot] !== Kind.None || e.order[slot] === Order.Build || e.order[slot] === Order.Repair) return false;
  return withinRangeSq(e.x[slot]!, e.y[slot]!, x, y, EMERGENCY_WORKER_RESPONSE_TILES * TILE * ONE);
};

export const emergencyWorkerResponders = (
  s: State,
  workers: readonly number[],
  incident: TacticalIncident,
  alreadyAssigned: number,
  reservedWorker: number = NONE,
): number[] => {
  const budget = tacticalResponseBudget(incident, workers.length + alreadyAssigned);
  const needed = budget - alreadyAssigned;
  if (needed <= 0) return [];
  return workers
    .filter((slot) => slot !== reservedWorker && canEmergencyPullWorker(s, slot, incident.x, incident.y))
    .map((slot) => ({ slot, distance: distanceSq(s.e.x[slot]!, s.e.y[slot]!, incident.x, incident.y) }))
    .sort((a, b) => a.distance - b.distance || a.slot - b.slot)
    .slice(0, needed)
    .map(({ slot }) => slot);
};
