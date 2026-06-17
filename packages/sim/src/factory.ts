// Game-data-aware entity creation. Keeps world.ts a generic store: this layer
// knows the unit registry and stamps hp + role flags from the def.

import type { State } from './world.ts';
import { slotOf, spawn } from './world.ts';
import { Kind, SPIDER_MINE_CHARGES, Tech, Units } from './data.ts';
import { upgradedEnergyMax } from './derived.ts';
import { getTechLevel } from './tech.ts';

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
  if (kind === Kind.Vulture && getTechLevel(s, owner, Tech.SpiderMines) > 0) {
    s.e.specialAmmo[slot] = SPIDER_MINE_CHARGES;
  }
  return id;
};
