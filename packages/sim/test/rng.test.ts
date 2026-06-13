import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng, nextU32, range } from '../src/rng.ts';

test('same seed -> same sequence', () => {
  const a = makeRng(42);
  const b = makeRng(42);
  for (let i = 0; i < 1000; i++) assert.equal(nextU32(a), nextU32(b));
});

test('different seeds diverge', () => {
  const a = makeRng(1);
  const b = makeRng(2);
  let same = 0;
  for (let i = 0; i < 100; i++) if (nextU32(a) === nextU32(b)) same++;
  assert.ok(same < 5, `sequences too similar (${same} collisions)`);
});

test('range stays in bounds', () => {
  const r = makeRng(7);
  for (let i = 0; i < 10000; i++) {
    const v = range(r, 10);
    assert.ok(v >= 0 && v < 10);
  }
});

test('outputs are uint32', () => {
  const r = makeRng(99);
  for (let i = 0; i < 1000; i++) {
    const v = nextU32(r);
    assert.ok(Number.isInteger(v) && v >= 0 && v <= 0xffffffff);
  }
});
