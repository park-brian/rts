import { Kind, Role, Units, tiles } from './data.ts';
import type { State } from './world.ts';

export const POWER_RADIUS = tiles(8);

const distSq = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
};

export const requiresPower = (kind: number): boolean => {
  const def = Units[kind];
  return !!def && def.race === 'protoss' && (def.roles & Role.Structure) !== 0 &&
    kind !== Kind.Nexus && kind !== Kind.Pylon && kind !== Kind.Assimilator;
};

export const isPowered = (s: State, slot: number): boolean => {
  const e = s.e;
  if (e.alive[slot] !== 1 || !requiresPower(e.kind[slot]!)) return true;
  return hasPowerAt(s, e.owner[slot]!, e.x[slot]!, e.y[slot]!);
};

export const hasPowerAt = (s: State, player: number, x: number, y: number): boolean => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.owner[i] !== player || e.built[i] !== 1 || e.kind[i] !== Kind.Pylon) continue;
    if (distSq(e.x[i]!, e.y[i]!, x, y) <= POWER_RADIUS * POWER_RADIUS) return true;
  }
  return false;
};
