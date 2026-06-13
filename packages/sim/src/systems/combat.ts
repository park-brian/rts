// Combat: any unit with a weapon acquires and engages enemies. Order semantics:
//   Attack      -> chase + hit a specific target until it dies
//   AttackMove  -> advance toward a point, engaging enemies met en route
//   Idle        -> hold, but defend by engaging enemies within sight
// Units on Move/Harvest/Build do not fire (they're busy).

import type { State } from '../world.ts';
import { slotOf, eid, kill, isAlive, NONE } from '../world.ts';
import { Order, Units, computeDamage, tiles } from '../data.ts';
import { within } from './move.ts';
import { navigate } from '../pathing.ts';
import { type Grid, nearestEnemy } from '../grid.ts';

export const combat = (s: State, grid: Grid): void => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1) continue;
    const def = Units[e.kind[i]!];
    if (!def || !def.weapon) continue;
    if (e.wcd[i]! > 0) e.wcd[i] = e.wcd[i]! - 1;

    const order = e.order[i]!;
    const engaging = order === Order.Attack || order === Order.AttackMove || order === Order.Idle;
    if (!engaging) continue;

    // Pick a target: explicit (Attack) or acquired (AttackMove/Idle).
    let tgt = NONE;
    if (order === Order.Attack && isAlive(e, e.target[i]!)) {
      tgt = slotOf(e.target[i]!);
    } else {
      tgt = nearestEnemy(s, grid, i, tiles(def.sight));
    }

    if (tgt === NONE) {
      if (order === Order.Attack) e.order[i] = Order.Idle; // target gone
      else if (order === Order.AttackMove) {
        if (navigate(s, i, e.tx[i]!, e.ty[i]!, def.speed)) e.order[i] = Order.Idle;
      }
      continue;
    }

    if (within(e, i, e.x[tgt]!, e.y[tgt]!, def.weapon.range)) {
      if (e.wcd[i]! <= 0) {
        const td = Units[e.kind[tgt]!]!;
        e.hp[tgt] = e.hp[tgt]! - computeDamage(def.weapon, td.size, td.armor);
        e.wcd[i] = def.weapon.cooldown;
        if (e.hp[tgt]! <= 0) kill(s, tgt);
      }
      // remember the engaged target so Idle defenders keep firing it
      e.target[i] = eid(e, tgt);
    } else {
      navigate(s, i, e.x[tgt]!, e.y[tgt]!, def.speed); // approach
    }
  }
};
