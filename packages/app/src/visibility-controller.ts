import {
  CAP, Kind, NONE, ONE, Role, TILE, Units, canDetect,
  type MapDef, type State,
} from './sim.ts';

export class VisibilityController {
  visible: Uint8Array = new Uint8Array(0);
  explored: Uint8Array = new Uint8Array(0);
  private readonly mapOf: () => MapDef;
  private visibleEntityTick = -1;
  private visibleEntityHuman = -2;
  private visibleEntityTrackVision = true;
  private readonly visibleEntity = new Uint8Array(CAP);

  constructor(mapOf: () => MapDef) {
    this.mapOf = mapOf;
  }

  reset(): void {
    const map = this.mapOf();
    const tiles = map.w * map.h;
    this.visible = new Uint8Array(tiles);
    this.explored = new Uint8Array(tiles);
    this.visibleEntityTick = -1;
    this.visibleEntityHuman = -2;
    this.visibleEntityTrackVision = true;
  }

  compute(state: State, human: number): void {
    this.ensureMapSize();
    if (human < 0 || !state.trackVision) {
      this.visible.fill(2);
      this.explored.fill(2);
      return;
    }
    const vision = state.vision[human]!;
    for (let t = 0; t < this.visible.length; t++) {
      const v = vision[t]!;
      this.visible[t] = v;
      if (v >= 1) this.explored[t] = 1;
    }
  }

  tileVisible(tx: number, ty: number): number {
    const map = this.mapOf();
    if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return 0;
    const t = ty * map.w + tx;
    const v = this.visible[t]!;
    return v === 2 ? 2 : this.explored[t]! === 1 ? 1 : 0;
  }

  canSeeEntity(state: State, human: number, slot: number): boolean {
    this.refreshEntityVisibility(state, human);
    return this.visibleEntity[slot] === 1;
  }

  private refreshEntityVisibility(state: State, human: number): void {
    if (
      this.visibleEntityTick === state.tick &&
      this.visibleEntityHuman === human &&
      this.visibleEntityTrackVision === state.trackVision
    ) return;
    const e = state.e;
    this.visibleEntity.fill(0, 0, e.hi);
    this.visibleEntityTick = state.tick;
    this.visibleEntityHuman = human;
    this.visibleEntityTrackVision = state.trackVision;
    for (let i = 0; i < e.hi; i++) {
      if (e.alive[i] !== 1 || e.container[i] !== NONE) continue;
      if (human < 0 || !state.trackVision) {
        this.visibleEntity[i] = 1;
        continue;
      }
      const tx = Math.floor(e.x[i]! / ONE / TILE);
      const ty = Math.floor(e.y[i]! / ONE / TILE);
      const vis = this.tileVisible(tx, ty);
      const def = Units[e.kind[i]!]!;
      if ((def.roles & Role.Resource) !== 0 || e.kind[i] === Kind.Geyser) {
        if (vis !== 0) this.visibleEntity[i] = 1;
      } else if (e.owner[i] === human) {
        this.visibleEntity[i] = 1;
      } else if (vis === 2 && canDetect(state, human, i)) {
        this.visibleEntity[i] = 1;
      }
    }
  }

  private ensureMapSize(): void {
    const map = this.mapOf();
    if (this.visible.length !== map.w * map.h) this.reset();
  }
}
