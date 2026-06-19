import { Kind, isLarvaSourceKind } from '../data.ts';
import { nearest, type State } from '../entity/world.ts';

export const LARVA_MAX = 3;

export const nearestLarvaSource = (s: State, slot: number, owner: number): number =>
  nearest(s, s.e.x[slot]!, s.e.y[slot]!, (sl) => s.e.owner[sl] === owner && isLarvaSourceKind(s.e.kind[sl]!));

export const countLarvae = (s: State, source: number): number => {
  const e = s.e;
  let count = 0;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.owner[i] !== e.owner[source] || e.kind[i] !== Kind.Larva) continue;
    if (nearestLarvaSource(s, i, e.owner[source]!) === source) count++;
  }
  return count;
};
