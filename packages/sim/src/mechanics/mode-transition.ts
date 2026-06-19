import { Kind, Order, sec, Units } from '../data/index.ts';
import { setEntityKind } from '../entity/kind.ts';
import { clearOrderQueue } from '../entity/order-queue.ts';
import type { State } from '../entity/world.ts';
import { NONE } from '../entity/world.ts';
import { clearVelocity } from '../spatial/motion.ts';

export const ModeTransition = {
  None: 0,
  Transform: 1,
  Burrow: 2,
} as const;
export type ModeTransition = (typeof ModeTransition)[keyof typeof ModeTransition];

// Local references confirm these are real BW orders, but exact frame counts are
// still marked unsourced in docs/research/bw-transition-timings.md.
export const SIEGE_TRANSITION_TICKS = sec(2);
export const BURROW_TRANSITION_TICKS = sec(1);

const clearActiveOrder = (s: State, slot: number): void => {
  const e = s.e;
  e.settled[slot] = 0;
  clearOrderQueue(e, slot);
  clearVelocity(e, slot);
  e.order[slot] = Order.Idle;
  e.target[slot] = NONE;
  e.intentTarget[slot] = NONE;
  e.combatTarget[slot] = NONE;
};

const startTransition = (
  s: State,
  slot: number,
  type: ModeTransition,
  targetKind: number,
  targetState: number,
  duration: number,
): void => {
  const e = s.e;
  clearActiveOrder(s, slot);
  e.modeTransitionType[slot] = type;
  e.modeTransitionTargetKind[slot] = targetKind;
  e.modeTransitionTargetState[slot] = targetState;
  e.modeTransitionTimer[slot] = duration;
  e.modeTransitionTotal[slot] = duration;
};

export const startModeTransform = (s: State, slot: number, targetKind: number): void => {
  const source = s.e.kind[slot]!;
  const duration =
    (source === Kind.SiegeTank && targetKind === Kind.SiegeTankSieged) ||
    (source === Kind.SiegeTankSieged && targetKind === Kind.SiegeTank)
      ? SIEGE_TRANSITION_TICKS
      : 1;
  startTransition(s, slot, ModeTransition.Transform, targetKind, 0, duration);
};

export const startBurrowTransition = (s: State, slot: number, active: boolean): void => {
  startTransition(s, slot, ModeTransition.Burrow, s.e.kind[slot]!, active ? 1 : 0, BURROW_TRANSITION_TICKS);
};

const finishTransition = (s: State, slot: number): void => {
  const e = s.e;
  const type = e.modeTransitionType[slot]!;
  if (type === ModeTransition.Transform) {
    setEntityKind(s, slot, e.modeTransitionTargetKind[slot]!);
  } else if (type === ModeTransition.Burrow) {
    e.burrowed[slot] = e.modeTransitionTargetState[slot]!;
  }
  e.modeTransitionType[slot] = ModeTransition.None;
  e.modeTransitionTargetKind[slot] = Kind.None;
  e.modeTransitionTargetState[slot] = 0;
  e.modeTransitionTimer[slot] = 0;
  e.modeTransitionTotal[slot] = 0;
};

export const tickModeTransitions = (s: State): void => {
  const e = s.e;
  for (let slot = 0; slot < e.hi; slot++) {
    if (e.alive[slot] !== 1 || e.modeTransitionTimer[slot]! <= 0) continue;
    e.modeTransitionTimer[slot] = e.modeTransitionTimer[slot]! - 1;
    if (e.modeTransitionTimer[slot]! <= 0) finishTransition(s, slot);
  }
};

export const modeTransitionLabel = (s: State, slot: number): string => {
  const e = s.e;
  switch (e.modeTransitionType[slot]) {
    case ModeTransition.Transform:
      return e.modeTransitionTargetKind[slot] === Kind.SiegeTankSieged ? 'Sieging' : 'Unsieging';
    case ModeTransition.Burrow:
      return e.modeTransitionTargetState[slot] === 1 ? 'Burrowing' : 'Unburrowing';
    default:
      return 'Transitioning';
  }
};

export const modeTransitionDetail = (s: State, slot: number): string => {
  const targetKind = s.e.modeTransitionTargetKind[slot]!;
  return Units[targetKind]?.name ?? '';
};
