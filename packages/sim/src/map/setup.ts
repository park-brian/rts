// Match setup: build the initial world from a map + per-player factions — neutral
// resources, then each player's depot + starting workers (auto-mining). Faction-
// driven, so it is not specific to any race.

import type { MapDef } from './core.ts';
import { resourceSpawnCenterPx } from './core.ts';
import type { State } from '../entity/world.ts';
import { makeState, slotOf, eid, NEUTRAL, NONE } from '../entity/world.ts';
import { spawnUnit } from '../entity/factory.ts';
import { Kind, Order, TILE, START_MINERALS, Terran, Units, isLarvaSourceKind, type Faction } from '../data/index.ts';
import { census } from '../systems/census.ts';
import { pickPatch } from '../mechanics/resources.ts';
import { fx } from '../fixed.ts';

const tilePx = (t: number): number => fx(t * TILE + (TILE >> 1)); // tile center

export const setupMatch = (
  map: MapDef,
  playerCount: number,
  seed: number,
  factions?: Faction[],
  teams?: readonly number[],
): State => {
  const s = makeState(map, playerCount, seed);
  const e = s.e;

  // Neutral resources: mineral patches and (inert) vespene geysers.
  for (const r of map.resources) {
    const p = resourceSpawnCenterPx(r);
    const id = spawnUnit(s, r.gas ? Kind.Geyser : Kind.Mineral, NEUTRAL, fx(p.x), fx(p.y));
    if (!r.gas) e.cargo[slotOf(id)] = r.amount;
  }

  // Teams from explicit setup, then the map, else each player on their own team.
  for (let p = 0; p < playerCount; p++) s.teams[p] = teams?.[p] ?? map.teams[p] ?? p;

  // Players: depot + workers, per faction.
  for (let p = 0; p < playerCount; p++) {
    const faction = factions?.[p] ?? Terran;
    const loc = map.starts[p % map.starts.length]!;
    const cx = tilePx(loc.x);
    const cy = tilePx(loc.y);
    const depot = slotOf(spawnUnit(s, faction.depot, p, cx, cy));
    s.players.minerals[p] = START_MINERALS;

    if (isLarvaSourceKind(faction.depot)) {
      spawnUnit(s, faction.supplyStructure, p, cx + fx(80), cy - fx(80));
      for (const dx of [-32, 0, 32]) spawnUnit(s, Kind.Larva, p, cx + fx(dx), cy + fx(28 + (dx === 0 ? 8 : 0)));
    }

    const speed = Units[faction.worker]!.speed;
    for (let w = 0; w < faction.startWorkers; w++) {
      // Horizontal-only spread so a N/S-mirrored map stays perfectly symmetric.
      const dx = fx((w - (faction.startWorkers - 1) / 2) * 14);
      const slot = slotOf(spawnUnit(s, faction.worker, p, cx + dx, cy));
      const node = pickPatch(s, slot, p, speed); // spread across the line (fewest-miners-first)
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
