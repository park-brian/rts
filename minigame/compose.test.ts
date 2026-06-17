import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pureComps, compositionMatrix, solveCompositionGame, countCounterCycles } from './compose.ts';
import { OPEN_FIELD } from './fight.ts';
import type { FightContext } from './fight.ts';

const NAMES = ['marine', 'zealot', 'vulture', 'hydra', 'tank'];
const BUDGET = 600;
const CHOKE: FightContext = { frontageA: 2, frontageB: 2, dmgMultA: 1, dmgMultB: 1 };

// 6. The composition game is non-transitive, and the optimal army is MIXED.
test('open-field composition game is non-transitive (a counter cycle exists)', () => {
  const M = compositionMatrix(pureComps(BUDGET, NAMES), OPEN_FIELD);
  assert.ok(countCounterCycles(M) >= 1, 'expected at least one counter cycle');
});

test('the optimal army choice is a mixed strategy (support > 1)', () => {
  const sol = solveCompositionGame(pureComps(BUDGET, NAMES), OPEN_FIELD);
  const support = sol.mix.filter((p) => p > 1e-3).length;
  assert.ok(support >= 2, `expected a mixed optimum, got support ${support}`);
  // Symmetric game => value 0 (no army dominates the field).
  assert.ok(Math.abs(sol.value) < 1e-6, `value ${sol.value}`);
});

test('terrain changes the strategic answer (choke collapses the cycle)', () => {
  const open = solveCompositionGame(pureComps(BUDGET, NAMES), OPEN_FIELD);
  const choke = solveCompositionGame(pureComps(BUDGET, NAMES), CHOKE);
  const supp = (m: number[]) => m.filter((p) => p > 1e-3).length;
  // The open field needs a spread of answers; the choke concentrates onto fewer.
  assert.ok(supp(open.mix) > supp(choke.mix), `open support ${supp(open.mix)} should exceed choke ${supp(choke.mix)}`);
});

test('the matrix is a valid zero-sum payoff (antisymmetric on the diagonal mirror)', () => {
  const M = compositionMatrix(pureComps(BUDGET, NAMES), OPEN_FIELD);
  for (let i = 0; i < M.length; i++) {
    assert.equal(M[i]![i], 0, 'a mirror matchup must be a draw');
    for (let j = 0; j < M.length; j++) if (i !== j) assert.equal(M[i]![j], -M[j]![i]!, `antisymmetry at ${i},${j}`);
  }
});
