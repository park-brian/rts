import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GridNet, cellSoftmax } from './grid.ts';
import { GridEnv, GRID_CHANNELS } from './gridEnv.ts';
import { trainGrid, evalGrid } from './ppoGrid.ts';

// The gold-standard correctness test for the hand-written conv backprop: analytic
// gradients must match finite-difference numerical gradients.
test('conv backprop matches numerical gradients (analytic == finite-difference)', () => {
  const Cin = 5, H = 6, W = 6, A = 4, F = 8;
  const net = new GridNet(Cin, H, W, A, F, 7);
  const planes = Float64Array.from({ length: Cin * H * W }, (_, i) => Math.sin(i * 0.3));
  const loss = (): number => { const f = net.forward(planes); let s = f.value; for (const l of f.logits) s += 0.5 * l; return s; };

  net.zeroGrad();
  const f = net.forward(planes);
  net.backward(f.cache, new Float64Array(A * H * W).fill(0.5), 1);

  const eps = 1e-4;
  const check = (p: { v: Float64Array; g: Float64Array }, idxs: number[]) => {
    for (const i of idxs) {
      const o = p.v[i]!;
      p.v[i] = o + eps; const lp = loss();
      p.v[i] = o - eps; const lm = loss();
      p.v[i] = o;
      const num = (lp - lm) / (2 * eps);
      const rel = Math.abs(num - p.g[i]!) / (Math.abs(num) + Math.abs(p.g[i]!) + 1e-9);
      assert.ok(rel < 1e-4, `grad mismatch ${p.g[i]} vs ${num} (rel ${rel})`);
    }
  };
  check(net.conv1, [0, 17, 40]);
  check(net.conv2, [0, 5, 30]);
  check(net.convP, [0, 3, 15]);
  check(net.Wv, [0, 3, 7]);
  check(net.b1, [0, 2]);
});

test('GridNet commands every active cell with a per-cell mask; sampling stays legal', () => {
  const env = new GridEnv();
  const obs = env.reset();
  const net = new GridNet(env.channels, env.H, env.W, env.actions, 8, 1);
  const hw = env.H * env.W;
  assert.ok(obs.active.length >= 2, 'player 0 should start with >=2 idle units (base + worker)');
  const f = net.forward(obs.planes);
  for (const a of obs.active) {
    assert.ok(a.mask[0], 'None always legal');
    const p = cellSoftmax(f.logits, a.cell, env.actions, hw, a.mask);
    // probability mass only on legal slots
    for (let i = 0; i < env.actions; i++) if (!a.mask[i]) assert.equal(p[i], 0, `illegal slot ${i} had probability`);
    const sum = p.reduce((x, y) => x + y, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, `cell distribution must sum to 1, got ${sum}`);
  }
  // base vs worker have different legal sets — per-cell masking is real
  assert.ok(new Set(obs.active.map((a) => a.mask.join(''))).size === obs.active.length);
});

test('observation has the declared channel count', () => {
  const env = new GridEnv();
  assert.equal(env.channels, GRID_CHANNELS);
  assert.equal(env.reset().planes.length, GRID_CHANNELS * env.H * env.W);
});

test('GridNet PPO improves over training (deterministic episode-return trend)', () => {
  // Fully seeded => deterministic. A modest budget; the conv policy is heavier
  // than the flat MLP, so we assert the (cheaper, faster-moving) return trend
  // rather than the greedy economy. The numerical gradient check above is the
  // correctness anchor; this confirms learning actually happens.
  const { net, returns } = trainGrid(() => new GridEnv(), { steps: 384, iterations: 20, epochs: 3, minibatch: 128, F: 8, lr: 1e-3, entCoef: 0.03, seed: 3 });
  const k = Math.min(12, Math.floor(returns.length / 2));
  const early = returns.slice(0, k).reduce((a, b) => a + b, 0) / k;
  const late = returns.slice(-k).reduce((a, b) => a + b, 0) / k;
  assert.ok(late > early, `expected improving return: ${early.toFixed(2)} -> ${late.toFixed(2)}`);
  // and the trained net is a valid economy player (greedy eval no worse than untrained)
  const untrained = new GridNet(new GridEnv().channels, 8, 8, new GridEnv().actions, 8, 999);
  assert.ok(evalGrid(net, new GridEnv()) >= evalGrid(untrained, new GridEnv()), 'trained should not be worse than untrained');
});
