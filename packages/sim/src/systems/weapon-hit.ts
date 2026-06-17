import type { State } from '../world.ts';
import { Role, type Weapon } from '../data.ts';
import { applyWeaponDamage } from '../damage.ts';
import { isContained } from '../cargo.ts';
import { isLowGroundAttackingHigh } from '../terrain.ts';
import { range } from '../rng.ts';

const LOW_TO_HIGH_MISS_PERCENT = 53;

const distSq = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
};

const missesLowToHigh = (s: State, attacker: number, target: number): boolean =>
  isLowGroundAttackingHigh(s, attacker, target) && range(s.rng, 100) < LOW_TO_HIGH_MISS_PERCENT;

export const applyWeaponHit = (s: State, target: number, weapon: Weapon, attacker: number): boolean => {
  if (missesLowToHigh(s, attacker, target)) return false;
  applyWeaponDamage(s, target, weapon, attacker);
  if (weapon.splashRadius === undefined || weapon.splashRadius <= 0) return true;
  const e = s.e;
  const x = e.x[target]!;
  const y = e.y[target]!;
  const r2 = weapon.splashRadius * weapon.splashRadius;
  const targetIsAir = (e.flags[target]! & Role.Air) !== 0;
  for (let i = 0; i < e.hi; i++) {
    if (i === target || e.alive[i] !== 1 || isContained(s, i) || (e.flags[i]! & Role.Resource) !== 0) continue;
    if (((e.flags[i]! & Role.Air) !== 0) !== targetIsAir) continue;
    if (distSq(e.x[i]!, e.y[i]!, x, y) <= r2) applyWeaponDamage(s, i, weapon, attacker);
  }
  return true;
};
