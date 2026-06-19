import {
  FPS, ONE, Order, TILE, Units,
  armorUpgradeBonus, canDetect, isCloaked, isLiftedStructureFlags,
  shieldArmorBonus, upgradedCooldown, upgradedRange,
  upgradedSight, upgradedSpeed, weaponUpgradeBonus,
  entityLifecycle,
  type State, type Weapon,
} from './sim.ts';
import type { SelectionStatus } from './store.ts';

const ORDER_LABELS: Record<number, string> = {
  [Order.Idle]: 'Idle',
  [Order.Move]: 'Moving',
  [Order.Harvest]: 'Harvesting',
  [Order.Attack]: 'Attacking',
  [Order.AttackMove]: 'Attack-moving',
  [Order.Build]: 'Building',
  [Order.Cast]: 'Casting',
  [Order.Repair]: 'Repairing',
  [Order.Hold]: 'Holding',
};

const orderLabel = (order: number): string => ORDER_LABELS[order] ?? 'Acting';

const fixedTile = (value: number): string => {
  const n = value / ONE / TILE;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
};

const pxPerSecond = (value: number): string => ((value / ONE) * FPS).toFixed(1);

const weaponDetails = (s: State, slot: number, weapon: Weapon): string => {
  const bonus = weaponUpgradeBonus(s, slot, weapon);
  const shots = weapon.shots && weapon.shots > 1 ? `x${weapon.shots}` : '';
  const dmg = bonus > 0 ? `${weapon.damage}+${bonus}` : String(weapon.damage);
  const range = fixedTile(upgradedRange(s, slot, weapon));
  const cd = upgradedCooldown(s, slot, weapon.cooldown);
  return `${dmg}${shots} R${range} CD${cd}`;
};

const selectionStats = (s: State, slot: number): string[] => {
  const e = s.e;
  const def = Units[e.kind[slot]!]!;
  const stats = [`HP ${e.hp[slot]}/${def.hp}`];
  if (def.shields > 0) stats.push(`Sh ${e.shield[slot]}/${def.shields}`);
  if (e.energyMax[slot]! > 0) stats.push(`E ${e.energy[slot]}/${e.energyMax[slot]}`);
  const armor = armorUpgradeBonus(s, slot);
  stats.push(`Arm ${def.armor}${armor > 0 ? `+${armor}` : ''}`);
  const shieldArmor = shieldArmorBonus(s, slot);
  if (shieldArmor > 0) stats.push(`ShArm +${shieldArmor}`);
  if (def.weapon && def.airWeapon && def.weapon === def.airWeapon) {
    stats.push(`G/A ${weaponDetails(s, slot, def.weapon)}`);
  } else {
    if (def.weapon) stats.push(`G ${weaponDetails(s, slot, def.weapon)}`);
    if (def.airWeapon) stats.push(`A ${weaponDetails(s, slot, def.airWeapon)}`);
  }
  if (def.speed > 0) stats.push(`Spd ${pxPerSecond(upgradedSpeed(s, slot, def.speed))}`);
  if (def.sight > 0) stats.push(`Sight ${upgradedSight(s, slot, def.sight)}`);
  return stats;
};

const selectionVisibilityStats = (s: State, slot: number, viewer: number): string[] => {
  const e = s.e;
  const stats: string[] = [];
  if (e.burrowed[slot] === 1) stats.push('Burrowed');
  if (isCloaked(s, slot)) stats.push('Cloaked');
  const owner = e.owner[slot]!;
  if (viewer >= 0 && viewer !== owner && isCloaked(s, slot) && canDetect(s, viewer, slot)) stats.push('Detected');
  return stats;
};

export const entityLifecycleStatus = (s: State, slot: number, viewer: number): SelectionStatus => {
  const e = s.e;
  const stats = [...selectionStats(s, slot), ...selectionVisibilityStats(s, slot, viewer)];
  const lifecycle = entityLifecycle(s, slot);
  if (lifecycle.state !== 'complete') {
    return {
      label: lifecycle.label,
      detail: lifecycle.detail,
      progress: lifecycle.progress,
      stats,
    };
  }
  return {
    label: isLiftedStructureFlags(e.flags[slot]!) ? 'Flying' : orderLabel(e.order[slot]!),
    detail: '',
    progress: 0,
    stats,
  };
};
