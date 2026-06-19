import type { State } from '../entity/world.ts';
import { eid, isEnemy, NONE } from '../entity/world.ts';
import { Kind, Order, Role, tiles } from '../data.ts';
import { canDetect } from '../detection.ts';
import { isContained } from '../cargo.ts';
import { distanceSq } from '../spatial.ts';

const TRIGGER_RANGE = tiles(3);

const validMineTarget = (s: State, mine: number, target: number): boolean => {
  const e = s.e;
  if (e.alive[target] !== 1 || isContained(s, target)) return false;
  if (!isEnemy(s, e.owner[mine]!, e.owner[target]!)) return false;
  if (!canDetect(s, e.owner[mine]!, target)) return false;
  return (e.flags[target]! & (Role.Mobile | Role.Air | Role.Structure | Role.Resource)) === Role.Mobile;
};

export const mines = (s: State): void => {
  const e = s.e;
  const trigger2 = TRIGGER_RANGE * TRIGGER_RANGE;
  for (let mine = 0; mine < e.hi; mine++) {
    if (e.alive[mine] !== 1 || e.kind[mine] !== Kind.SpiderMine || e.burrowed[mine] !== 1 || isContained(s, mine)) continue;
    let best = NONE;
    let bestD = trigger2 + 1;
    for (let target = 0; target < e.hi; target++) {
      if (!validMineTarget(s, mine, target)) continue;
      const d = distanceSq(e.x[mine]!, e.y[mine]!, e.x[target]!, e.y[target]!);
      if (d <= trigger2 && (d < bestD || (d === bestD && target < best))) { best = target; bestD = d; }
    }
    if (best === NONE) continue;
    e.burrowed[mine] = 0;
    e.order[mine] = Order.Attack;
    e.target[mine] = eid(e, best);
  }
};
