import { BUILD_RANGE, Kind, Order, Units } from '../data.ts';
import { isAlive, slotOf, NONE } from '../world.ts';
import type { State } from '../world.ts';
import { navigate } from '../pathing.ts';
import { REPAIR_RATE, isRepairableKind, repairCost } from '../repair.ts';
import { faceToward, within } from './move.ts';
import { effectiveSpeed, isDisabled } from './status.ts';
import { isContained } from '../cargo.ts';

export const repair = (s: State): void => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || isContained(s, i) || e.order[i] !== Order.Repair) continue;
    if (isDisabled(e, i) || e.kind[i] !== Kind.SCV || !isAlive(e, e.target[i]!)) {
      e.order[i] = Order.Idle; e.target[i] = NONE; continue;
    }
    const target = slotOf(e.target[i]!);
    if (isContained(s, target)) { e.order[i] = Order.Idle; e.target[i] = NONE; continue; }
    const def = Units[e.kind[target]!];
    if (!def || e.built[target] !== 1 || !isRepairableKind(e.kind[target]!) || e.hp[target]! >= def.hp) {
      e.order[i] = Order.Idle; e.target[i] = NONE; continue;
    }
    faceToward(e, i, e.x[target]!, e.y[target]!);
    if (!within(e, i, e.x[target]!, e.y[target]!, BUILD_RANGE)) {
      navigate(s, i, e.x[target]!, e.y[target]!, effectiveSpeed(s, e, i, Units[e.kind[i]!]!.speed));
      continue;
    }
    const amount = Math.min(REPAIR_RATE, def.hp - e.hp[target]!);
    const cost = repairCost(e.kind[target]!, amount);
    const owner = e.owner[i]!;
    if (s.players.minerals[owner]! < cost.minerals || s.players.gas[owner]! < cost.gas) {
      e.order[i] = Order.Idle; e.target[i] = NONE; continue;
    }
    s.players.minerals[owner] = s.players.minerals[owner]! - cost.minerals;
    s.players.gas[owner] = s.players.gas[owner]! - cost.gas;
    e.hp[target] = e.hp[target]! + amount;
  }
};
