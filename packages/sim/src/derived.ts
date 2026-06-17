import {
  CARRIER_INTERCEPTOR_CAPACITY, CARRIER_INTERCEPTOR_UPGRADED_CAPACITY, Kind,
  REAVER_SCARAB_CAPACITY, REAVER_SCARAB_UPGRADED_CAPACITY, Role, Tech, Units, tiles,
  unitTraits, Trait, type Weapon,
} from './data.ts';
import type { State } from './world.ts';
import { getTechLevel } from './tech.ts';

const level = (s: State, owner: number, tech: number): number =>
  owner < s.teams.length ? getTechLevel(s, owner, tech) : 0;

const isTerranInfantry = (kind: number): boolean =>
  kind === Kind.Marine || kind === Kind.Firebat || kind === Kind.Medic || kind === Kind.Ghost || kind === Kind.SCV;

const isZergMelee = (kind: number): boolean =>
  kind === Kind.Zergling || kind === Kind.Ultralisk || kind === Kind.Broodling || kind === Kind.InfestedTerran;

export const weaponUpgradeBonus = (s: State, attacker: number): number => {
  const e = s.e;
  const owner = e.owner[attacker]!;
  const kind = e.kind[attacker]!;
  const def = Units[kind]!;
  if (def.race === 'terran') {
    if (isTerranInfantry(kind)) return level(s, owner, Tech.InfantryWeapons);
    return level(s, owner, (def.roles & Role.Air) !== 0 ? Tech.ShipWeapons : Tech.VehicleWeapons);
  }
  if (kind === Kind.Reaver) return level(s, owner, Tech.ScarabDamage) > 0 ? 25 : 0;
  if (def.race === 'protoss') return level(s, owner, (def.roles & Role.Air) !== 0 ? Tech.AirWeapons : Tech.GroundWeapons);
  if (def.race === 'zerg') {
    if ((def.roles & Role.Air) !== 0) return level(s, owner, Tech.FlyerAttacks);
    return level(s, owner, isZergMelee(kind) ? Tech.MeleeAttacks : Tech.MissileAttacks);
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
  switch (e.kind[attacker]!) {
    case Kind.Marine: return weapon.range + (level(s, owner, Tech.U238Shells) > 0 ? tiles(1) : 0);
    case Kind.Goliath: return weapon === Units[Kind.Goliath]!.airWeapon && level(s, owner, Tech.CharonBoosters) > 0 ? weapon.range + tiles(3) : weapon.range;
    case Kind.Dragoon: return weapon.range + (level(s, owner, Tech.SingularityCharge) > 0 ? tiles(2) : 0);
    case Kind.Hydralisk: return weapon.range + (level(s, owner, Tech.GroovedSpines) > 0 ? tiles(1) : 0);
    default: return weapon.range;
  }
};

export const upgradedSpeed = (s: State, slot: number, baseSpeed: number): number => {
  if (baseSpeed <= 0) return 0;
  const owner = s.e.owner[slot]!;
  switch (s.e.kind[slot]!) {
    case Kind.Vulture: return level(s, owner, Tech.IonThrusters) > 0 ? Math.trunc((baseSpeed * 3) / 2) : baseSpeed;
    case Kind.Zealot: return level(s, owner, Tech.LegEnhancements) > 0 ? Math.trunc((baseSpeed * 3) / 2) : baseSpeed;
    case Kind.Shuttle: return level(s, owner, Tech.GraviticDrive) > 0 ? Math.trunc((baseSpeed * 3) / 2) : baseSpeed;
    case Kind.Observer: return level(s, owner, Tech.GraviticBoosters) > 0 ? Math.trunc((baseSpeed * 3) / 2) : baseSpeed;
    case Kind.Scout: return level(s, owner, Tech.GraviticThrusters) > 0 ? Math.trunc((baseSpeed * 3) / 2) : baseSpeed;
    case Kind.Zergling: return level(s, owner, Tech.MetabolicBoost) > 0 ? Math.trunc((baseSpeed * 3) / 2) : baseSpeed;
    case Kind.Hydralisk: return level(s, owner, Tech.MuscularAugments) > 0 ? Math.trunc((baseSpeed * 5) / 4) : baseSpeed;
    case Kind.Overlord: return level(s, owner, Tech.PneumatizedCarapace) > 0 ? baseSpeed * 2 : baseSpeed;
    case Kind.Ultralisk: return level(s, owner, Tech.AnabolicSynthesis) > 0 ? Math.trunc((baseSpeed * 4) / 3) : baseSpeed;
    default: return baseSpeed;
  }
};

export const upgradedCooldown = (s: State, slot: number, baseCooldown: number): number => {
  const owner = s.e.owner[slot]!;
  if (s.e.kind[slot] === Kind.Zergling && level(s, owner, Tech.AdrenalGlands) > 0) return 6;
  return baseCooldown;
};

export const upgradedSight = (s: State, slot: number, baseSight: number): number => {
  const owner = s.e.owner[slot]!;
  switch (s.e.kind[slot]!) {
    case Kind.Ghost: return baseSight + (level(s, owner, Tech.OcularImplants) > 0 ? 2 : 0);
    case Kind.Overlord: return baseSight + (level(s, owner, Tech.Antennae) > 0 ? 2 : 0);
    case Kind.Observer: return baseSight + (level(s, owner, Tech.SensorArray) > 0 ? 2 : 0);
    case Kind.Scout: return baseSight + (level(s, owner, Tech.ApialSensors) > 0 ? 2 : 0);
    default: return baseSight;
  }
};

export const upgradedEnergyMax = (s: State, slot: number, baseMax: number): number => {
  if (baseMax <= 0) return 0;
  const owner = s.e.owner[slot]!;
  switch (s.e.kind[slot]!) {
    case Kind.Medic: return level(s, owner, Tech.CaduceusReactor) > 0 ? 250 : baseMax;
    case Kind.Ghost: return level(s, owner, Tech.MoebiusReactor) > 0 ? 250 : baseMax;
    case Kind.Wraith: return level(s, owner, Tech.ApolloReactor) > 0 ? 250 : baseMax;
    case Kind.Battlecruiser: return level(s, owner, Tech.ColossusReactor) > 0 ? 250 : baseMax;
    case Kind.ScienceVessel: return level(s, owner, Tech.TitanReactor) > 0 ? 250 : baseMax;
    case Kind.HighTemplar: return level(s, owner, Tech.KhaydarinAmulet) > 0 ? 250 : baseMax;
    case Kind.DarkArchon: return level(s, owner, Tech.ArgusTalisman) > 0 ? 250 : baseMax;
    case Kind.Arbiter: return level(s, owner, Tech.KhaydarinCore) > 0 ? 250 : baseMax;
    case Kind.Corsair: return level(s, owner, Tech.ArgusJewel) > 0 ? 250 : baseMax;
    case Kind.Queen: return level(s, owner, Tech.GameteMeiosis) > 0 ? 250 : baseMax;
    case Kind.Defiler: return level(s, owner, Tech.MetasynapticNode) > 0 ? 250 : baseMax;
    default: return baseMax;
  }
};

export const reaverScarabCapacity = (s: State, slot: number): number =>
  level(s, s.e.owner[slot]!, Tech.ReaverCapacity) > 0 ? REAVER_SCARAB_UPGRADED_CAPACITY : REAVER_SCARAB_CAPACITY;

export const carrierInterceptorCapacity = (s: State, slot: number): number =>
  level(s, s.e.owner[slot]!, Tech.CarrierCapacity) > 0 ? CARRIER_INTERCEPTOR_UPGRADED_CAPACITY : CARRIER_INTERCEPTOR_CAPACITY;

export const internalAmmoCapacity = (s: State, producer: number, kind: number): number => {
  const producerKind = s.e.kind[producer]!;
  if (producerKind === Kind.Reaver && kind === Kind.Scarab) return reaverScarabCapacity(s, producer);
  if (producerKind === Kind.Carrier && kind === Kind.Interceptor) return carrierInterceptorCapacity(s, producer);
  return 0;
};
