import {
  effectFieldAffordances, effectVisibilityAffordances,
  type EffectFieldAffordance, type EffectVisibilityAffordance,
} from './sim.ts';
import type { Game } from './game.ts';
import type { LastKnownEnemyAffordance } from './visibility-controller.ts';

export type VisibilityAffordance = EffectVisibilityAffordance;
export type FieldAffordance = EffectFieldAffordance;
export type LastKnownAffordance = LastKnownEnemyAffordance;

const query = (game: Game) => ({
  viewer: game.human,
  tileVisible: (tx: number, ty: number) => game.tileVisible(tx, ty),
});

export const visibilityAffordances = (game: Game, out: VisibilityAffordance[] = []): VisibilityAffordance[] =>
  effectVisibilityAffordances(game.sim.fullState(), query(game), out);

export const fieldAffordances = (game: Game, out: FieldAffordance[] = []): FieldAffordance[] =>
  effectFieldAffordances(game.sim.fullState(), query(game), out);

export const lastKnownEnemies = (game: Game, out: LastKnownAffordance[] = []): LastKnownAffordance[] =>
  game.lastKnownEnemies(out);
