import type { Entities, State } from '../entity/world.ts';
import { NONE, eid, isAlive, kill, slotOf } from '../entity/world.ts';
import { Kind, Order } from '../data/index.ts';
import { setEntityKind } from '../entity/kind.ts';
import { refundBuildCost } from './refund-ledger.ts';

export const hasPendingBuild = (e: Entities, slot: number): boolean =>
  e.order[slot] === Order.Build && e.buildKind[slot] !== 0;

export const cancelPendingBuild = (s: State, slot: number): void => {
  const e = s.e;
  if (!hasPendingBuild(e, slot)) return;
  refundBuildCost(s, slot);
  e.order[slot] = Order.Idle;
  e.buildKind[slot] = 0;
  e.target[slot] = NONE;
  e.intentTarget[slot] = NONE;
  e.combatTarget[slot] = NONE;
};

export const cancelFoundation = (s: State, slot: number): void => {
  const e = s.e;
  if (e.morphFromKind[slot] !== Kind.None) {
    const original = e.morphFromKind[slot]!;
    refundBuildCost(s, slot, 3, 4);
    setEntityKind(s, slot, original);
    e.built[slot] = 1;
    e.ctimer[slot] = 0;
    e.morphFromKind[slot] = Kind.None;
    e.order[slot] = Order.Idle;
    e.target[slot] = NONE;
    e.intentTarget[slot] = NONE;
    e.combatTarget[slot] = NONE;
    return;
  }
  const foundationId = eid(e, slot);
  for (let worker = 0; worker < e.hi; worker++) {
    if (e.alive[worker] === 1 && e.order[worker] === Order.Build && e.target[worker] === foundationId) {
      e.order[worker] = Order.Idle;
      e.target[worker] = NONE;
      e.intentTarget[worker] = NONE;
      e.combatTarget[worker] = NONE;
    }
  }
  if (e.target[slot] !== NONE && isAlive(e, e.target[slot]!)) {
    const parent = slotOf(e.target[slot]!);
    if (e.target[parent] === eid(e, slot)) {
      e.target[parent] = NONE;
      e.intentTarget[parent] = NONE;
      e.combatTarget[parent] = NONE;
    }
  }
  refundBuildCost(s, slot, 3, 4);
  kill(s, slot);
};
