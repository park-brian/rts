import type { KindT } from './types.ts';
import { Kind } from './types.ts';

// µRTS-style unit stats (APPROXIMATE defaults, not a bit-exact port). Durations
// are in frames. Distances are integer; attack range is compared in squared
// Euclidean units so melee (range 1) is orthogonal-only, ranged (3) reaches.
export type UnitDef = {
  name: string;
  symbol: string; // for the ASCII renderer
  hp: number;
  cost: number;
  damage: number;
  attackRange: number; // tiles (Euclidean)
  moveTime: number;
  attackTime: number;
  harvestTime: number;
  returnTime: number;
  produceTime: number; // frames to build ONE of this unit
  canMove: boolean;
  canHarvest: boolean;
  produces: KindT[]; // what this unit can build/train
  isResource: boolean;
};

const D = (d: Partial<UnitDef> & { name: string; symbol: string }): UnitDef => ({
  hp: 1, cost: 1, damage: 0, attackRange: 1,
  moveTime: 10, attackTime: 5, harvestTime: 20, returnTime: 10, produceTime: 10,
  canMove: false, canHarvest: false, produces: [], isResource: false,
  ...d,
});

export const UNITS: Record<number, UnitDef> = {
  [Kind.Resource]: D({ name: 'Resource', symbol: '#', hp: 1, isResource: true }),
  [Kind.Base]: D({ name: 'Base', symbol: 'B', hp: 10, cost: 10, produceTime: 250, produces: [Kind.Worker] }),
  [Kind.Barracks]: D({ name: 'Barracks', symbol: 'R', hp: 4, cost: 5, produceTime: 200, produces: [Kind.Light, Kind.Heavy, Kind.Ranged] }),
  [Kind.Worker]: D({
    name: 'Worker', symbol: 'w', hp: 1, cost: 1, damage: 1, attackRange: 1,
    moveTime: 10, attackTime: 5, produceTime: 50, canMove: true, canHarvest: true,
    produces: [Kind.Base, Kind.Barracks],
  }),
  [Kind.Light]: D({ name: 'Light', symbol: 'l', hp: 4, cost: 2, damage: 2, attackRange: 1, moveTime: 8, produceTime: 80, canMove: true }),
  [Kind.Heavy]: D({ name: 'Heavy', symbol: 'h', hp: 4, cost: 3, damage: 4, attackRange: 1, moveTime: 12, produceTime: 120, canMove: true }),
  [Kind.Ranged]: D({ name: 'Ranged', symbol: 'r', hp: 1, cost: 2, damage: 1, attackRange: 3, moveTime: 10, produceTime: 100, canMove: true }),
};

export const HARVEST_AMOUNT = 1;
export const def = (k: number): UnitDef => UNITS[k]!;
