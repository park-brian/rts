import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Oracle } from './oracle.ts';
import { initialState } from './game.ts';
import { ARCHETYPES, greedy } from './policies.ts';
import { TINY, TINY_MARCH } from './params.ts';

// The heavy full-tree solves use TINY_MARCH: it is the movement-cost game (a
// rush must spend a turn in transit) and still solves exactly in ~1-2s. We solve
// it ONCE here and share the result across tests.
const oracle = new Oracle(TINY_MARCH);
const start = initialState(TINY_MARCH);
const sol = oracle.solve(start);

test('symmetric start has value ~0 (optimal play draws)', () => {
  assert.ok(Math.abs(sol.value) < 1e-6, `value ${sol.value}`);
  const sum = sol.row.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-6, `row sum ${sum}`);
});

test('oracle value bounds every archetype: no bot can beat the oracle', () => {
  for (const e of ARCHETYPES) {
    // If A plays the archetype and B best-responds, B holds A to <= the game
    // value: the archetype as A cannot force more than optimal play would.
    const brB = oracle.bestResponseValue(start, e.policy, 'b');
    assert.ok(brB <= sol.value + 1e-6, `${e.name}: best-response ${brB} > value ${sol.value}`);
  }
});

test('a never-attacking economy is exploitable (best-responder wins outright)', () => {
  // Use the instant game so a build-up-and-kill is unobstructed and decisive.
  const o = new Oracle(TINY);
  const brB = o.bestResponseValue(initialState(TINY), greedy, 'b');
  assert.equal(brB, -1, `pure-greedy exploitability value ${brB}`);
});

test('oracle is deterministic (a fresh solve reproduces the value)', () => {
  const fresh = new Oracle(TINY_MARCH);
  assert.equal(fresh.solve(initialState(TINY_MARCH)).value, sol.value);
});

test('movement cost enlarges the reachable state space vs the instant game', () => {
  // Same caps, only marchTime differs: committed troops + warning windows are
  // genuinely new state, so the march game must reach strictly more states.
  const instant = { ...TINY_MARCH, marchTime: 0 };
  const oi = new Oracle(instant);
  oi.solve(initialState(instant));
  assert.ok(oracle.nodeCount > oi.nodeCount, `march ${oracle.nodeCount} should exceed instant ${oi.nodeCount}`);
});
