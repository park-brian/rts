import { Kind } from './data.ts';
import type { State } from './world.ts';

export const readyNukeSilo = (s: State, player: number): number => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.owner[i] === player && e.kind[i] === Kind.NuclearSilo && e.built[i] === 1 && e.specialAmmo[i]! > 0) {
      return i;
    }
  }
  return -1;
};

export const hasReadyNuke = (s: State, player: number): boolean =>
  readyNukeSilo(s, player) >= 0;

export const consumeReadyNuke = (s: State, player: number): boolean => {
  const silo = readyNukeSilo(s, player);
  if (silo < 0) return false;
  s.e.specialAmmo[silo] = s.e.specialAmmo[silo]! - 1;
  return true;
};
