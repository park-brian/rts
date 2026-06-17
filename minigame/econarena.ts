import type { EconParams, EconState } from './econfight.ts';
import { econInitial, econOutcome, econStep } from './econfight.ts';
import type { EconPolicy } from './econpolicies.ts';

export type EconMatch = { result: 1 | -1 | 0; turns: number; final: EconState };

/** Play polA (as A) vs polB (as B) forward to termination. Deterministic. */
export const playEcon = (polA: EconPolicy, polB: EconPolicy, p: EconParams): EconMatch => {
  let s = econInitial(p);
  for (;;) {
    const o = econOutcome(s, p);
    if (o !== null) return { result: o, turns: s.turn, final: s };
    s = econStep(s, polA(s, 'a', p), polB(s, 'b', p), p);
  }
};

export type EconEntry = { name: string; policy: EconPolicy };

export const econPayoffMatrix = (entries: EconEntry[], p: EconParams): (1 | -1 | 0)[][] =>
  entries.map((row) => entries.map((col) => playEcon(row.policy, col.policy, p).result));

/** Count non-transitive triples (i beats j beats k beats i). */
export const econCycles = (M: (1 | -1 | 0)[][]): number => {
  const n = M.length;
  const beats = (i: number, j: number): boolean => i !== j && M[i]![j] === 1 && M[j]![i] === -1;
  let c = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) if (beats(i, j) && beats(j, k) && beats(k, i)) c++;
  return c / 3;
};
