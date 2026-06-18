// Generic movement: Move orders navigate to points/entities. AttackMove combat is
// owned by combat.ts, but entity-follow AttackMove endpoints refresh here so
// escort intent can survive transient combat targets.

import type { State } from '../world.ts';
import { Order, Units } from '../data.ts';
import { navigate } from '../pathing.ts';
import { effectiveSpeed, isDisabled } from './status.ts';
import { commandMoveSpeed, isLiftedStructureFlags, landedStructureFlags } from '../terran-mobility.ts';
import { canAcceptCargo, isContained, loadUnitInto, withinLoadRange } from '../cargo.ts';
import { placementForStructure } from '../placement.ts';
import { eid, isAlive, NONE, slotOf } from '../world.ts';
import { isLocalAvoidanceSolid } from '../local-avoidance.ts';
import { clearVelocity } from './move.ts';
import { entityApproachPoint } from '../entity-approach.ts';
import { roundedGroupSpacing, usesGroundMoveSlot } from '../movement-slots.ts';

type FollowPlan = {
  rank: Map<number, number>;
  spacing: Map<number, number>;
};

const followsIntentTarget = (e: State['e'], slot: number): boolean =>
  e.intentTarget[slot] !== NONE && (e.order[slot] === Order.Move || e.order[slot] === Order.AttackMove);

const FOLLOW_PLAN: FollowPlan = { rank: new Map(), spacing: new Map() };
const FOLLOW_GROUPS = new Map<number, number[]>();
const FOLLOW_GROUP_POOL: number[][] = [];

const resetFollowPlan = (): FollowPlan => {
  FOLLOW_PLAN.rank.clear();
  FOLLOW_PLAN.spacing.clear();
  for (const group of FOLLOW_GROUPS.values()) {
    group.length = 0;
    FOLLOW_GROUP_POOL.push(group);
  }
  FOLLOW_GROUPS.clear();
  return FOLLOW_PLAN;
};

const followGroupFor = (targetId: number): number[] => {
  let group = FOLLOW_GROUPS.get(targetId);
  if (!group) {
    group = FOLLOW_GROUP_POOL.pop() ?? [];
    FOLLOW_GROUPS.set(targetId, group);
  }
  return group;
};

const buildFollowPlan = (s: State): FollowPlan => {
  const plan = resetFollowPlan();
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    const targetId = e.intentTarget[i] !== NONE ? e.intentTarget[i]! : e.target[i]!;
    if (e.alive[i] !== 1 || !followsIntentTarget(e, i) || targetId === eid(e, i)) continue;
    if (!isAlive(e, targetId) || !usesGroundMoveSlot(e.flags[i]!)) continue;
    followGroupFor(targetId).push(i);
  }
  for (const [targetId, slots] of FOLLOW_GROUPS) {
    if (slots.length <= 1) continue;
    slots.sort((a, b) => a - b);
    plan.spacing.set(targetId, roundedGroupSpacing(s, slots));
    for (let i = 0; i < slots.length; i++) plan.rank.set(slots[i]!, i);
  }
  return plan;
};

const liveTravelTargetId = (e: State['e'], slot: number): number =>
  e.intentTarget[slot] !== NONE ? e.intentTarget[slot]! : e.target[slot]!;

const refreshEntityTravelDestination = (s: State, slot: number, followPlan: FollowPlan): number => {
  const e = s.e;
  const targetId = liveTravelTargetId(e, slot);
  if (targetId === NONE || targetId === eid(e, slot)) return NONE;
  if (!isAlive(e, targetId)) {
    e.intentTarget[slot] = NONE;
    if (e.target[slot] === targetId) e.target[slot] = NONE;
    return NONE;
  }
  const target = slotOf(targetId);
  const p = entityApproachPoint(
    s,
    slot,
    target,
    e.x[slot]!,
    e.y[slot]!,
    followPlan.rank.get(slot) ?? 0,
    followPlan.spacing.get(targetId),
  );
  e.tx[slot] = p.x;
  e.ty[slot] = p.y;
  return target;
};

const landIfArrived = (s: State, slot: number): void => {
  const e = s.e;
  const landTarget = liveTravelTargetId(e, slot);
  if (landTarget !== eid(e, slot) || !isLiftedStructureFlags(e.flags[slot]!)) {
    clearVelocity(e, slot);
    e.order[slot] = Order.Idle;
    e.intentTarget[slot] = NONE;
    return;
  }
  const placement = placementForStructure(s, e.kind[slot]!, e.tx[slot]!, e.ty[slot]!, slot, e.owner[slot]!);
  if (placement.ok) {
    e.x[slot] = placement.x;
    e.y[slot] = placement.y;
    e.flags[slot] = landedStructureFlags(e.kind[slot]!);
  }
  clearVelocity(e, slot);
  e.order[slot] = Order.Idle;
  e.target[slot] = NONE;
  e.intentTarget[slot] = NONE;
};

export const movement = (s: State): void => {
  const e = s.e;
  const followPlan = buildFollowPlan(s);
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || isContained(s, i)) continue;
    if (e.order[i] !== Order.Move) {
      if (followsIntentTarget(e, i)) refreshEntityTravelDestination(s, i, followPlan);
      continue;
    }
    if (isDisabled(e, i)) {
      clearVelocity(e, i);
      continue;
    }
    if (e.burrowed[i] === 1) {
      clearVelocity(e, i);
      e.order[i] = Order.Idle;
      continue;
    }
    const def = Units[e.kind[i]!];
    const speed = commandMoveSpeed(e.kind[i]!, e.flags[i]!);
    if (!def || speed === 0) {
      clearVelocity(e, i);
      e.order[i] = Order.Idle;
      continue;
    }
    const target = refreshEntityTravelDestination(s, i, followPlan);
    if (target !== NONE && canAcceptCargo(s, target, i)) {
      if (withinLoadRange(s, target, i)) {
        loadUnitInto(s, target, i);
        continue;
      }
    }
    const arrived = navigate(s, i, e.tx[i]!, e.ty[i]!, effectiveSpeed(s, e, i, speed));
    const liveIntentTarget = liveTravelTargetId(e, i);
    if (arrived && liveIntentTarget === eid(e, i) && isLiftedStructureFlags(e.flags[i]!)) landIfArrived(s, i);
    else if (arrived && liveIntentTarget !== NONE) {
      clearVelocity(e, i);
      e.settled[i] = 1;
    }
    else if (arrived && !isLocalAvoidanceSolid(s, i)) e.order[i] = Order.Idle;
  }
};
