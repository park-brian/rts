// Construction: a worker with a Build order walks to the site and places the
// structure (cost was paid at command time). The structure then completes over
// its build time; until then it is targetable but not yet functional (built=0).
// The worker is freed and auto-returns to mining.

import type { State } from '../world.ts';
import { spawn, slotOf, eid, NONE } from '../world.ts';
import { Order, Role, Units, BUILD_RANGE } from '../data.ts';
import { navigate } from '../pathing.ts';
import { pickPatch } from './harvest.ts';

export const construction = (s: State): void => {
  const e = s.e;

  // 1) Workers heading to a build site.
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.order[i] !== Order.Build) continue;
    const speed = Units[e.kind[i]!]!.speed;
    const dx = e.tx[i]! - e.x[i]!;
    const dy = e.ty[i]! - e.y[i]!;
    if (dx * dx + dy * dy <= BUILD_RANGE * BUILD_RANGE) {
      const kind = e.buildKind[i]!;
      const def = Units[kind]!;
      const id = spawn(s, kind, e.owner[i]!, e.tx[i]!, e.ty[i]!, def.hp, def.roles);
      const st = slotOf(id);
      e.built[st] = 0;
      e.ctimer[st] = def.buildTime;
      // Free the worker; auto-return to the nearest free resource.
      e.buildKind[i] = 0;
      const node = (e.flags[i]! & Role.Worker) !== 0
        ? pickPatch(s, i, e.owner[i]!, Units[e.kind[i]!]!.speed)
        : NONE;
      if (node !== NONE) {
        e.order[i] = Order.Harvest;
        e.target[i] = eid(e, node);
      } else {
        e.order[i] = Order.Idle;
        e.target[i] = NONE;
      }
    } else {
      navigate(s, i, e.tx[i]!, e.ty[i]!, speed);
    }
  }

  // 2) Structures finishing construction.
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.built[i] === 1) continue;
    if (e.ctimer[i]! > 0) {
      e.ctimer[i] = e.ctimer[i]! - 1;
      if (e.ctimer[i]! <= 0) e.built[i] = 1;
    }
  }
};
