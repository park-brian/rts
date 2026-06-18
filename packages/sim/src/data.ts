// Game data tables + tunable constants. The simulation systems are generic: they
// reason about roles, weapons, requirements, and defs declared here, not specific
// unit kinds. Race-specific complexity should enter as data first; mechanics that
// truly differ (larva, creep, power, add-ons, spells) get explicit engine support.

import { fx } from './fixed.ts';

export const TILE = 32; // pixels per build tile
export const FPS = 24; // logical ticks/sec (SC1 "Fastest" is about 23.81; rounded)

/** seconds -> integer ticks. */
export const sec = (s: number): number => Math.round(s * FPS);
/** tiles -> fixed-point pixels. */
export const tiles = (t: number): number => fx(t * TILE);
/** BWAPI weapon/interaction range pixels -> fixed-point pixels. */
export const bwRange = (px: number): number => fx(px);

// Supply is stored in half-supply units so Zerglings/Scourge can cost 0.5.
export const SUPPLY_SCALE = 2;
export const supply = (shown: number): number => Math.round(shown * SUPPLY_SCALE);
export const shownSupply = (internal: number): number => internal / SUPPLY_SCALE;

// ---- entity kinds: a flat registry of types. Systems must NOT branch on these. ----
export const Kind = {
  None: 0,
  Mineral: 1,
  CommandCenter: 2,
  SCV: 3,
  SupplyDepot: 4,
  Barracks: 5,
  Marine: 6,
  Geyser: 7, // vespene geyser: inert placement marker; build a gas structure on it
  Refinery: 8, // Terran gas structure

  Firebat: 9,
  Medic: 10,
  Ghost: 11,
  Vulture: 12,
  SiegeTank: 13,
  SiegeTankSieged: 14,
  Goliath: 15,
  Wraith: 16,
  Dropship: 17,
  ScienceVessel: 18,
  Valkyrie: 19,
  Battlecruiser: 20,
  SpiderMine: 21,
  NuclearMissile: 22,
  EngineeringBay: 23,
  Bunker: 24,
  Academy: 25,
  MissileTurret: 26,
  Factory: 27,
  MachineShop: 28,
  Starport: 29,
  ControlTower: 30,
  Armory: 31,
  ScienceFacility: 32,
  PhysicsLab: 33,
  CovertOps: 34,
  ComsatStation: 35,
  NuclearSilo: 36,

  Probe: 50,
  Zealot: 51,
  Dragoon: 52,
  HighTemplar: 53,
  DarkTemplar: 54,
  Archon: 55,
  DarkArchon: 56,
  Reaver: 57,
  Scarab: 58,
  Observer: 59,
  Shuttle: 60,
  Scout: 61,
  Carrier: 62,
  Interceptor: 63,
  Arbiter: 64,
  Corsair: 65,
  Nexus: 66,
  Pylon: 67,
  Assimilator: 68,
  Gateway: 69,
  Forge: 70,
  PhotonCannon: 71,
  CyberneticsCore: 72,
  ShieldBattery: 73,
  RoboticsFacility: 74,
  Stargate: 75,
  CitadelOfAdun: 76,
  TemplarArchives: 77,
  RoboticsSupportBay: 78,
  Observatory: 79,
  FleetBeacon: 80,
  ArbiterTribunal: 81,

  Larva: 100,
  Egg: 101,
  Drone: 102,
  Overlord: 103,
  Zergling: 104,
  Hydralisk: 105,
  Lurker: 106,
  Mutalisk: 107,
  Scourge: 108,
  Guardian: 109,
  Devourer: 110,
  Queen: 111,
  Defiler: 112,
  Ultralisk: 113,
  InfestedTerran: 114,
  Broodling: 115,
  Hatchery: 116,
  Lair: 117,
  Hive: 118,
  CreepColony: 119,
  SunkenColony: 120,
  SporeColony: 121,
  SpawningPool: 122,
  EvolutionChamber: 123,
  HydraliskDen: 124,
  Extractor: 125,
  Spire: 126,
  GreaterSpire: 127,
  QueensNest: 128,
  NydusCanal: 129,
  UltraliskCavern: 130,
  DefilerMound: 131,
  InfestedCommandCenter: 132,
} as const;
export type Kind = (typeof Kind)[keyof typeof Kind];

// ---- orders ----
export const Order = {
  Idle: 0,
  Move: 1,
  Harvest: 2,
  Attack: 3, // attack a specific target
  AttackMove: 4, // move to a point, engaging enemies en route
  Build: 5, // worker en route to a construction site
  Cast: 6, // channeling a delayed ability; interrupted by any new order
  Repair: 7, // worker repairing a mechanical unit or Terran structure
} as const;
export type Order = (typeof Order)[keyof typeof Order];

// ---- capability flags (race-agnostic) ----
export const Role = {
  Mobile: 1 << 0,
  Structure: 1 << 1,
  Worker: 1 << 2,
  ResourceDepot: 1 << 3,
  Resource: 1 << 4,
  Producer: 1 << 5,
  Air: 1 << 6, // flying unit: ignores terrain and ground collision
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const Trait = {
  Biological: 1 << 0,
  Mechanical: 1 << 1,
  Robotic: 1 << 2,
  Psionic: 1 << 3,
  Detector: 1 << 4,
  PermanentCloak: 1 << 5,
} as const;
export type Trait = (typeof Trait)[keyof typeof Trait];

export const ResourceType = { Minerals: 0, Gas: 1 } as const;
export type ResourceType = (typeof ResourceType)[keyof typeof ResourceType];

export type Race = 'neutral' | 'terran' | 'protoss' | 'zerg';
export type WorkerRace = Exclude<Race, 'neutral'>;
export type BuildMethod = 'worker' | 'warp' | 'addon' | 'larva' | 'morph' | 'merge' | 'internal';

// ---- combat model (docs/specs/sc1-spec.md section A.5) ----
export const Size = { Small: 0, Medium: 1, Large: 2 } as const;
export type Size = (typeof Size)[keyof typeof Size];

export const DamageType = { Normal: 0, Concussive: 1, Explosive: 2 } as const;
export type DamageType = (typeof DamageType)[keyof typeof DamageType];

export const CLOAK_AURA_RADIUS = tiles(6);

// percent multiplier [damageType][size]
export const DAMAGE_MULT: readonly (readonly number[])[] = [
  [100, 100, 100], // Normal
  [100, 50, 25], // Concussive
  [50, 75, 100], // Explosive
];

export type Weapon = {
  damage: number;
  dtype: number; // DamageType
  cooldown: number; // ticks
  range: number; // fixed-point px
  shots?: number; // armor applies per shot
  minRange?: number; // fixed-point px
  splashRadius?: number; // fixed-point px, outer splash radius
  splashInnerRadius?: number; // fixed-point px, 100% splash damage inside this radius
  splashMediumRadius?: number; // fixed-point px, 50% splash damage inside this radius
};

export const WeaponRangePx = {
  // Terran
  FusionCutter: 10,
  GaussRifle: 128,
  FlameThrower: 32,
  C10CanisterRifle: 224,
  FragmentationGrenade: 160,
  SpiderMines: 10,
  TwinAutocannons: 192,
  HellfireMissilePack: 160,
  ArcliteCannon: 224,
  ArcliteShockCannon: 384,
  BurstLasers: 160,
  GeminiMissiles: 160,
  ATSLaserBattery: 192,
  LongboltMissile: 224,
  HaloRockets: 192,

  // Protoss
  ParticleBeam: 32,
  PsiBlades: 15,
  PhaseDisruptor: 128,
  WarpBlades: 15,
  PsionicShockwave: 64,
  ReaverLaunch: 256,
  ScarabImpact: 16,
  DualPhotonBlasters: 128,
  AntiMatterMissiles: 128,
  PulseCannon: 128,
  PhaseDisruptorCannon: 160,
  NeutronFlare: 160,
  PhotonCannon: 224,

  // Zerg
  Spines: 32,
  Claws: 15,
  NeedleSpines: 128,
  SubterraneanSpines: 192,
  GlaveWurm: 96,
  SuicideScourge: 3,
  AcidSpore: 256,
  CorrosiveAcid: 192,
  KaiserBlades: 25,
  SuicideInfestedTerran: 3,
  ToxicSpores: 2,
  SubterraneanTentacle: 224,
  SeekerSpores: 224,
} as const;

export const WeaponMinRangePx = {
  ArcliteShockCannon: 64,
} as const;

export const WeaponRangeUpgradePx = {
  U238Shells: 32,
  CharonBoosters: 96,
  SingularityCharge: 64,
  GroovedSpines: 32,
} as const;

export const HarvestRangePx = {
  Mine: 10,
  Deposit: 10,
} as const;

type SplashSpecPx = {
  readonly inner: number;
  readonly medium: number;
  readonly outer: number;
};

export const SplashPx = {
  FlameThrower: { inner: 15, medium: 20, outer: 25 },
  ArcliteShockCannon: { inner: 10, medium: 25, outer: 40 },
  SpiderMines: { inner: 50, medium: 75, outer: 100 },
  Scarab: { inner: 20, medium: 40, outer: 60 },
  PsionicShockwave: { inner: 3, medium: 15, outer: 30 },
  InfestedTerran: { inner: 20, medium: 40, outer: 60 },
  AirSplash: { inner: 5, medium: 50, outer: 100 },
} satisfies Record<string, SplashSpecPx>;

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

export const Ability = {
  StimPack: 1,
  EMPShockwave: 2,
  PsionicStorm: 3,
  DefensiveMatrix: 4,
  Irradiate: 5,
  Lockdown: 6,
  YamatoGun: 7,
  Feedback: 8,
  StasisField: 9,
  Maelstrom: 10,
  DisruptionWeb: 11,
  SpawnBroodling: 12,
  Ensnare: 13,
  Plague: 14,
  Consume: 15,
  DarkSwarm: 16,
  PersonnelCloaking: 17,
  CloakingField: 18,
  ScannerSweep: 19,
  Heal: 20,
  Restoration: 21,
  OpticalFlare: 22,
  Parasite: 23,
  Recall: 24,
  MindControl: 25,
  Hallucination: 26,
  InfestCommandCenter: 27,
  NuclearStrike: 28,
  ShieldRecharge: 29,
} as const;
export type Ability = (typeof Ability)[keyof typeof Ability];

export const EffectKind = {
  PsionicStorm: 1,
  DarkSwarm: 2,
  DisruptionWeb: 3,
  ScannerSweep: 4,
  NuclearStrike: 5,
} as const;
export type EffectKind = (typeof EffectKind)[keyof typeof EffectKind];

export const Tech = {
  StimPack: 1,
  U238Shells: 2,
  Restoration: 3,
  OpticalFlare: 4,
  CaduceusReactor: 5,
  IonThrusters: 6,
  SpiderMines: 7,
  SiegeTech: 8,
  CharonBoosters: 9,
  PersonnelCloaking: 10,
  Lockdown: 11,
  OcularImplants: 12,
  MoebiusReactor: 13,
  CloakingField: 14,
  ApolloReactor: 15,
  YamatoCannon: 16,
  ColossusReactor: 17,
  EMPShockwave: 18,
  Irradiate: 19,
  TitanReactor: 20,
  InfantryWeapons: 21,
  InfantryArmor: 22,
  VehicleWeapons: 23,
  VehiclePlating: 24,
  ShipWeapons: 25,
  ShipPlating: 26,

  SingularityCharge: 40,
  LegEnhancements: 41,
  GraviticDrive: 42,
  ReaverCapacity: 43,
  ScarabDamage: 44,
  GraviticThrusters: 45,
  CarrierCapacity: 46,
  ApialSensors: 47,
  ArgusJewel: 48,
  DisruptionWeb: 49,
  SensorArray: 50,
  GraviticBoosters: 51,
  PsionicStorm: 52,
  Hallucination: 53,
  KhaydarinAmulet: 54,
  Maelstrom: 55,
  MindControl: 56,
  ArgusTalisman: 57,
  StasisField: 58,
  Recall: 59,
  KhaydarinCore: 60,
  GroundWeapons: 61,
  GroundArmor: 62,
  PlasmaShields: 63,
  AirWeapons: 64,
  AirArmor: 65,

  MetabolicBoost: 80,
  AdrenalGlands: 81,
  MuscularAugments: 82,
  GroovedSpines: 83,
  LurkerAspect: 84,
  PneumatizedCarapace: 85,
  VentralSacs: 86,
  Antennae: 87,
  AnabolicSynthesis: 88,
  ChitinousPlating: 89,
  GameteMeiosis: 90,
  Ensnare: 91,
  SpawnBroodling: 92,
  MetasynapticNode: 93,
  Plague: 94,
  Consume: 95,
  MeleeAttacks: 96,
  MissileAttacks: 97,
  Carapace: 98,
  FlyerAttacks: 99,
  FlyerCarapace: 100,
  Burrow: 101,
} as const;
export type Tech = (typeof Tech)[keyof typeof Tech];
export const TECH_CAP = 128;

export type TechDef = {
  name: string;
  producers: number[];
  minerals: number[];
  gas: number[];
  time: number[];
  requires: number[];
  maxLevel: number;
};

const tech = (
  name: string,
  producers: number[],
  minerals: number | number[],
  gas: number | number[],
  time: number | number[],
  requires: number[] = [],
): TechDef => {
  const m = Array.isArray(minerals) ? minerals : [minerals];
  const g = Array.isArray(gas) ? gas : [gas];
  const t = Array.isArray(time) ? time : [time];
  return { name, producers, minerals: m, gas: g, time: t, requires, maxLevel: m.length };
};

const three = (a: number, b: number, c: number): number[] => [a, b, c];

export const TechDefs: Record<number, TechDef> = {
  [Tech.StimPack]: tech('Stim Pack', [Kind.Academy], 100, 100, sec(50.4)),
  [Tech.U238Shells]: tech('U-238 Shells', [Kind.Academy], 150, 150, sec(63)),
  [Tech.Restoration]: tech('Restoration', [Kind.Academy], 100, 100, sec(50.4)),
  [Tech.OpticalFlare]: tech('Optical Flare', [Kind.Academy], 100, 100, sec(75.6)),
  [Tech.CaduceusReactor]: tech('Caduceus Reactor', [Kind.Academy], 150, 150, sec(105)),
  [Tech.IonThrusters]: tech('Ion Thrusters', [Kind.MachineShop], 100, 100, sec(63)),
  [Tech.SpiderMines]: tech('Spider Mines', [Kind.MachineShop], 100, 100, sec(50.4)),
  [Tech.SiegeTech]: tech('Siege Tech', [Kind.MachineShop], 150, 150, sec(50.4)),
  [Tech.CharonBoosters]: tech('Charon Boosters', [Kind.MachineShop], 100, 100, sec(83.79)),
  [Tech.PersonnelCloaking]: tech('Personnel Cloaking', [Kind.CovertOps], 100, 100, sec(50)),
  [Tech.Lockdown]: tech('Lockdown', [Kind.CovertOps], 200, 200, sec(63)),
  [Tech.OcularImplants]: tech('Ocular Implants', [Kind.CovertOps], 100, 100, sec(104.58)),
  [Tech.MoebiusReactor]: tech('Moebius Reactor', [Kind.CovertOps], 150, 150, sec(104.58)),
  [Tech.CloakingField]: tech('Cloaking Field', [Kind.ControlTower], 150, 150, sec(63)),
  [Tech.ApolloReactor]: tech('Apollo Reactor', [Kind.ControlTower], 200, 200, sec(104.58)),
  [Tech.YamatoCannon]: tech('Yamato Cannon', [Kind.PhysicsLab], 100, 100, sec(75.6)),
  [Tech.ColossusReactor]: tech('Colossus Reactor', [Kind.PhysicsLab], 150, 150, sec(104.58)),
  [Tech.EMPShockwave]: tech('EMP Shockwave', [Kind.ScienceFacility], 200, 200, sec(75.6)),
  [Tech.Irradiate]: tech('Irradiate', [Kind.ScienceFacility], 200, 200, sec(50.4)),
  [Tech.TitanReactor]: tech('Titan Reactor', [Kind.ScienceFacility], 150, 150, sec(104.58)),
  [Tech.InfantryWeapons]: tech('Infantry Weapons', [Kind.EngineeringBay], three(100, 175, 250), three(100, 175, 250), three(sec(167.58), sec(180.18), sec(192.78))),
  [Tech.InfantryArmor]: tech('Infantry Armor', [Kind.EngineeringBay], three(100, 175, 250), three(100, 175, 250), three(sec(167.58), sec(180.18), sec(192.78))),
  [Tech.VehicleWeapons]: tech('Vehicle Weapons', [Kind.Armory], three(100, 175, 250), three(100, 175, 250), three(sec(167.58), sec(180.18), sec(192.78))),
  [Tech.VehiclePlating]: tech('Vehicle Plating', [Kind.Armory], three(100, 175, 250), three(100, 175, 250), three(sec(167.58), sec(180.18), sec(192.78))),
  [Tech.ShipWeapons]: tech('Ship Weapons', [Kind.Armory], three(100, 150, 200), three(100, 150, 200), three(sec(167.58), sec(180.18), sec(192.78))),
  [Tech.ShipPlating]: tech('Ship Plating', [Kind.Armory], three(150, 225, 300), three(150, 225, 300), three(sec(167.58), sec(180.18), sec(192.78))),

  [Tech.SingularityCharge]: tech('Singularity Charge', [Kind.CyberneticsCore], 150, 150, sec(104.58)),
  [Tech.LegEnhancements]: tech('Leg Enhancements', [Kind.CitadelOfAdun], 150, 150, sec(83.79)),
  [Tech.GraviticDrive]: tech('Gravitic Drive', [Kind.RoboticsSupportBay], 200, 200, sec(104.58)),
  [Tech.ReaverCapacity]: tech('Reaver Capacity', [Kind.RoboticsSupportBay], 200, 200, sec(104.58)),
  [Tech.ScarabDamage]: tech('Scarab Damage', [Kind.RoboticsSupportBay], 200, 200, sec(104.58)),
  [Tech.GraviticThrusters]: tech('Gravitic Thrusters', [Kind.FleetBeacon], 200, 200, sec(104.58)),
  [Tech.CarrierCapacity]: tech('Carrier Capacity', [Kind.FleetBeacon], 100, 100, sec(63)),
  [Tech.ApialSensors]: tech('Apial Sensors', [Kind.FleetBeacon], 100, 100, sec(104.58)),
  [Tech.ArgusJewel]: tech('Argus Jewel', [Kind.FleetBeacon], 100, 100, sec(104.58)),
  [Tech.DisruptionWeb]: tech('Disruption Web', [Kind.FleetBeacon], 200, 200, sec(50)),
  [Tech.SensorArray]: tech('Sensor Array', [Kind.Observatory], 150, 150, sec(83.79)),
  [Tech.GraviticBoosters]: tech('Gravitic Boosters', [Kind.Observatory], 150, 150, sec(83.79)),
  [Tech.PsionicStorm]: tech('Psionic Storm', [Kind.TemplarArchives], 200, 200, sec(75.6)),
  [Tech.Hallucination]: tech('Hallucination', [Kind.TemplarArchives], 150, 150, sec(50.4)),
  [Tech.KhaydarinAmulet]: tech('Khaydarin Amulet', [Kind.TemplarArchives], 150, 150, sec(104.58)),
  [Tech.Maelstrom]: tech('Maelstrom', [Kind.TemplarArchives], 100, 100, sec(63)),
  [Tech.MindControl]: tech('Mind Control', [Kind.TemplarArchives], 200, 200, sec(75.6)),
  [Tech.ArgusTalisman]: tech('Argus Talisman', [Kind.TemplarArchives], 150, 150, sec(104.58)),
  [Tech.StasisField]: tech('Stasis Field', [Kind.ArbiterTribunal], 150, 150, sec(63)),
  [Tech.Recall]: tech('Recall', [Kind.ArbiterTribunal], 150, 150, sec(75.6)),
  [Tech.KhaydarinCore]: tech('Khaydarin Core', [Kind.ArbiterTribunal], 150, 150, sec(104.58)),
  [Tech.GroundWeapons]: tech('Ground Weapons', [Kind.Forge], three(100, 150, 200), three(100, 150, 200), three(sec(167.58), sec(180.18), sec(192.78))),
  [Tech.GroundArmor]: tech('Ground Armor', [Kind.Forge], three(100, 175, 250), three(100, 175, 250), three(sec(167.58), sec(180.18), sec(192.78))),
  [Tech.PlasmaShields]: tech('Plasma Shields', [Kind.Forge], three(200, 300, 400), three(200, 300, 400), three(sec(167.58), sec(180.18), sec(192.78))),
  [Tech.AirWeapons]: tech('Air Weapons', [Kind.CyberneticsCore], three(100, 175, 250), three(100, 175, 250), three(sec(167.58), sec(180.18), sec(192.78))),
  [Tech.AirArmor]: tech('Air Armor', [Kind.CyberneticsCore], three(150, 225, 300), three(150, 225, 300), three(sec(167.58), sec(180.18), sec(192.78))),

  [Tech.MetabolicBoost]: tech('Metabolic Boost', [Kind.SpawningPool], 100, 100, sec(63)),
  [Tech.AdrenalGlands]: tech('Adrenal Glands', [Kind.SpawningPool], 200, 200, sec(63), [Kind.Hive]),
  [Tech.MuscularAugments]: tech('Muscular Augments', [Kind.HydraliskDen], 150, 150, sec(63)),
  [Tech.GroovedSpines]: tech('Grooved Spines', [Kind.HydraliskDen], 150, 150, sec(63)),
  [Tech.LurkerAspect]: tech('Lurker Aspect', [Kind.HydraliskDen], 200, 200, sec(75.6)),
  [Tech.PneumatizedCarapace]: tech('Pneumatized Carapace', [Kind.Lair, Kind.Hive], 150, 150, sec(83.79)),
  [Tech.VentralSacs]: tech('Ventral Sacs', [Kind.Lair, Kind.Hive], 200, 200, sec(100.8)),
  [Tech.Antennae]: tech('Antennae', [Kind.Lair, Kind.Hive], 150, 150, sec(83.79)),
  [Tech.AnabolicSynthesis]: tech('Anabolic Synthesis', [Kind.UltraliskCavern], 200, 200, sec(83.79)),
  [Tech.ChitinousPlating]: tech('Chitinous Plating', [Kind.UltraliskCavern], 150, 150, sec(83.79)),
  [Tech.GameteMeiosis]: tech('Gamete Meiosis', [Kind.QueensNest], 150, 150, sec(104.58)),
  [Tech.Ensnare]: tech('Ensnare', [Kind.QueensNest], 100, 100, sec(50)),
  [Tech.SpawnBroodling]: tech('Spawn Broodling', [Kind.QueensNest], 100, 100, sec(50)),
  [Tech.MetasynapticNode]: tech('Metasynaptic Node', [Kind.DefilerMound], 150, 150, sec(104.58)),
  [Tech.Plague]: tech('Plague', [Kind.DefilerMound], 200, 200, sec(63)),
  [Tech.Consume]: tech('Consume', [Kind.DefilerMound], 100, 100, sec(63)),
  [Tech.MeleeAttacks]: tech('Melee Attacks', [Kind.EvolutionChamber], three(100, 150, 200), three(100, 150, 200), three(sec(167.58), sec(180.18), sec(192.78))),
  [Tech.MissileAttacks]: tech('Missile Attacks', [Kind.EvolutionChamber], three(100, 150, 200), three(100, 150, 200), three(sec(167.58), sec(180.18), sec(192.78))),
  [Tech.Carapace]: tech('Carapace', [Kind.EvolutionChamber], three(150, 225, 300), three(150, 225, 300), three(sec(167.58), sec(180.18), sec(192.78))),
  [Tech.FlyerAttacks]: tech('Flyer Attacks', [Kind.Spire, Kind.GreaterSpire], three(100, 175, 250), three(100, 175, 250), three(sec(167.58), sec(180.18), sec(192.78))),
  [Tech.FlyerCarapace]: tech('Flyer Carapace', [Kind.Spire, Kind.GreaterSpire], three(150, 225, 300), three(150, 225, 300), three(sec(167.58), sec(180.18), sec(192.78))),
  [Tech.Burrow]: tech('Burrow', [Kind.Hatchery, Kind.Lair, Kind.Hive], 100, 100, sec(100.8)),
};

export type AbilityTarget = 'self' | 'point' | 'entity';
export type TargetTeam = 'own' | 'enemy' | 'any';
export type AbilityStatusTimer = 'stim' | 'lockdown';
export type AbilityTargetMarker = 'opticalFlare' | 'parasiteOwner';
export type AbilityRestorePool = 'hp' | 'shield';
export type AbilityExecution =
  | { mode: 'caster-status'; timer: AbilityStatusTimer }
  | { mode: 'target-status'; timer: AbilityStatusTimer }
  | { mode: 'target-marker'; marker: AbilityTargetMarker }
  | { mode: 'target-restore'; pool: AbilityRestorePool };
export type AbilityDef = {
  name: string;
  tech?: number;
  target: AbilityTarget;
  targetTeam: TargetTeam;
  targetRolesAny: number;
  targetRolesNone: number;
  targetTraitsAny: number;
  targetTraitsNone: number;
  targetNeedsEnergy: boolean;
  casters: number[];
  energyCost: number;
  hpCost: number;
  range: number;
  radius: number;
  duration: number;
  period: number;
  damage: number;
  execution?: AbilityExecution;
};

export const Abilities: Record<number, AbilityDef> = {
  [Ability.StimPack]: {
    name: 'Stim Pack', tech: Tech.StimPack, target: 'self', targetTeam: 'own', targetRolesAny: 0, targetRolesNone: 0,
    targetTraitsAny: 0, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.Marine, Kind.Firebat],
    energyCost: 0, hpCost: 10, range: 0, radius: 0, duration: sec(12.6), period: 0, damage: 0,
    execution: { mode: 'caster-status', timer: 'stim' },
  },
  [Ability.EMPShockwave]: {
    name: 'EMP Shockwave', tech: Tech.EMPShockwave, target: 'point', targetTeam: 'any', targetRolesAny: 0, targetRolesNone: 0,
    targetTraitsAny: 0, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.ScienceVessel],
    energyCost: 100, hpCost: 0, range: tiles(8), radius: fx(48), duration: 0, period: 0, damage: 0,
  },
  [Ability.PsionicStorm]: {
    name: 'Psionic Storm', tech: Tech.PsionicStorm, target: 'point', targetTeam: 'any', targetRolesAny: 0, targetRolesNone: 0,
    targetTraitsAny: 0, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.HighTemplar],
    energyCost: 75, hpCost: 0, range: tiles(9), radius: fx(48), duration: sec(2.67), period: 8, damage: 14,
  },
  [Ability.DefensiveMatrix]: {
    name: 'Defensive Matrix', target: 'entity', targetTeam: 'own', targetRolesAny: Role.Mobile, targetRolesNone: 0,
    targetTraitsAny: 0, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.ScienceVessel],
    energyCost: 100, hpCost: 0, range: tiles(10), radius: 0, duration: sec(56.7), period: 0, damage: 250,
  },
  [Ability.Irradiate]: {
    name: 'Irradiate', tech: Tech.Irradiate, target: 'entity', targetTeam: 'any', targetRolesAny: Role.Mobile, targetRolesNone: 0,
    targetTraitsAny: Trait.Biological, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.ScienceVessel],
    energyCost: 75, hpCost: 0, range: tiles(9), radius: fx(32), duration: sec(37.8), period: 8, damage: 9,
  },
  [Ability.Lockdown]: {
    name: 'Lockdown', tech: Tech.Lockdown, target: 'entity', targetTeam: 'enemy', targetRolesAny: Role.Mobile, targetRolesNone: 0,
    targetTraitsAny: Trait.Mechanical, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.Ghost],
    energyCost: 100, hpCost: 0, range: tiles(8), radius: 0, duration: sec(43.8), period: 0, damage: 0,
    execution: { mode: 'target-status', timer: 'lockdown' },
  },
  [Ability.YamatoGun]: {
    name: 'Yamato Gun', tech: Tech.YamatoCannon, target: 'entity', targetTeam: 'enemy', targetRolesAny: 0, targetRolesNone: Role.Resource,
    targetTraitsAny: 0, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.Battlecruiser],
    energyCost: 150, hpCost: 0, range: tiles(10), radius: 0, duration: 0, period: 0, damage: 260,
  },
  [Ability.Feedback]: {
    name: 'Feedback', target: 'entity', targetTeam: 'enemy', targetRolesAny: Role.Mobile, targetRolesNone: 0,
    targetTraitsAny: 0, targetTraitsNone: 0, targetNeedsEnergy: true, casters: [Kind.DarkArchon],
    energyCost: 50, hpCost: 0, range: tiles(10), radius: 0, duration: 0, period: 0, damage: 0,
  },
  [Ability.StasisField]: {
    name: 'Stasis Field', tech: Tech.StasisField, target: 'point', targetTeam: 'any', targetRolesAny: 0, targetRolesNone: 0,
    targetTraitsAny: 0, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.Arbiter],
    energyCost: 100, hpCost: 0, range: tiles(9), radius: fx(48), duration: sec(37.8), period: 0, damage: 0,
  },
  [Ability.Maelstrom]: {
    name: 'Maelstrom', tech: Tech.Maelstrom, target: 'point', targetTeam: 'enemy', targetRolesAny: 0, targetRolesNone: 0,
    targetTraitsAny: Trait.Biological, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.DarkArchon],
    energyCost: 100, hpCost: 0, range: tiles(10), radius: fx(48), duration: sec(7.56), period: 0, damage: 0,
  },
  [Ability.DisruptionWeb]: {
    name: 'Disruption Web', tech: Tech.DisruptionWeb, target: 'point', targetTeam: 'any', targetRolesAny: 0, targetRolesNone: 0,
    targetTraitsAny: 0, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.Corsair],
    energyCost: 125, hpCost: 0, range: tiles(9), radius: fx(48), duration: sec(37.8), period: 0, damage: 0,
  },
  [Ability.SpawnBroodling]: {
    name: 'Spawn Broodling', tech: Tech.SpawnBroodling, target: 'entity', targetTeam: 'enemy', targetRolesAny: Role.Mobile, targetRolesNone: Role.Air,
    targetTraitsAny: Trait.Biological, targetTraitsNone: Trait.Robotic, targetNeedsEnergy: false, casters: [Kind.Queen],
    energyCost: 150, hpCost: 0, range: tiles(9), radius: 0, duration: 0, period: 0, damage: 0,
  },
  [Ability.Ensnare]: {
    name: 'Ensnare', tech: Tech.Ensnare, target: 'point', targetTeam: 'enemy', targetRolesAny: 0, targetRolesNone: 0,
    targetTraitsAny: 0, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.Queen],
    energyCost: 75, hpCost: 0, range: tiles(9), radius: fx(64), duration: sec(25.2), period: 0, damage: 0,
  },
  [Ability.Plague]: {
    name: 'Plague', tech: Tech.Plague, target: 'point', targetTeam: 'enemy', targetRolesAny: 0, targetRolesNone: 0,
    targetTraitsAny: 0, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.Defiler],
    energyCost: 150, hpCost: 0, range: tiles(9), radius: fx(48), duration: sec(25.2), period: 8, damage: 10,
  },
  [Ability.Consume]: {
    name: 'Consume', tech: Tech.Consume, target: 'entity', targetTeam: 'own', targetRolesAny: Role.Mobile, targetRolesNone: Role.Structure,
    targetTraitsAny: Trait.Biological, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.Defiler],
    energyCost: 0, hpCost: 0, range: tiles(1), radius: 0, duration: 0, period: 0, damage: 50,
  },
  [Ability.DarkSwarm]: {
    name: 'Dark Swarm', target: 'point', targetTeam: 'any', targetRolesAny: 0, targetRolesNone: 0,
    targetTraitsAny: 0, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.Defiler],
    energyCost: 100, hpCost: 0, range: tiles(9), radius: fx(48), duration: sec(37.8), period: 0, damage: 0,
  },
  [Ability.PersonnelCloaking]: {
    name: 'Personnel Cloaking', tech: Tech.PersonnelCloaking, target: 'self', targetTeam: 'own', targetRolesAny: 0, targetRolesNone: 0,
    targetTraitsAny: 0, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.Ghost],
    energyCost: 25, hpCost: 0, range: 0, radius: 0, duration: 0, period: sec(1.08), damage: 0,
  },
  [Ability.CloakingField]: {
    name: 'Cloaking Field', tech: Tech.CloakingField, target: 'self', targetTeam: 'own', targetRolesAny: 0, targetRolesNone: 0,
    targetTraitsAny: 0, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.Wraith],
    energyCost: 25, hpCost: 0, range: 0, radius: 0, duration: 0, period: sec(5.26), damage: 0,
  },
  [Ability.ScannerSweep]: {
    name: 'Scanner Sweep', target: 'point', targetTeam: 'any', targetRolesAny: 0, targetRolesNone: 0,
    targetTraitsAny: 0, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.ComsatStation],
    energyCost: 50, hpCost: 0, range: tiles(999), radius: fx(160), duration: sec(8.4), period: 0, damage: 0,
  },
  [Ability.Heal]: {
    name: 'Heal', target: 'entity', targetTeam: 'own', targetRolesAny: Role.Mobile, targetRolesNone: 0,
    targetTraitsAny: Trait.Biological, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.Medic],
    energyCost: 1, hpCost: 0, range: tiles(1), radius: 0, duration: 0, period: 0, damage: 2,
    execution: { mode: 'target-restore', pool: 'hp' },
  },
  [Ability.Restoration]: {
    name: 'Restoration', tech: Tech.Restoration, target: 'entity', targetTeam: 'any', targetRolesAny: Role.Mobile, targetRolesNone: 0,
    targetTraitsAny: Trait.Biological, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.Medic],
    energyCost: 50, hpCost: 0, range: tiles(6), radius: 0, duration: 0, period: 0, damage: 0,
  },
  [Ability.OpticalFlare]: {
    name: 'Optical Flare', tech: Tech.OpticalFlare, target: 'entity', targetTeam: 'enemy', targetRolesAny: Role.Mobile, targetRolesNone: 0,
    targetTraitsAny: 0, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.Medic],
    energyCost: 75, hpCost: 0, range: tiles(9), radius: 0, duration: 0, period: 0, damage: 0,
    execution: { mode: 'target-marker', marker: 'opticalFlare' },
  },
  [Ability.Parasite]: {
    name: 'Parasite', target: 'entity', targetTeam: 'enemy', targetRolesAny: Role.Mobile, targetRolesNone: 0,
    targetTraitsAny: 0, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.Queen],
    energyCost: 75, hpCost: 0, range: tiles(12), radius: 0, duration: 0, period: 0, damage: 0,
    execution: { mode: 'target-marker', marker: 'parasiteOwner' },
  },
  [Ability.Recall]: {
    name: 'Recall', tech: Tech.Recall, target: 'point', targetTeam: 'own', targetRolesAny: 0, targetRolesNone: 0,
    targetTraitsAny: 0, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.Arbiter],
    energyCost: 150, hpCost: 0, range: tiles(999), radius: fx(70), duration: 0, period: 0, damage: 0,
  },
  [Ability.MindControl]: {
    name: 'Mind Control', tech: Tech.MindControl, target: 'entity', targetTeam: 'enemy', targetRolesAny: Role.Mobile, targetRolesNone: 0,
    targetTraitsAny: 0, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.DarkArchon],
    energyCost: 150, hpCost: 0, range: tiles(8), radius: 0, duration: 0, period: 0, damage: 0,
  },
  [Ability.Hallucination]: {
    name: 'Hallucination', tech: Tech.Hallucination, target: 'entity', targetTeam: 'own', targetRolesAny: Role.Mobile, targetRolesNone: 0,
    targetTraitsAny: 0, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.HighTemplar],
    energyCost: 100, hpCost: 0, range: tiles(7), radius: 0, duration: sec(56.7), period: 0, damage: 0,
  },
  [Ability.InfestCommandCenter]: {
    name: 'Infest Command Center', target: 'entity', targetTeam: 'enemy', targetRolesAny: Role.Structure, targetRolesNone: 0,
    targetTraitsAny: 0, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.Queen],
    energyCost: 0, hpCost: 0, range: tiles(1), radius: 0, duration: 0, period: 0, damage: 0,
  },
  [Ability.NuclearStrike]: {
    name: 'Nuclear Strike', target: 'point', targetTeam: 'enemy', targetRolesAny: 0, targetRolesNone: 0,
    targetTraitsAny: 0, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.Ghost],
    energyCost: 0, hpCost: 0, range: tiles(10), radius: fx(192), duration: sec(8.4), period: 0, damage: 500,
  },
  [Ability.ShieldRecharge]: {
    name: 'Recharge Shields', target: 'entity', targetTeam: 'own', targetRolesAny: Role.Mobile, targetRolesNone: 0,
    targetTraitsAny: 0, targetTraitsNone: 0, targetNeedsEnergy: false, casters: [Kind.ShieldBattery],
    energyCost: 1, hpCost: 0, range: tiles(4), radius: 0, duration: 0, period: 0, damage: 2,
    execution: { mode: 'target-restore', pool: 'shield' },
  },
};

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

/** Damage of one hit to HP: type x size multiplier, then flat armor, min 1. */
export const computeDamage = (w: Weapon, targetSize: number, targetArmor: number): number => {
  const pct = DAMAGE_MULT[w.dtype]![targetSize]!;
  const raw = Math.trunc((w.damage * pct) / 100);
  return Math.max(1, raw - targetArmor);
};

/** Damage of one hit to shields: type x size multiplier, no unit armor in this slice. */
export const computeShieldDamage = (w: Weapon, targetSize: number): number => {
  const pct = DAMAGE_MULT[w.dtype]![targetSize]!;
  return Math.max(1, Math.trunc((w.damage * pct) / 100));
};

// ---- faction descriptor: race-specific data, not race-specific code. ----
export type Faction = {
  name: string;
  worker: number;
  depot: number; // starting resource depot
  startWorkers: number;
  supplyStructure: number; // built to raise the supply cap by generic bots
  armyStructure: number; // produces army by generic bots
  armyUnit: number; // the basic army unit
};
export type FactionName = 'terran' | 'protoss' | 'zerg';

// ---- economy / combat tunables (provisional) ----
export const MINE_AMOUNT = 8;
export const MINERAL_MINE_TICKS = 80;
export const GAS_MINE_TICKS = 37;
export const MINE_TICKS = MINERAL_MINE_TICKS;
export const MINE_RANGE = bwRange(HarvestRangePx.Mine);
export const MAX_PER_PATCH = 3; // ceiling for the timing-derived patch saturation cap
export const DEPOSIT_RANGE = bwRange(HarvestRangePx.Deposit);
export const BUILD_RANGE = fx(28); // worker "at the construction site" radius
export const START_MINERALS = 50;
export const START_WORKERS = 4;
export const MAX_QUEUE = 5;
export const SPIDER_MINE_CHARGES = 3;
export const REAVER_SCARAB_CAPACITY = 5;
export const REAVER_SCARAB_UPGRADED_CAPACITY = 10;
export const CARRIER_INTERCEPTOR_CAPACITY = 4;
export const CARRIER_INTERCEPTOR_UPGRADED_CAPACITY = 8;
export const SUPPLY_CAP = 200 * SUPPLY_SCALE;
export const PATCH_AMOUNT = 1500;
export const GAS_AMOUNT = 5000; // gas a refinery-style structure yields once built

export const Terran: Faction = {
  name: 'Terran',
  worker: Kind.SCV,
  depot: Kind.CommandCenter,
  startWorkers: START_WORKERS,
  supplyStructure: Kind.SupplyDepot,
  armyStructure: Kind.Barracks,
  armyUnit: Kind.Marine,
};

export const Protoss: Faction = {
  name: 'Protoss',
  worker: Kind.Probe,
  depot: Kind.Nexus,
  startWorkers: START_WORKERS,
  supplyStructure: Kind.Pylon,
  armyStructure: Kind.Gateway,
  armyUnit: Kind.Zealot,
};

export const Zerg: Faction = {
  name: 'Zerg',
  worker: Kind.Drone,
  depot: Kind.Hatchery,
  startWorkers: START_WORKERS,
  supplyStructure: Kind.Overlord,
  armyStructure: Kind.SpawningPool,
  armyUnit: Kind.Zergling,
};

export const Factions: Record<FactionName, Faction> = {
  terran: Terran,
  protoss: Protoss,
  zerg: Zerg,
};

export const factionNameOf = (faction: Faction): FactionName => {
  if (faction.name === Protoss.name) return 'protoss';
  if (faction.name === Zerg.name) return 'zerg';
  return 'terran';
};
