// The tick pipeline: ordered systems over world state. Order is fixed (and thus
// deterministic). See docs/specs/architecture.md §4.

import type { State } from './world.ts';
import type { CommandResult, PlayerCommands } from './commands.ts';
import { census } from './systems/census.ts';
import { applyCommands } from './systems/ingest.ts';
import { construction } from './systems/construction.ts';
import { production } from './systems/production.ts';
import { research } from './systems/research.ts';
import { harvest } from './systems/harvest.ts';
import { abilities } from './systems/abilities.ts';
import { repair } from './systems/repair.ts';
import { mines } from './systems/mines.ts';
import { combat } from './systems/combat.ts';
import { movement } from './systems/movement.ts';
import { cargo } from './systems/cargo.ts';
import { collide } from './systems/collision.ts';
import { vision } from './systems/vision.ts';
import { victory } from './systems/victory.ts';
import { buildGrid } from './grid.ts';
import { prepareNav } from './flow.ts';
import { updateCloakAuras } from './detection.ts';

export const stepWorld = (s: State, batch: PlayerCommands[]): CommandResult[] => {
  if (s.result.over) return []; // frozen once decided
  census(s); // derive supply used/cap
  updateCloakAuras(s); // derived, but command validation needs current aura cloak
  const results = applyCommands(s, batch);
  construction(s);
  production(s);
  research(s);
  prepareNav(s); // refresh building footprints for pathing (after new structures appear)
  harvest(s);
  abilities(s);
  repair(s);
  const grid = buildGrid(s); // spatial index for target acquisition + collision
  mines(s);
  combat(s, grid);
  movement(s);
  cargo(s);
  collide(s); // builds its own fine (one-tile) grid for tight overlap resolution
  if (s.trackVision) vision(s); // per-player fog (derived; for observe()/rendering)
  victory(s);
  s.tick++;
  return results;
};
