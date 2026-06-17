import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ECON, econInitial, econStep } from './econfight.ts';
import type { EconAction } from './econfight.ts';
import { ECON_POLICIES, greedy, vultureRush } from './econpolicies.ts';
import { playEcon, econPayoffMatrix, econCycles } from './econarena.ts';

const idle: EconAction = { build: 'idle', commit: false };

test('econ game is deterministic', () => {
  const r1 = playEcon(vultureRush, greedy, ECON);
  const r2 = playEcon(vultureRush, greedy, ECON);
  assert.equal(r1.result, r2.result);
  assert.equal(r1.turns, r2.turns);
});

test('a fixed matchup injects zero variance', () => {
  const outs = new Set<number>();
  for (let i = 0; i < 6; i++) outs.add(playEcon(vultureRush, greedy, ECON).result);
  assert.equal(outs.size, 1, `varied: ${[...outs]}`);
});

test('symmetry: every mirror match is a draw', () => {
  for (const e of ECON_POLICIES) {
    assert.equal(playEcon(e.policy, e.policy, ECON).result, 0, `${e.name} mirror was not a draw`);
  }
});

test('committing sends the whole army (home empties) after the march delay', () => {
  const p = { ...ECON, marchTime: 2 };
  let s = econInitial(p);
  // Hand-build a couple marines, then commit.
  s = econStep(s, { build: 'marine', commit: false }, idle, p);
  s = econStep(s, { build: 'marine', commit: false }, idle, p);
  assert.equal(s.a.army.length, 2);
  s = econStep(s, { build: 'idle', commit: true }, idle, p);
  assert.equal(s.a.army.length, 0, 'standing army left home');
  assert.ok(s.a.attack && s.a.attack.army.length === 2, 'army is in transit');
});

test('an aggressive build razes a pure-economy opponent', () => {
  assert.equal(playEcon(vultureRush, greedy, ECON).result, 1);
});

test('the build-order metagame is non-transitive (a cycle exists)', () => {
  const M = econPayoffMatrix(ECON_POLICIES, ECON);
  assert.ok(econCycles(M) >= 1, 'expected at least one non-transitive triple');
});

test('the cycle is vultureRush > zealotPush > tankTech > vultureRush', () => {
  const beats = (a: typeof greedy, b: typeof greedy) => playEcon(a, b, ECON).result === 1 && playEcon(b, a, ECON).result === -1;
  const i = (n: string) => ECON_POLICIES.find((e) => e.name === n)!.policy;
  assert.ok(beats(i('vultureRush'), i('zealotPush')), 'vultureRush > zealotPush');
  assert.ok(beats(i('zealotPush'), i('tankTech')), 'zealotPush > tankTech');
  assert.ok(beats(i('tankTech'), i('vultureRush')), 'tankTech > vultureRush');
});

test('widening the attacker frontage collapses the cycle (regime, not law)', () => {
  const open = { ...ECON, ctx: { frontageA: 99, frontageB: 99, dmgMultA: 1, dmgMultB: 1 } };
  const cyclesOpen = econCycles(econPayoffMatrix(ECON_POLICIES, open));
  const cyclesChoke = econCycles(econPayoffMatrix(ECON_POLICIES, ECON));
  assert.ok(cyclesChoke >= 1 && cyclesOpen < cyclesChoke, `choke ${cyclesChoke} vs open ${cyclesOpen}`);
});
