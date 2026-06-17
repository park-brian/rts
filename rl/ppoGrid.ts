import { GridNet, cellSoftmax } from './grid.ts';
import { sampleFrom, entropy } from './nn.ts';
import type { GridEnv, ActiveCell } from './gridEnv.ts';

// PPO over the GridNet: ONE conv forward pass per state produces logits for every
// cell; the joint policy is the product of per-cell (masked) policies, so the
// joint log-prob is the sum over active cells and the per-cell gradient is
// scattered back into the shared conv weights. Same masked-PPO optimizations as
// the flat version (GAE, clip, entropy, advantage norm, Adam, grad clip).

export type GridCfg = {
  steps: number; iterations: number; epochs: number; minibatch: number;
  gamma: number; lambda: number; clip: number; entCoef: number; vfCoef: number; lr: number; F: number; seed: number;
};
export const GRID_DEFAULTS: GridCfg = {
  steps: 512, iterations: 40, epochs: 4, minibatch: 128,
  gamma: 0.99, lambda: 0.95, clip: 0.2, entCoef: 0.03, vfCoef: 0.5, lr: 1e-3, F: 16, seed: 1,
};

const rng = (seed: number) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; }; };

type TS = { planes: Float64Array; active: { cell: number; slot: number; mask: boolean[] }[]; value: number; reward: number; done: boolean; oldJoint: number };

export type GridResult = { net: GridNet; returns: number[] };

export const trainGrid = (makeEnv: () => GridEnv, cfg: Partial<GridCfg> = {}): GridResult => {
  const c = { ...GRID_DEFAULTS, ...cfg };
  const env = makeEnv();
  const A = env.actions, H = env.H, W = env.W, hw = H * W;
  const net = new GridNet(env.channels, H, W, A, c.F, c.seed);
  const rand = rng(c.seed);

  let cur = env.reset();
  const returns: number[] = [];
  let epRet = 0;

  const sampleCells = (planes: Float64Array, active: ActiveCell[]) => {
    const f = net.forward(planes);
    let joint = 0;
    const chosen: { cell: number; slot: number; mask: boolean[] }[] = [];
    const acts: { cell: number; slot: number }[] = [];
    for (const a of active) {
      const p = cellSoftmax(f.logits, a.cell, A, hw, a.mask);
      const slot = sampleFrom(p, rand());
      joint += Math.log(p[slot]! + 1e-12);
      chosen.push({ cell: a.cell, slot, mask: a.mask });
      acts.push({ cell: a.cell, slot });
    }
    return { value: f.value, joint, chosen, acts };
  };

  for (let it = 0; it < c.iterations; it++) {
    const buf: TS[] = [];
    for (let t = 0; t < c.steps; t++) {
      const { value, joint, chosen, acts } = sampleCells(cur.planes, cur.active);
      const out = env.step(acts);
      epRet += out.reward;
      buf.push({ planes: cur.planes, active: chosen, value, reward: out.reward, done: out.done, oldJoint: joint });
      if (out.done) { returns.push(epRet); epRet = 0; cur = env.reset(); } else cur = out.obs;
    }

    const last = net.forward(cur.planes).value;
    const adv = new Array(buf.length).fill(0);
    let gae = 0;
    for (let t = buf.length - 1; t >= 0; t--) {
      const nonterm = buf[t]!.done ? 0 : 1;
      const nextV = t === buf.length - 1 ? last : buf[t + 1]!.value;
      const delta = buf[t]!.reward + c.gamma * nonterm * nextV - buf[t]!.value;
      gae = delta + c.gamma * c.lambda * nonterm * gae;
      adv[t] = gae;
    }
    const ret = adv.map((a, t) => a + buf[t]!.value);

    const idx = buf.map((_, i) => i);
    for (let e = 0; e < c.epochs; e++) {
      for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [idx[i], idx[j]] = [idx[j]!, idx[i]!]; }
      for (let mb = 0; mb < idx.length; mb += c.minibatch) {
        const batch = idx.slice(mb, mb + c.minibatch);
        let mean = 0; for (const k of batch) mean += adv[k]!; mean /= batch.length;
        let varr = 0; for (const k of batch) varr += (adv[k]! - mean) ** 2; varr /= batch.length;
        const std = Math.sqrt(varr) + 1e-8;
        for (const k of batch) {
          const ts = buf[k]!;
          const f = net.forward(ts.planes);
          let newJoint = 0;
          const ps = ts.active.map((a) => { const p = cellSoftmax(f.logits, a.cell, A, hw, a.mask); newJoint += Math.log(p[a.slot]! + 1e-12); return p; });
          const ratio = Math.exp(newJoint - ts.oldJoint);
          const Adv = (adv[k]! - mean) / std;
          const unclipped = ratio * Adv;
          const clippedR = Math.min(Math.max(ratio, 1 - c.clip), 1 + c.clip);
          const clipped = clippedR * Adv;
          let dObj: number;
          if (unclipped <= clipped) dObj = ratio * Adv; else dObj = ratio > 1 + c.clip || ratio < 1 - c.clip ? 0 : ratio * Adv;
          const dPolicy = -dObj;

          const dLogits = new Float64Array(A * hw);
          for (let ci = 0; ci < ts.active.length; ci++) {
            const a = ts.active[ci]!; const p = ps[ci]!; const Hh = entropy(p);
            for (let act = 0; act < A; act++) {
              if (!a.mask[act]) continue;
              const grad = dPolicy * ((act === a.slot ? 1 : 0) - p[act]!) + c.entCoef * p[act]! * (Math.log(p[act]! + 1e-12) + Hh);
              dLogits[act * hw + a.cell] = grad;
            }
          }
          net.backward(f.cache, dLogits, c.vfCoef * (f.value - ret[k]!));
        }
        net.adamStep(c.lr, batch.length);
      }
    }
  }
  return { net, returns };
};

/** Greedy economy rollout for evaluation. */
export const evalGrid = (net: GridNet, env: GridEnv): number => {
  const A = env.actions, hw = env.H * env.W;
  let obs = env.reset(); let total = 0;
  for (;;) {
    const f = net.forward(obs.planes);
    const acts = obs.active.map((a) => {
      let best = 0, bv = -Infinity;
      for (let act = 0; act < A; act++) if (a.mask[act] && f.logits[act * hw + a.cell]! > bv) { bv = f.logits[act * hw + a.cell]!; best = act; }
      return { cell: a.cell, slot: best };
    });
    const out = env.step(acts);
    total += out.reward;
    if (out.done) return total;
    obs = out.obs;
  }
};
