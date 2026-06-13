// The tick pipeline: ordered systems over world state. Order is fixed (and thus
// deterministic). See docs/specs/architecture.md §4.

import type { State } from './world.ts';
import type { PlayerCommands } from './commands.ts';
import { applyCommands } from './systems/ingest.ts';
import { production } from './systems/production.ts';
import { harvest } from './systems/harvest.ts';
import { movement } from './systems/movement.ts';

export const stepWorld = (s: State, batch: PlayerCommands[]): void => {
  applyCommands(s, batch);
  production(s);
  harvest(s);
  movement(s);
  s.tick++;
};
