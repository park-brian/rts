import test from 'node:test';
import assert from 'node:assert/strict';
import { fx, toInt, mul, div, isqrt, ONE } from '../src/fixed.ts';

test('fx / toInt round-trip', () => {
  assert.equal(fx(5), 5 * ONE);
  assert.equal(toInt(fx(5)), 5);
  assert.equal(toInt(fx(-7)), -7);
});

test('mul / div', () => {
  assert.equal(mul(fx(2), fx(3)), fx(6));
  assert.equal(div(fx(6), fx(2)), fx(3));
  assert.equal(mul(fx(3), fx(0.5)), fx(1.5)); // fractional operands
});

test('isqrt is exact floor and deterministic on edges', () => {
  assert.equal(isqrt(0), 0);
  assert.equal(isqrt(1), 1);
  assert.equal(isqrt(15), 3);
  assert.equal(isqrt(16), 4);
  assert.equal(isqrt(17), 4);
  assert.equal(isqrt(2 ** 40), 2 ** 20);
  // exhaustive small check
  for (let n = 0; n < 1000; n++) {
    const r = isqrt(n);
    assert.ok(r * r <= n && (r + 1) * (r + 1) > n, `isqrt(${n})=${r}`);
  }
});
