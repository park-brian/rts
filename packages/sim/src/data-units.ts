import {
  bwRange,
  DamageType,
  Kind,
  ResourceType,
  Role,
  sec,
  Size,
  supply,
  Trait,
  type BuildMethod,
  type Race,
  type WorkerRace,
} from './data-core.ts';
import {
  SplashPx,
  type SplashSpecPx,
  type Weapon,
  WeaponMinRangePx,
  WeaponRangePx,
  WeaponRangeUpgradePx,
} from './data-weapons.ts';
import { Ability } from './data-abilities.ts';
import { fx } from './fixed.ts';

export type UnitDef = {
  name: string;
  race: Race;
  sprite: string;
  roles: number; // bitwise-OR of Role.*
  traits: number; // bitwise-OR of Trait.*
  size: number; // Size
  hp: number;
  shields: number;
  energyMax: number;
  startEnergy: number;
  armor: number;
  sight: number; // tiles
  speed: number; // fixed-point px/tick (0 = immobile)
  radius: number; // fixed-point interaction radius
  footprintW: number; // build-tile footprint width for placement/solidity
  footprintH: number; // build-tile footprint height for placement/solidity
  minerals: number;
  gas: number;
  supply: number; // internal half-supply units
  buildTime: number; // ticks
  provides: number; // internal half-supply units
  resourceType: number; // for Role.Resource nodes
  cargoSize: number; // transport space consumed when loaded; 0 = not loadable
  cargoCapacity: number; // transport space provided; 0 = not a transport
  requiresGeyser: boolean;
  buildMethod: BuildMethod;
  weapon: Weapon | null; // ground weapon
  airWeapon: Weapon | null;
  abilities: number[];
  produces: number[]; // kinds this structure can produce with the current generic queue
  requires: number[]; // completed structures required before build/train
  notes: string[];
};

const def = (d: Partial<UnitDef> & { name: string; roles: number }): UnitDef => ({
  race: 'neutral', sprite: '', traits: 0, size: Size.Small, hp: 0, shields: 0, energyMax: 0, startEnergy: 0, armor: 0, sight: 0,
  speed: 0, radius: fx(8), footprintW: 1, footprintH: 1,
  minerals: 0, gas: 0, supply: 0, buildTime: 0, provides: 0, cargoSize: 0, cargoCapacity: 0,
  resourceType: ResourceType.Minerals, requiresGeyser: false, buildMethod: 'worker',
  weapon: null, airWeapon: null, abilities: [], produces: [], requires: [], notes: [],
  ...d,
});

const mobile = (radiusPx: number): Pick<UnitDef, 'roles' | 'radius'> => ({ roles: Role.Mobile, radius: fx(radiusPx) });
const air = (radiusPx: number): Pick<UnitDef, 'roles' | 'radius'> => ({ roles: Role.Mobile | Role.Air, radius: fx(radiusPx) });
const structure = (radiusPx: number, w: number, h: number): Pick<UnitDef, 'roles' | 'radius' | 'footprintW' | 'footprintH'> => ({
  roles: Role.Structure, radius: fx(radiusPx), footprintW: w, footprintH: h,
});
const cargo = (cargoSize: number): Pick<UnitDef, 'cargoSize'> => ({ cargoSize });
const producer = (base: Pick<UnitDef, 'roles'>): number => base.roles | Role.Producer;
const depot = (base: Pick<UnitDef, 'roles'>): number => base.roles | Role.ResourceDepot | Role.Producer;
const gasBuilding = (race: Race, sprite: string, hp: number, shields = 0): Partial<UnitDef> & { roles: number } => ({
  race, sprite, ...structure(56, 4, 2), roles: Role.Structure | Role.Resource,
  hp, shields, resourceType: ResourceType.Gas, requiresGeyser: true,
});

const terran = (sprite: string, d: Partial<UnitDef> & { name: string; roles: number }): UnitDef => def({ race: 'terran', sprite, ...d });
const protoss = (sprite: string, d: Partial<UnitDef> & { name: string; roles: number }): UnitDef => def({ race: 'protoss', sprite, ...d });
const zerg = (sprite: string, d: Partial<UnitDef> & { name: string; roles: number }): UnitDef => def({ race: 'zerg', sprite, ...d });

const same = (w: Weapon): { weapon: Weapon; airWeapon: Weapon } => ({ weapon: w, airWeapon: w });
const WR = WeaponRangePx;
const WMIN = WeaponMinRangePx;
const SP = SplashPx;
const W = (damage: number, dtype: number, cooldown: number, rangePx: number, shots = 1, minRangePx = 0): Weapon => ({
  damage, dtype, cooldown, range: bwRange(rangePx), shots,
  ...(minRangePx > 0 ? { minRange: bwRange(minRangePx) } : {}),
});
const radialSplash = (px: SplashSpecPx): Pick<Weapon, 'splashInnerRadius' | 'splashMediumRadius' | 'splashRadius'> => ({
  splashInnerRadius: bwRange(px.inner),
  splashMediumRadius: bwRange(px.medium),
  splashRadius: bwRange(px.outer),
});
const cd = sec;
const SCARAB_SPLASH = radialSplash(SP.Scarab);

export const Units: Record<number, UnitDef> = {
  // Neutral resources.
  [Kind.Mineral]: def({
    name: 'Mineral Field', sprite: 'mineral', roles: Role.Resource, size: Size.Large,
    radius: fx(24), footprintW: 2, footprintH: 1, resourceType: ResourceType.Minerals,
  }),
  [Kind.Geyser]: def({
    name: 'Vespene Geyser', sprite: 'geyser', roles: 0, size: Size.Large, radius: fx(56),
    footprintW: 4, footprintH: 2, resourceType: ResourceType.Gas,
  }),

  // Terran units.
  [Kind.SCV]: terran('scv', {
    name: 'SCV', ...mobile(11), roles: Role.Mobile | Role.Worker, size: Size.Small,
    hp: 60, sight: 7, speed: fx(2), minerals: 50, supply: supply(1), buildTime: sec(17.86),
    weapon: W(5, DamageType.Normal, 15, WR.FusionCutter), ...cargo(1),
  }),
  [Kind.Marine]: terran('marine', {
    name: 'Marine', ...mobile(8), size: Size.Small,
    hp: 40, sight: 7, speed: fx(2), minerals: 50, supply: supply(1), buildTime: sec(15.12),
    ...same(W(6, DamageType.Normal, 15, WR.GaussRifle)), abilities: [Ability.StimPack], ...cargo(1),
  }),
  [Kind.Firebat]: terran('firebat', {
    name: 'Firebat', ...mobile(11), size: Size.Small,
    hp: 50, armor: 1, sight: 7, speed: fx(2), minerals: 50, gas: 25, supply: supply(1), buildTime: sec(15.12),
    weapon: { ...W(8, DamageType.Concussive, cd(1.05), WR.FlameThrower, 2), ...radialSplash(SP.FlameThrower) },
    abilities: [Ability.StimPack], requires: [Kind.Academy], ...cargo(1),
  }),
  [Kind.Medic]: terran('medic', {
    name: 'Medic', ...mobile(8), size: Size.Small,
    hp: 60, energyMax: 200, startEnergy: 50, armor: 1, sight: 9, speed: fx(2), minerals: 50, gas: 25, supply: supply(1), buildTime: sec(18.9),
    abilities: [Ability.Heal, Ability.Restoration, Ability.OpticalFlare], requires: [Kind.Academy], ...cargo(1),
  }),
  [Kind.Ghost]: terran('ghost', {
    name: 'Ghost', ...mobile(8), size: Size.Medium,
    hp: 45, energyMax: 200, startEnergy: 50, sight: 9, speed: fx(2), minerals: 25, gas: 75, supply: supply(1), buildTime: sec(31.5),
    ...same(W(10, DamageType.Concussive, cd(0.92), WR.C10CanisterRifle)), requires: [Kind.Academy, Kind.CovertOps],
    abilities: [Ability.Lockdown, Ability.PersonnelCloaking, Ability.NuclearStrike], ...cargo(1),
  }),
  [Kind.Vulture]: terran('vulture', {
    name: 'Vulture', ...mobile(16), size: Size.Small,
    hp: 80, sight: 8, speed: fx(3), minerals: 75, supply: supply(2), buildTime: sec(12.6),
    weapon: W(20, DamageType.Concussive, cd(1.26), WR.FragmentationGrenade), ...cargo(2),
  }),
  [Kind.SiegeTank]: terran('siegeTank', {
    name: 'Siege Tank', ...mobile(16), size: Size.Large,
    hp: 150, armor: 1, sight: 10, speed: fx(2), minerals: 150, gas: 100, supply: supply(2), buildTime: sec(31.5),
    weapon: W(30, DamageType.Explosive, cd(1.55), WR.ArcliteCannon), requires: [Kind.MachineShop], ...cargo(4),
  }),
  [Kind.SiegeTankSieged]: terran('siegeMode', {
    name: 'Siege Tank (Siege)', ...mobile(16), size: Size.Large,
    hp: 150, armor: 1, sight: 10, minerals: 0, gas: 0, supply: supply(2),
    weapon: { ...W(70, DamageType.Explosive, cd(3.15), WR.ArcliteShockCannon, 1, WMIN.ArcliteShockCannon), ...radialSplash(SP.ArcliteShockCannon) },
    buildMethod: 'internal',
  }),
  [Kind.Goliath]: terran('goliath', {
    name: 'Goliath', ...mobile(16), size: Size.Large,
    hp: 125, armor: 1, sight: 8, speed: fx(2), minerals: 100, gas: 50, supply: supply(2), buildTime: sec(25.2),
    weapon: W(12, DamageType.Normal, cd(0.92), WR.TwinAutocannons), airWeapon: W(10, DamageType.Explosive, cd(1.85), WR.HellfireMissilePack, 2),
    requires: [Kind.MachineShop], ...cargo(4),
  }),
  [Kind.Wraith]: terran('wraith', {
    name: 'Wraith', ...air(19), size: Size.Large,
    hp: 120, energyMax: 200, startEnergy: 50, sight: 7, speed: fx(3), minerals: 150, gas: 100, supply: supply(2), buildTime: sec(37.8),
    weapon: W(8, DamageType.Normal, cd(1.26), WR.BurstLasers), airWeapon: W(20, DamageType.Explosive, cd(1.89), WR.GeminiMissiles),
    abilities: [Ability.CloakingField],
  }),
  [Kind.Dropship]: terran('dropship', {
    name: 'Dropship', ...air(24), size: Size.Large,
    hp: 150, armor: 1, sight: 8, speed: fx(2), minerals: 100, gas: 100, supply: supply(2), buildTime: sec(31.5),
    cargoCapacity: 8, requires: [Kind.ControlTower],
  }),
  [Kind.ScienceVessel]: terran('scienceVessel', {
    name: 'Science Vessel', ...air(32), size: Size.Large,
    hp: 200, energyMax: 200, startEnergy: 50, armor: 1, sight: 10, speed: fx(2), minerals: 100, gas: 225, supply: supply(2), buildTime: sec(50.4),
    abilities: [Ability.DefensiveMatrix, Ability.Irradiate, Ability.EMPShockwave], requires: [Kind.ControlTower],
  }),
  [Kind.Valkyrie]: terran('valkyrie', {
    name: 'Valkyrie', ...air(24), size: Size.Large,
    hp: 200, armor: 2, sight: 8, speed: fx(3), minerals: 250, gas: 125, supply: supply(3), buildTime: sec(31.5),
    airWeapon: { ...W(6, DamageType.Explosive, cd(4), WR.HaloRockets, 8), ...radialSplash(SP.AirSplash) },
    requires: [Kind.ControlTower, Kind.Armory],
  }),
  [Kind.Battlecruiser]: terran('battlecruiser', {
    name: 'Battlecruiser', ...air(37), size: Size.Large,
    hp: 500, energyMax: 200, startEnergy: 50, armor: 3, sight: 11, speed: fx(1), minerals: 400, gas: 300, supply: supply(6), buildTime: sec(84),
    ...same(W(25, DamageType.Normal, cd(1.89), WR.ATSLaserBattery)), requires: [Kind.ControlTower, Kind.PhysicsLab],
    abilities: [Ability.YamatoGun],
  }),
  [Kind.SpiderMine]: terran('spiderMine', {
    name: 'Spider Mine', ...mobile(7), size: Size.Small,
    hp: 20, sight: 3, speed: fx(4),
    weapon: { ...W(125, DamageType.Explosive, 1, WR.SpiderMines), ...radialSplash(SP.SpiderMines) },
    buildMethod: 'internal',
  }),
  [Kind.NuclearMissile]: terran('nuclearMissile', {
    name: 'Nuclear Missile', roles: 0, size: Size.Large,
    hp: 1, minerals: 200, gas: 200, buildTime: sec(37.8), buildMethod: 'internal',
  }),

  // Terran buildings.
  [Kind.CommandCenter]: terran('commandCenter', {
    name: 'Command Center', ...structure(58, 4, 3), roles: depot(structure(58, 4, 3)),
    size: Size.Large, hp: 1500, armor: 1, sight: 10, minerals: 400, buildTime: sec(75.6),
    provides: supply(10), produces: [Kind.SCV],
  }),
  [Kind.SupplyDepot]: terran('supplyDepot', {
    name: 'Supply Depot', ...structure(38, 3, 2), size: Size.Large,
    hp: 500, armor: 1, sight: 8, minerals: 100, buildTime: sec(25.2), provides: supply(8),
    requires: [Kind.CommandCenter],
  }),
  [Kind.Refinery]: terran('refinery', {
    name: 'Refinery', ...gasBuilding('terran', 'refinery', 750), size: Size.Large,
    armor: 1, sight: 8, minerals: 100, buildTime: sec(25.2),
  }),
  [Kind.Barracks]: terran('barracks', {
    name: 'Barracks', ...structure(52, 4, 3), roles: producer(structure(52, 4, 3)), size: Size.Large,
    hp: 1000, armor: 1, sight: 10, minerals: 150, buildTime: sec(50.4),
    produces: [Kind.Marine, Kind.Firebat, Kind.Medic, Kind.Ghost], requires: [Kind.CommandCenter],
  }),
  [Kind.EngineeringBay]: terran('engineeringBay', {
    name: 'Engineering Bay', ...structure(48, 4, 3), size: Size.Large,
    hp: 850, armor: 1, sight: 10, minerals: 125, buildTime: sec(37.8), requires: [Kind.CommandCenter],
  }),
  [Kind.Bunker]: terran('bunker', {
    name: 'Bunker', ...structure(32, 3, 2), size: Size.Large,
    hp: 350, armor: 1, sight: 10, minerals: 100, buildTime: sec(18.9), requires: [Kind.Barracks],
    cargoCapacity: 4,
  }),
  [Kind.Academy]: terran('academy', {
    name: 'Academy', ...structure(40, 3, 2), size: Size.Large,
    hp: 600, armor: 1, sight: 10, minerals: 150, buildTime: sec(50.4), requires: [Kind.Barracks],
  }),
  [Kind.MissileTurret]: terran('missileTurret', {
    name: 'Missile Turret', ...structure(20, 2, 2), size: Size.Large,
    hp: 200, sight: 11, minerals: 75, buildTime: sec(18.9), airWeapon: W(20, DamageType.Explosive, 15, WR.LongboltMissile, 1),
    requires: [Kind.EngineeringBay],
  }),
  [Kind.Factory]: terran('factory', {
    name: 'Factory', ...structure(56, 4, 3), roles: producer(structure(56, 4, 3)), size: Size.Large,
    hp: 1250, armor: 1, sight: 10, minerals: 200, gas: 100, buildTime: sec(50.4),
    produces: [Kind.Vulture, Kind.SiegeTank, Kind.Goliath], requires: [Kind.Barracks],
  }),
  [Kind.MachineShop]: terran('machineShop', {
    name: 'Machine Shop', ...structure(36, 2, 2), size: Size.Large,
    hp: 750, armor: 1, sight: 8, minerals: 50, gas: 50, buildTime: sec(25.2), requires: [Kind.Factory],
    buildMethod: 'addon',
  }),
  [Kind.Starport]: terran('starport', {
    name: 'Starport', ...structure(48, 4, 3), roles: producer(structure(48, 4, 3)), size: Size.Large,
    hp: 1300, armor: 1, sight: 10, minerals: 150, gas: 100, buildTime: sec(50.4),
    produces: [Kind.Wraith, Kind.Dropship, Kind.ScienceVessel, Kind.Valkyrie, Kind.Battlecruiser],
    requires: [Kind.Factory],
  }),
  [Kind.ControlTower]: terran('controlTower', {
    name: 'Control Tower', ...structure(38, 2, 2), size: Size.Large,
    hp: 500, armor: 1, sight: 8, minerals: 50, gas: 50, buildTime: sec(25.2), requires: [Kind.Starport],
    buildMethod: 'addon',
  }),
  [Kind.Armory]: terran('armory', {
    name: 'Armory', ...structure(48, 3, 2), size: Size.Large,
    hp: 750, armor: 1, sight: 10, minerals: 100, gas: 50, buildTime: sec(50.4), requires: [Kind.Factory],
  }),
  [Kind.ScienceFacility]: terran('scienceFacility', {
    name: 'Science Facility', ...structure(48, 4, 3), size: Size.Large,
    hp: 850, armor: 1, sight: 10, minerals: 100, gas: 150, buildTime: sec(50.4), requires: [Kind.Starport],
  }),
  [Kind.PhysicsLab]: terran('physicsLab', {
    name: 'Physics Lab', ...structure(38, 2, 2), size: Size.Large,
    hp: 600, armor: 1, sight: 8, minerals: 50, gas: 50, buildTime: sec(25.2), requires: [Kind.ScienceFacility],
    buildMethod: 'addon',
  }),
  [Kind.CovertOps]: terran('covertOps', {
    name: 'Covert Ops', ...structure(38, 2, 2), size: Size.Large,
    hp: 750, armor: 1, sight: 8, minerals: 50, gas: 50, buildTime: sec(25.2), requires: [Kind.ScienceFacility],
    buildMethod: 'addon',
  }),
  [Kind.ComsatStation]: terran('comsatStation', {
    name: 'Comsat Station', ...structure(38, 2, 2), size: Size.Large,
    hp: 500, energyMax: 200, startEnergy: 50, armor: 1, sight: 10, minerals: 50, gas: 50, buildTime: sec(25.2), requires: [Kind.CommandCenter, Kind.Academy],
    buildMethod: 'addon', abilities: [Ability.ScannerSweep],
  }),
  [Kind.NuclearSilo]: terran('nuclearSilo', {
    name: 'Nuclear Silo', ...structure(38, 2, 2), roles: producer(structure(38, 2, 2)), size: Size.Large,
    hp: 600, armor: 1, sight: 8, minerals: 100, gas: 100, buildTime: sec(50.4), produces: [Kind.NuclearMissile],
    requires: [Kind.CommandCenter, Kind.CovertOps], buildMethod: 'addon',
  }),

  // Protoss units.
  [Kind.Probe]: protoss('probe', {
    name: 'Probe', ...mobile(11), roles: Role.Mobile | Role.Worker, size: Size.Small,
    hp: 20, shields: 20, sight: 8, speed: fx(2), minerals: 50, supply: supply(1), buildTime: sec(12.6),
    weapon: W(5, DamageType.Normal, 22, WR.ParticleBeam), ...cargo(1),
  }),
  [Kind.Zealot]: protoss('zealot', {
    name: 'Zealot', ...mobile(11), size: Size.Small,
    hp: 100, shields: 60, armor: 1, sight: 7, speed: fx(2), minerals: 100, supply: supply(2), buildTime: sec(25.2),
    weapon: W(8, DamageType.Normal, 22, WR.PsiBlades, 2), ...cargo(2),
  }),
  [Kind.Dragoon]: protoss('dragoon', {
    name: 'Dragoon', ...mobile(16), size: Size.Large,
    hp: 100, shields: 80, armor: 1, sight: 8, speed: fx(2), minerals: 125, gas: 50, supply: supply(2), buildTime: sec(31.5),
    ...same(W(20, DamageType.Explosive, 30, WR.PhaseDisruptor)), requires: [Kind.CyberneticsCore], ...cargo(4),
  }),
  [Kind.HighTemplar]: protoss('highTemplar', {
    name: 'High Templar', ...mobile(12), size: Size.Small,
    hp: 40, shields: 40, energyMax: 200, startEnergy: 50, sight: 7, speed: fx(1), minerals: 50, gas: 150, supply: supply(2), buildTime: sec(31.5),
    abilities: [Ability.PsionicStorm, Ability.Hallucination], requires: [Kind.TemplarArchives], ...cargo(2),
  }),
  [Kind.DarkTemplar]: protoss('darkTemplar', {
    name: 'Dark Templar', ...mobile(12), size: Size.Small,
    hp: 80, shields: 40, armor: 1, sight: 7, speed: fx(2), minerals: 125, gas: 100, supply: supply(2), buildTime: sec(31.5),
    weapon: W(40, DamageType.Normal, 30, WR.WarpBlades), requires: [Kind.TemplarArchives], ...cargo(2),
  }),
  [Kind.Archon]: protoss('archon', {
    name: 'Archon', ...mobile(16), size: Size.Large,
    hp: 10, shields: 350, sight: 8, speed: fx(2), supply: supply(4), buildTime: sec(12.6),
    ...same({ ...W(30, DamageType.Normal, 20, WR.PsionicShockwave), ...radialSplash(SP.PsionicShockwave) }), buildMethod: 'merge', ...cargo(4),
  }),
  [Kind.DarkArchon]: protoss('darkArchon', {
    name: 'Dark Archon', ...mobile(16), size: Size.Large,
    hp: 25, shields: 200, energyMax: 200, startEnergy: 50, armor: 1, sight: 10, speed: fx(2), supply: supply(4), buildTime: sec(12.6),
    buildMethod: 'merge', abilities: [Ability.Feedback, Ability.Maelstrom, Ability.MindControl], ...cargo(4),
  }),
  [Kind.Reaver]: protoss('reaver', {
    name: 'Reaver', ...mobile(16), roles: Role.Mobile | Role.Producer, size: Size.Large,
    hp: 100, shields: 80, sight: 10, speed: fx(1), minerals: 200, gas: 100, supply: supply(4), buildTime: sec(44),
    weapon: { ...W(100, DamageType.Normal, 60, WR.ReaverLaunch), ...SCARAB_SPLASH }, requires: [Kind.RoboticsSupportBay],
    produces: [Kind.Scarab], ...cargo(4),
  }),
  [Kind.Scarab]: protoss('scarab', {
    name: 'Scarab', ...mobile(3), size: Size.Small,
    hp: 1, minerals: 15, buildTime: sec(4), speed: fx(4),
    weapon: { ...W(100, DamageType.Normal, 1, WR.ScarabImpact), ...SCARAB_SPLASH },
    buildMethod: 'internal',
  }),
  [Kind.Observer]: protoss('observer', {
    name: 'Observer', ...air(16), size: Size.Small,
    hp: 40, shields: 20, sight: 9, speed: fx(2), minerals: 25, gas: 75, supply: supply(1), buildTime: sec(25.2),
    requires: [Kind.Observatory],
  }),
  [Kind.Shuttle]: protoss('shuttle', {
    name: 'Shuttle', ...air(20), size: Size.Large,
    hp: 80, shields: 60, armor: 1, sight: 8, speed: fx(2), minerals: 200, supply: supply(2), buildTime: sec(37.8),
    cargoCapacity: 8,
  }),
  [Kind.Scout]: protoss('scout', {
    name: 'Scout', ...air(18), size: Size.Large,
    hp: 150, shields: 100, sight: 8, speed: fx(3), minerals: 275, gas: 125, supply: supply(3), buildTime: sec(50.4),
    weapon: W(8, DamageType.Normal, 30, WR.DualPhotonBlasters), airWeapon: W(14, DamageType.Explosive, 22, WR.AntiMatterMissiles, 2),
  }),
  [Kind.Carrier]: protoss('carrier', {
    name: 'Carrier', ...air(32), roles: Role.Mobile | Role.Air | Role.Producer, size: Size.Large,
    hp: 300, shields: 150, armor: 4, sight: 11, speed: fx(2), minerals: 350, gas: 250, supply: supply(6), buildTime: sec(86.4),
    produces: [Kind.Interceptor], requires: [Kind.FleetBeacon],
  }),
  [Kind.Interceptor]: protoss('interceptor', {
    name: 'Interceptor', ...air(8), size: Size.Small,
    hp: 40, shields: 40, sight: 6, speed: fx(4), minerals: 25, buildTime: sec(12.6),
    ...same(W(6, DamageType.Normal, 1, WR.PulseCannon)), buildMethod: 'internal',
  }),
  [Kind.Arbiter]: protoss('arbiter', {
    name: 'Arbiter', ...air(22), size: Size.Large,
    hp: 200, shields: 150, energyMax: 200, startEnergy: 50, armor: 1, sight: 9, speed: fx(2), minerals: 100, gas: 350, supply: supply(4), buildTime: sec(100.8),
    ...same(W(10, DamageType.Explosive, 45, WR.PhaseDisruptorCannon)), requires: [Kind.ArbiterTribunal],
    abilities: [Ability.StasisField, Ability.Recall],
  }),
  [Kind.Corsair]: protoss('corsair', {
    name: 'Corsair', ...air(18), size: Size.Medium,
    hp: 100, shields: 80, energyMax: 200, startEnergy: 50, armor: 1, sight: 9, speed: fx(3), minerals: 150, gas: 100, supply: supply(2), buildTime: sec(25.2),
    airWeapon: { ...W(5, DamageType.Explosive, 8, WR.NeutronFlare), ...radialSplash(SP.AirSplash) },
    abilities: [Ability.DisruptionWeb],
  }),

  // Protoss buildings.
  [Kind.Nexus]: protoss('nexus', {
    name: 'Nexus', ...structure(56, 4, 3), roles: depot(structure(56, 4, 3)), size: Size.Large,
    hp: 750, shields: 750, armor: 1, sight: 10, minerals: 400, buildTime: sec(120),
    provides: supply(10), produces: [Kind.Probe],
  }),
  [Kind.Pylon]: protoss('pylon', {
    name: 'Pylon', ...structure(20, 2, 2), size: Size.Large,
    hp: 300, shields: 300, sight: 8, minerals: 100, buildTime: sec(18), provides: supply(8),
  }),
  [Kind.Assimilator]: protoss('assimilator', {
    name: 'Assimilator', ...gasBuilding('protoss', 'assimilator', 450, 450), size: Size.Large,
    armor: 1, sight: 8, minerals: 100, buildTime: sec(25.2),
  }),
  [Kind.Gateway]: protoss('gateway', {
    name: 'Gateway', ...structure(48, 4, 3), roles: producer(structure(48, 4, 3)), size: Size.Large,
    hp: 500, shields: 500, armor: 1, sight: 10, minerals: 150, buildTime: sec(37.8),
    produces: [Kind.Zealot, Kind.Dragoon, Kind.HighTemplar, Kind.DarkTemplar], requires: [Kind.Nexus],
  }),
  [Kind.Forge]: protoss('forge', {
    name: 'Forge', ...structure(36, 3, 2), size: Size.Large,
    hp: 550, shields: 550, armor: 1, sight: 10, minerals: 150, buildTime: sec(25.2), requires: [Kind.Nexus],
  }),
  [Kind.PhotonCannon]: protoss('photonCannon', {
    name: 'Photon Cannon', ...structure(20, 2, 2), size: Size.Large,
    hp: 100, shields: 100, sight: 11, minerals: 150, buildTime: sec(31.5), ...same(W(20, DamageType.Normal, 22, WR.PhotonCannon)),
    requires: [Kind.Forge],
  }),
  [Kind.CyberneticsCore]: protoss('cyberneticsCore', {
    name: 'Cybernetics Core', ...structure(40, 3, 2), size: Size.Large,
    hp: 500, shields: 500, armor: 1, sight: 10, minerals: 200, buildTime: sec(37.8), requires: [Kind.Gateway],
  }),
  [Kind.ShieldBattery]: protoss('shieldBattery', {
    name: 'Shield Battery', ...structure(32, 3, 2), size: Size.Large,
    hp: 200, shields: 200, energyMax: 200, startEnergy: 50, armor: 1, sight: 10, minerals: 100, buildTime: sec(18),
    requires: [Kind.Gateway], abilities: [Ability.ShieldRecharge],
  }),
  [Kind.RoboticsFacility]: protoss('roboticsFacility', {
    name: 'Robotics Facility', ...structure(40, 3, 2), roles: producer(structure(40, 3, 2)), size: Size.Large,
    hp: 500, shields: 500, armor: 1, sight: 10, minerals: 200, gas: 200, buildTime: sec(50.4),
    produces: [Kind.Shuttle, Kind.Reaver, Kind.Observer], requires: [Kind.CyberneticsCore],
  }),
  [Kind.Stargate]: protoss('stargate', {
    name: 'Stargate', ...structure(48, 4, 3), roles: producer(structure(48, 4, 3)), size: Size.Large,
    hp: 600, shields: 600, armor: 1, sight: 10, minerals: 150, gas: 150, buildTime: sec(44),
    produces: [Kind.Scout, Kind.Corsair, Kind.Carrier, Kind.Arbiter], requires: [Kind.CyberneticsCore],
  }),
  [Kind.CitadelOfAdun]: protoss('citadelOfAdun', {
    name: 'Citadel of Adun', ...structure(32, 3, 2), size: Size.Large,
    hp: 450, shields: 450, armor: 1, sight: 10, minerals: 150, gas: 100, buildTime: sec(37.8),
    requires: [Kind.CyberneticsCore],
  }),
  [Kind.TemplarArchives]: protoss('templarArchives', {
    name: 'Templar Archives', ...structure(32, 3, 2), size: Size.Large,
    hp: 500, shields: 500, armor: 1, sight: 10, minerals: 150, gas: 200, buildTime: sec(44),
    requires: [Kind.CitadelOfAdun],
  }),
  [Kind.RoboticsSupportBay]: protoss('roboticsSupportBay', {
    name: 'Robotics Support Bay', ...structure(32, 3, 2), size: Size.Large,
    hp: 450, shields: 450, armor: 1, sight: 10, minerals: 150, gas: 100, buildTime: sec(18),
    requires: [Kind.RoboticsFacility],
  }),
  [Kind.Observatory]: protoss('observatory', {
    name: 'Observatory', ...structure(44, 3, 2), size: Size.Large,
    hp: 250, shields: 250, armor: 1, sight: 10, minerals: 50, gas: 100, buildTime: sec(18),
    requires: [Kind.RoboticsFacility],
  }),
  [Kind.FleetBeacon]: protoss('fleetBeacon', {
    name: 'Fleet Beacon', ...structure(44, 3, 2), size: Size.Large,
    hp: 500, shields: 500, armor: 1, sight: 10, minerals: 300, gas: 200, buildTime: sec(37.8),
    requires: [Kind.Stargate],
  }),
  [Kind.ArbiterTribunal]: protoss('arbiterTribunal', {
    name: 'Arbiter Tribunal', ...structure(44, 3, 2), size: Size.Large,
    hp: 500, shields: 500, armor: 1, sight: 10, minerals: 200, gas: 150, buildTime: sec(37.8),
    requires: [Kind.Stargate, Kind.TemplarArchives],
  }),

  // Zerg units.
  [Kind.Larva]: zerg('larva', {
    name: 'Larva', ...mobile(8), roles: Role.Mobile | Role.Producer, size: Size.Small,
    hp: 25, armor: 10, sight: 4, buildMethod: 'internal',
    produces: [Kind.Drone, Kind.Overlord, Kind.Zergling, Kind.Hydralisk, Kind.Mutalisk, Kind.Scourge, Kind.Queen, Kind.Defiler, Kind.Ultralisk],
  }),
  [Kind.Egg]: zerg('egg', {
    name: 'Egg', ...mobile(16), size: Size.Large,
    hp: 200, armor: 10, sight: 4, buildMethod: 'internal',
  }),
  [Kind.Drone]: zerg('drone', {
    name: 'Drone', ...mobile(11), roles: Role.Mobile | Role.Worker, size: Size.Small,
    hp: 40, sight: 7, speed: fx(2), minerals: 50, supply: supply(1), buildTime: sec(12.6),
    weapon: W(5, DamageType.Normal, 22, WR.Spines), buildMethod: 'larva', ...cargo(1),
  }),
  [Kind.Overlord]: zerg('overlord', {
    name: 'Overlord', ...air(25), size: Size.Large,
    hp: 200, sight: 9, speed: fx(1), minerals: 100, supply: 0, provides: supply(8), buildTime: sec(25.2),
    cargoCapacity: 8, buildMethod: 'larva',
  }),
  [Kind.Zergling]: zerg('zergling', {
    name: 'Zergling', ...mobile(8), size: Size.Small,
    hp: 35, sight: 5, speed: fx(3), minerals: 25, supply: supply(0.5), buildTime: sec(28),
    weapon: W(5, DamageType.Normal, 8, WR.Claws), requires: [Kind.SpawningPool], buildMethod: 'larva', ...cargo(1),
  }),
  [Kind.Hydralisk]: zerg('hydralisk', {
    name: 'Hydralisk', ...mobile(10), size: Size.Medium,
    hp: 80, sight: 6, speed: fx(2), minerals: 75, gas: 25, supply: supply(1), buildTime: sec(28),
    ...same(W(10, DamageType.Explosive, 15, WR.NeedleSpines)), requires: [Kind.HydraliskDen], buildMethod: 'larva', ...cargo(2),
  }),
  [Kind.Lurker]: zerg('lurker', {
    name: 'Lurker', ...mobile(16), size: Size.Large,
    hp: 125, armor: 1, sight: 8, speed: fx(2), minerals: 50, gas: 100, supply: supply(2), buildTime: sec(40),
    weapon: W(20, DamageType.Explosive, 37, WR.SubterraneanSpines), requires: [Kind.HydraliskDen], buildMethod: 'morph',
    ...cargo(4),
  }),
  [Kind.Mutalisk]: zerg('mutalisk', {
    name: 'Mutalisk', ...air(22), size: Size.Small,
    hp: 120, sight: 7, speed: fx(3), minerals: 100, gas: 100, supply: supply(2), buildTime: sec(40),
    ...same(W(9, DamageType.Normal, 30, WR.GlaveWurm)), requires: [Kind.Spire], buildMethod: 'larva',
  }),
  [Kind.Scourge]: zerg('scourge', {
    name: 'Scourge', ...air(12), size: Size.Small,
    hp: 25, sight: 5, speed: fx(4), minerals: 25, gas: 75, supply: supply(0.5), buildTime: sec(30),
    airWeapon: W(110, DamageType.Normal, 1, WR.SuicideScourge), requires: [Kind.Spire], buildMethod: 'larva',
  }),
  [Kind.Guardian]: zerg('guardian', {
    name: 'Guardian', ...air(22), size: Size.Large,
    hp: 150, armor: 2, sight: 8, speed: fx(2), minerals: 50, gas: 100, supply: supply(2), buildTime: sec(40),
    weapon: W(20, DamageType.Normal, 30, WR.AcidSpore), requires: [Kind.GreaterSpire], buildMethod: 'morph',
  }),
  [Kind.Devourer]: zerg('devourer', {
    name: 'Devourer', ...air(22), size: Size.Large,
    hp: 250, armor: 2, sight: 8, speed: fx(2), minerals: 150, gas: 50, supply: supply(2), buildTime: sec(40),
    airWeapon: W(25, DamageType.Explosive, 100, WR.CorrosiveAcid), requires: [Kind.GreaterSpire], buildMethod: 'morph',
  }),
  [Kind.Queen]: zerg('queen', {
    name: 'Queen', ...air(24), size: Size.Medium,
    hp: 120, energyMax: 200, startEnergy: 50, sight: 10, speed: fx(3), minerals: 100, gas: 100, supply: supply(2), buildTime: sec(50),
    requires: [Kind.QueensNest], buildMethod: 'larva', abilities: [Ability.SpawnBroodling, Ability.Ensnare, Ability.Parasite, Ability.InfestCommandCenter],
  }),
  [Kind.Defiler]: zerg('defiler', {
    name: 'Defiler', ...mobile(13), size: Size.Medium,
    hp: 80, energyMax: 200, startEnergy: 50, armor: 1, sight: 10, speed: fx(2), minerals: 50, gas: 150, supply: supply(2), buildTime: sec(31.5),
    requires: [Kind.DefilerMound], buildMethod: 'larva', abilities: [Ability.DarkSwarm, Ability.Plague, Ability.Consume], ...cargo(2),
  }),
  [Kind.Ultralisk]: zerg('ultralisk', {
    name: 'Ultralisk', ...mobile(19), size: Size.Large,
    hp: 400, armor: 1, sight: 7, speed: fx(3), minerals: 200, gas: 200, supply: supply(4), buildTime: sec(60),
    weapon: W(20, DamageType.Normal, 15, WR.KaiserBlades), requires: [Kind.UltraliskCavern], buildMethod: 'larva', ...cargo(4),
  }),
  [Kind.InfestedTerran]: zerg('infestedTerran', {
    name: 'Infested Terran', ...mobile(8), size: Size.Small,
    hp: 60, sight: 5, speed: fx(2), minerals: 100, gas: 50, supply: supply(1), buildTime: sec(40),
    weapon: { ...W(500, DamageType.Normal, 1, WR.SuicideInfestedTerran), ...radialSplash(SP.InfestedTerran) },
    buildMethod: 'internal', ...cargo(1),
  }),
  [Kind.Broodling]: zerg('broodling', {
    name: 'Broodling', ...mobile(9), size: Size.Small,
    hp: 30, sight: 5, speed: fx(2), weapon: W(4, DamageType.Normal, 15, WR.ToxicSpores), buildMethod: 'internal',
  }),

  // Zerg buildings.
  [Kind.Hatchery]: zerg('hatchery', {
    name: 'Hatchery', ...structure(49, 4, 3), roles: Role.Structure | Role.ResourceDepot, size: Size.Large,
    hp: 1250, armor: 1, sight: 10, minerals: 300, buildTime: sec(120), provides: supply(1),
    buildMethod: 'morph',
  }),
  [Kind.Lair]: zerg('lair', {
    name: 'Lair', ...structure(49, 4, 3), roles: Role.Structure | Role.ResourceDepot, size: Size.Large,
    hp: 1800, armor: 1, sight: 10, minerals: 150, gas: 100, buildTime: sec(100), provides: supply(1),
    requires: [Kind.Hatchery, Kind.SpawningPool], buildMethod: 'morph',
  }),
  [Kind.Hive]: zerg('hive', {
    name: 'Hive', ...structure(49, 4, 3), roles: Role.Structure | Role.ResourceDepot, size: Size.Large,
    hp: 2500, armor: 1, sight: 10, minerals: 200, gas: 150, buildTime: sec(120), provides: supply(1),
    requires: [Kind.Lair, Kind.QueensNest], buildMethod: 'morph',
  }),
  [Kind.CreepColony]: zerg('creepColony', {
    name: 'Creep Colony', ...structure(24, 2, 2), size: Size.Large,
    hp: 400, sight: 10, minerals: 75, buildTime: sec(20), requires: [Kind.Hatchery], buildMethod: 'morph',
  }),
  [Kind.SunkenColony]: zerg('sunkenColony', {
    name: 'Sunken Colony', ...structure(24, 2, 2), size: Size.Large,
    hp: 300, armor: 2, sight: 10, minerals: 50, buildTime: sec(20), weapon: W(40, DamageType.Explosive, 32, WR.SubterraneanTentacle),
    requires: [Kind.SpawningPool], buildMethod: 'morph',
  }),
  [Kind.SporeColony]: zerg('sporeColony', {
    name: 'Spore Colony', ...structure(24, 2, 2), size: Size.Large,
    hp: 400, sight: 10, minerals: 50, buildTime: sec(20), airWeapon: W(15, DamageType.Normal, 15, WR.SeekerSpores),
    requires: [Kind.EvolutionChamber], buildMethod: 'morph',
  }),
  [Kind.SpawningPool]: zerg('spawningPool', {
    name: 'Spawning Pool', ...structure(40, 3, 2), size: Size.Large,
    hp: 750, sight: 10, minerals: 200, buildTime: sec(65), requires: [Kind.Hatchery], buildMethod: 'morph',
  }),
  [Kind.EvolutionChamber]: zerg('evolutionChamber', {
    name: 'Evolution Chamber', ...structure(38, 3, 2), size: Size.Large,
    hp: 750, sight: 10, minerals: 75, buildTime: sec(25), requires: [Kind.Hatchery], buildMethod: 'morph',
  }),
  [Kind.HydraliskDen]: zerg('hydraliskDen', {
    name: 'Hydralisk Den', ...structure(40, 3, 2), size: Size.Large,
    hp: 850, sight: 10, minerals: 100, gas: 50, buildTime: sec(25), requires: [Kind.SpawningPool], buildMethod: 'morph',
  }),
  [Kind.Extractor]: zerg('extractor', {
    name: 'Extractor', ...gasBuilding('zerg', 'extractor', 750), size: Size.Large,
    sight: 8, minerals: 50, buildTime: sec(25), buildMethod: 'morph',
  }),
  [Kind.Spire]: zerg('spire', {
    name: 'Spire', ...structure(28, 2, 2), size: Size.Large,
    hp: 600, sight: 10, minerals: 200, gas: 150, buildTime: sec(75), requires: [Kind.Lair], buildMethod: 'morph',
  }),
  [Kind.GreaterSpire]: zerg('greaterSpire', {
    name: 'Greater Spire', ...structure(28, 2, 2), size: Size.Large,
    hp: 1000, sight: 10, minerals: 100, gas: 150, buildTime: sec(120), requires: [Kind.Spire, Kind.Hive], buildMethod: 'morph',
  }),
  [Kind.QueensNest]: zerg('queensNest', {
    name: "Queen's Nest", ...structure(38, 3, 2), size: Size.Large,
    hp: 850, sight: 10, minerals: 150, gas: 100, buildTime: sec(50), requires: [Kind.Lair], buildMethod: 'morph',
  }),
  [Kind.NydusCanal]: zerg('nydusCanal', {
    name: 'Nydus Canal', ...structure(32, 2, 2), size: Size.Large,
    hp: 250, sight: 10, minerals: 150, buildTime: sec(40), requires: [Kind.Lair], buildMethod: 'morph',
    cargoCapacity: 64,
  }),
  [Kind.UltraliskCavern]: zerg('ultraliskCavern', {
    name: 'Ultralisk Cavern', ...structure(40, 3, 2), size: Size.Large,
    hp: 600, sight: 10, minerals: 150, gas: 200, buildTime: sec(65), requires: [Kind.Hive], buildMethod: 'morph',
  }),
  [Kind.DefilerMound]: zerg('defilerMound', {
    name: 'Defiler Mound', ...structure(48, 4, 2), size: Size.Large,
    hp: 850, armor: 1, sight: 10, minerals: 100, gas: 100, buildTime: sec(60), requires: [Kind.Hive], buildMethod: 'morph',
  }),
  [Kind.InfestedCommandCenter]: zerg('commandCenter', {
    name: 'Infested Command Center', ...structure(58, 4, 3), roles: depot(structure(58, 4, 3)), size: Size.Large,
    hp: 1500, armor: 1, sight: 10, produces: [Kind.InfestedTerran], buildMethod: 'internal',
  }),
};

const BIOLOGICAL_KINDS = new Set<number>([
  Kind.SCV, Kind.Marine, Kind.Firebat, Kind.Medic, Kind.Ghost,
  Kind.Probe, Kind.Zealot, Kind.HighTemplar, Kind.DarkTemplar, Kind.Archon, Kind.DarkArchon,
  Kind.Larva, Kind.Egg, Kind.Drone, Kind.Overlord, Kind.Zergling, Kind.Hydralisk, Kind.Lurker,
  Kind.Mutalisk, Kind.Scourge, Kind.Guardian, Kind.Devourer, Kind.Queen, Kind.Defiler,
  Kind.Ultralisk, Kind.InfestedTerran, Kind.Broodling,
]);
const ROBOTIC_KINDS = new Set<number>([
  Kind.Dragoon, Kind.Reaver, Kind.Scarab, Kind.Observer, Kind.Shuttle, Kind.Scout,
  Kind.Carrier, Kind.Interceptor, Kind.Arbiter, Kind.Corsair,
]);
const PSIONIC_KINDS = new Set<number>([
  Kind.HighTemplar, Kind.DarkTemplar, Kind.Archon, Kind.DarkArchon, Kind.Arbiter,
  Kind.Queen, Kind.Defiler,
]);
const DETECTOR_KINDS = new Set<number>([
  Kind.ScienceVessel, Kind.MissileTurret, Kind.Observer, Kind.PhotonCannon, Kind.Overlord, Kind.SporeColony,
]);

export const unitTraits = (kind: number): number => {
  const def = Units[kind];
  if (!def) return 0;
  let traits = def.traits;
  if (BIOLOGICAL_KINDS.has(kind)) traits |= Trait.Biological;
  if (ROBOTIC_KINDS.has(kind)) traits |= Trait.Robotic | Trait.Mechanical;
  if (def.race === 'terran' && (def.roles & Role.Mobile) !== 0 && !BIOLOGICAL_KINDS.has(kind)) traits |= Trait.Mechanical;
  if (PSIONIC_KINDS.has(kind)) traits |= Trait.Psionic;
  if (DETECTOR_KINDS.has(kind)) traits |= Trait.Detector;
  if (kind === Kind.DarkTemplar || kind === Kind.Observer) traits |= Trait.PermanentCloak;
  return traits;
};

/** Pick the weapon this attacker can use against the target, respecting air/ground. */
export const weaponForTarget = (attacker: UnitDef, target: UnitDef): Weapon | null =>
  (target.roles & Role.Air) !== 0 ? attacker.airWeapon : attacker.weapon;

export const hasAnyWeapon = (d: UnitDef): boolean => d.weapon !== null || d.airWeapon !== null;

export const isLarvaSourceKind = (kind: number): boolean =>
  kind === Kind.Hatchery || kind === Kind.Lair || kind === Kind.Hive;

export const WorkerBuildKinds: Record<WorkerRace, number[]> = {
  terran: [
    Kind.SupplyDepot, Kind.Refinery, Kind.Barracks, Kind.EngineeringBay, Kind.Bunker, Kind.Academy,
    Kind.Factory, Kind.Armory, Kind.Starport, Kind.ScienceFacility,
  ],
  protoss: [
    Kind.Pylon, Kind.Assimilator, Kind.Gateway, Kind.Forge, Kind.PhotonCannon, Kind.CyberneticsCore,
    Kind.ShieldBattery, Kind.RoboticsFacility, Kind.Stargate, Kind.CitadelOfAdun, Kind.TemplarArchives,
    Kind.RoboticsSupportBay, Kind.Observatory, Kind.FleetBeacon, Kind.ArbiterTribunal,
  ],
  zerg: [
    Kind.Hatchery, Kind.Extractor, Kind.SpawningPool, Kind.EvolutionChamber, Kind.CreepColony,
    Kind.HydraliskDen, Kind.Spire, Kind.QueensNest, Kind.NydusCanal, Kind.UltraliskCavern, Kind.DefilerMound,
  ],
};

export const workerBuildKindsFor = (race: Race): number[] =>
  race === 'terran' || race === 'protoss' || race === 'zerg' ? WorkerBuildKinds[race] : [];

export const productionCount = (kind: number): number =>
  kind === Kind.Zergling || kind === Kind.Scourge ? 2 : 1;

export const productionCostCount = (kind: number): number =>
  kind === Kind.Zergling ? 2 : 1;
