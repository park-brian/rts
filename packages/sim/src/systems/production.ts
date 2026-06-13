// Production: structures with an in-progress unit count down and, on completion,
// spawn it and dequeue the next. Supply is derived by the census system, so this
// system does no supply bookkeeping. Race-agnostic: a produced *worker* (by role)
// auto-mines the nearest *resource* (by role).

import type { State } from '../world.ts';
import { nearest, eid, slotOf, NONE } from '../world.ts';
import { spawnUnit } from '../factory.ts';
import { Kind, Order, Role, Units } from '../data.ts';
import { fx, isqrt } from '../fixed.ts';
import { pickPatch, isResource } from './harvest.ts';

const EXIT = fx(40); // how far from a structure produced units appear

/** Direct a freshly produced unit per its producer's rally (default worker = auto-mine). */
const applyRally = (s: State, producer: number, slot: number, owner: number, isWorker: boolean, speed: number): void => {
  const e = s.e;
  const hasPoint = e.rallyX[producer]! >= 0;
  const mineRally = isResource(e, e.rallyTarget[producer]!);
  if (isWorker && (mineRally || !hasPoint)) {
    // No rally, or rallied to the mineral line → harvest, spreading from the rally point.
    const fromX = hasPoint ? e.rallyX[producer]! : e.x[slot]!;
    const fromY = hasPoint ? e.rallyY[producer]! : e.y[slot]!;
    const np = pickPatch(s, slot, owner, speed, fromX, fromY);
    if (np !== NONE) { e.order[slot] = Order.Harvest; e.target[slot] = eid(e, np); }
  } else if (hasPoint) {
    // Rally to a ground point (any unit, or a worker rallied to open ground).
    e.order[slot] = Order.Move; e.target[slot] = NONE;
    e.tx[slot] = e.rallyX[producer]!; e.ty[slot] = e.rallyY[producer]!;
  }
};

export const production = (s: State): void => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.built[i] !== 1 || e.prodKind[i] === Kind.None) continue;
    if (e.prodTimer[i]! > 0) {
      e.prodTimer[i] = e.prodTimer[i]! - 1;
      if (e.prodTimer[i]! > 0) continue;
    }
    const kind = e.prodKind[i]!;
    const def = Units[kind]!;
    const owner = e.owner[i]!;
    const isWorker = (def.roles & Role.Worker) !== 0;
    const node = isWorker
      ? nearest(s, e.x[i]!, e.y[i]!, (sl) => (e.flags[sl]! & Role.Resource) !== 0)
      : NONE;

    // Exit position: a step toward the work (symmetric across bases), else +y.
    let sx = e.x[i]!;
    let sy = e.y[i]! + EXIT;
    if (node !== NONE) {
      const dx = e.x[node]! - e.x[i]!;
      const dy = e.y[node]! - e.y[i]!;
      const d = isqrt(dx * dx + dy * dy) || 1;
      sx = e.x[i]! + Math.trunc((dx * EXIT) / d);
      sy = e.y[i]! + Math.trunc((dy * EXIT) / d);
    }

    const id = spawnUnit(s, kind, owner, sx, sy);
    applyRally(s, i, slotOf(id), owner, isWorker, def.speed);

    // Dequeue the next unit, or go idle.
    if (e.prodQueued[i]! > 0) {
      e.prodQueued[i] = e.prodQueued[i]! - 1;
      e.prodTimer[i] = def.buildTime;
    } else {
      e.prodKind[i] = Kind.None;
    }
  }
};
