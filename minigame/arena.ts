import type { Outcome, Params, State } from './types.ts';
import { initialState, outcome, step } from './game.ts';
import type { Policy } from './oracle.ts';

export type MatchResult = { result: Outcome; turns: number; final: State };

/** Play `polA` (as A) vs `polB` (as B) forward to termination. Deterministic. */
export const playMatch = (polA: Policy, polB: Policy, p: Params): MatchResult => {
  let s = initialState(p);
  for (;;) {
    const o = outcome(s, p);
    if (o !== null) return { result: o, turns: s.turn, final: s };
    s = step(s, polA(s, 'a', p), polB(s, 'b', p), p);
  }
};

export type Entry = { name: string; policy: Policy };

/**
 * Round-robin payoff matrix. Cell [i][j] is the result for row policy i (as A)
 * vs column policy j (as B), from A's perspective (+1/0/-1). A non-transitive
 * "rock-paper-scissors" shows up as a cycle of +1s that can't be linearly
 * ordered — the structural reason a single fixed strategy is exploitable and a
 * league is needed.
 */
export const payoffMatrix = (entries: Entry[], p: Params): Outcome[][] =>
  entries.map((row) => entries.map((col) => playMatch(row.policy, col.policy, p).result));

/** A crude transitivity probe: count cyclic triples (i>j, j>k, k>i). */
export const countCycles = (M: Outcome[][]): number => {
  const n = M.length;
  const beats = (i: number, j: number): boolean => i !== j && M[i]![j] === 1 && M[j]![i] === -1;
  let cycles = 0;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      for (let k = 0; k < n; k++)
        if (beats(i, j) && beats(j, k) && beats(k, i)) cycles++;
  return cycles / 3; // each cycle counted 3x (rotations)
};
