import {
  Kind, Tech, Units, WeaponRangeUpgradePx, bwRange, type Weapon,
} from '../data/index.ts';
import type { State } from '../entity/world.ts';
import { getTechLevel } from './tech.ts';
import { internalProductCapacity } from './internal-products.ts';

const level = (s: State, owner: number, tech: number): number =>
  owner < s.teams.length ? getTechLevel(s, owner, tech) : 0;

const kindSet = (...kinds: number[]): ReadonlySet<number> => new Set(kinds);

const UPGRADE_DAMAGE_STEP: Partial<Record<number, number>> = {
  [Kind.Vulture]: 2,
  [Kind.SiegeTank]: 3,
  [Kind.SiegeTankSieged]: 5,
  [Kind.Battlecruiser]: 3,
  [Kind.Dragoon]: 2,
  [Kind.DarkTemplar]: 3,
  [Kind.Archon]: 3,
  [Kind.Lurker]: 2,
  [Kind.Guardian]: 2,
  [Kind.Devourer]: 2,
  [Kind.Ultralisk]: 3,
};

type UpgradeKindRule = { tech: number; kinds: ReadonlySet<number> };
type WeaponUpgradeRule = UpgradeKindRule & { bonus?: number; bonusPerLevel?: number; weaponKind?: number; weapon?: 'air' | 'ground' };
type ArmorUpgradeRule = UpgradeKindRule & { bonusPerLevel?: number };

const WEAPON_UPGRADES: readonly WeaponUpgradeRule[] = [
  { tech: Tech.InfantryWeapons, kinds: kindSet(Kind.Marine, Kind.Firebat, Kind.Ghost) },
  { tech: Tech.VehicleWeapons, kinds: kindSet(Kind.Goliath), bonusPerLevel: 2, weapon: 'air' },
  { tech: Tech.VehicleWeapons, kinds: kindSet(Kind.Vulture, Kind.SiegeTank, Kind.SiegeTankSieged, Kind.Goliath) },
  { tech: Tech.ShipWeapons, kinds: kindSet(Kind.Wraith), bonusPerLevel: 2, weapon: 'air' },
  { tech: Tech.ShipWeapons, kinds: kindSet(Kind.Wraith, Kind.Valkyrie, Kind.Battlecruiser) },
  { tech: Tech.GroundWeapons, kinds: kindSet(Kind.Zealot, Kind.Dragoon, Kind.DarkTemplar, Kind.Archon) },
  { tech: Tech.ScarabDamage, kinds: kindSet(Kind.Reaver), bonus: 25, weaponKind: Kind.Scarab },
  { tech: Tech.AirWeapons, kinds: kindSet(Kind.Scout, Kind.Interceptor, Kind.Arbiter, Kind.Corsair) },
  { tech: Tech.MeleeAttacks, kinds: kindSet(Kind.Zergling, Kind.Ultralisk, Kind.Broodling, Kind.InfestedTerran) },
  { tech: Tech.MissileAttacks, kinds: kindSet(Kind.Hydralisk, Kind.Lurker) },
  { tech: Tech.FlyerAttacks, kinds: kindSet(Kind.Mutalisk, Kind.Scourge, Kind.Guardian, Kind.Devourer) },
];

const ARMOR_UPGRADES: readonly ArmorUpgradeRule[] = [
  { tech: Tech.InfantryArmor, kinds: kindSet(Kind.SCV, Kind.Marine, Kind.Firebat, Kind.Medic, Kind.Ghost) },
  { tech: Tech.VehiclePlating, kinds: kindSet(Kind.Vulture, Kind.SiegeTank, Kind.SiegeTankSieged, Kind.Goliath) },
  { tech: Tech.ShipPlating, kinds: kindSet(Kind.Wraith, Kind.Dropship, Kind.ScienceVessel, Kind.Valkyrie, Kind.Battlecruiser) },
  {
    tech: Tech.GroundArmor,
    kinds: kindSet(
      Kind.Probe, Kind.Zealot, Kind.Dragoon, Kind.HighTemplar, Kind.DarkTemplar,
      Kind.Archon, Kind.DarkArchon, Kind.Reaver, Kind.Scarab,
    ),
  },
  { tech: Tech.AirArmor, kinds: kindSet(Kind.Observer, Kind.Shuttle, Kind.Scout, Kind.Carrier, Kind.Interceptor, Kind.Arbiter, Kind.Corsair) },
  {
    tech: Tech.Carapace,
    kinds: kindSet(
      Kind.Larva, Kind.Egg, Kind.Drone, Kind.Zergling, Kind.Hydralisk, Kind.Lurker,
      Kind.Defiler, Kind.Ultralisk, Kind.InfestedTerran, Kind.Broodling,
    ),
  },
  { tech: Tech.FlyerCarapace, kinds: kindSet(Kind.Overlord, Kind.Mutalisk, Kind.Scourge, Kind.Guardian, Kind.Devourer, Kind.Queen) },
  { tech: Tech.ChitinousPlating, kinds: kindSet(Kind.Ultralisk), bonusPerLevel: 2 },
];

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

const weaponUpgradeStep = (kind: number): number =>
  UPGRADE_DAMAGE_STEP[kind] ?? 1;

const weaponMatchesRule = (rule: WeaponUpgradeRule, kind: number, weapon?: Weapon): boolean => {
  if (rule.weapon !== undefined) {
    const def = Units[kind]!;
    return weapon === (rule.weapon === 'air' ? def.airWeapon : def.weapon);
  }
  if (rule.weaponKind === undefined) return true;
  const def = Units[rule.weaponKind]!;
  return weapon === def.weapon || weapon === def.airWeapon;
};

export const weaponUpgradeBonusForKind = (
  s: State,
  owner: number,
  kind: number,
  weapon?: Weapon,
): number => {
  for (const rule of WEAPON_UPGRADES) {
    if (!rule.kinds.has(kind) || !weaponMatchesRule(rule, kind, weapon)) continue;
    const techLevel = level(s, owner, rule.tech);
    if (rule.bonusPerLevel !== undefined) return techLevel * rule.bonusPerLevel;
    if (rule.bonus !== undefined) return techLevel > 0 ? rule.bonus : 0;
    return techLevel * weaponUpgradeStep(kind);
  }
  return 0;
};

export const weaponUpgradeBonus = (s: State, attacker: number, weapon?: Weapon): number =>
  weaponUpgradeBonusForKind(s, s.e.owner[attacker]!, s.e.kind[attacker]!, weapon);

export const armorUpgradeBonusForKind = (s: State, owner: number, kind: number): number => {
  let bonus = 0;
  for (const rule of ARMOR_UPGRADES) {
    if (!rule.kinds.has(kind)) continue;
    bonus += level(s, owner, rule.tech) * (rule.bonusPerLevel ?? 1);
  }
  return bonus;
};

export const armorUpgradeBonus = (s: State, target: number): number =>
  armorUpgradeBonusForKind(s, s.e.owner[target]!, s.e.kind[target]!);

export const shieldArmorBonus = (s: State, target: number): number =>
  Units[s.e.kind[target]!]!.race === 'protoss' ? level(s, s.e.owner[target]!, Tech.PlasmaShields) : 0;

export const upgradedRangeForKind = (s: State, owner: number, kind: number, weapon: Weapon): number => {
  const upgrade = RANGE_UPGRADES[kind];
  if (!upgrade || level(s, owner, upgrade.tech) <= 0) return weapon.range;
  if (upgrade.weapon === 'air' && weapon !== Units[kind]!.airWeapon) return weapon.range;
  if (upgrade.weapon === 'ground' && weapon !== Units[kind]!.weapon) return weapon.range;
  return weapon.range + upgrade.bonus;
};

export const upgradedRange = (s: State, attacker: number, weapon: Weapon): number =>
  upgradedRangeForKind(s, s.e.owner[attacker]!, s.e.kind[attacker]!, weapon);

export const upgradedSpeedForKind = (s: State, owner: number, kind: number, baseSpeed: number): number => {
  if (baseSpeed <= 0) return 0;
  const upgrade = SPEED_UPGRADES[kind];
  if (!upgrade || level(s, owner, upgrade.tech) <= 0) return baseSpeed;
  return Math.trunc((baseSpeed * upgrade.num) / upgrade.den);
};

export const upgradedSpeed = (s: State, slot: number, baseSpeed: number): number =>
  upgradedSpeedForKind(s, s.e.owner[slot]!, s.e.kind[slot]!, baseSpeed);

export const upgradedCooldownForKind = (s: State, owner: number, kind: number, baseCooldown: number): number => {
  const upgrade = COOLDOWN_UPGRADES[kind];
  return upgrade && level(s, owner, upgrade.tech) > 0 ? upgrade.cooldown : baseCooldown;
};

export const upgradedCooldown = (s: State, slot: number, baseCooldown: number): number =>
  upgradedCooldownForKind(s, s.e.owner[slot]!, s.e.kind[slot]!, baseCooldown);

export const upgradedSightForKind = (s: State, owner: number, kind: number, baseSight: number): number => {
  const upgrade = SIGHT_UPGRADES[kind];
  return upgrade && level(s, owner, upgrade.tech) > 0 ? baseSight + upgrade.bonus : baseSight;
};

export const upgradedSight = (s: State, slot: number, baseSight: number): number =>
  upgradedSightForKind(s, s.e.owner[slot]!, s.e.kind[slot]!, baseSight);

export const upgradedEnergyMaxForKind = (s: State, owner: number, kind: number, baseMax: number): number => {
  if (baseMax <= 0) return 0;
  const upgrade = ENERGY_UPGRADES[kind];
  return upgrade && level(s, owner, upgrade.tech) > 0 ? upgrade.max : baseMax;
};

export const upgradedEnergyMax = (s: State, slot: number, baseMax: number): number =>
  upgradedEnergyMaxForKind(s, s.e.owner[slot]!, s.e.kind[slot]!, baseMax);

export const reaverScarabCapacity = (s: State, slot: number): number =>
  internalProductCapacity(s, slot, Kind.Scarab);

export const carrierInterceptorCapacity = (s: State, slot: number): number =>
  internalProductCapacity(s, slot, Kind.Interceptor);

export const internalAmmoCapacity = (s: State, producer: number, kind: number): number => {
  return internalProductCapacity(s, producer, kind);
};
