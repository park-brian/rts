import { CONTROL_GROUP_COUNT, ControlGroupController, type ControlGroupResult } from './control-group-controller.ts';
import { boundsIntersectsRect, pointInBounds, selectableBounds } from './selection-geometry.ts';
import { NONE, ONE, Role, TILE, eid, isAlive, isUserCommandableKind, slotOf, type State } from './sim.ts';

type Viewport = {
  camX: number;
  camY: number;
  viewW: number;
  viewH: number;
  zoom: number;
};

type SelectionControllerDeps = {
  state: () => State;
  human: () => number;
  screenToWorld: (sx: number, sy: number) => [number, number];
  canSeeEntity: (slot: number) => boolean;
  tileVisible: (tx: number, ty: number) => number;
  viewport: () => Viewport;
  centerOn: (wx: number, wy: number) => void;
};

export { CONTROL_GROUP_COUNT };

export class SelectionController {
  selection = new Set<number>();
  private readonly deps: SelectionControllerDeps;
  private readonly controlGroupController = new ControlGroupController();

  constructor(deps: SelectionControllerDeps) {
    this.deps = deps;
  }

  get controlGroups(): readonly ReadonlySet<number>[] {
    return this.controlGroupController.groups;
  }

  reset(): void {
    this.selection.clear();
    this.controlGroupController.reset();
  }

  clear(): void {
    this.selection.clear();
  }

  prune(): void {
    const e = this.deps.state().e;
    for (const id of [...this.selection]) if (!isAlive(e, id)) this.selection.delete(id);
  }

  firstSelected(pred: (slot: number) => boolean): number {
    const e = this.deps.state().e;
    for (const id of this.selection) {
      if (isAlive(e, id) && pred(slotOf(id))) return slotOf(id);
    }
    return -1;
  }

  boxSelect(sx0: number, sy0: number, sx1: number, sy1: number): void {
    const [wx0, wy0] = this.deps.screenToWorld(Math.min(sx0, sx1), Math.min(sy0, sy1));
    const [wx1, wy1] = this.deps.screenToWorld(Math.max(sx0, sx1), Math.max(sy0, sy1));
    this.selection.clear();
    const human = this.deps.human();
    if (human < 0) return;
    const e = this.deps.state().e;
    const buildings: number[] = [];
    for (let i = 0; i < e.hi; i++) {
      if (e.alive[i] !== 1 || e.container[i] !== NONE || e.owner[i] !== human) continue;
      if (!isUserCommandableKind(e.kind[i]!)) continue;
      const b = selectableBounds(e.kind[i]!, e.x[i]!, e.y[i]!);
      if (!boundsIntersectsRect(b, wx0, wy0, wx1, wy1)) continue;
      if ((e.flags[i]! & Role.Structure) !== 0) buildings.push(eid(e, i));
      else this.selection.add(eid(e, i));
    }
    if (this.selection.size === 0) for (const id of buildings) this.selection.add(id);
  }

  hitTest(wx: number, wy: number): number {
    const e = this.deps.state().e;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < e.hi; i++) {
      if (!this.isHitTestCandidate(i)) continue;
      const b = selectableBounds(e.kind[i]!, e.x[i]!, e.y[i]!);
      if (!pointInBounds(wx, wy, b)) continue;
      const dx = b.cx - wx;
      const dy = b.cy - wy;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = eid(e, i);
      }
    }
    return best;
  }

  isHitTestCandidate(slot: number): boolean {
    const e = this.deps.state().e;
    if (e.alive[slot] !== 1 || e.container[slot] !== NONE) return false;
    if (!isUserCommandableKind(e.kind[slot]!)) return false;
    if (!this.deps.canSeeEntity(slot)) return false;
    const human = this.deps.human();
    if (human >= 0 && e.owner[slot] !== human) {
      const tx = Math.floor(e.x[slot]! / ONE / TILE);
      const ty = Math.floor(e.y[slot]! / ONE / TILE);
      if (this.deps.tileVisible(tx, ty) !== 2) return false;
    }
    return true;
  }

  isOwnedSelectable(id: number): boolean {
    const human = this.deps.human();
    if (id < 0 || human < 0) return false;
    const e = this.deps.state().e;
    const slot = slotOf(id);
    return isAlive(e, id) && e.owner[slot] === human && isUserCommandableKind(e.kind[slot]!);
  }

  selectVisibleKind(kind: number): void {
    if (!isUserCommandableKind(kind)) return;
    const e = this.deps.state().e;
    const human = this.deps.human();
    const { camX, camY, viewW, viewH, zoom } = this.deps.viewport();
    const x1 = camX + viewW / zoom;
    const y1 = camY + viewH / zoom;
    this.selection.clear();
    for (let i = 0; i < e.hi; i++) {
      if (e.alive[i] !== 1 || e.container[i] !== NONE || e.owner[i] !== human || e.kind[i] !== kind) continue;
      const b = selectableBounds(kind, e.x[i]!, e.y[i]!);
      if (boundsIntersectsRect(b, camX, camY, x1, y1)) this.selection.add(eid(e, i));
    }
  }

  assignControlGroup(index: number): ControlGroupResult {
    return this.controlGroupController.assign(this.deps.state(), this.deps.human(), this.selection, index);
  }

  recallControlGroup(index: number, add = false): ControlGroupResult {
    const result = this.controlGroupController.recall(this.deps.state(), this.deps.human(), this.selection, index, add);
    if (result.shouldCenter) this.centerOnSelection();
    return result;
  }

  private centerOnSelection(): void {
    const e = this.deps.state().e;
    let x = 0;
    let y = 0;
    let n = 0;
    for (const id of this.selection) {
      if (!isAlive(e, id)) continue;
      const slot = slotOf(id);
      x += e.x[slot]! / ONE;
      y += e.y[slot]! / ONE;
      n++;
    }
    if (n > 0) this.deps.centerOn(x / n, y / n);
  }
}
