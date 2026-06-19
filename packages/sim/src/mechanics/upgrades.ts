import {
  Kind, Role, Tech, Units, WeaponRangeUpgradePx, bwRange,
  unitTraits, Trait, type Weapon,
} from '../data/index.ts';
import type { State } from '../entity/world.ts';
import { getTechLevel } from './tech.ts';
import { internalProductCapacity } from './internal-products.ts';

const level = (s: State, owner: number, tech: number): number =>
  owner < s.teams.length ? getTechLevel(s, owner, tech) : 0;

const isTerranInfantry = (kind: number): boolean =>
  kind === Kind.Marine || kind === Kind.Firebat || kind === Kind.Medic || kind === Kind.Ghost || kind === Kind.SCV;

const isZergMelee = (kind: number): boolean =>
  kind === Kind.Zergling || kind === Kind.Ultralisk || kind === Kind.Broodling || kind === Kind.InfestedTerran;

const UPGRADE_DAMAGE_STEP: Partial<Record<number, number>> = {
  [Kind.Dragoon]: 2,
  [Kind.DarkTemplar]: 3,
  [Kind.Archon]: 3,
  [Kind.Lurker]: 2,
  [Kind.Guardian]: 2,
  [Kind.Devourer]: 2,
  [Kind.Ultralisk]: 3,
};

type RangeUpgradeDef = { tech: number; bonus: number; weapon?: 'air' | 'ground' };
const RANGE_UPGRADES: Partial<Record<number, RangeUpgradeDef>> = {
  [Kind.Marine]: { tech: Tech.U238Shells, bonus: bwRange(WeaponRangeUpgradePx.U238Shells) },
  [Kind.Goliath]: { tech: Tech.CharonBoosters, bonus: bwRange(WeaponRangeUpgradePx.CharonBoosters), weapon: 'air' },
  [Kind.Dragoon]: { tech: Tech.SingularityCharge, bonus: bwRange(WeaponRangeUpgradePx.SingularityCharge) },
  [Kind.Hydralisk]: { tech: Tech.GroovedSpines, bonus: bwRange(WeaponRangeUpgradePx.GroovedSpines) },
};

type SpeedUpgradeDef = { tech: number; num: number; den: number };
const SPEED_UPGRADES: Partial<Record<number, SpeedUpgradeDef>> = {
  [Kind.Vulture]: { tech: Tech.IonThrusters, num: 3, den: 2 },
  [Kind.Zealot]: { tech: Tech.LegEnhancements, num: 3, den: 2 },
  [Kind.Shuttle]: { tech: Tech.GraviticDrive, num: 3, den: 2 },
  [Kind.Observer]: { tech: Tech.GraviticBoosters, num: 3, den: 2 },
  [Kind.Scout]: { tech: Tech.GraviticThrusters, num: 3, den: 2 },
  [Kind.Zergling]: { tech: Tech.MetabolicBoost, num: 3, den: 2 },
  [Kind.Hydralisk]: { tech: Tech.MuscularAugments, num: 5, den: 4 },
  [Kind.Overlord]: { tech: Tech.PneumatizedCarapace, num: 2, den: 1 },
  [Kind.Ultralisk]: { tech: Tech.AnabolicSynthesis, num: 4, den: 3 },
};

const COOLDOWN_UPGRADES: Partial<Record<number, { tech: number; cooldown: number }>> = {
  [Kind.Zergling]: { tech: Tech.AdrenalGlands, cooldown: 6 },
};

const SIGHT_UPGRADES: Partial<Record<number, { tech: number; bonus: number }>> = {
  [Kind.Ghost]: { tech: Tech.OcularImplants, bonus: 2 },
  [Kind.Overlord]: { tech: Tech.Antennae, bonus: 2 },
  [Kind.Observer]: { tech: Tech.SensorArray, bonus: 2 },
  [Kind.Scout]: { tech: Tech.ApialSensors, bonus: 2 },
};

const ENERGY_UPGRADES: Partial<Record<number, { tech: number; max: number }>> = {
  [Kind.Medic]: { tech: Tech.CaduceusReactor, max: 250 },
  [Kind.Ghost]: { tech: Tech.MoebiusReactor, max: 250 },
  [Kind.Wraith]: { tech: Tech.ApolloReactor, max: 250 },
  [Kind.Battlecruiser]: { tech: Tech.ColossusReactor, max: 250 },
  [Kind.ScienceVessel]: { tech: Tech.TitanReactor, max: 250 },
  [Kind.HighTemplar]: { tech: Tech.KhaydarinAmulet, max: 250 },
  [Kind.DarkArchon]: { tech: Tech.ArgusTalisman, max: 250 },
  [Kind.Arbiter]: { tech: Tech.KhaydarinCore, max: 250 },
  [Kind.Corsair]: { tech: Tech.ArgusJewel, max: 250 },
  [Kind.Queen]: { tech: Tech.GameteMeiosis, max: 250 },
  [Kind.Defiler]: { tech: Tech.MetasynapticNode, max: 250 },
};

const weaponUpgradeStep = (kind: number, _weapon?: Weapon): number =>
  UPGRADE_DAMAGE_STEP[kind] ?? 1;

export const weaponUpgradeBonus = (s: State, attacker: number, weapon?: Weapon): number => {
  const e = s.e;
  const owner = e.owner[attacker]!;
  const kind = e.kind[attacker]!;
  const def = Units[kind]!;
  const step = weaponUpgradeStep(kind, weapon);
  if (def.race === 'terran') {
    if (isTerranInfantry(kind)) return level(s, owner, Tech.InfantryWeapons) * step;
    return level(s, owner, (def.roles & Role.Air) !== 0 ? Tech.ShipWeapons : Tech.VehicleWeapons) * step;
  }
  if (kind === Kind.Reaver) return level(s, owner, Tech.ScarabDamage) > 0 ? 25 : 0;
  if (def.race === 'protoss') return level(s, owner, (def.roles & Role.Air) !== 0 ? Tech.AirWeapons : Tech.GroundWeapons) * step;
  if (def.race === 'zerg') {
    if ((def.roles & Role.Air) !== 0) return level(s, owner, Tech.FlyerAttacks) * step;
    return level(s, owner, isZergMelee(kind) ? Tech.MeleeAttacks : Tech.MissileAttacks) * step;
  }
  return 0;
};

export const armorUpgradeBonus = (s: State, target: number): number => {
  const e = s.e;
  const owner = e.owner[target]!;
  const kind = e.kind[target]!;
  const def = Units[kind]!;
  if (def.race === 'terran') {
    if (isTerranInfantry(kind) || (unitTraits(kind) & Trait.Biological) !== 0) return level(s, owner, Tech.InfantryArmor);
    return level(s, owner, (def.roles & Role.Air) !== 0 ? Tech.ShipPlating : Tech.VehiclePlating);
  }
  if (def.race === 'protoss') return level(s, owner, (def.roles & Role.Air) !== 0 ? Tech.AirArmor : Tech.GroundArmor);
  if (def.race === 'zerg') return level(s, owner, (def.roles & Role.Air) !== 0 ? Tech.FlyerCarapace : Tech.Carapace);
  return 0;
};

export const shieldArmorBonus = (s: State, target: number): number =>
  Units[s.e.kind[target]!]!.race === 'protoss' ? level(s, s.e.owner[target]!, Tech.PlasmaShields) : 0;

export const upgradedRange = (s: State, attacker: number, weapon: Weapon): number => {
  const e = s.e;
  const owner = e.owner[attacker]!;
  const kind = e.kind[attacker]!;
  const upgrade = RANGE_UPGRADES[kind];
  if (!upgrade || level(s, owner, upgrade.tech) <= 0) return weapon.range;
  if (upgrade.weapon === 'air' && weapon !== Units[kind]!.airWeapon) return weapon.range;
  if (upgrade.weapon === 'ground' && weapon !== Units[kind]!.weapon) return weapon.range;
  return weapon.range + upgrade.bonus;
};

export const upgradedSpeed = (s: State, slot: number, baseSpeed: number): number => {
  if (baseSpeed <= 0) return 0;
  const owner = s.e.owner[slot]!;
  const upgrade = SPEED_UPGRADES[s.e.kind[slot]!];
  if (!upgrade || level(s, owner, upgrade.tech) <= 0) return baseSpeed;
  return Math.trunc((baseSpeed * upgrade.num) / upgrade.den);
};

export const upgradedCooldown = (s: State, slot: number, baseCooldown: number): number => {
  const owner = s.e.owner[slot]!;
  const upgrade = COOLDOWN_UPGRADES[s.e.kind[slot]!];
  return upgrade && level(s, owner, upgrade.tech) > 0 ? upgrade.cooldown : baseCooldown;
};

export const upgradedSight = (s: State, slot: number, baseSight: number): number => {
  const owner = s.e.owner[slot]!;
  const upgrade = SIGHT_UPGRADES[s.e.kind[slot]!];
  return upgrade && level(s, owner, upgrade.tech) > 0 ? baseSight + upgrade.bonus : baseSight;
};

export const upgradedEnergyMax = (s: State, slot: number, baseMax: number): number => {
  if (baseMax <= 0) return 0;
  const owner = s.e.owner[slot]!;
  const upgrade = ENERGY_UPGRADES[s.e.kind[slot]!];
  return upgrade && level(s, owner, upgrade.tech) > 0 ? upgrade.max : baseMax;
};

export const reaverScarabCapacity = (s: State, slot: number): number =>
  internalProductCapacity(s, slot, Kind.Scarab);

export const carrierInterceptorCapacity = (s: State, slot: number): number =>
  internalProductCapacity(s, slot, Kind.Interceptor);

export const internalAmmoCapacity = (s: State, producer: number, kind: number): number => {
  return internalProductCapacity(s, producer, kind);
};
