// Harvest: the worker economy state machine. A harvesting SCV cycles
//   go to patch -> mine (timer) -> carry -> go to command center -> deposit -> repeat.
// Phase is derived from cargo + proximity + timer, so it needs no extra column.

import type { State } from '../world.ts';
import { slotOf, eid, nearest, kill, isAlive, NONE } from '../world.ts';
import { Kind, Order, Units, MINE_AMOUNT, MINE_TICKS, MINE_RANGE, DEPOSIT_RANGE } from '../data.ts';
import { moveToward, within } from './move.ts';

export const harvest = (s: State): void => {
  const e = s.e;
  const speed = Units[Kind.SCV]!.speed;

  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.kind[i] !== Kind.SCV || e.order[i] !== Order.Harvest) continue;
    const owner = e.owner[i]!;

    if (e.cargo[i]! > 0) {
      // Returning: deliver to the nearest owned command center.
      const cc = nearest(s, e.x[i]!, e.y[i]!, (sl) => e.kind[sl] === Kind.CommandCenter && e.owner[sl] === owner);
      if (cc === NONE) {
        e.order[i] = Order.Idle;
        continue;
      }
      if (within(e, i, e.x[cc]!, e.y[cc]!, DEPOSIT_RANGE)) {
        s.players.minerals[owner] = s.players.minerals[owner]! + e.cargo[i]!;
        e.cargo[i] = 0;
        e.timer[i] = 0;
        if (!isPatchAlive(e, e.target[i]!)) {
          const np = nearest(s, e.x[i]!, e.y[i]!, (sl) => e.kind[sl] === Kind.Mineral);
          e.target[i] = np === NONE ? NONE : eid(e, np);
        }
      } else {
        moveToward(e, i, e.x[cc]!, e.y[cc]!, speed);
      }
      continue;
    }

    // Going to mine.
    if (!isPatchAlive(e, e.target[i]!)) {
      const np = nearest(s, e.x[i]!, e.y[i]!, (sl) => e.kind[sl] === Kind.Mineral);
      if (np === NONE) {
        e.order[i] = Order.Idle;
        e.target[i] = NONE;
        continue;
      }
      e.target[i] = eid(e, np);
    }
    const patch = slotOf(e.target[i]!);
    if (within(e, i, e.x[patch]!, e.y[patch]!, MINE_RANGE)) {
      if (e.timer[i]! === 0) {
        e.timer[i] = MINE_TICKS; // begin mining
      } else {
        e.timer[i] = e.timer[i]! - 1;
        if (e.timer[i]! === 0) {
          const taken = Math.min(MINE_AMOUNT, e.cargo[patch]!);
          e.cargo[patch] = e.cargo[patch]! - taken;
          e.cargo[i] = taken;
          if (e.cargo[patch]! <= 0) kill(s, patch);
        }
      }
    } else {
      moveToward(e, i, e.x[patch]!, e.y[patch]!, speed);
    }
  }
};

const isPatchAlive = (e: State['e'], id: number): boolean =>
  isAlive(e, id) && e.kind[slotOf(id)] === Kind.Mineral;
