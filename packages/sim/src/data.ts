// Game data tables + tunable constants. The simulation systems are generic: they
// reason about *roles* (capabilities) and *defs* declared here, never about
// specific unit kinds. Adding a unit — or a whole race — is data, not new code.
//
// Values trace back to docs/specs/sc1-spec.md (Terran subset for the slice). A few
// (movement speeds, mining cadence) are provisional and flagged.

import { fx } from './fixed.ts';

export const TILE = 32; // pixels per build tile
export const FPS = 24; // logical ticks/sec (SC1 "Fastest" ≈ 23.81; rounded for the slice)

/** seconds -> integer ticks. */
export const sec = (s: number): number => Math.round(s * FPS);
/** tiles -> fixed-point pixels. */
export const tiles = (t: number): number => fx(t * TILE);

// ---- entity kinds: a flat registry of types. Systems must NOT branch on these. ----
export const Kind = {
  None: 0,
  Mineral: 1,
  CommandCenter: 2,
  SCV: 3,
  SupplyDepot: 4,
  Barracks: 5,
  Marine: 6,
  Geyser: 7, // vespene geyser: inert placement marker; build a Refinery on it
  Refinery: 8, // structure on a geyser; becomes the gas resource node
  // ---- Terran (rest of the roster) ----
  Firebat: 9, Medic: 10, Ghost: 11, Vulture: 12, SiegeTank: 13, Goliath: 14,
  Wraith: 15, Dropship: 16, ScienceVessel: 17, Valkyrie: 18, Battlecruiser: 19, SpiderMine: 20,
  EngineeringBay: 21, Bunker: 22, Academy: 23, MissileTurret: 24, Factory: 25, MachineShop: 26,
  Starport: 27, ControlTower: 28, Armory: 29, ScienceFacility: 30, PhysicsLab: 31, CovertOps: 32,
  ComsatStation: 33, NuclearSilo: 34,
  // ---- Protoss ----
  Probe: 35, Zealot: 36, Dragoon: 37, HighTemplar: 38, DarkTemplar: 39, Archon: 40, DarkArchon: 41,
  Reaver: 42, Scarab: 43, Observer: 44, Shuttle: 45, Scout: 46, Carrier: 47, Interceptor: 48,
  Arbiter: 49, Corsair: 50,
  Nexus: 51, Pylon: 52, Assimilator: 53, Gateway: 54, Forge: 55, PhotonCannon: 56, CyberneticsCore: 57,
  ShieldBattery: 58, RoboticsFacility: 59, Stargate: 60, CitadelOfAdun: 61, TemplarArchives: 62,
  RoboticsSupportBay: 63, Observatory: 64, FleetBeacon: 65, ArbiterTribunal: 66,
  // ---- Zerg ----
  Larva: 67, Drone: 68, Overlord: 69, Zergling: 70, Hydralisk: 71, Lurker: 72, Mutalisk: 73,
  Scourge: 74, Guardian: 75, Devourer: 76, Queen: 77, Defiler: 78, Ultralisk: 79, InfestedTerran: 80,
  Broodling: 81,
  Hatchery: 82, Lair: 83, Hive: 84, CreepColony: 85, SunkenColony: 86, SporeColony: 87,
  SpawningPool: 88, EvolutionChamber: 89, HydraliskDen: 90, Extractor: 91, Spire: 92, GreaterSpire: 93,
  QueensNest: 94, NydusCanal: 95, UltraliskCavern: 96, DefilerMound: 97,
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
  Air: 1 << 6, // flying unit: ignores terrain & ground collision
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const ResourceType = { Minerals: 0, Gas: 1 } as const;
export type ResourceType = (typeof ResourceType)[keyof typeof ResourceType];

// ---- combat model (docs/specs/sc1-spec.md §A.5) ----
export const Size = { Small: 0, Medium: 1, Large: 2 } as const;
export type Size = (typeof Size)[keyof typeof Size];

export const DamageType = { Normal: 0, Concussive: 1, Explosive: 2 } as const;
export type DamageType = (typeof DamageType)[keyof typeof DamageType];

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
};

export type UnitDef = {
  name: string;
  roles: number; // bitwise-OR of Role.*
  size: number; // Size
  hp: number;
  armor: number;
  sight: number; // tiles
  speed: number; // fixed-point px/tick (0 = immobile)
  radius: number; // fixed-point interaction radius
  minerals: number;
  gas: number;
  supply: number;
  buildTime: number; // ticks
  provides: number; // supply provided
  resourceType: number; // for Role.Resource nodes
  weapon: Weapon | null;
  produces: number[]; // kinds this structure can produce
};

const def = (d: Partial<UnitDef> & { name: string; roles: number }): UnitDef => ({
  size: Size.Small, hp: 0, armor: 0, sight: 0, speed: 0, radius: fx(8),
  minerals: 0, gas: 0, supply: 0, buildTime: 0, provides: 0,
  resourceType: ResourceType.Minerals, weapon: null, produces: [],
  ...d,
});

export const Units: Record<number, UnitDef> = {
  [Kind.SCV]: def({
    name: 'SCV', roles: Role.Mobile | Role.Worker, size: Size.Small,
    hp: 60, sight: 7, speed: fx(2) /* provisional */, radius: fx(8),
    minerals: 50, supply: 1, buildTime: sec(17.86),
    weapon: { damage: 5, dtype: DamageType.Normal, cooldown: 15, range: tiles(0.5) },
  }),
  [Kind.Marine]: def({
    name: 'Marine', roles: Role.Mobile, size: Size.Small,
    hp: 40, sight: 7, speed: fx(2) /* provisional */, radius: fx(8),
    minerals: 50, supply: 1, buildTime: sec(15.12),
    weapon: { damage: 6, dtype: DamageType.Normal, cooldown: 15, range: tiles(4) },
  }),
  [Kind.CommandCenter]: def({
    name: 'Command Center', roles: Role.Structure | Role.ResourceDepot | Role.Producer,
    size: Size.Large, hp: 1500, armor: 1, sight: 10, radius: fx(48),
    minerals: 400, buildTime: sec(75.6), provides: 10, produces: [Kind.SCV],
  }),
  [Kind.SupplyDepot]: def({
    name: 'Supply Depot', roles: Role.Structure, size: Size.Large,
    hp: 500, armor: 1, sight: 8, radius: fx(32), minerals: 100, buildTime: sec(25.2), provides: 8,
  }),
  [Kind.Barracks]: def({
    name: 'Barracks', roles: Role.Structure | Role.Producer, size: Size.Large,
    hp: 1000, armor: 1, sight: 10, radius: fx(40), minerals: 150, buildTime: sec(50.4),
    produces: [Kind.Marine, Kind.Firebat, Kind.Medic, Kind.Ghost],
  }),
  [Kind.Mineral]: def({
    name: 'Mineral Field', roles: Role.Resource, size: Size.Large,
    radius: fx(16), resourceType: ResourceType.Minerals,
  }),
  [Kind.Geyser]: def({
    // Inert marker (no roles): you build a Refinery on it to gather gas.
    name: 'Vespene Geyser', roles: 0, size: Size.Large, radius: fx(32), resourceType: ResourceType.Gas,
  }),
  [Kind.Refinery]: def({
    // Structure + Resource: once built it holds gas and is harvested like a patch.
    name: 'Refinery', roles: Role.Structure | Role.Resource, size: Size.Large,
    hp: 750, armor: 1, sight: 8, radius: fx(40), minerals: 75, buildTime: sec(30),
    resourceType: ResourceType.Gas,
  }),

  // ============================ TERRAN (rest) ============================
  [Kind.Firebat]: def({ name: 'Firebat', roles: Role.Mobile, size: Size.Small, hp: 50, armor: 1, sight: 7, speed: fx(2), radius: fx(8), minerals: 50, gas: 25, supply: 1, buildTime: sec(15.12), weapon: { damage: 16, dtype: DamageType.Concussive, cooldown: sec(1.05), range: tiles(2) } }),
  [Kind.Medic]: def({ name: 'Medic', roles: Role.Mobile, size: Size.Small, hp: 60, armor: 1, sight: 9, speed: fx(2), radius: fx(8), minerals: 50, gas: 25, supply: 1, buildTime: sec(18.9) }),
  [Kind.Ghost]: def({ name: 'Ghost', roles: Role.Mobile, size: Size.Medium, hp: 45, sight: 9, speed: fx(2), radius: fx(9), minerals: 25, gas: 75, supply: 1, buildTime: sec(31.5), weapon: { damage: 10, dtype: DamageType.Concussive, cooldown: sec(0.92), range: tiles(7) } }),
  [Kind.Vulture]: def({ name: 'Vulture', roles: Role.Mobile, size: Size.Small, hp: 80, sight: 8, speed: fx(3), radius: fx(9), minerals: 75, supply: 2, buildTime: sec(12.6), weapon: { damage: 20, dtype: DamageType.Concussive, cooldown: sec(1.26), range: tiles(5) } }),
  [Kind.SiegeTank]: def({ name: 'Siege Tank', roles: Role.Mobile, size: Size.Large, hp: 150, armor: 1, sight: 10, speed: fx(2), radius: fx(13), minerals: 150, gas: 100, supply: 2, buildTime: sec(31.5), weapon: { damage: 30, dtype: DamageType.Explosive, cooldown: sec(1.55), range: tiles(7) } }),
  [Kind.Goliath]: def({ name: 'Goliath', roles: Role.Mobile, size: Size.Large, hp: 125, armor: 1, sight: 8, speed: fx(2), radius: fx(12), minerals: 100, gas: 50, supply: 2, buildTime: sec(25.2), weapon: { damage: 12, dtype: DamageType.Normal, cooldown: sec(0.92), range: tiles(6) } }),
  [Kind.Wraith]: def({ name: 'Wraith', roles: Role.Mobile | Role.Air, size: Size.Large, hp: 120, sight: 7, speed: fx(3), radius: fx(11), minerals: 150, gas: 100, supply: 2, buildTime: sec(37.8), weapon: { damage: 8, dtype: DamageType.Normal, cooldown: sec(1.26), range: tiles(5) } }),
  [Kind.Dropship]: def({ name: 'Dropship', roles: Role.Mobile | Role.Air, size: Size.Large, hp: 150, armor: 1, sight: 8, speed: fx(2), radius: fx(12), minerals: 100, gas: 100, supply: 2, buildTime: sec(31.5) }),
  [Kind.ScienceVessel]: def({ name: 'Science Vessel', roles: Role.Mobile | Role.Air, size: Size.Large, hp: 200, armor: 1, sight: 10, speed: fx(2), radius: fx(12), minerals: 100, gas: 225, supply: 2, buildTime: sec(50.4) }),
  [Kind.Valkyrie]: def({ name: 'Valkyrie', roles: Role.Mobile | Role.Air, size: Size.Large, hp: 200, armor: 2, sight: 8, speed: fx(3), radius: fx(12), minerals: 250, gas: 125, supply: 3, buildTime: sec(31.5), weapon: { damage: 48, dtype: DamageType.Explosive, cooldown: sec(4), range: tiles(6) } }),
  [Kind.Battlecruiser]: def({ name: 'Battlecruiser', roles: Role.Mobile | Role.Air, size: Size.Large, hp: 500, armor: 3, sight: 11, speed: fx(1.5), radius: fx(15), minerals: 400, gas: 300, supply: 6, buildTime: sec(84), weapon: { damage: 25, dtype: DamageType.Normal, cooldown: sec(1.89), range: tiles(6) } }),
  [Kind.SpiderMine]: def({ name: 'Spider Mine', roles: Role.Mobile, size: Size.Small, hp: 20, sight: 3, speed: fx(3), radius: fx(6), weapon: { damage: 125, dtype: DamageType.Explosive, cooldown: sec(1), range: tiles(0.5) } }),

  [Kind.EngineeringBay]: def({ name: 'Engineering Bay', roles: Role.Structure, size: Size.Large, hp: 850, armor: 1, sight: 8, radius: fx(32), minerals: 125, buildTime: sec(37.8) }),
  [Kind.Bunker]: def({ name: 'Bunker', roles: Role.Structure, size: Size.Large, hp: 350, armor: 1, sight: 8, radius: fx(28), minerals: 100, buildTime: sec(18.9) }),
  [Kind.Academy]: def({ name: 'Academy', roles: Role.Structure, size: Size.Large, hp: 600, armor: 1, sight: 8, radius: fx(32), minerals: 150, buildTime: sec(50.4) }),
  [Kind.MissileTurret]: def({ name: 'Missile Turret', roles: Role.Structure, size: Size.Large, hp: 200, sight: 11, radius: fx(20), minerals: 75, buildTime: sec(18.9), weapon: { damage: 20, dtype: DamageType.Explosive, cooldown: sec(0.83), range: tiles(7) } }),
  [Kind.Factory]: def({ name: 'Factory', roles: Role.Structure | Role.Producer, size: Size.Large, hp: 1250, armor: 1, sight: 8, radius: fx(40), minerals: 200, gas: 100, buildTime: sec(50.4), produces: [Kind.Vulture, Kind.SiegeTank, Kind.Goliath] }),
  [Kind.MachineShop]: def({ name: 'Machine Shop', roles: Role.Structure, size: Size.Large, hp: 750, armor: 1, sight: 6, radius: fx(20), minerals: 50, gas: 50, buildTime: sec(25.2) }),
  [Kind.Starport]: def({ name: 'Starport', roles: Role.Structure | Role.Producer, size: Size.Large, hp: 1300, armor: 1, sight: 8, radius: fx(40), minerals: 150, gas: 100, buildTime: sec(50.4), produces: [Kind.Wraith, Kind.Dropship, Kind.ScienceVessel, Kind.Valkyrie, Kind.Battlecruiser] }),
  [Kind.ControlTower]: def({ name: 'Control Tower', roles: Role.Structure, size: Size.Large, hp: 500, armor: 1, sight: 8, radius: fx(20), minerals: 50, gas: 50, buildTime: sec(25.2) }),
  [Kind.Armory]: def({ name: 'Armory', roles: Role.Structure, size: Size.Large, hp: 750, armor: 1, sight: 8, radius: fx(32), minerals: 100, gas: 50, buildTime: sec(50.4) }),
  [Kind.ScienceFacility]: def({ name: 'Science Facility', roles: Role.Structure, size: Size.Large, hp: 850, armor: 1, sight: 10, radius: fx(40), minerals: 100, gas: 150, buildTime: sec(50.4) }),
  [Kind.PhysicsLab]: def({ name: 'Physics Lab', roles: Role.Structure, size: Size.Large, hp: 600, armor: 1, sight: 6, radius: fx(20), minerals: 50, gas: 50, buildTime: sec(25.2) }),
  [Kind.CovertOps]: def({ name: 'Covert Ops', roles: Role.Structure, size: Size.Large, hp: 750, armor: 1, sight: 6, radius: fx(20), minerals: 50, gas: 50, buildTime: sec(25.2) }),
  [Kind.ComsatStation]: def({ name: 'Comsat Station', roles: Role.Structure, size: Size.Large, hp: 500, armor: 1, sight: 10, radius: fx(20), minerals: 50, gas: 50, buildTime: sec(25.2) }),
  [Kind.NuclearSilo]: def({ name: 'Nuclear Silo', roles: Role.Structure, size: Size.Large, hp: 600, armor: 1, sight: 8, radius: fx(20), minerals: 100, gas: 100, buildTime: sec(50.4) }),

  // ============================ PROTOSS ============================
  [Kind.Probe]: def({ name: 'Probe', roles: Role.Mobile | Role.Worker, size: Size.Small, hp: 40, sight: 8, speed: fx(2), radius: fx(8), minerals: 50, supply: 1, buildTime: sec(12.6), weapon: { damage: 5, dtype: DamageType.Normal, cooldown: sec(0.92), range: tiles(0.5) } }),
  [Kind.Zealot]: def({ name: 'Zealot', roles: Role.Mobile, size: Size.Small, hp: 160, armor: 1, sight: 7, speed: fx(2), radius: fx(9), minerals: 100, supply: 2, buildTime: sec(25.2), weapon: { damage: 16, dtype: DamageType.Normal, cooldown: sec(0.92), range: tiles(0.5) } }),
  [Kind.Dragoon]: def({ name: 'Dragoon', roles: Role.Mobile, size: Size.Large, hp: 180, armor: 1, sight: 8, speed: fx(2), radius: fx(12), minerals: 125, gas: 50, supply: 2, buildTime: sec(31.5), weapon: { damage: 20, dtype: DamageType.Explosive, cooldown: sec(1.26), range: tiles(4) } }),
  [Kind.HighTemplar]: def({ name: 'High Templar', roles: Role.Mobile, size: Size.Small, hp: 80, sight: 7, speed: fx(1.5), radius: fx(9), minerals: 50, gas: 150, supply: 2, buildTime: sec(31.5) }),
  [Kind.DarkTemplar]: def({ name: 'Dark Templar', roles: Role.Mobile, size: Size.Small, hp: 120, armor: 1, sight: 7, speed: fx(2), radius: fx(9), minerals: 125, gas: 100, supply: 2, buildTime: sec(31.5), weapon: { damage: 40, dtype: DamageType.Normal, cooldown: sec(1.26), range: tiles(0.5) } }),
  [Kind.Archon]: def({ name: 'Archon', roles: Role.Mobile, size: Size.Large, hp: 360, sight: 8, speed: fx(2), radius: fx(12), supply: 4, buildTime: sec(12.6), weapon: { damage: 30, dtype: DamageType.Normal, cooldown: sec(0.83), range: tiles(2) } }),
  [Kind.DarkArchon]: def({ name: 'Dark Archon', roles: Role.Mobile, size: Size.Large, hp: 225, armor: 1, sight: 10, speed: fx(2), radius: fx(12), supply: 4, buildTime: sec(12.6) }),
  [Kind.Reaver]: def({ name: 'Reaver', roles: Role.Mobile, size: Size.Large, hp: 180, sight: 10, speed: fx(1.5), radius: fx(13), minerals: 200, gas: 100, supply: 4, buildTime: sec(44), weapon: { damage: 100, dtype: DamageType.Normal, cooldown: sec(2.5), range: tiles(8) } }),
  [Kind.Scarab]: def({ name: 'Scarab', roles: Role.Mobile, size: Size.Small, hp: 10, sight: 3, speed: fx(3), radius: fx(5), weapon: { damage: 100, dtype: DamageType.Normal, cooldown: sec(1), range: tiles(0.5) } }),
  [Kind.Observer]: def({ name: 'Observer', roles: Role.Mobile | Role.Air, size: Size.Small, hp: 40, sight: 9, speed: fx(2), radius: fx(8), minerals: 25, gas: 75, supply: 1, buildTime: sec(25.2) }),
  [Kind.Shuttle]: def({ name: 'Shuttle', roles: Role.Mobile | Role.Air, size: Size.Large, hp: 140, armor: 1, sight: 8, speed: fx(2), radius: fx(12), minerals: 200, supply: 2, buildTime: sec(37.8) }),
  [Kind.Scout]: def({ name: 'Scout', roles: Role.Mobile | Role.Air, size: Size.Large, hp: 250, sight: 8, speed: fx(3), radius: fx(12), minerals: 275, gas: 125, supply: 3, buildTime: sec(50.4), weapon: { damage: 28, dtype: DamageType.Explosive, cooldown: sec(0.92), range: tiles(4) } }),
  [Kind.Carrier]: def({ name: 'Carrier', roles: Role.Mobile | Role.Air, size: Size.Large, hp: 450, armor: 4, sight: 11, speed: fx(1.5), radius: fx(15), minerals: 350, gas: 250, supply: 6, buildTime: sec(86.4), produces: [Kind.Interceptor] }),
  [Kind.Interceptor]: def({ name: 'Interceptor', roles: Role.Mobile | Role.Air, size: Size.Small, hp: 80, sight: 6, speed: fx(3), radius: fx(6), weapon: { damage: 6, dtype: DamageType.Normal, cooldown: sec(1), range: tiles(2) } }),
  [Kind.Arbiter]: def({ name: 'Arbiter', roles: Role.Mobile | Role.Air, size: Size.Large, hp: 350, armor: 1, sight: 9, speed: fx(2), radius: fx(14), minerals: 100, gas: 350, supply: 4, buildTime: sec(100.8), weapon: { damage: 10, dtype: DamageType.Explosive, cooldown: sec(1.89), range: tiles(5) } }),
  [Kind.Corsair]: def({ name: 'Corsair', roles: Role.Mobile | Role.Air, size: Size.Medium, hp: 180, armor: 1, sight: 9, speed: fx(3), radius: fx(10), minerals: 150, gas: 100, supply: 2, buildTime: sec(25.2), weapon: { damage: 5, dtype: DamageType.Explosive, cooldown: sec(0.33), range: tiles(5) } }),

  [Kind.Nexus]: def({ name: 'Nexus', roles: Role.Structure | Role.ResourceDepot | Role.Producer, size: Size.Large, hp: 750, armor: 1, sight: 10, radius: fx(48), minerals: 400, buildTime: sec(120), provides: 10, produces: [Kind.Probe] }),
  [Kind.Pylon]: def({ name: 'Pylon', roles: Role.Structure, size: Size.Large, hp: 300, sight: 8, radius: fx(24), minerals: 100, buildTime: sec(18), provides: 8 }),
  [Kind.Assimilator]: def({ name: 'Assimilator', roles: Role.Structure | Role.Resource, size: Size.Large, hp: 450, armor: 1, sight: 8, radius: fx(40), minerals: 100, buildTime: sec(25.2), resourceType: ResourceType.Gas }),
  [Kind.Gateway]: def({ name: 'Gateway', roles: Role.Structure | Role.Producer, size: Size.Large, hp: 500, armor: 1, sight: 10, radius: fx(40), minerals: 150, buildTime: sec(37.8), produces: [Kind.Zealot, Kind.Dragoon, Kind.HighTemplar, Kind.DarkTemplar] }),
  [Kind.Forge]: def({ name: 'Forge', roles: Role.Structure, size: Size.Large, hp: 550, armor: 1, sight: 8, radius: fx(32), minerals: 150, buildTime: sec(25.2) }),
  [Kind.PhotonCannon]: def({ name: 'Photon Cannon', roles: Role.Structure, size: Size.Large, hp: 100, sight: 11, radius: fx(22), minerals: 150, buildTime: sec(31.5), weapon: { damage: 20, dtype: DamageType.Normal, cooldown: sec(0.92), range: tiles(7) } }),
  [Kind.CyberneticsCore]: def({ name: 'Cybernetics Core', roles: Role.Structure, size: Size.Large, hp: 500, armor: 1, sight: 8, radius: fx(40), minerals: 200, buildTime: sec(37.8) }),
  [Kind.ShieldBattery]: def({ name: 'Shield Battery', roles: Role.Structure, size: Size.Large, hp: 200, armor: 1, sight: 8, radius: fx(28), minerals: 100, buildTime: sec(18) }),
  [Kind.RoboticsFacility]: def({ name: 'Robotics Facility', roles: Role.Structure | Role.Producer, size: Size.Large, hp: 500, armor: 1, sight: 8, radius: fx(40), minerals: 200, gas: 200, buildTime: sec(50.4), produces: [Kind.Shuttle, Kind.Reaver, Kind.Observer] }),
  [Kind.Stargate]: def({ name: 'Stargate', roles: Role.Structure | Role.Producer, size: Size.Large, hp: 600, armor: 1, sight: 10, radius: fx(40), minerals: 150, gas: 150, buildTime: sec(44), produces: [Kind.Scout, Kind.Corsair, Kind.Carrier, Kind.Arbiter] }),
  [Kind.CitadelOfAdun]: def({ name: 'Citadel of Adun', roles: Role.Structure, size: Size.Large, hp: 450, armor: 1, sight: 8, radius: fx(32), minerals: 150, gas: 100, buildTime: sec(37.8) }),
  [Kind.TemplarArchives]: def({ name: 'Templar Archives', roles: Role.Structure, size: Size.Large, hp: 500, armor: 1, sight: 8, radius: fx(40), minerals: 150, gas: 200, buildTime: sec(44) }),
  [Kind.RoboticsSupportBay]: def({ name: 'Robotics Support Bay', roles: Role.Structure, size: Size.Large, hp: 450, armor: 1, sight: 8, radius: fx(28), minerals: 150, gas: 100, buildTime: sec(18) }),
  [Kind.Observatory]: def({ name: 'Observatory', roles: Role.Structure, size: Size.Large, hp: 250, armor: 1, sight: 8, radius: fx(28), minerals: 50, gas: 100, buildTime: sec(18) }),
  [Kind.FleetBeacon]: def({ name: 'Fleet Beacon', roles: Role.Structure, size: Size.Large, hp: 500, armor: 1, sight: 8, radius: fx(40), minerals: 300, gas: 200, buildTime: sec(37.8) }),
  [Kind.ArbiterTribunal]: def({ name: 'Arbiter Tribunal', roles: Role.Structure, size: Size.Large, hp: 500, armor: 1, sight: 8, radius: fx(40), minerals: 200, gas: 150, buildTime: sec(37.8) }),

  // ============================ ZERG ============================
  [Kind.Larva]: def({ name: 'Larva', roles: Role.Mobile, size: Size.Small, hp: 25, armor: 10, sight: 4, radius: fx(7) }),
  [Kind.Drone]: def({ name: 'Drone', roles: Role.Mobile | Role.Worker, size: Size.Small, hp: 40, sight: 7, speed: fx(2), radius: fx(8), minerals: 50, supply: 1, buildTime: sec(12.6), weapon: { damage: 5, dtype: DamageType.Normal, cooldown: sec(0.92), range: tiles(0.5) } }),
  [Kind.Overlord]: def({ name: 'Overlord', roles: Role.Mobile | Role.Air, size: Size.Large, hp: 200, sight: 9, speed: fx(1), radius: fx(13), minerals: 100, buildTime: sec(25.2), provides: 8 }),
  [Kind.Zergling]: def({ name: 'Zergling', roles: Role.Mobile, size: Size.Small, hp: 35, sight: 5, speed: fx(3), radius: fx(7), minerals: 25, supply: 1, buildTime: sec(28), weapon: { damage: 5, dtype: DamageType.Normal, cooldown: sec(0.33), range: tiles(0.5) } }),
  [Kind.Hydralisk]: def({ name: 'Hydralisk', roles: Role.Mobile, size: Size.Medium, hp: 80, sight: 6, speed: fx(2), radius: fx(10), minerals: 75, gas: 25, supply: 1, buildTime: sec(28), weapon: { damage: 10, dtype: DamageType.Explosive, cooldown: sec(0.63), range: tiles(4) } }),
  [Kind.Lurker]: def({ name: 'Lurker', roles: Role.Mobile, size: Size.Large, hp: 125, armor: 1, sight: 8, speed: fx(2), radius: fx(12), minerals: 50, gas: 100, supply: 2, buildTime: sec(40), weapon: { damage: 20, dtype: DamageType.Explosive, cooldown: sec(1.55), range: tiles(6) } }),
  [Kind.Mutalisk]: def({ name: 'Mutalisk', roles: Role.Mobile | Role.Air, size: Size.Small, hp: 120, sight: 7, speed: fx(3), radius: fx(9), minerals: 100, gas: 100, supply: 2, buildTime: sec(40), weapon: { damage: 9, dtype: DamageType.Normal, cooldown: sec(1.26), range: tiles(3) } }),
  [Kind.Scourge]: def({ name: 'Scourge', roles: Role.Mobile | Role.Air, size: Size.Small, hp: 25, sight: 5, speed: fx(3), radius: fx(6), minerals: 12, supply: 1, buildTime: sec(30), weapon: { damage: 110, dtype: DamageType.Normal, cooldown: sec(1), range: tiles(0.5) } }),
  [Kind.Guardian]: def({ name: 'Guardian', roles: Role.Mobile | Role.Air, size: Size.Large, hp: 150, armor: 2, sight: 8, speed: fx(1.5), radius: fx(13), minerals: 50, gas: 100, supply: 2, buildTime: sec(40), weapon: { damage: 20, dtype: DamageType.Normal, cooldown: sec(1.26), range: tiles(8) } }),
  [Kind.Devourer]: def({ name: 'Devourer', roles: Role.Mobile | Role.Air, size: Size.Large, hp: 250, armor: 2, sight: 8, speed: fx(2), radius: fx(13), minerals: 150, gas: 50, supply: 2, buildTime: sec(40), weapon: { damage: 25, dtype: DamageType.Explosive, cooldown: sec(4.2), range: tiles(6) } }),
  [Kind.Queen]: def({ name: 'Queen', roles: Role.Mobile | Role.Air, size: Size.Medium, hp: 120, sight: 10, speed: fx(2), radius: fx(11), minerals: 100, gas: 100, supply: 2, buildTime: sec(50) }),
  [Kind.Defiler]: def({ name: 'Defiler', roles: Role.Mobile, size: Size.Medium, hp: 80, armor: 1, sight: 10, speed: fx(2), radius: fx(10), minerals: 50, gas: 150, supply: 2, buildTime: sec(31.5) }),
  [Kind.Ultralisk]: def({ name: 'Ultralisk', roles: Role.Mobile, size: Size.Large, hp: 400, armor: 1, sight: 7, speed: fx(2), radius: fx(15), minerals: 200, gas: 200, supply: 4, buildTime: sec(60), weapon: { damage: 20, dtype: DamageType.Normal, cooldown: sec(0.63), range: tiles(0.5) } }),
  [Kind.InfestedTerran]: def({ name: 'Infested Terran', roles: Role.Mobile, size: Size.Small, hp: 60, sight: 5, speed: fx(2), radius: fx(8), minerals: 100, gas: 50, supply: 1, buildTime: sec(40), weapon: { damage: 100, dtype: DamageType.Explosive, cooldown: sec(1), range: tiles(0.5) } }),
  [Kind.Broodling]: def({ name: 'Broodling', roles: Role.Mobile, size: Size.Small, hp: 30, sight: 5, speed: fx(3), radius: fx(7), weapon: { damage: 4, dtype: DamageType.Normal, cooldown: sec(0.63), range: tiles(0.5) } }),

  [Kind.Hatchery]: def({ name: 'Hatchery', roles: Role.Structure | Role.ResourceDepot | Role.Producer, size: Size.Large, hp: 1250, armor: 1, sight: 9, radius: fx(48), minerals: 300, buildTime: sec(120), provides: 1, produces: [Kind.Drone, Kind.Overlord, Kind.Zergling, Kind.Hydralisk, Kind.Mutalisk, Kind.Queen, Kind.Scourge, Kind.Defiler, Kind.Ultralisk] }),
  [Kind.Lair]: def({ name: 'Lair', roles: Role.Structure | Role.ResourceDepot | Role.Producer, size: Size.Large, hp: 1800, armor: 1, sight: 10, radius: fx(48), gas: 100, buildTime: sec(100), provides: 1, produces: [Kind.Drone, Kind.Overlord, Kind.Zergling, Kind.Hydralisk, Kind.Mutalisk, Kind.Queen] }),
  [Kind.Hive]: def({ name: 'Hive', roles: Role.Structure | Role.ResourceDepot | Role.Producer, size: Size.Large, hp: 2500, armor: 1, sight: 10, radius: fx(48), gas: 150, buildTime: sec(120), provides: 1, produces: [Kind.Drone, Kind.Overlord, Kind.Zergling, Kind.Hydralisk, Kind.Mutalisk, Kind.Ultralisk, Kind.Defiler] }),
  [Kind.CreepColony]: def({ name: 'Creep Colony', roles: Role.Structure, size: Size.Large, hp: 400, sight: 8, radius: fx(28), minerals: 75, buildTime: sec(20) }),
  [Kind.SunkenColony]: def({ name: 'Sunken Colony', roles: Role.Structure, size: Size.Large, hp: 300, armor: 2, sight: 10, radius: fx(28), buildTime: sec(20), weapon: { damage: 40, dtype: DamageType.Explosive, cooldown: sec(1.3), range: tiles(7) } }),
  [Kind.SporeColony]: def({ name: 'Spore Colony', roles: Role.Structure, size: Size.Large, hp: 400, sight: 10, radius: fx(28), buildTime: sec(20), weapon: { damage: 15, dtype: DamageType.Normal, cooldown: sec(0.63), range: tiles(7) } }),
  [Kind.SpawningPool]: def({ name: 'Spawning Pool', roles: Role.Structure, size: Size.Large, hp: 750, sight: 8, radius: fx(32), minerals: 200, buildTime: sec(65) }),
  [Kind.EvolutionChamber]: def({ name: 'Evolution Chamber', roles: Role.Structure, size: Size.Large, hp: 750, sight: 8, radius: fx(32), minerals: 75, buildTime: sec(25) }),
  [Kind.HydraliskDen]: def({ name: 'Hydralisk Den', roles: Role.Structure, size: Size.Large, hp: 850, sight: 8, radius: fx(32), minerals: 100, gas: 50, buildTime: sec(25) }),
  [Kind.Extractor]: def({ name: 'Extractor', roles: Role.Structure | Role.Resource, size: Size.Large, hp: 750, sight: 8, radius: fx(40), minerals: 50, buildTime: sec(25), resourceType: ResourceType.Gas }),
  [Kind.Spire]: def({ name: 'Spire', roles: Role.Structure, size: Size.Large, hp: 600, sight: 8, radius: fx(32), minerals: 200, gas: 150, buildTime: sec(75) }),
  [Kind.GreaterSpire]: def({ name: 'Greater Spire', roles: Role.Structure, size: Size.Large, hp: 1000, sight: 8, radius: fx(32), minerals: 100, gas: 150, buildTime: sec(120) }),
  [Kind.QueensNest]: def({ name: "Queen's Nest", roles: Role.Structure, size: Size.Large, hp: 850, sight: 8, radius: fx(32), minerals: 150, gas: 100, buildTime: sec(50) }),
  [Kind.NydusCanal]: def({ name: 'Nydus Canal', roles: Role.Structure, size: Size.Large, hp: 250, sight: 8, radius: fx(28), minerals: 150, buildTime: sec(40) }),
  [Kind.UltraliskCavern]: def({ name: 'Ultralisk Cavern', roles: Role.Structure, size: Size.Large, hp: 600, sight: 8, radius: fx(32), minerals: 150, gas: 200, buildTime: sec(65) }),
  [Kind.DefilerMound]: def({ name: 'Defiler Mound', roles: Role.Structure, size: Size.Large, hp: 850, armor: 1, sight: 8, radius: fx(32), minerals: 100, gas: 100, buildTime: sec(60) }),
};

/** Effective damage of one hit: type×size multiplier, then flat armor, min 1. */
export const computeDamage = (w: Weapon, targetSize: number, targetArmor: number): number => {
  const pct = DAMAGE_MULT[w.dtype]![targetSize]!;
  const raw = Math.trunc((w.damage * pct) / 100);
  return Math.max(1, raw - targetArmor);
};

// ---- faction descriptor: race-specific data, not race-specific code. ----
export type Faction = {
  name: string;
  worker: number;
  depot: number; // starting resource depot
  startWorkers: number;
  supplyStructure: number; // built to raise the supply cap
  armyStructure: number; // produces army
  armyUnit: number; // the basic army unit
};

// ---- economy / combat tunables (provisional) ----
export const MINE_AMOUNT = 8;
export const MINE_TICKS = sec(2);
export const MINE_RANGE = fx(20);
export const MAX_PER_PATCH = 3; // ceiling for the timing-derived patch saturation cap
export const DEPOSIT_RANGE = fx(48);
export const BUILD_RANGE = fx(28); // worker "at the construction site" radius
export const START_MINERALS = 50;
export const START_WORKERS = 4;
export const MAX_QUEUE = 5;
export const SUPPLY_CAP = 200;
export const PATCH_AMOUNT = 1500;
export const GAS_AMOUNT = 5000; // gas a Refinery yields once built on a geyser

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
