// Match setup: build the initial world from a map + per-player factions — neutral
// resources, then each player's depot + starting workers (auto-mining). Faction-
// driven, so it is not specific to any race.

import type { MapDef } from './map.ts';
import type { State } from './world.ts';
import { makeState, slotOf, eid, nearest, NEUTRAL, NONE } from './world.ts';
import { spawnUnit } from './factory.ts';
import { Kind, Order, Role, TILE, START_MINERALS, Terran, type Faction } from './data.ts';
import { census } from './systems/census.ts';
import { fx } from './fixed.ts';

const tilePx = (t: number): number => fx(t * TILE + (TILE >> 1)); // tile center

export const setupMatch = (
  map: MapDef,
  playerCount: number,
  seed: number,
  factions?: Faction[],
): State => {
  const s = makeState(map, playerCount, seed);
  const e = s.e;

  // Neutral resources.
  for (const r of map.resources) {
    if (r.gas) continue; // gas not in the slice yet
    const id = spawnUnit(s, Kind.Mineral, NEUTRAL, tilePx(r.x), tilePx(r.y));
    e.cargo[slotOf(id)] = r.amount;
  }

  // Players: depot + workers, per faction.
  for (let p = 0; p < playerCount; p++) {
    const faction = factions?.[p] ?? Terran;
    const loc = map.starts[p % map.starts.length]!;
    const cx = tilePx(loc.x);
    const cy = tilePx(loc.y);
    spawnUnit(s, faction.depot, p, cx, cy);
    s.players.minerals[p] = START_MINERALS;

    for (let w = 0; w < faction.startWorkers; w++) {
      // Horizontal-only spread so a N/S-mirrored map stays perfectly symmetric.
      const dx = fx((w - (faction.startWorkers - 1) / 2) * 14);
      const id = spawnUnit(s, faction.worker, p, cx + dx, cy);
      const slot = slotOf(id);
      const node = nearest(s, cx, cy, (sl) => (e.flags[sl]! & Role.Resource) !== 0);
      if (node !== NONE) {
        e.order[slot] = Order.Harvest;
        e.target[slot] = eid(e, node);
      }
    }
  }

  // Record how many distinct teams started (victory needs >= 2).
  const seen = new Set<number>();
  for (let p = 0; p < playerCount; p++) seen.add(s.teams[p]!);
  s.startTeams = seen.size;

  census(s); // derive initial supply
  return s;
};
