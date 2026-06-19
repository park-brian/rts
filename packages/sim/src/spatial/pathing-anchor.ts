import { Order, Role, Units, weaponForTarget } from '../data/index.ts';
import { isContained } from '../mechanics/cargo.ts';
import { isAlive, slotOf, type State } from '../entity/world.ts';
import { effectiveCooldown } from '../systems/status.ts';

export const FIRING_PATHING_LOCKOUT_TICKS = 4;

const inFiringLockout = (s: State, slot: number): boolean => {
  const e = s.e;
  const target = e.target[slot]!;
  if (e.wcd[slot]! <= 0 || !isAlive(e, target)) return false;
  const attacker = Units[e.kind[slot]!]!;
  const victim = Units[e.kind[slotOf(target)]!]!;
  const weapon = weaponForTarget(attacker, victim);
  if (!weapon) return false;
  const cycle = effectiveCooldown(s, e, slot, weapon.cooldown);
  return e.wcd[slot]! > Math.max(0, cycle - FIRING_PATHING_LOCKOUT_TICKS);
};

/** Ground units in a weapon cycle hold their space; movers must route around them. */
export const isPathingAnchor = (s: State, slot: number): boolean => {
  const e = s.e;
  if (e.alive[slot] !== 1 || e.built[slot] !== 1 || isContained(s, slot) || e.burrowed[slot] === 1) return false;
  const flags = e.flags[slot]!;
  if ((flags & Role.Mobile) === 0 || (flags & (Role.Structure | Role.Air)) !== 0) return false;
  if (!inFiringLockout(s, slot)) return false;
  const order = e.order[slot]!;
  return order === Order.Attack || order === Order.AttackMove || order === Order.Idle;
};
