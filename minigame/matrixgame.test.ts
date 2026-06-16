import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solveZeroSum } from './matrixgame.ts';

const close = (a: number, b: number, eps = 1e-6): boolean => Math.abs(a - b) <= eps;

test('matching pennies: value 0, uniform mix', () => {
  const sol = solveZeroSum([
    [1, -1],
    [-1, 1],
  ]);
  assert.ok(close(sol.value, 0), `value ${sol.value}`);
  assert.ok(close(sol.row[0]!, 0.5) && close(sol.col[0]!, 0.5), JSON.stringify(sol));
});

test('rock-paper-scissors: value 0, uniform mix', () => {
  const sol = solveZeroSum([
    [0, -1, 1],
    [1, 0, -1],
    [-1, 1, 0],
  ]);
  assert.ok(close(sol.value, 0), `value ${sol.value}`);
  for (const x of sol.row) assert.ok(close(x, 1 / 3), `row ${x}`);
  for (const x of sol.col) assert.ok(close(x, 1 / 3), `col ${x}`);
});

test('dominant row: pure value', () => {
  // Row 0 dominates row 1; column then minimizes within row 0 -> value 3.
  const sol = solveZeroSum([
    [3, 5],
    [1, 2],
  ]);
  assert.ok(close(sol.value, 3), `value ${sol.value}`);
  assert.ok(close(sol.row[0]!, 1), `row ${JSON.stringify(sol.row)}`);
});

test('classic 2x2 with mixed equilibrium (value 1/5)', () => {
  // [[ -1, 2 ], [ 3, -4 ]] has value -2/... let us use a known one:
  // [[2,-1],[-1,1]] -> value = 1/5, row = (2/5,3/5).
  const sol = solveZeroSum([
    [2, -1],
    [-1, 1],
  ]);
  assert.ok(close(sol.value, 0.2), `value ${sol.value}`);
  assert.ok(close(sol.row[0]!, 0.4) && close(sol.row[1]!, 0.6), JSON.stringify(sol.row));
});

test('strategies are valid distributions', () => {
  const sol = solveZeroSum([
    [4, 0, 2],
    [0, 3, 1],
    [1, 1, 5],
  ]);
  const sum = (a: number[]): number => a.reduce((x, y) => x + y, 0);
  assert.ok(close(sum(sol.row), 1), `row sum ${sum(sol.row)}`);
  assert.ok(close(sum(sol.col), 1), `col sum ${sum(sol.col)}`);
  for (const x of [...sol.row, ...sol.col]) assert.ok(x >= -1e-9, `nonneg ${x}`);
});
