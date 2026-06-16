// Combat: any unit with a weapon acquires and engages enemies. Order semantics:
//   Attack      -> chase + hit a specific target until it dies
//   AttackMove  -> advance toward a point, engaging enemies met en route
//   Idle        -> hold, but defend by engaging enemies within sight
// Units on Move/Harvest/Build do not fire (they're busy).

import type { State } from '../world.ts';
import { slotOf, eid, kill, isAlive, isEnemy, NONE } from '../world.ts';
import { Order, Units, computeDamage, tiles } from '../data.ts';
import { faceToward, within } from './move.ts';
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

    // Keep the current target while it's still valid — for Attack, chase it at any
    // range; for Idle/AttackMove, hold it while it's in sight. This avoids a grid
    // re-acquire every tick once a unit is engaged (the bulk of a melee). Only when
    // there's no valid target do Idle/AttackMove units acquire the nearest enemy.
    const owner = e.owner[i]!;
    const sight = tiles(def.sight);
    let tgt = NONE;
    const rem = e.target[i]!;
    if (isAlive(e, rem)) {
      const rs = slotOf(rem);
      if (isEnemy(s, owner, e.owner[rs]!) && (order === Order.Attack || within(e, i, e.x[rs]!, e.y[rs]!, sight))) tgt = rs;
    }
    if (tgt === NONE && order !== Order.Attack) tgt = nearestEnemy(s, grid, i, sight);
    if (tgt !== NONE) e.target[i] = eid(e, tgt); // remember for next tick

    if (tgt === NONE) {
      if (order === Order.Attack) e.order[i] = Order.Idle; // target gone
      else if (order === Order.AttackMove) {
        if (navigate(s, i, e.tx[i]!, e.ty[i]!, def.speed)) e.order[i] = Order.Idle;
      }
      continue;
    }

    faceToward(e, i, e.x[tgt]!, e.y[tgt]!);
    if (within(e, i, e.x[tgt]!, e.y[tgt]!, def.weapon.range)) {
      if (e.wcd[i]! <= 0) {
        const td = Units[e.kind[tgt]!]!;
        e.hp[tgt] = e.hp[tgt]! - computeDamage(def.weapon, td.size, td.armor);
        e.wcd[i] = def.weapon.cooldown;
        if (e.hp[tgt]! <= 0) kill(s, tgt);
      }
    } else {
      navigate(s, i, e.x[tgt]!, e.y[tgt]!, def.speed); // approach
    }
  }
};
