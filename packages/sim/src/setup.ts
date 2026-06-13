// Match setup: build the initial world from a map — neutral resources, then each
// player's command center + starting workers (auto-mining).

import type { MapDef } from './map.ts';
import type { State } from './world.ts';
import { makeState, spawn, slotOf, eid, nearest, NONE } from './world.ts';
import { Kind, Order, Units, TILE, START_MINERALS, START_WORKERS } from './data.ts';
import { fx } from './fixed.ts';

const NEUTRAL = 255;
const tilePx = (t: number): number => fx(t * TILE + (TILE >> 1)); // tile center

export const setupMatch = (map: MapDef, playerCount: number, seed: number): State => {
  const s = makeState(map, playerCount, seed);
  const e = s.e;

  // Neutral resources.
  for (const r of map.resources) {
    if (r.gas) continue; // gas not in the slice yet
    const id = spawn(s, Kind.Mineral, NEUTRAL, tilePx(r.x), tilePx(r.y), 0);
    e.cargo[slotOf(id)] = r.amount;
  }

  // Players: command center + workers.
  for (let p = 0; p < playerCount; p++) {
    const loc = map.starts[p % map.starts.length]!;
    const ccx = tilePx(loc.x);
    const ccy = tilePx(loc.y);
    spawn(s, Kind.CommandCenter, p, ccx, ccy, Units[Kind.CommandCenter]!.hp);
    s.players.minerals[p] = START_MINERALS;
    s.players.supplyMax[p] = Units[Kind.CommandCenter]!.provides;

    for (let w = 0; w < START_WORKERS; w++) {
      // Horizontal-only spread so a N/S-mirrored map stays perfectly symmetric.
      const dx = fx((w - (START_WORKERS - 1) / 2) * 14);
      const id = spawn(s, Kind.SCV, p, ccx + dx, ccy, Units[Kind.SCV]!.hp);
      const slot = slotOf(id);
      const patch = nearest(s, ccx, ccy, (sl) => e.kind[sl] === Kind.Mineral);
      if (patch !== NONE) {
        e.order[slot] = Order.Harvest;
        e.target[slot] = eid(e, patch);
      }
      s.players.supplyUsed[p] = s.players.supplyUsed[p]! + Units[Kind.SCV]!.supply;
    }
  }
  return s;
};
