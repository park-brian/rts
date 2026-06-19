// Game data tables + tunable constants. The simulation systems are generic: they
// reason about roles, weapons, requirements, and defs declared here, not specific
// unit kinds. Race-specific complexity should enter as data first; mechanics that
// truly differ (larva, creep, power, add-ons, spells) get explicit engine support.

import {
  bwRange,
  Kind,
  SUPPLY_SCALE,
  tiles,
} from './core.ts';
import { HarvestRangePx } from './weapons.ts';
import { fx } from '../fixed.ts';

export * from './abilities.ts';
export * from './core.ts';
export * from './tech.ts';
export * from './units.ts';
export * from './weapons.ts';

export const CLOAK_AURA_RADIUS = tiles(6);

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
