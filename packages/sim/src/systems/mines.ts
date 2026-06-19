import type { State } from '../entity/world.ts';
import { eid, isEnemy, NONE } from '../entity/world.ts';
import { Kind, Role } from '../data/index.ts';
import { canDetect } from '../mechanics/detection.ts';
import { isContained } from '../mechanics/cargo.ts';
import { topDownEdgeDistanceSq } from '../spatial/geometry.ts';
import { actorTrigger, type ActorTriggerTarget } from '../mechanics/actors.ts';

const matchesTriggerTarget = (s: State, mine: number, target: number, policy: ActorTriggerTarget): boolean => {
  const e = s.e;
  if (e.alive[target] !== 1 || isContained(s, target)) return false;
  if (!isEnemy(s, e.owner[mine]!, e.owner[target]!)) return false;
  switch (policy) {
    case 'enemy-detected-ground-mobile':
      if (!canDetect(s, e.owner[mine]!, target)) return false;
      return (e.flags[target]! & (Role.Mobile | Role.Air | Role.Structure | Role.Resource)) === Role.Mobile;
    default:
      policy satisfies never;
      return false;
  }
};

export const mines = (s: State): void => {
  const e = s.e;
  const trigger = actorTrigger(Kind.SpiderMine);
  if (!trigger) return;
  const trigger2 = trigger.range * trigger.range;
  for (let mine = 0; mine < e.hi; mine++) {
    if (e.alive[mine] !== 1 || e.kind[mine] !== Kind.SpiderMine || e.burrowed[mine] !== 1 || isContained(s, mine)) continue;
    let best = NONE;
    let bestD = trigger2 + 1;
    for (let target = 0; target < e.hi; target++) {
      if (!matchesTriggerTarget(s, mine, target, trigger.target)) continue;
      const d = topDownEdgeDistanceSq(s, mine, target);
      if (d <= trigger2 && (d < bestD || (d === bestD && target < best))) { best = target; bestD = d; }
    }
    if (best === NONE) continue;
    e.burrowed[mine] = 0;
    e.order[mine] = trigger.wakeOrder;
    e.target[mine] = eid(e, best);
  }
};
