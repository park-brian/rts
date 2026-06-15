// Production: structures with an in-progress unit count down and, on completion,
// spawn it and dequeue the next. Supply is derived by the census system, so this
// system does no supply bookkeeping. Race-agnostic: a produced *worker* (by role)
// auto-mines the nearest *resource* (by role).

import type { State } from '../world.ts';
import { nearest, eid, slotOf, isAlive, NONE } from '../world.ts';
import { spawnUnit } from '../factory.ts';
import { Kind, Order, Role, Units } from '../data.ts';
import { fx, isqrt } from '../fixed.ts';
import { pickPatch, isResource } from './harvest.ts';

const EXIT = fx(40); // how far from a structure produced units appear

/**
 * Resolve a producer's entity rally to a still-live target, applying the
 * "followed unit died → next-closest unit" fallback (the same idea as a depleted
 * patch re-routing to the nearest one). Mutates the producer's rally columns in
 * place so the fallback *persists* and the rally line tracks the live target.
 */
const resolveRally = (s: State, producer: number, owner: number): void => {
  const e = s.e;
  const rt = e.rallyTarget[producer]!;
  if (rt === NONE) return; // a plain ground point (or no rally) — nothing to resolve
  if (isAlive(e, rt)) {
    // Keep the stored point glued to the live target so it tracks a moving unit.
    const ts = slotOf(rt);
    e.rallyX[producer] = e.x[ts]!; e.rallyY[producer] = e.y[ts]!;
    return;
  }
  // The followed entity is gone. Pick the next-closest owned mobile unit (to where
  // it was last seen); failing that, degrade to the last-known point (rallyX/Y).
  const refX = e.rallyX[producer]! >= 0 ? e.rallyX[producer]! : e.x[producer]!;
  const refY = e.rallyY[producer]! >= 0 ? e.rallyY[producer]! : e.y[producer]!;
  const fb = nearest(s, refX, refY, (sl) =>
    sl !== producer && e.owner[sl] === owner &&
    (e.flags[sl]! & Role.Mobile) !== 0 && (e.flags[sl]! & Role.Resource) === 0);
  if (fb !== NONE) {
    e.rallyTarget[producer] = eid(e, fb);
    e.rallyX[producer] = e.x[fb]!; e.rallyY[producer] = e.y[fb]!;
  } else {
    e.rallyTarget[producer] = NONE; // no fallback unit → hold the last-known point
  }
};

/** Direct a freshly produced unit per its producer's rally (default worker = auto-mine). */
const applyRally = (s: State, producer: number, slot: number, owner: number, isWorker: boolean, speed: number): void => {
  const e = s.e;
  resolveRally(s, producer, owner);
  const rt = e.rallyTarget[producer]!;
  const rtSlot = rt !== NONE ? slotOf(rt) : NONE;
  const rallyIsResource = rtSlot !== NONE && isResource(e, rt);
  const hasPoint = e.rallyX[producer]! >= 0;

  // Workers auto-mine when there's no rally at all, or when rallied at the mineral
  // line — spreading from the rally point (SC2-style).
  if (isWorker && (rallyIsResource || (rt === NONE && !hasPoint))) {
    const fromX = hasPoint ? e.rallyX[producer]! : e.x[slot]!;
    const fromY = hasPoint ? e.rallyY[producer]! : e.y[slot]!;
    const np = pickPatch(s, slot, owner, speed, fromX, fromY);
    if (np !== NONE) { e.order[slot] = Order.Harvest; e.target[slot] = eid(e, np); }
    return;
  }

  // Otherwise head to the rally: a followed entity's live spot, or a ground point.
  let tx: number; let ty: number;
  if (rtSlot !== NONE) { tx = e.x[rtSlot]!; ty = e.y[rtSlot]!; }
  else if (hasPoint) { tx = e.rallyX[producer]!; ty = e.rallyY[producer]!; }
  else return; // no rally → the unit just waits at the exit

  e.target[slot] = NONE;
  e.tx[slot] = tx; e.ty[slot] = ty;
  // Army attack-moves so it engages threats on the way to the rally; workers relocate.
  e.order[slot] = isWorker ? Order.Move : Order.AttackMove;
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
