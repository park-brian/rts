import { DAMAGE_MULT, Units, type Weapon } from '../data/index.ts';
import type { State } from '../entity/world.ts';
import { kill } from '../entity/world.ts';
import { armorUpgradeBonus, shieldArmorBonus, weaponUpgradeBonus } from './upgrades.ts';

const absorbMatrix = (s: State, target: number, amount: number): number => {
  const e = s.e;
  if (e.matrixTimer[target]! <= 0 || e.matrixHp[target]! <= 0) return amount;
  const absorbed = Math.min(amount, e.matrixHp[target]!);
  e.matrixHp[target] = e.matrixHp[target]! - absorbed;
  if (e.matrixHp[target]! <= 0) e.matrixTimer[target] = 0;
  return amount - absorbed;
};

export const applyIndependentDamage = (s: State, target: number, amount: number): void => {
  const e = s.e;
  if (e.alive[target] !== 1 || amount <= 0 || e.stasisTimer[target]! > 0) return;
  if (e.illusion[target] === 1) amount *= 2;
  amount = absorbMatrix(s, target, amount);
  if (amount <= 0) return;
  let hpDamage = amount;
  if (e.shield[target]! > 0) {
    const shield = e.shield[target]!;
    if (amount <= shield) {
      e.shield[target] = shield - amount;
      return;
    }
    e.shield[target] = 0;
    hpDamage = amount - shield;
  }
  e.hp[target] = e.hp[target]! - hpDamage;
  if (e.hp[target]! <= 0) kill(s, target);
};

export const applyNuclearStrikeDamage = (s: State, target: number, baseDamage: number, damagePercent: number): void => {
  const def = Units[s.e.kind[target]!]!;
  const durabilityDamage = Math.trunc(((def.hp + def.shields) * 2) / 3);
  applyIndependentDamage(s, target, Math.trunc((Math.max(baseDamage, durabilityDamage) * damagePercent) / 100));
};

export const applyPlagueDamage = (s: State, target: number, amount: number): void => {
  const e = s.e;
  if (e.alive[target] !== 1 || amount <= 0 || e.stasisTimer[target]! > 0) return;
  if (e.shield[target]! > 0) {
    const shieldDamage = Math.min(amount, e.shield[target]!);
    e.shield[target] = e.shield[target]! - shieldDamage;
    amount -= shieldDamage;
  }
  if (amount <= 0 || e.hp[target]! <= 1) return;
  e.hp[target] = Math.max(1, e.hp[target]! - amount);
};

const typedDamage = (weapon: Weapon, targetSize: number, bonus: number, damagePercent: number): number => {
  const pct = DAMAGE_MULT[weapon.dtype]![targetSize]!;
  const scaled = Math.trunc(((weapon.damage + bonus) * damagePercent) / 100);
  return Math.max(1, Math.trunc((scaled * pct) / 100));
};

export const applyWeaponDamage = (s: State, target: number, weapon: Weapon, attacker = -1, damagePercent = 100): void => {
  const e = s.e;
  if (e.stasisTimer[target]! > 0) return;
  const bonus = attacker >= 0 ? weaponUpgradeBonus(s, attacker, weapon) : 0;
  const td = Units[e.kind[target]!]!;
  const armor = td.armor + (attacker >= 0 ? armorUpgradeBonus(s, target) : 0);
  const shieldArmor = attacker >= 0 ? shieldArmorBonus(s, target) : 0;
  const shots = weapon.shots ?? 1;
  for (let n = 0; n < shots && e.alive[target] === 1; n++) {
    let rawDamage = typedDamage(weapon, td.size, bonus, damagePercent) + e.acidSporeCount[target]!;
    if (e.illusion[target] === 1) rawDamage *= 2;
    const afterMatrix = absorbMatrix(s, target, rawDamage);
    if (afterMatrix <= 0) continue;
    let hpDamage = 0;
    if (e.shield[target]! > 0) {
      const shield = e.shield[target]!;
      const shieldDamage = Math.max(1, afterMatrix - shieldArmor);
      if (shieldDamage <= shield) {
        e.shield[target] = shield - shieldDamage;
        continue;
      }
      e.shield[target] = 0;
      hpDamage = Math.max(1, afterMatrix - shield - armor);
    } else {
      hpDamage = Math.max(1, afterMatrix - armor);
    }
    e.hp[target] = e.hp[target]! - hpDamage;
    if (e.hp[target]! <= 0) kill(s, target);
  }
};
