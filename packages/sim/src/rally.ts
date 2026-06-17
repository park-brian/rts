import { Role } from './data.ts';
import { isContained, sameTeam } from './cargo.ts';
import { isAlive, nearest, slotOf, NONE, type State } from './world.ts';

export type RallyEndpoint = { x: number; y: number; target: number };

const nearestFriendlyRallyTarget = (s: State, producer: number, exclude: number): number => {
  const e = s.e;
  const owner = e.owner[producer]!;
  return nearest(s, e.x[producer]!, e.y[producer]!, (sl) =>
    sl !== producer &&
    sl !== exclude &&
    e.alive[sl] === 1 &&
    !isContained(s, sl) &&
    ((e.flags[sl]! & Role.Resource) !== 0 || sameTeam(s, owner, e.owner[sl]!)));
};

export const resolveRallyEndpoint = (s: State, producer: number, exclude = NONE): RallyEndpoint | null => {
  const e = s.e;
  if (e.rallyX[producer]! < 0) return null;
  const id = e.rallyTarget[producer]!;
  if (id !== NONE && isAlive(e, id)) {
    const target = slotOf(id);
    return { x: e.x[target]!, y: e.y[target]!, target };
  }
  if (id !== NONE) {
    const target = nearestFriendlyRallyTarget(s, producer, exclude);
    if (target !== NONE) return { x: e.x[target]!, y: e.y[target]!, target };
  }
  return { x: e.rallyX[producer]!, y: e.rallyY[producer]!, target: NONE };
};
