import { activeAddonParentSlot } from './addons.ts';
import { Kind } from '../data/index.ts';
import type { State } from '../entity/world.ts';
import { NONE } from '../entity/world.ts';
import { consumeInternalProduct, internalProductReadyCount } from './internal-products.ts';

export type NukeSiloReservation = (slot: number) => number;

export const readyNukeSilo = (
  s: State,
  player: number,
  reserved: NukeSiloReservation = () => 0,
): number => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.owner[i] === player && e.kind[i] === Kind.NuclearSilo && e.built[i] === 1 &&
        internalProductReadyCount(s, i, Kind.NuclearMissile) > reserved(i) && activeAddonParentSlot(s, i) !== NONE) {
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
  return consumeInternalProduct(s, silo, Kind.NuclearMissile);
};
