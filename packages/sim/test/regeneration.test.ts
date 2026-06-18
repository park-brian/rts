import test from 'node:test';
import assert from 'node:assert/strict';
import { Kind, Units, sec } from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import { slotOf } from '../src/world.ts';
import { simScenario } from '../test-support/scenario.ts';

test('zerg units regenerate hit points over time', () => {
  const { sim, state: s, spawn } = simScenario({ seed: 80 });
  const zergling = spawn(Kind.Zergling, 0, fx(400), fx(400));
  const z = slotOf(zergling);
  s.e.hp[z] = Units[Kind.Zergling]!.hp - 3;

  for (let t = 0; t < sec(6); t++) sim.step([]);

  assert.equal(s.e.hp[z], Units[Kind.Zergling]!.hp);
});

test('protoss units regenerate shields over time', () => {
  const { sim, state: s, spawn } = simScenario({ seed: 81 });
  const zealot = spawn(Kind.Zealot, 0, fx(400), fx(400));
  const z = slotOf(zealot);
  s.e.shield[z] = Units[Kind.Zealot]!.shields - 2;

  for (let t = 0; t < sec(6); t++) sim.step([]);

  assert.equal(s.e.shield[z], Units[Kind.Zealot]!.shields);
});

test('stasis pauses passive regeneration', () => {
  const { sim, state: s, spawn } = simScenario({ seed: 82 });
  const zealot = spawn(Kind.Zealot, 0, fx(400), fx(400));
  const z = slotOf(zealot);
  s.e.shield[z] = Units[Kind.Zealot]!.shields - 2;
  s.e.stasisTimer[z] = sec(6);

  for (let t = 0; t < sec(3); t++) sim.step([]);

  assert.equal(s.e.shield[z], Units[Kind.Zealot]!.shields - 2);
});
