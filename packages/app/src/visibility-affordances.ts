import {
  effectFieldAffordances, effectVisibilityAffordances,
  type EffectFieldAffordance, type EffectVisibilityAffordance,
} from './sim.ts';
import type { Game } from './game.ts';

export type VisibilityAffordance = EffectVisibilityAffordance;
export type FieldAffordance = EffectFieldAffordance;

const query = (game: Game) => ({
  viewer: game.human,
  tileVisible: (tx: number, ty: number) => game.tileVisible(tx, ty),
});

export const visibilityAffordances = (game: Game, out: VisibilityAffordance[] = []): VisibilityAffordance[] =>
  effectVisibilityAffordances(game.sim.fullState(), query(game), out);

export const fieldAffordances = (game: Game, out: FieldAffordance[] = []): FieldAffordance[] =>
  effectFieldAffordances(game.sim.fullState(), query(game), out);
