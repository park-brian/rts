import { test } from 'node:test';
import assert from 'node:assert/strict';
import { payoffMatrix, countCycles, playMatch } from './arena.ts';
import { ARCHETYPES, cheese, macro, turtle, greedy } from './policies.ts';
import { SMALL } from './params.ts';

test('the SMALL preset sits in a NON-TRANSITIVE regime (the cycle exists)', () => {
  const M = payoffMatrix(ARCHETYPES, SMALL);
  assert.ok(countCycles(M) >= 1, 'expected at least one rock-paper-scissors triple');
});

test('the cycle is cheese > macro > turtle > cheese', () => {
  // "a beats b" robustly: a wins as A vs b, and b loses as A vs a.
  const beats = (a: typeof cheese, b: typeof cheese): boolean =>
    playMatch(a, b, SMALL).result === 1 && playMatch(b, a, SMALL).result === -1;
  assert.ok(beats(cheese, macro), 'cheese should beat macro');
  assert.ok(beats(macro, turtle), 'macro should beat turtle');
  assert.ok(beats(turtle, cheese), 'turtle should beat cheese');
});

test('pure greedy (never attacks) loses to every aggressive archetype', () => {
  for (const e of ARCHETYPES) {
    if (e.policy === greedy) continue;
    // greedy as A vs an aggressor as B: greedy never threatens, so it cannot win.
    const r = playMatch(greedy, e.policy, SMALL).result;
    assert.ok(r !== 1, `greedy unexpectedly beat ${e.name}`);
  }
});

test('matches are deterministic and terminate', () => {
  const r1 = playMatch(cheese, turtle, SMALL);
  const r2 = playMatch(cheese, turtle, SMALL);
  assert.equal(r1.result, r2.result);
  assert.ok(r1.turns <= SMALL.horizon);
});
