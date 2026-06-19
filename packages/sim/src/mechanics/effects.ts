import { EffectKind } from '../data/index.ts';
import type { State } from '../entity/world.ts';
import { topDownPointDistanceSq } from '../spatial/geometry.ts';

export const inRadius = (s: State, slot: number, x: number, y: number, radius: number): boolean =>
  topDownPointDistanceSq(s, slot, x, y) <= radius * radius;

export const coveredByEffect = (s: State, slot: number, kind: EffectKind): boolean => {
  const fx = s.effects;
  for (let i = 0; i < fx.hi; i++) {
    if (fx.alive[i] !== 1 || fx.kind[i] !== kind) continue;
    if (inRadius(s, slot, fx.x[i]!, fx.y[i]!, fx.radius[i]!)) return true;
  }
  return false;
};
