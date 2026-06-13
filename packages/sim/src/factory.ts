// Game-data-aware entity creation. Keeps world.ts a generic store: this layer
// knows the unit registry and stamps hp + role flags from the def.

import type { State } from './world.ts';
import { spawn } from './world.ts';
import { Units } from './data.ts';

/** Spawn an entity of `kind`, applying its def's hp and role flags. */
export const spawnUnit = (
  s: State,
  kind: number,
  owner: number,
  x: number,
  y: number,
): number => {
  const d = Units[kind]!;
  return spawn(s, kind, owner, x, y, d.hp, d.roles);
};
