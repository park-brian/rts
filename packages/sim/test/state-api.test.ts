import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/sim.ts';
import { sliceMap } from '../src/map.ts';
import { kill, slotOf } from '../src/world.ts';
import { spawnUnit } from '../src/factory.ts';
import { Kind } from '../src/data.ts';
import { fx } from '../src/fixed.ts';

test('observe requires vision tracking and returns a defensive vision copy', () => {
  const noVision = new Sim({ map: sliceMap(), players: 1, seed: 201 });
  assert.throws(() => noVision.observe(0), /vision tracking is disabled/);

  const sim = new Sim({ map: sliceMap(), players: 1, seed: 202, vision: true });
  const obs = sim.observe(0);
  assert.ok(obs.vision.some((v) => v === 2), 'initial vision is computed before the first tick');
  obs.vision.fill(0);
  assert.ok(sim.observe(0).vision.some((v) => v === 2), 'mutating observation does not mutate sim fog');
});

test('byte serialization preserves vision tracking and fog memory', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 203, vision: true });
  for (let t = 0; t < 10; t++) sim.step([]);
  const before = sim.observe(0).vision;

  const restored = Sim.deserialize(sim.serialize());
  assert.equal(restored.fullState().trackVision, true);
  assert.deepEqual(restored.observe(0).vision, before);
});

test('state hash includes dead-slot allocation history', () => {
  const a = new Sim({ map: sliceMap(), players: 1, seed: 204 });
  const b = new Sim({ map: sliceMap(), players: 1, seed: 204 });
  const extra = slotOf(spawnUnit(b.fullState(), Kind.Marine, 0, fx(500), fx(500)));
  kill(b.fullState(), extra);

  assert.notEqual(a.hash(), b.hash(), 'same live entities but different allocation history must not hash equal');
});

test('recorded replay stops growing after game over', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 205, record: true });
  const s = sim.fullState();
  for (let i = 0; i < s.e.hi; i++) {
    if (s.e.alive[i] === 1 && s.e.kind[i] === Kind.CommandCenter && s.e.owner[i] === 1) kill(s, i);
  }
  sim.step([]);
  assert.equal(s.result.over, true);
  const terminalLength = sim.frames!.length;

  for (let i = 0; i < 5; i++) sim.step([]);
  assert.equal(sim.frames!.length, terminalLength);
});
