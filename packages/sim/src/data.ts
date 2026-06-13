// Game data tables + tunable constants. The simulation systems are generic: they
// reason about *roles* (capabilities) declared here, never about specific unit
// kinds. Adding a unit — or a whole race — is data, not new system code.
//
// Values trace back to docs/specs/sc1-spec.md (Terran subset for the slice). A few
// (movement speeds, mining cadence) are provisional and flagged.

import { fx } from './fixed.ts';

export const TILE = 32; // pixels per build tile
export const FPS = 24; // logical ticks/sec (SC1 "Fastest" ≈ 23.81; rounded for the slice)

/** seconds -> integer ticks. */
export const sec = (s: number): number => Math.round(s * FPS);

// ---- entity kinds: a flat registry of types. Systems must NOT branch on these;
// they branch on Role flags. Kinds exist for data tables, spawning, and rendering.
export const Kind = {
  None: 0,
  Mineral: 1,
  CommandCenter: 2,
  SCV: 3,
  SupplyDepot: 4,
} as const;
export type Kind = (typeof Kind)[keyof typeof Kind];

// ---- unit/structure orders ----
export const Order = {
  Idle: 0,
  Move: 1,
  Harvest: 2,
} as const;
export type Order = (typeof Order)[keyof typeof Order];

// ---- capability flags (race-agnostic). A unit def declares what it *can do*. ----
export const Role = {
  Mobile: 1 << 0, // can move
  Structure: 1 << 1, // a building
  Worker: 1 << 2, // can harvest resources
  ResourceDepot: 1 << 3, // workers deposit resources here
  Resource: 1 << 4, // a harvestable node
  Producer: 1 << 5, // can produce units
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const ResourceType = { Minerals: 0, Gas: 1 } as const;
export type ResourceType = (typeof ResourceType)[keyof typeof ResourceType];

export type UnitDef = {
  name: string;
  roles: number; // bitwise-OR of Role.*
  hp: number;
  sight: number; // tiles
  speed: number; // fixed-point px/tick (0 = immobile)
  radius: number; // fixed-point interaction radius
  minerals: number;
  gas: number;
  supply: number; // supply consumed
  buildTime: number; // ticks
  provides: number; // supply provided
  resourceType: number; // for Role.Resource nodes (else ignored)
};

const def = (d: Partial<UnitDef> & { name: string; roles: number }): UnitDef => ({
  hp: 0, sight: 0, speed: 0, radius: fx(8),
  minerals: 0, gas: 0, supply: 0, buildTime: 0, provides: 0, resourceType: ResourceType.Minerals,
  ...d,
});

export const Units: Record<number, UnitDef> = {
  [Kind.SCV]: def({
    name: 'SCV', roles: Role.Mobile | Role.Worker,
    hp: 60, sight: 7, speed: fx(2) /* provisional */, radius: fx(8),
    minerals: 50, supply: 1, buildTime: sec(17.86),
  }),
  [Kind.CommandCenter]: def({
    name: 'Command Center', roles: Role.Structure | Role.ResourceDepot | Role.Producer,
    hp: 1500, sight: 10, radius: fx(48), minerals: 400, buildTime: sec(75.6), provides: 10,
  }),
  [Kind.SupplyDepot]: def({
    name: 'Supply Depot', roles: Role.Structure,
    hp: 500, sight: 8, radius: fx(32), minerals: 100, buildTime: sec(25.2), provides: 8,
  }),
  [Kind.Mineral]: def({
    name: 'Mineral Field', roles: Role.Resource,
    radius: fx(16), resourceType: ResourceType.Minerals,
  }),
};

// ---- faction descriptor: the data that says "this race's worker/depot are X". ----
export type Faction = {
  name: string;
  worker: number; // worker kind
  depot: number; // starting resource-depot kind
  startWorkers: number;
};

// ---- economy / tunables (provisional) ----
export const MINE_AMOUNT = 8; // resources per trip
export const MINE_TICKS = sec(2); // time at the node per trip
export const MINE_RANGE = fx(20); // "at the node" radius
export const DEPOSIT_RANGE = fx(48); // "at the depot" radius
export const START_MINERALS = 50;
export const START_WORKERS = 4;
export const MAX_QUEUE = 5; // production queue depth per structure
export const SUPPLY_CAP = 200;
export const PATCH_AMOUNT = 1500;

export const Terran: Faction = {
  name: 'Terran', worker: Kind.SCV, depot: Kind.CommandCenter, startWorkers: START_WORKERS,
};
