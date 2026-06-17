import type { FightContext } from './fight.ts';
import { makeForce, fightPayoff, OPEN_FIELD } from './fight.ts';
import { UNITS } from './units.ts';
import { solveZeroSum } from './matrixgame.ts';

// The smallest possible STRATEGIC layer on top of the mechanical fight resolver:
// each player picks an army composition under a budget; the resolver decides the
// fight; the existing zero-sum solver finds the optimal (generally MIXED) army
// choice. This is the payoff of the whole split — "what beats what" becomes a
// matrix the resolver fills in, and the army you should build is its Nash.

export type NamedComp = { label: string; comp: Record<string, number> };

/** One near-pure army per unit type: spend the whole budget on that unit. */
export const pureComps = (budget: number, names: string[]): NamedComp[] =>
  names.map((n) => {
    const count = Math.floor(budget / UNITS[n]!.cost);
    return { label: `${count}x ${UNITS[n]!.name}`, comp: { [n]: count } };
  });

/** Payoff matrix M[i][j] = fight result for row comp i vs column comp j (A view). */
export const compositionMatrix = (comps: NamedComp[], ctx: FightContext = OPEN_FIELD): number[][] =>
  comps.map((r) => comps.map((c) => fightPayoff(makeForce(r.comp), makeForce(c.comp), ctx)));

export type CompositionSolution = {
  value: number;
  mix: number[]; // optimal probability over `comps`
  matrix: number[][];
};

/** Solve the composition game: value + the optimal mixed army choice. */
export const solveCompositionGame = (comps: NamedComp[], ctx: FightContext = OPEN_FIELD): CompositionSolution => {
  const matrix = compositionMatrix(comps, ctx);
  const sol = solveZeroSum(matrix);
  return { value: sol.value, mix: sol.row, matrix };
};

/** Count non-transitive triples in a composition payoff matrix (i>j>k>i). */
export const countCounterCycles = (M: number[][]): number => {
  const n = M.length;
  const beats = (i: number, j: number): boolean => i !== j && M[i]![j]! === 1 && M[j]![i]! === -1;
  let c = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) if (beats(i, j) && beats(j, k) && beats(k, i)) c++;
  return c / 3;
};
