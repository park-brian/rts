import { Role, Units, isLarvaSourceKind } from './data.ts';
import { isContained, sameTeam } from './cargo.ts';
import { isAlive, nearest, slotOf, NONE, type State } from './entity/world.ts';
import { canPlayerGatherTargetSlot, isGatherTargetSlot } from './resource-targets.ts';

export type RallyEndpoint = { x: number; y: number; target: number };

export const producerSupportsWorkerRally = (s: State, producer: number): boolean => {
  const kind = s.e.kind[producer]!;
  if (isLarvaSourceKind(kind)) return true;
  const def = Units[kind];
  return !!def && def.produces.some((product) => (Units[product]?.roles ?? 0) & Role.Worker);
};

export const producerDirectlyProducesOnlyWorkers = (s: State, producer: number): boolean => {
  const produced = Units[s.e.kind[producer]!]?.produces ?? [];
  return produced.length > 0 && produced.every((product) => ((Units[product]?.roles ?? 0) & Role.Worker) !== 0);
};

const nearestFriendlyRallyTarget = (s: State, producer: number, exclude: number): number => {
  const e = s.e;
  const owner = e.owner[producer]!;
  return nearest(s, e.x[producer]!, e.y[producer]!, (sl) =>
    sl !== producer &&
    sl !== exclude &&
    e.alive[sl] === 1 &&
    !isContained(s, sl) &&
    !isGatherTargetSlot(s, sl) &&
    sameTeam(s, owner, e.owner[sl]!));
};

const nearestGatherRallyTarget = (s: State, producer: number, exclude: number): number => {
  const e = s.e;
  const owner = e.owner[producer]!;
  return nearest(s, e.x[producer]!, e.y[producer]!, (sl) =>
    sl !== producer &&
    sl !== exclude &&
    canPlayerGatherTargetSlot(s, owner, sl));
};

export const resolveUnitRallyEndpoint = (s: State, producer: number, exclude = NONE): RallyEndpoint | null => {
  const e = s.e;
  if (e.rallyX[producer]! < 0) return null;
  const id = e.rallyTarget[producer]!;
  if (id !== NONE && isAlive(e, id)) {
    const target = slotOf(id);
    if (isGatherTargetSlot(s, target)) return { x: e.rallyX[producer]!, y: e.rallyY[producer]!, target: NONE };
    return { x: e.x[target]!, y: e.y[target]!, target };
  }
  if (id !== NONE) {
    const target = nearestFriendlyRallyTarget(s, producer, exclude);
    if (target !== NONE) return { x: e.x[target]!, y: e.y[target]!, target };
  }
  return { x: e.rallyX[producer]!, y: e.rallyY[producer]!, target: NONE };
};

export const resolveWorkerRallyEndpoint = (s: State, producer: number, exclude = NONE): RallyEndpoint | null => {
  const e = s.e;
  if (e.workerRallyX[producer]! < 0) return null;
  const id = e.workerRallyTarget[producer]!;
  if (id !== NONE && isAlive(e, id)) {
    const target = slotOf(id);
    if (canPlayerGatherTargetSlot(s, e.owner[producer]!, target)) return { x: e.x[target]!, y: e.y[target]!, target };
  }
  if (id !== NONE) {
    const target = nearestGatherRallyTarget(s, producer, exclude);
    if (target !== NONE) return { x: e.x[target]!, y: e.y[target]!, target };
  }
  return null;
};

export const resolveRallyEndpoint = (s: State, producer: number, exclude = NONE): RallyEndpoint | null =>
  resolveUnitRallyEndpoint(s, producer, exclude) ?? resolveWorkerRallyEndpoint(s, producer, exclude);
