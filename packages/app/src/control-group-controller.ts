import { NONE, isAlive, slotOf, type State } from './sim.ts';

export const CONTROL_GROUP_COUNT = 10;

export type ControlGroupResult = {
  ok: boolean;
  changed: boolean;
  shouldCenter: boolean;
};

const emptyResult = (): ControlGroupResult => ({ ok: false, changed: false, shouldCenter: false });

export class ControlGroupController {
  readonly groups: Set<number>[];
  private readonly count: number;
  private readonly now: () => number;
  private lastRecall = -1;
  private lastRecallAt = 0;

  constructor(
    count = CONTROL_GROUP_COUNT,
    now = () => performance.now(),
  ) {
    this.count = count;
    this.now = now;
    this.groups = Array.from({ length: count }, () => new Set<number>());
  }

  reset(): void {
    for (const group of this.groups) group.clear();
    this.lastRecall = -1;
    this.lastRecallAt = 0;
  }

  assign(s: State, human: number, selection: ReadonlySet<number>, index: number): ControlGroupResult {
    if (!this.validIndex(index) || selection.size === 0) return emptyResult();
    const live = this.liveIds(s, human, selection);
    this.groups[index] = new Set(live);
    return { ok: live.length > 0, changed: true, shouldCenter: false };
  }

  recall(s: State, human: number, selection: Set<number>, index: number, add = false): ControlGroupResult {
    if (!this.validIndex(index)) return emptyResult();
    const live = this.liveIds(s, human, this.groups[index]!);
    this.groups[index] = new Set(live);
    if (live.length === 0) return { ok: false, changed: true, shouldCenter: false };

    if (!add) selection.clear();
    for (const id of live) selection.add(id);

    const t = this.now();
    const shouldCenter = !add && this.lastRecall === index && t - this.lastRecallAt < 450;
    this.lastRecall = index;
    this.lastRecallAt = t;
    return { ok: true, changed: true, shouldCenter };
  }

  private validIndex(index: number): boolean {
    return index >= 0 && index < this.count;
  }

  private liveIds(s: State, human: number, ids: Iterable<number>): number[] {
    const e = s.e;
    const live: number[] = [];
    for (const id of ids) {
      const slot = slotOf(id);
      if (isAlive(e, id) && e.owner[slot] === human && e.container[slot] === NONE) live.push(id);
    }
    return live;
  }
}
