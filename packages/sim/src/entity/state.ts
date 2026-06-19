import type { State } from '../world.ts';

export const isTransitioning = (s: State, slot: number): boolean => {
  const e = s.e;
  return e.alive[slot] === 1 && e.built[slot] !== 1;
};
