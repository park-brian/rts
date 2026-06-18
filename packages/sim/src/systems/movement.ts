// Generic movement: units carrying out a plain Move order path toward their target
// point and go Idle on arrival. (Harvesters/attackers move via their own systems.)

import type { State } from '../world.ts';
import { Order, Units } from '../data.ts';
import { navigate } from '../pathing.ts';
import { effectiveSpeed, isDisabled } from './status.ts';
import { commandMoveSpeed, isLiftedStructureFlags, landedStructureFlags } from '../terran-mobility.ts';
import { canAcceptCargo, isContained, loadUnitInto, withinLoadRange } from '../cargo.ts';
import { placementForStructure } from '../validation.ts';
import { eid, isAlive, NONE, slotOf } from '../world.ts';
import { isLocalAvoidanceSolid } from '../local-avoidance.ts';

const landIfArrived = (s: State, slot: number): void => {
  const e = s.e;
  if (e.target[slot] !== eid(e, slot) || !isLiftedStructureFlags(e.flags[slot]!)) {
    e.order[slot] = Order.Idle;
    return;
  }
  const placement = placementForStructure(s, e.kind[slot]!, e.tx[slot]!, e.ty[slot]!, slot, e.owner[slot]!);
  if (placement.ok) {
    e.x[slot] = placement.x;
    e.y[slot] = placement.y;
    e.flags[slot] = landedStructureFlags(e.kind[slot]!);
  }
  e.order[slot] = Order.Idle;
  e.target[slot] = NONE;
};

export const movement = (s: State): void => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || isContained(s, i) || e.order[i] !== Order.Move) continue;
    if (isDisabled(e, i)) continue;
    if (e.burrowed[i] === 1) {
      e.order[i] = Order.Idle;
      continue;
    }
    const def = Units[e.kind[i]!];
    const speed = commandMoveSpeed(e.kind[i]!, e.flags[i]!);
    if (!def || speed === 0) {
      e.order[i] = Order.Idle;
      continue;
    }
    const targetId = e.target[i]!;
    if (targetId !== NONE && targetId !== eid(e, i)) {
      if (!isAlive(e, targetId)) {
        e.target[i] = NONE;
      } else {
        const target = slotOf(targetId);
        e.tx[i] = e.x[target]!;
        e.ty[i] = e.y[target]!;
        if (canAcceptCargo(s, target, i)) {
          if (withinLoadRange(s, target, i)) {
            loadUnitInto(s, target, i);
            continue;
          }
        } else {
          e.target[i] = NONE;
        }
      }
    }
    const arrived = navigate(s, i, e.tx[i]!, e.ty[i]!, effectiveSpeed(s, e, i, speed));
    if (arrived && e.target[i] === eid(e, i) && isLiftedStructureFlags(e.flags[i]!)) landIfArrived(s, i);
    else if (arrived && !isLocalAvoidanceSolid(s, i)) e.order[i] = Order.Idle;
  }
};
