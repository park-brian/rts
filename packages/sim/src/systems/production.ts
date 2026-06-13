// Production: structures with an in-progress unit count down and, on completion,
// spawn it (consuming supply) and dequeue the next. New workers auto-mine the
// nearest patch (the reduced-APM default from docs/specs/ui-mobile.md).

import type { State } from '../world.ts';
import { spawn, nearest, eid, slotOf, NONE } from '../world.ts';
import { Kind, Order, Units } from '../data.ts';
import { fx, isqrt } from '../fixed.ts';

const EXIT = fx(40); // how far from a structure produced units appear

export const production = (s: State): void => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.prodKind[i] === Kind.None) continue;
    if (e.prodTimer[i]! > 0) {
      e.prodTimer[i] = e.prodTimer[i]! - 1;
      if (e.prodTimer[i]! > 0) continue;
    }
    // Completed: spawn the unit at the structure's exit, facing its work.
    const kind = e.prodKind[i]!;
    const def = Units[kind]!;
    const owner = e.owner[i]!;
    const patch =
      kind === Kind.SCV
        ? nearest(s, e.x[i]!, e.y[i]!, (slot) => e.kind[slot] === Kind.Mineral)
        : NONE;

    // Exit position: a step toward the nearest patch (symmetric across bases), else +y.
    let sx = e.x[i]!;
    let sy = e.y[i]! + EXIT;
    if (patch !== NONE) {
      const dx = e.x[patch]! - e.x[i]!;
      const dy = e.y[patch]! - e.y[i]!;
      const d = isqrt(dx * dx + dy * dy) || 1;
      sx = e.x[i]! + Math.trunc((dx * EXIT) / d);
      sy = e.y[i]! + Math.trunc((dy * EXIT) / d);
    }

    const id = spawn(s, kind, owner, sx, sy, def.hp);
    s.players.supplyUsed[owner] = s.players.supplyUsed[owner]! + def.supply;
    if (patch !== NONE) {
      const newSlot = slotOf(id);
      e.order[newSlot] = Order.Harvest;
      e.target[newSlot] = eid(e, patch);
    }

    // Dequeue the next unit, or go idle.
    if (e.prodQueued[i]! > 0) {
      e.prodQueued[i] = e.prodQueued[i]! - 1;
      e.prodTimer[i] = def.buildTime;
    } else {
      e.prodKind[i] = Kind.None;
    }
  }
};
