import { test } from 'node:test';
import assert from 'node:assert/strict';
import { focusFire, initialState, step, outcome, legalActions, stateKey } from './game.ts';
import { Target } from './types.ts';
import type { Action, State } from './types.ts';
import { TINY } from './params.ts';

test('focusFire concentrates damage (no overkill waste)', () => {
  // 3 damage into two 2-HP units: kills one (2), leaves the other at 1.
  assert.deepEqual(focusFire([2, 2], 3).sort(), [1]);
  // Exactly lethal removes a unit cleanly.
  assert.deepEqual(focusFire([2, 2], 2).sort(), [2]);
  // Overkill beyond the group just stops.
  assert.deepEqual(focusFire([2], 5), []);
  // Zero damage leaves everyone untouched.
  assert.deepEqual(focusFire([1, 2], 0).sort(), [1, 2]);
});

const idle: Action = { attack: 0, defend: 0, target: Target.Base, build: false };

test('harvesters generate income; build spends it', () => {
  const p = { ...TINY, startMinerals: 0, mineralCap: 10, maxWorkers: 6 };
  let s = initialState(p);
  // Both harvest 2 workers -> +2 minerals each (income 1).
  s = step(s, idle, idle, p);
  assert.equal(s.a.minerals, 2);
  // Build a worker (cost 1, instant) -> minerals 2 -> 1, workers 2 -> 3.
  const buildAct: Action = { ...idle, build: true };
  s = step(s, buildAct, idle, p);
  assert.equal(s.a.workers.length, 3);
  assert.equal(s.a.minerals, 2 + 2 - 1); // +2 income, -1 build
});

test('attacking the base deals damage; defenders deal free hits back', () => {
  const p = { ...TINY, baseHp: 4 };
  let s = initialState(p);
  // A sends both workers at B's BASE; B keeps both home as defenders.
  const aAttack: Action = { attack: 2, defend: 0, target: Target.Base, build: false };
  const bDefend: Action = { attack: 0, defend: 2, target: Target.Base, build: false };
  s = step(s, aAttack, bDefend, p);
  // A dealt 2 dmg to B's base (4 -> 2).
  assert.equal(s.b.baseHp, 2);
  // B's 2 defenders dealt 2 dmg "for free" to A's 2 attackers: focus fire kills one.
  assert.equal(s.a.workers.length, 1);
});

test('targeting defenders is a mutual trade; targeting harvesters denies economy', () => {
  const p = TINY;
  let s = initialState(p);
  // A attacks B's HARVESTERS with 2; B harvests both (no defenders).
  const aHarass: Action = { attack: 2, defend: 0, target: Target.Harvesters, build: false };
  s = step(s, aHarass, idle, p);
  // B had 2 harvesters; 2 dmg focus-fires one dead -> 1 left, so B earns only 1.
  assert.equal(s.b.workers.length, 1);
  assert.equal(s.b.minerals, 1);
  // A took NO damage (B had no defenders) -> both attackers survive.
  assert.equal(s.a.workers.length, 2);
});

test('movement cost: an attack is delayed in transit and visible as a warning', () => {
  const p = { ...TINY, marchTime: 1, baseHp: 4 };
  let s = initialState(p);
  const launch: Action = { attack: 2, defend: 0, target: Target.Base, build: false };
  s = step(s, launch, idle, p);
  // Workers left home and are marching (committed), base untouched, eta ticking.
  assert.equal(s.a.workers.length, 0, 'attackers left home');
  assert.ok(s.a.inbound && s.a.inbound.eta === 1, 'raid in transit');
  assert.equal(s.b.baseHp, 4, 'no damage yet — still marching');
  // Cannot launch a second raid while one is in flight.
  assert.equal(legalActions(s, 'a', p).every((act) => act.attack === 0), true);
  // Next turn it strikes.
  s = step(s, idle, idle, p);
  assert.equal(s.a.inbound, null, 'raid has landed');
  assert.equal(s.b.baseHp, 2, 'base took the hit on arrival');
  assert.equal(s.a.workers.length, 2, 'survivors retreated home');
});

test('outcome: base death ends the game', () => {
  const p = { ...TINY, baseHp: 1 };
  let s = initialState(p);
  const kill: Action = { attack: 2, defend: 0, target: Target.Base, build: false };
  s = step(s, kill, idle, p);
  assert.equal(s.b.baseHp <= 0, true);
  assert.equal(outcome(s, p), 1); // A wins
});

test('determinism: identical actions reproduce identical states', () => {
  const p = TINY;
  const run = (): State => {
    let s = initialState(p);
    const seq: Action[] = [
      { attack: 0, defend: 0, target: Target.Base, build: true },
      { attack: 1, defend: 1, target: Target.Harvesters, build: false },
      { attack: 2, defend: 0, target: Target.Base, build: false },
    ];
    for (const a of seq) s = step(s, a, idle, p);
    return s;
  };
  assert.equal(stateKey(run(), p), stateKey(run(), p));
});

test('legalActions are well-formed (no idle, valid splits)', () => {
  const s = initialState(TINY);
  const acts = legalActions(s, 'a', TINY);
  const w = s.a.workers.length;
  for (const a of acts) {
    assert.ok(a.attack + a.defend <= w, 'over-assigned workers');
    assert.ok(a.attack >= 0 && a.defend >= 0);
  }
  // With 2 workers and 0 minerals: splits (a,d) with a+d in 0..2.
  // attack=0 -> 1 target; attack>0 -> 3 targets. Count = 1*(d:0..2=3 splits)
  //   + for attack=1 (d:0..1) 2 splits *3 + attack=2 (d:0) 1 split*3 = 3 + 6 + 3 = 12.
  assert.equal(acts.length, 12);
});
