import { fx } from '../fixed.ts';

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
  Hold: 8, // hold position: fire at enemies in range without chasing
  Patrol: 9, // travel between two points, engaging enemies encountered en route
  Load: 10, // cargo unit moving to board a transport
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
