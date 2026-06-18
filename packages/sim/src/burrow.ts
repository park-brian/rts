import { Kind, Order, Role, Tech, Units } from './data.ts';
import { getTechLevel } from './tech.ts';
import type { State } from './world.ts';
import { NONE } from './world.ts';
import { clearVelocity } from './systems/move.ts';

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
  const def = Units[e.kind[slot]!];
  if (!def || !canBurrowKind(e.kind[slot]!)) return false;
  return e.built[slot] === 1 &&
    (e.flags[slot]! & Role.Mobile) !== 0 &&
    (e.flags[slot]! & (Role.Air | Role.Structure | Role.Resource)) === 0;
};

export const canUseWeaponNow = (s: State, slot: number): boolean => {
  const e = s.e;
  if (e.built[slot] !== 1) return false;
  if (e.kind[slot] === Kind.Lurker) return e.burrowed[slot] === 1;
  if (e.kind[slot] === Kind.SpiderMine) return e.burrowed[slot] !== 1;
  return e.burrowed[slot] !== 1;
};

export const setBurrowed = (s: State, slot: number, active: boolean): void => {
  const e = s.e;
  e.settled[slot] = 0;
  clearVelocity(e, slot);
  e.burrowed[slot] = active ? 1 : 0;
  e.order[slot] = Order.Idle;
  e.target[slot] = NONE;
};
