// Harvest: the worker economy state machine, entirely role-driven (no unit kinds).
// A harvesting worker cycles:
//   go to node -> mine (timer) -> carry -> go to a resource depot -> deposit -> repeat.
// Phase is derived from cargo + proximity + timer, so it needs no extra column.

import type { State } from '../world.ts';
import { slotOf, eid, nearest, kill, isAlive, NONE } from '../world.ts';
import { Order, Role, ResourceType, Units, MINE_AMOUNT, MINE_TICKS, MINE_RANGE, DEPOSIT_RANGE } from '../data.ts';
import { moveToward, within } from './move.ts';

export const harvest = (s: State): void => {
  const e = s.e;

  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || (e.flags[i]! & Role.Worker) === 0 || e.order[i] !== Order.Harvest) continue;
    const owner = e.owner[i]!;
    const speed = Units[e.kind[i]!]!.speed;

    if (e.cargo[i]! > 0) {
      // Returning: deliver to the nearest owned resource depot.
      const depot = nearest(s, e.x[i]!, e.y[i]!, (sl) => (e.flags[sl]! & Role.ResourceDepot) !== 0 && e.owner[sl] === owner);
      if (depot === NONE) {
        e.order[i] = Order.Idle;
        continue;
      }
      if (within(e, i, e.x[depot]!, e.y[depot]!, DEPOSIT_RANGE)) {
        const pool = e.cargoType[i]! === ResourceType.Gas ? s.players.gas : s.players.minerals;
        pool[owner] = pool[owner]! + e.cargo[i]!;
        e.cargo[i] = 0;
        e.timer[i] = 0;
        if (!isResource(e, e.target[i]!)) {
          const np = nearest(s, e.x[i]!, e.y[i]!, (sl) => (e.flags[sl]! & Role.Resource) !== 0);
          e.target[i] = np === NONE ? NONE : eid(e, np);
        }
      } else {
        moveToward(e, i, e.x[depot]!, e.y[depot]!, speed);
      }
      continue;
    }

    // Going to mine.
    if (!isResource(e, e.target[i]!)) {
      const np = nearest(s, e.x[i]!, e.y[i]!, (sl) => (e.flags[sl]! & Role.Resource) !== 0);
      if (np === NONE) {
        e.order[i] = Order.Idle;
        e.target[i] = NONE;
        continue;
      }
      e.target[i] = eid(e, np);
    }
    const node = slotOf(e.target[i]!);
    if (within(e, i, e.x[node]!, e.y[node]!, MINE_RANGE)) {
      if (e.timer[i]! === 0) {
        e.timer[i] = MINE_TICKS; // begin mining
      } else {
        e.timer[i] = e.timer[i]! - 1;
        if (e.timer[i]! === 0) {
          const taken = Math.min(MINE_AMOUNT, e.cargo[node]!);
          e.cargo[node] = e.cargo[node]! - taken;
          e.cargo[i] = taken;
          e.cargoType[i] = Units[e.kind[node]!]!.resourceType;
          if (e.cargo[node]! <= 0) kill(s, node);
        }
      }
    } else {
      moveToward(e, i, e.x[node]!, e.y[node]!, speed);
    }
  }
};

const isResource = (e: State['e'], id: number): boolean =>
  isAlive(e, id) && (e.flags[slotOf(id)]! & Role.Resource) !== 0;
