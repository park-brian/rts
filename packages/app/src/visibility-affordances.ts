import { effectVisibilityAffordances, type EffectVisibilityAffordance } from './sim.ts';
import type { Game } from './game.ts';

export type VisibilityAffordance = EffectVisibilityAffordance;

export const visibilityAffordances = (game: Game, out: VisibilityAffordance[] = []): VisibilityAffordance[] => {
  const s = game.sim.fullState();
  return effectVisibilityAffordances(s, {
    viewer: game.human,
    tileVisible: (tx, ty) => game.tileVisible(tx, ty),
  }, out);
};
