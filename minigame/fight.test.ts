import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeForce, resolveFight, fightPayoff, forceCount, OPEN_FIELD } from './fight.ts';
import type { FightContext } from './fight.ts';
import { UNITS, effectiveDamage } from './units.ts';

const f = (c: Record<string, number>) => makeForce(c);
const CHOKE: FightContext = { frontageA: 2, frontageB: 2, dmgMultA: 1, dmgMultB: 1 };

// 1. Determinism.
test('resolveFight is deterministic', () => {
  const r1 = resolveFight(f({ marine: 12 }), f({ tank: 3 }), OPEN_FIELD);
  const r2 = resolveFight(f({ marine: 12 }), f({ tank: 3 }), OPEN_FIELD);
  assert.equal(r1.winner, r2.winner);
  assert.equal(forceCount(r1.survivorsA), forceCount(r2.survivorsA));
  assert.equal(forceCount(r1.survivorsB), forceCount(r2.survivorsB));
});

// 2. Variance test (the core contract): fixed compositions => zero outcome variance.
test('a fixed matchup injects zero variance into the payoff', () => {
  const payoffs = new Set<number>();
  for (let i = 0; i < 8; i++) payoffs.add(fightPayoff(f({ vulture: 8 }), f({ zealot: 6 }), OPEN_FIELD));
  assert.equal(payoffs.size, 1, `outcome varied across identical runs: ${[...payoffs]}`);
});

// 3. Damage-type x size counters (the composition-counter mechanic).
test('explosive is strong vs Large, weak vs Small (multiplier + a real fight)', () => {
  // Tank (explosive) does full vs a Large target, half vs a Small one.
  assert.ok(effectiveDamage(UNITS.tank!, UNITS.tank!) > effectiveDamage(UNITS.tank!, UNITS.marine!));
  // And in the open a cheap Small swarm overwhelms the explosive army.
  assert.equal(resolveFight(f({ tank: 4 }), f({ marine: 24 }), OPEN_FIELD).winner, 'B');
});

test('concussive is strong vs Small, weak vs Large', () => {
  assert.ok(effectiveDamage(UNITS.vulture!, UNITS.marine!) > effectiveDamage(UNITS.vulture!, UNITS.tank!));
  assert.equal(resolveFight(f({ vulture: 8 }), f({ marine: 24 }), OPEN_FIELD).winner, 'A');
});

// 4. Square law: concentration makes 2x the army win with most of it intact.
test('square law: double the army wins with more than half surviving', () => {
  const r = resolveFight(f({ marine: 8 }), f({ marine: 4 }), OPEN_FIELD);
  assert.equal(r.winner, 'A');
  assert.ok(forceCount(r.survivorsA) > 4, `expected >4 survivors, got ${forceCount(r.survivorsA)}`);
});

// 5. Terrain flips a counter.
test('a choke flips the swarm-vs-heavy matchup', () => {
  assert.equal(resolveFight(f({ tank: 4 }), f({ marine: 24 }), OPEN_FIELD).winner, 'B'); // open: swarm
  assert.equal(resolveFight(f({ tank: 4 }), f({ marine: 24 }), CHOKE).winner, 'A'); // choke: heavy
});

// Symmetry: mirroring the matchup mirrors the result.
test('the resolver is symmetric under swapping sides', () => {
  const r = resolveFight(f({ vulture: 8 }), f({ tank: 4 }), OPEN_FIELD);
  const s = resolveFight(f({ tank: 4 }), f({ vulture: 8 }), OPEN_FIELD);
  const flip = (w: string) => (w === 'A' ? 'B' : w === 'B' ? 'A' : 'draw');
  assert.equal(flip(r.winner), s.winner);
});
