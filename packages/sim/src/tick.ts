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
import { separation } from './systems/separation.ts';
import { victory } from './systems/victory.ts';
import { buildGrid } from './grid.ts';

export const stepWorld = (s: State, batch: PlayerCommands[]): void => {
  if (s.result.over) return; // frozen once decided
  census(s); // derive supply used/cap
  applyCommands(s, batch);
  construction(s);
  production(s);
  harvest(s);
  const grid = buildGrid(s); // spatial index for target acquisition + separation
  combat(s, grid);
  movement(s);
  separation(s, grid);
  victory(s);
  s.tick++;
};
