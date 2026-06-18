// Game-data-aware entity creation. Keeps world.ts a generic store: this layer
// knows the unit registry and stamps hp + role flags from the def.

import type { State } from './world.ts';
import { NONE, slotOf, spawn, trySpawn } from './world.ts';
import { Kind, Units } from './data.ts';
import { upgradedEnergyMax } from './derived.ts';
import { refillInternalProduct } from './internal-products.ts';

/** Spawn an entity of `kind`, applying its def's hp and role flags. */
export const spawnUnit = (
  s: State,
  kind: number,
  owner: number,
  x: number,
  y: number,
): number => {
  const d = Units[kind]!;
  const id = spawn(s, kind, owner, x, y, d.hp, d.roles, d.shields, d.energyMax, d.startEnergy);
  const slot = slotOf(id);
  s.e.energyMax[slot] = upgradedEnergyMax(s, slot, s.e.energyMax[slot]!);
  refillInternalProduct(s, slot, Kind.SpiderMine);
  return id;
};

export const trySpawnUnit = (
  s: State,
  kind: number,
  owner: number,
  x: number,
  y: number,
): number => {
  const d = Units[kind]!;
  const id = trySpawn(s, kind, owner, x, y, d.hp, d.roles, d.shields, d.energyMax, d.startEnergy);
  if (id === NONE) return NONE;
  const slot = slotOf(id);
  s.e.energyMax[slot] = upgradedEnergyMax(s, slot, s.e.energyMax[slot]!);
  refillInternalProduct(s, slot, Kind.SpiderMine);
  return id;
};
