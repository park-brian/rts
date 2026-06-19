// The tick pipeline: ordered systems over world state. Order is fixed (and thus
// deterministic). See docs/specs/architecture.md §4.

import type { State } from './entity/world.ts';
import type { CommandResult, PlayerCommands } from './commands/types.ts';
import { census } from './systems/census.ts';
import { applyCommands } from './commands/ingest.ts';
import { construction } from './systems/construction.ts';
import { production } from './systems/production/index.ts';
import { research } from './systems/research.ts';
import { harvest } from './systems/harvest.ts';
import { abilities } from './systems/abilities.ts';
import { repair } from './systems/repair.ts';
import { mines } from './systems/mines.ts';
import { combat } from './systems/combat.ts';
import { scarabs } from './systems/scarabs.ts';
import { interceptors } from './systems/interceptors.ts';
import { movement } from './systems/movement.ts';
import { cargo } from './systems/cargo.ts';
import { collide } from './systems/collision.ts';
import { settleMovement } from './systems/settle.ts';
import { vision } from './systems/vision.ts';
import { victory } from './systems/victory.ts';
import { buildGrid } from './grid.ts';
import { prepareNav } from './flow.ts';
import { prepareLocalAvoidance } from './local-avoidance.ts';
import { updateCloakAuras } from './detection.ts';

// Several systems use module-local scratch for speed. Parallelism should come
// from Workers/processes stepping independent sims, not nested/interleaved calls
// in one JS module instance.
let stepping = false;

export const stepWorld = (s: State, batch: PlayerCommands[]): CommandResult[] => {
  if (stepping) throw new Error('stepWorld is non-reentrant');
  stepping = true;
  try {
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
    prepareLocalAvoidance(s); // common pre-move body snapshot for local steering
    combat(s, grid);
    scarabs(s);
    interceptors(s);
    movement(s);
    cargo(s);
    collide(s); // builds its own fine (one-tile) grid for tight overlap resolution
    settleMovement(s);
    if (s.trackVision) vision(s); // per-player fog (derived; for observe()/rendering)
    victory(s);
    s.tick++;
    return results;
  } finally {
    stepping = false;
  }
};
