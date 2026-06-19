import { Kind, Order, Role, Units } from '../data/index.ts';
import { isTransitioning } from './state.ts';
import { entityWorkQueue } from './work-queue.ts';
import type { State } from './world.ts';

export { isTransitioning } from './state.ts';

export type EntityLifecycleState =
  | 'dead'
  | 'complete'
  | 'constructing'
  | 'morphing'
  | 'merging'
  | 'training'
  | 'researching'
  | 'transitioning'
  | 'channeling';

export type EntityLifecycle = {
  state: EntityLifecycleState;
  label: string;
  detail: string;
  progress: number;
  remaining: number;
  total: number;
  displayKind: number;
  sourceKind: number;
  targetKind: number;
  busy: boolean;
  cancelable: boolean;
};

const clampProgress = (remaining: number, total: number): number =>
  total <= 0 ? 0 : Math.max(0, Math.min(1, 1 - remaining / total));

const emptyLifecycle = (state: EntityLifecycleState, label: string): EntityLifecycle => ({
  state,
  label,
  detail: '',
  progress: 0,
  remaining: 0,
  total: 0,
  displayKind: Kind.None,
  sourceKind: Kind.None,
  targetKind: Kind.None,
  busy: state !== 'dead' && state !== 'complete',
  cancelable: false,
});

const constructionLabel = (kind: number): string => {
  const def = Units[kind];
  if (def?.race === 'protoss' && (def.roles & Role.Structure) !== 0) return 'Warping';
  switch (def?.buildMethod) {
    case 'addon': return 'Adding';
    default: return 'Building';
  }
};

const unfinishedLifecycle = (s: State, slot: number): EntityLifecycle => {
  const e = s.e;
  const kind = e.kind[slot]!;
  const def = Units[kind]!;
  const sourceKind = e.morphFromKind[slot]!;
  const isMerge = def.buildMethod === 'merge' && sourceKind === Kind.None;
  const isMorph = !isMerge && (sourceKind !== Kind.None || def.buildMethod === 'morph');
  const state: EntityLifecycleState = isMerge ? 'merging' : isMorph ? 'morphing' : 'constructing';
  const label = isMerge ? 'Summoning' : isMorph ? 'Morphing' : constructionLabel(kind);
  const cancelable = sourceKind !== Kind.None ||
    ((e.flags[slot]! & Role.Structure) !== 0 && (e.buildCostMinerals[slot]! > 0 || e.buildCostGas[slot]! > 0));

  return {
    state,
    label,
    detail: def.name,
    progress: clampProgress(e.ctimer[slot]!, def.buildTime),
    remaining: e.ctimer[slot]!,
    total: def.buildTime,
    displayKind: kind,
    sourceKind,
    targetKind: kind,
    busy: true,
    cancelable,
  };
};

export const entityLifecycle = (s: State, slot: number): EntityLifecycle => {
  const e = s.e;
  if (e.alive[slot] !== 1) return emptyLifecycle('dead', 'Dead');
  const kind = e.kind[slot]!;
  if (isTransitioning(s, slot)) return unfinishedLifecycle(s, slot);

  const work = entityWorkQueue(s, slot);
  if (work.active?.t === 'production') {
    return {
      state: 'training',
      label: work.active.label,
      detail: work.active.detail,
      progress: clampProgress(work.active.remaining, work.active.total),
      remaining: work.active.remaining,
      total: work.active.total,
      displayKind: kind,
      sourceKind: kind,
      targetKind: work.active.kind,
      busy: true,
      cancelable: false,
    };
  }
  if (work.active?.t === 'research') {
    return {
      state: 'researching',
      label: work.active.label,
      detail: work.active.detail,
      progress: clampProgress(work.active.remaining, work.active.total),
      remaining: work.active.remaining,
      total: work.active.total,
      displayKind: kind,
      sourceKind: kind,
      targetKind: work.active.tech,
      busy: true,
      cancelable: false,
    };
  }
  if (e.order[slot] === Order.Cast) {
    return {
      ...emptyLifecycle('channeling', 'Casting'),
      displayKind: kind,
      sourceKind: kind,
      targetKind: kind,
    };
  }
  return {
    ...emptyLifecycle('complete', 'Complete'),
    displayKind: kind,
    sourceKind: kind,
    targetKind: kind,
  };
};
