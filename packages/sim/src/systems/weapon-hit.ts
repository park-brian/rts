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

const splashDamagePercent = (d2: number, inner2: number, medium2: number, outer2: number): number => {
  if (d2 > outer2) return 0;
  if (d2 <= inner2) return 100;
  return d2 <= medium2 ? 50 : 25;
};

export const applyWeaponHit = (s: State, target: number, weapon: Weapon, attacker: number): boolean => {
  if (missesLowToHigh(s, attacker, target)) return false;
  applyWeaponDamage(s, target, weapon, attacker);
  const outer = weapon.splashRadius ?? 0;
  if (outer <= 0) return true;
  const inner = weapon.splashInnerRadius ?? outer;
  const medium = weapon.splashMediumRadius ?? outer;
  const inner2 = inner * inner;
  const medium2 = medium * medium;
  const outer2 = outer * outer;
  const e = s.e;
  const x = e.x[target]!;
  const y = e.y[target]!;
  const targetIsAir = (e.flags[target]! & Role.Air) !== 0;
  for (let i = 0; i < e.hi; i++) {
    if (i === target || e.alive[i] !== 1 || isContained(s, i) || (e.flags[i]! & Role.Resource) !== 0) continue;
    if (((e.flags[i]! & Role.Air) !== 0) !== targetIsAir) continue;
    const pct = splashDamagePercent(distSq(e.x[i]!, e.y[i]!, x, y), inner2, medium2, outer2);
    if (pct > 0) applyWeaponDamage(s, i, weapon, attacker, pct);
  }
  return true;
};
