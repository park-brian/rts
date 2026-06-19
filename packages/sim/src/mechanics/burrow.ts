import { Kind, Role, Tech, Units } from '../data/index.ts';
import type { State } from '../entity/world.ts';
import { isModeTransitioning } from '../entity/state.ts';
import { getTechLevel } from './tech.ts';

const BURROWABLE = new Set<number>([
  Kind.Drone,
  Kind.Zergling,
  Kind.Hydralisk,
  Kind.Lurker,
  Kind.Defiler,
  Kind.InfestedTerran,
]);

export const canBurrowKind = (kind: number): boolean => BURROWABLE.has(kind);

export const hasBurrowAccess = (s: State, player: number, kind: number): boolean =>
  kind === Kind.Lurker || getTechLevel(s, player, Tech.Burrow) > 0;

export const canBurrowSlot = (s: State, slot: number): boolean => {
  const e = s.e;
  const kind = e.kind[slot]!;
  const def = Units[kind];
  if (!def || !canBurrowKind(kind)) return false;
  return e.built[slot] === 1 &&
    (e.flags[slot]! & Role.Mobile) !== 0 &&
    (e.flags[slot]! & (Role.Air | Role.Structure | Role.Resource)) === 0;
};

export const canUseWeaponNow = (s: State, slot: number): boolean => {
  const e = s.e;
  if (e.built[slot] !== 1) return false;
  if (isModeTransitioning(s, slot)) return false;
  switch (e.kind[slot]) {
    case Kind.Lurker:
      return e.burrowed[slot] === 1;
    case Kind.SpiderMine:
      return e.burrowed[slot] !== 1;
    default:
      return e.burrowed[slot] !== 1;
  }
};
