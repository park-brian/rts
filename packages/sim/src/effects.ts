import { EffectKind } from './data.ts';
import type { State } from './world.ts';

export const inRadius = (s: State, slot: number, x: number, y: number, radius: number): boolean => {
  const e = s.e;
  const dx = e.x[slot]! - x;
  const dy = e.y[slot]! - y;
  return dx * dx + dy * dy <= radius * radius;
};

export const coveredByEffect = (s: State, slot: number, kind: EffectKind): boolean => {
  const fx = s.effects;
  for (let i = 0; i < fx.hi; i++) {
    if (fx.alive[i] !== 1 || fx.kind[i] !== kind) continue;
    if (inRadius(s, slot, fx.x[i]!, fx.y[i]!, fx.radius[i]!)) return true;
  }
  return false;
};
