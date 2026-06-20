import { BUILD_RANGE, Kind, Order, Units } from '../data/index.ts';
import { isAlive, slotOf, NONE } from '../entity/world.ts';
import type { State } from '../entity/world.ts';
import { navigate } from '../spatial/pathing.ts';
import { isRepairableKind, repairCostDelta, repairTick } from '../mechanics/repair.ts';
import { faceToward } from '../spatial/motion.ts';
import { effectiveSpeed, isDisabled } from '../mechanics/status.ts';
import { isContained } from '../mechanics/cargo.ts';
import { withinTopDownEdgeRange } from '../spatial/geometry.ts';
import { entityApproachPoint } from '../entity/approach.ts';

const stopRepairing = (s: State, slot: number): void => {
  const e = s.e;
  e.order[slot] = Order.Idle;
  e.target[slot] = NONE;
  e.intentTarget[slot] = NONE;
  e.combatTarget[slot] = NONE;
  e.timer[slot] = 0;
};

export const repair = (s: State): void => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || isContained(s, i) || e.order[i] !== Order.Repair) continue;
    if (isDisabled(e, i) || e.kind[i] !== Kind.SCV || !isAlive(e, e.target[i]!)) {
      stopRepairing(s, i); continue;
    }
    const target = slotOf(e.target[i]!);
    if (isContained(s, target)) { stopRepairing(s, i); continue; }
    const def = Units[e.kind[target]!];
    if (!def || e.built[target] !== 1 || !isRepairableKind(e.kind[target]!) || e.hp[target]! >= def.hp) {
      stopRepairing(s, i); continue;
    }
    faceToward(e, i, e.x[target]!, e.y[target]!);
    if (!withinTopDownEdgeRange(s, i, target, BUILD_RANGE)) {
      const p = entityApproachPoint(s, i, target);
      navigate(s, i, p.x, p.y, effectiveSpeed(s, e, i, Units[e.kind[i]!]!.speed));
      continue;
    }
    const currentHp = e.hp[target]!;
    const step = repairTick(e.kind[target]!, e.timer[i]!);
    e.timer[i] = step.accumulator;
    if (step.hp <= 0) continue;
    const nextHp = Math.min(def.hp, currentHp + step.hp);
    const cost = repairCostDelta(e.kind[target]!, currentHp, nextHp);
    const owner = e.owner[i]!;
    if (s.players.minerals[owner]! < cost.minerals || s.players.gas[owner]! < cost.gas) {
      stopRepairing(s, i); continue;
    }
    s.players.minerals[owner] = s.players.minerals[owner]! - cost.minerals;
    s.players.gas[owner] = s.players.gas[owner]! - cost.gas;
    e.hp[target] = nextHp;
    if (nextHp >= def.hp) stopRepairing(s, i);
  }
};
