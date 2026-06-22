import {
  CAP, Kind, NONE, ONE, Role, TILE, Units, canDetect,
  type MapDef, type State,
} from './sim.ts';

export type LastKnownEnemyAffordance = {
  slot: number;
  kind: number;
  owner: number;
  x: number;
  y: number;
  tick: number;
};

export class VisibilityController {
  visible: Uint8Array = new Uint8Array(0);
  explored: Uint8Array = new Uint8Array(0);
  private readonly mapOf: () => MapDef;
  private visibleEntityTick = -1;
  private visibleEntityHuman = -2;
  private visibleEntityTrackVision = true;
  private readonly visibleEntity = new Uint8Array(CAP);
  private lastKnownTick = -1;
  private lastKnownHuman = -2;
  private lastKnownTrackVision = true;
  private readonly lastKnownEnemy: Array<LastKnownEnemyAffordance | null> = new Array(CAP).fill(null);

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
    this.lastKnownTick = -1;
    this.lastKnownHuman = -2;
    this.lastKnownTrackVision = true;
    this.lastKnownEnemy.fill(null);
  }

  compute(state: State, human: number): void {
    this.ensureMapSize();
    if (human < 0 || !state.trackVision) {
      this.visible.fill(2);
      this.explored.fill(2);
      this.visibleEntityTick = -1;
      this.lastKnownTick = -1;
      this.refreshLastKnownEnemies(state, human);
      return;
    }
    const vision = state.vision[human]!;
    for (let t = 0; t < this.visible.length; t++) {
      const v = vision[t]!;
      this.visible[t] = v;
      if (v >= 1) this.explored[t] = 1;
    }
    this.visibleEntityTick = -1;
    this.lastKnownTick = -1;
    this.refreshLastKnownEnemies(state, human);
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

  lastKnownEnemies(state: State, human: number, out: LastKnownEnemyAffordance[] = []): LastKnownEnemyAffordance[] {
    this.refreshLastKnownEnemies(state, human);
    out.length = 0;
    for (const enemy of this.lastKnownEnemy) {
      if (enemy && !this.canSeeEntityNow(state, human, enemy.slot)) out.push(enemy);
    }
    return out;
  }

  private canSeeEntityNow(state: State, human: number, slot: number): boolean {
    const e = state.e;
    if (e.alive[slot] !== 1 || e.container[slot] !== NONE) return false;
    if (human < 0 || !state.trackVision) return true;
    const tx = Math.floor(e.x[slot]! / ONE / TILE);
    const ty = Math.floor(e.y[slot]! / ONE / TILE);
    const vis = this.tileVisible(tx, ty);
    const def = Units[e.kind[slot]!]!;
    if ((def.roles & Role.Resource) !== 0 || e.kind[slot] === Kind.Geyser) return vis !== 0;
    if (e.owner[slot] === human) return true;
    return vis === 2 && canDetect(state, human, slot);
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
      if (this.canSeeEntityNow(state, human, i)) this.visibleEntity[i] = 1;
    }
  }

  private refreshLastKnownEnemies(state: State, human: number): void {
    if (
      this.lastKnownTick === state.tick &&
      this.lastKnownHuman === human &&
      this.lastKnownTrackVision === state.trackVision
    ) return;
    this.lastKnownTick = state.tick;
    this.lastKnownHuman = human;
    this.lastKnownTrackVision = state.trackVision;
    if (human < 0 || !state.trackVision) {
      this.lastKnownEnemy.fill(null);
      return;
    }

    const e = state.e;
    for (let i = 0; i < e.hi; i++) {
      const visibleNow = this.canSeeEntityNow(state, human, i);
      if (visibleNow) {
        const def = Units[e.kind[i]!]!;
        const isEnemy = e.owner[i] !== human && (def.roles & Role.Resource) === 0 && e.kind[i] !== Kind.Geyser;
        this.lastKnownEnemy[i] = isEnemy
          ? { slot: i, kind: e.kind[i]!, owner: e.owner[i]!, x: e.x[i]! / ONE, y: e.y[i]! / ONE, tick: state.tick }
          : null;
        continue;
      }

      const remembered = this.lastKnownEnemy[i];
      if (!remembered) continue;
      const tx = Math.floor(remembered.x / TILE);
      const ty = Math.floor(remembered.y / TILE);
      if (this.tileVisible(tx, ty) === 2) this.lastKnownEnemy[i] = null;
    }
  }

  private ensureMapSize(): void {
    const map = this.mapOf();
    if (this.visible.length !== map.w * map.h) this.reset();
  }
}
