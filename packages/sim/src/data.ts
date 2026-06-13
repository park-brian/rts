// Game data tables + tunable constants. Values trace back to docs/specs/sc1-spec.md
// (Terran subset for the vertical slice). Times are converted to integer ticks.
//
// NOTE: a handful of values (movement speeds, mining cadence) are provisional and
// flagged; they'll be calibrated to exact SC1 frame data as the slice matures.

import { fx } from './fixed.ts';

export const TILE = 32; // pixels per build tile
export const FPS = 24; // logical ticks/sec (SC1 "Fastest" ≈ 23.81; rounded for the slice)

/** seconds -> integer ticks. */
export const sec = (s: number): number => Math.round(s * FPS);

// ---- entity kinds (no TS enum: erasable const object + union type) ----
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

export type UnitDef = {
  name: string;
  hp: number; // integer hit points
  sight: number; // tiles
  speed: number; // fixed-point px/tick (0 = immobile)
  radius: number; // fixed-point interaction radius
  minerals: number;
  gas: number;
  supply: number; // supply consumed
  buildTime: number; // ticks
  provides: number; // supply provided
};

export const Units: Record<number, UnitDef> = {
  [Kind.SCV]: {
    name: 'SCV', hp: 60, sight: 7, speed: fx(2) /* provisional */, radius: fx(8),
    minerals: 50, gas: 0, supply: 1, buildTime: sec(17.86), provides: 0,
  },
  [Kind.CommandCenter]: {
    name: 'Command Center', hp: 1500, sight: 10, speed: 0, radius: fx(48),
    minerals: 400, gas: 0, supply: 0, buildTime: sec(75.6), provides: 10,
  },
  [Kind.SupplyDepot]: {
    name: 'Supply Depot', hp: 500, sight: 8, speed: 0, radius: fx(32),
    minerals: 100, gas: 0, supply: 0, buildTime: sec(25.2), provides: 8,
  },
  [Kind.Mineral]: {
    name: 'Mineral Field', hp: 0, sight: 0, speed: 0, radius: fx(16),
    minerals: 0, gas: 0, supply: 0, buildTime: 0, provides: 0,
  },
};

// ---- economy / tunables (provisional) ----
export const MINE_AMOUNT = 8; // minerals per trip
export const MINE_TICKS = sec(2); // time at the patch per trip
export const MINE_RANGE = fx(20); // "at the patch" radius
export const DEPOSIT_RANGE = fx(48); // "at the command center" radius
export const START_MINERALS = 50;
export const START_WORKERS = 4;
export const MAX_QUEUE = 5; // production queue depth per structure
export const PATCH_AMOUNT = 1500;
