import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BanditEnv } from './env.ts';
import { train, greedyAction } from './ppo.ts';
import { maskedSoftmax, sampleFrom } from './nn.ts';

test('masked softmax puts zero probability on illegal actions', () => {
  const p = maskedSoftmax([1, 2, 3, 4], [true, false, true, false]);
  assert.equal(p[1], 0);
  assert.equal(p[3], 0);
  assert.ok(Math.abs(p[0]! + p[2]! - 1) < 1e-9);
});

test('PPO learns the masked bandit (reaches near-optimal reward)', () => {
  const { net, returns } = train(() => new BanditEnv(4, 7), {
    steps: 512, iterations: 40, epochs: 4, minibatch: 128, lr: 3e-3, entCoef: 0.01, hidden: 32, seed: 3,
  });
  const early = returns.slice(0, 200).reduce((a, b) => a + b, 0) / 200;
  const late = returns.slice(-200).reduce((a, b) => a + b, 0) / 200;
  assert.ok(late > early + 0.2, `expected improvement: early ${early.toFixed(2)} -> late ${late.toFixed(2)}`);
  assert.ok(late > 0.8, `expected near-optimal late reward, got ${late.toFixed(2)}`);

  // The greedy policy should pick a LEGAL action for every observation.
  const env = new BanditEnv(4, 99);
  for (let i = 0; i < 200; i++) {
    const o = env.reset();
    const a = greedyAction(net, o.obs, o.mask);
    assert.ok(o.mask[a], 'greedy policy chose an illegal action');
    env.step(a);
  }
});

test('sampling never returns an illegal (zero-prob) action', () => {
  const p = maskedSoftmax([5, 5, 5, 5], [false, true, false, true]);
  for (let i = 0; i < 1000; i++) {
    const a = sampleFrom(p, i / 1000);
    assert.ok(a === 1 || a === 3, `sampled illegal action ${a}`);
  }
});
