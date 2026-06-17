import { Kind, Role, Units, isLarvaSourceKind, tiles } from './data.ts';
import type { State } from './world.ts';

export const CREEP_RADIUS = tiles(10);

const distSq = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
};

export const providesCreep = (kind: number): boolean => {
  const def = Units[kind];
  return !!def && def.race === 'zerg' && (def.roles & Role.Structure) !== 0 && kind !== Kind.Extractor;
};

export const requiresCreep = (kind: number): boolean => {
  const def = Units[kind];
  return !!def && def.race === 'zerg' && (def.roles & Role.Structure) !== 0 && !isLarvaSourceKind(kind) && kind !== Kind.Extractor;
};

export const hasCreepAt = (s: State, player: number, x: number, y: number): boolean => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.owner[i] !== player || e.built[i] !== 1 || !providesCreep(e.kind[i]!)) continue;
    if (distSq(e.x[i]!, e.y[i]!, x, y) <= CREEP_RADIUS * CREEP_RADIUS) return true;
  }
  return false;
};
