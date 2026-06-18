import {
  ONE, Role, eid, canPlaceStructure, isLiftedStructureFlags, snapBuildAnchor,
  validateCommand, type Command, type State,
} from './sim.ts';
import { isPlacementArmed, type ArmedCommand } from './store.ts';

export type PlacementGhost = { kind: number; x: number; y: number; ok: boolean };

type PlacementContext = {
  state: State;
  human: number;
  armed: ArmedCommand;
  worldX: number;
  worldY: number;
  firstSelected: (pred: (slot: number) => boolean) => number;
};

type CommitContext = {
  state: State;
  armed: ArmedCommand;
  firstSelected: (pred: (slot: number) => boolean) => number;
};

export class PlacementController {
  ghost: PlacementGhost | null = null;

  update({ state: s, human, armed, worldX, worldY, firstSelected }: PlacementContext): void {
    if (human < 0 || !isPlacementArmed(armed)) {
      this.ghost = null;
      return;
    }

    const e = s.e;
    const kind = armed.kind;
    const tx = (worldX * ONE) | 0;
    const ty = (worldY * ONE) | 0;
    if (armed.t === 'land') {
      const building = firstSelected((i) => e.kind[i] === kind && isLiftedStructureFlags(e.flags[i]!));
      if (building < 0) {
        this.ghost = null;
        return;
      }
      const snapped = snapBuildAnchor(tx, ty);
      const c: Command = { t: 'land', building: eid(e, building), x: snapped.x, y: snapped.y };
      this.ghost = { kind, x: snapped.x, y: snapped.y, ok: validateCommand(s, human, c).ok };
      return;
    }

    const worker = firstSelected((i) => (e.flags[i]! & Role.Worker) !== 0);
    if (worker < 0) {
      this.ghost = null;
      return;
    }
    const placement = canPlaceStructure(s, human, worker, kind, tx, ty);
    if (placement.ok) {
      this.ghost = { kind, x: placement.x, y: placement.y, ok: true };
      return;
    }
    const snapped = snapBuildAnchor(tx, ty);
    this.ghost = { kind, x: snapped.x, y: snapped.y, ok: false };
  }

  commit({ state: s, armed, firstSelected }: CommitContext): Command | null {
    const ghost = this.ghost;
    const e = s.e;
    if (!ghost || !ghost.ok || !isPlacementArmed(armed)) return null;
    if (armed.t === 'land') {
      const building = firstSelected((i) => e.kind[i] === ghost.kind && isLiftedStructureFlags(e.flags[i]!));
      if (building < 0) return null;
      this.clear();
      return { t: 'land', building: eid(e, building), x: ghost.x, y: ghost.y };
    }

    const worker = firstSelected((i) => (e.flags[i]! & Role.Worker) !== 0);
    if (worker < 0) return null;
    this.clear();
    return { t: 'build', unit: eid(e, worker), kind: ghost.kind, x: ghost.x, y: ghost.y };
  }

  clear(): void {
    this.ghost = null;
  }
}
