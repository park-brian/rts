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
  footprintW: number; // build-tile footprint width for placement/solidity
  footprintH: number; // build-tile footprint height for placement/solidity
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
  footprintW: 1, footprintH: 1,
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
    footprintW: 4, footprintH: 3, minerals: 400, buildTime: sec(75.6), provides: 10, produces: [Kind.SCV],
  }),
  [Kind.SupplyDepot]: def({
    name: 'Supply Depot', roles: Role.Structure, size: Size.Large,
    hp: 500, armor: 1, sight: 8, radius: fx(32), footprintW: 3, footprintH: 2,
    minerals: 100, buildTime: sec(25.2), provides: 8,
  }),
  [Kind.Barracks]: def({
    name: 'Barracks', roles: Role.Structure | Role.Producer, size: Size.Large,
    hp: 1000, armor: 1, sight: 10, radius: fx(40), footprintW: 4, footprintH: 3,
    minerals: 150, buildTime: sec(50.4),
    produces: [Kind.Marine],
  }),
  [Kind.Mineral]: def({
    name: 'Mineral Field', roles: Role.Resource, size: Size.Large,
    radius: fx(16), footprintW: 1, footprintH: 1, resourceType: ResourceType.Minerals,
  }),
  [Kind.Geyser]: def({
    // Inert marker (no roles): you build a Refinery on it to gather gas.
    name: 'Vespene Geyser', roles: 0, size: Size.Large, radius: fx(32),
    footprintW: 3, footprintH: 2, resourceType: ResourceType.Gas,
  }),
  [Kind.Refinery]: def({
    // Structure + Resource: once built it holds gas and is harvested like a patch.
    name: 'Refinery', roles: Role.Structure | Role.Resource, size: Size.Large,
    hp: 750, armor: 1, sight: 8, radius: fx(40), footprintW: 3, footprintH: 2,
    minerals: 75, buildTime: sec(30),
    resourceType: ResourceType.Gas,
  }),
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
