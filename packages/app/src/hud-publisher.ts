import { FPS, NONE, isAlive, slotOf, type State } from './sim.ts';
import { selectionCapabilities } from './selection-capabilities.ts';
import { EMPTY_SELECTION_VIEW, ui, type Mode } from './store.ts';

type PublishHudArgs = {
  state: State;
  human: number;
  mode: Mode;
  hasRecordedReplay: boolean;
  selection: ReadonlySet<number>;
  activeSubgroupKind: number;
  controlGroups: readonly ReadonlySet<number>[];
  canSeeEntity: (slot: number) => boolean;
};

const sameCounts = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

const liveControlGroupCount = (s: State, human: number, group: ReadonlySet<number>): number => {
  const e = s.e;
  let count = 0;
  for (const id of group) {
    if (isAlive(e, id) && e.owner[slotOf(id)] === human && e.container[slotOf(id)] === NONE) count++;
  }
  return count;
};

export const clearSelectionView = (): void => {
  ui.selectionView.value = EMPTY_SELECTION_VIEW;
};

export const resetControlGroupCounts = (count: number): void => {
  ui.controlGroupCounts.value = Array(count).fill(0);
};

export const publishHud = ({
  state: s,
  human,
  mode,
  hasRecordedReplay,
  selection,
  activeSubgroupKind,
  controlGroups,
  canSeeEntity,
}: PublishHudArgs): void => {
  const p = human < 0 ? 0 : human;
  ui.minerals.value = s.players.minerals[p]!;
  ui.gas.value = s.players.gas[p]!;
  ui.supplyUsed.value = s.players.supplyUsed[p]!;
  ui.supplyMax.value = s.players.supplyMax[p]!;
  ui.seconds.value = Math.floor(s.tick / FPS);
  ui.over.value = s.result.over;
  ui.winner.value = s.result.winner;
  ui.hasReplay.value = mode !== 'replay' && s.result.over && hasRecordedReplay;

  const counts = controlGroups.map((group) => liveControlGroupCount(s, human, group));
  if (!sameCounts(ui.controlGroupCounts.value, counts)) ui.controlGroupCounts.value = counts;

  ui.selectionView.value = selectionCapabilities(s, human, selection, canSeeEntity, activeSubgroupKind);
};
