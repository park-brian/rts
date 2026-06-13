// The tick pipeline: ordered systems over world state. Order is fixed (and thus
// deterministic). See docs/specs/architecture.md §4.

import type { State } from './world.ts';
import type { PlayerCommands } from './commands.ts';
import { census } from './systems/census.ts';
import { applyCommands } from './systems/ingest.ts';
import { construction } from './systems/construction.ts';
import { production } from './systems/production.ts';
import { harvest } from './systems/harvest.ts';
import { combat } from './systems/combat.ts';
import { movement } from './systems/movement.ts';
import { collide } from './systems/collision.ts';
import { vision } from './systems/vision.ts';
import { victory } from './systems/victory.ts';
import { buildGrid } from './grid.ts';
import { prepareNav } from './flow.ts';

export const stepWorld = (s: State, batch: PlayerCommands[]): void => {
  if (s.result.over) return; // frozen once decided
  census(s); // derive supply used/cap
  applyCommands(s, batch);
  construction(s);
  production(s);
  prepareNav(s); // refresh building footprints for pathing (after new structures appear)
  harvest(s);
  const grid = buildGrid(s); // spatial index for target acquisition + collision
  combat(s, grid);
  movement(s);
  collide(s, grid);
  if (s.trackVision) vision(s); // per-player fog (derived; for observe()/rendering)
  victory(s);
  s.tick++;
};
