import { Kind, Order, Units } from '../data/index.ts';
import { range } from '../rng.ts';
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

export type ModeTransitionTimingDef = {
  duration: number;
  sourceStatus: 'sourced' | 'unsourced';
  note: string;
};

export type RandomModeTransitionTimingDef = {
  minDuration: number;
  maxDuration: number;
  sourceStatus: 'sourced' | 'unsourced';
  note: string;
};

const ISCRIPT_SOURCE_NOTE =
  'Derived from icecc bundled Brood War iscript.bin and DAT mappings: order completion waits for the relevant sigorder opcode.';

export const ModeTransitionTimings = {
  Siege: {
    duration: 64,
    sourceStatus: 'sourced',
    note: `${ISCRIPT_SOURCE_NOTE} SiegeTank_Siege_Base Init reaches sigorder 1 after 64 frames.`,
  },
  Unsiege: {
    duration: 63,
    sourceStatus: 'sourced',
    note: `${ISCRIPT_SOURCE_NOTE} SiegeTank_Siege_Base SpecialState2 reaches sigorder 1 after 63 frames.`,
  },
  Burrow: {
    duration: 5,
    sourceStatus: 'sourced',
    note: `${ISCRIPT_SOURCE_NOTE} Drone, Zergling, Hydralisk, and Defiler Burrow reach sigorder 4 after 5 frames.`,
  },
  InfestedTerranBurrow: {
    duration: 6,
    sourceStatus: 'sourced',
    note: `${ISCRIPT_SOURCE_NOTE} InfestedTerran Burrow reaches sigorder 4 after 6 frames.`,
  },
  LurkerBurrow: {
    duration: 20,
    sourceStatus: 'sourced',
    note: `${ISCRIPT_SOURCE_NOTE} Lurker Burrow reaches sigorder 4 after 20 frames.`,
  },
  Unburrow: {
    minDuration: 5,
    maxDuration: 9,
    sourceStatus: 'sourced',
    note: `${ISCRIPT_SOURCE_NOTE} Drone, Zergling, Hydralisk, Defiler, and Lurker UnBurrow reach sigorder 4 after waitrand 1-5 plus four waits.`,
  },
  InfestedTerranUnburrow: {
    minDuration: 6,
    maxDuration: 10,
    sourceStatus: 'sourced',
    note: `${ISCRIPT_SOURCE_NOTE} InfestedTerran UnBurrow reaches sigorder 4 after waitrand 1-5 plus five waits.`,
  },
} as const satisfies Record<string, ModeTransitionTimingDef | RandomModeTransitionTimingDef>;

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
  let duration = 1;
  if (source === Kind.SiegeTank && targetKind === Kind.SiegeTankSieged) {
    duration = ModeTransitionTimings.Siege.duration;
  } else if (source === Kind.SiegeTankSieged && targetKind === Kind.SiegeTank) {
    duration = ModeTransitionTimings.Unsiege.duration;
  }
  startTransition(s, slot, ModeTransition.Transform, targetKind, 0, duration);
};

const burrowDuration = (kind: number): number => {
  if (kind === Kind.Lurker) return ModeTransitionTimings.LurkerBurrow.duration;
  if (kind === Kind.InfestedTerran) return ModeTransitionTimings.InfestedTerranBurrow.duration;
  return ModeTransitionTimings.Burrow.duration;
};

const unburrowDuration = (s: State, kind: number): number => {
  const timing = kind === Kind.InfestedTerran
    ? ModeTransitionTimings.InfestedTerranUnburrow
    : ModeTransitionTimings.Unburrow;
  return timing.minDuration + range(s.rng, timing.maxDuration - timing.minDuration + 1);
};

export const startBurrowTransition = (s: State, slot: number, active: boolean): void => {
  const kind = s.e.kind[slot]!;
  const duration = active ? burrowDuration(kind) : unburrowDuration(s, kind);
  startTransition(s, slot, ModeTransition.Burrow, kind, active ? 1 : 0, duration);
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
