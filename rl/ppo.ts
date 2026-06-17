import type { Env } from './env.ts';
import { ActorCritic, maskedSoftmax, sampleFrom, entropy } from './nn.ts';

// Masked PPO (clipped surrogate) with the "what matters in on-policy RL" defaults:
// GAE(λ), per-minibatch advantage normalization, a small-init policy head, an
// entropy bonus, value-function loss, Adam, and global grad-norm clipping.
// INVALID-ACTION MASKING is applied both when sampling and inside the loss (the
// softmax/entropy are computed over legal actions only, so illegal actions get
// exactly zero probability and zero gradient).

export type PPOConfig = {
  steps: number; // transitions collected per iteration
  iterations: number;
  epochs: number; // PPO epochs per iteration
  minibatch: number;
  gamma: number;
  lambda: number;
  clip: number;
  entCoef: number;
  vfCoef: number;
  lr: number;
  hidden: number;
  seed: number;
};

export const DEFAULTS: PPOConfig = {
  steps: 1024, iterations: 60, epochs: 4, minibatch: 256,
  gamma: 0.99, lambda: 0.95, clip: 0.2, entCoef: 0.01, vfCoef: 0.5, lr: 3e-4, hidden: 64, seed: 1,
};

type Sample = { obs: number[]; mask: boolean[]; action: number; oldLogp: number; value: number; reward: number; done: boolean };

const rng = (seed: number) => {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
};

export type TrainResult = { net: ActorCritic; returns: number[] };

export const train = (makeEnv: () => Env, cfg: Partial<PPOConfig> = {}): TrainResult => {
  const c = { ...DEFAULTS, ...cfg };
  const env = makeEnv();
  const net = new ActorCritic(env.obsDim, env.nActions, c.hidden, c.seed);
  const rand = rng(c.seed);

  let cur = env.reset();
  const epReturns: number[] = [];
  let epRet = 0;

  for (let it = 0; it < c.iterations; it++) {
    const buf: Sample[] = [];
    for (let t = 0; t < c.steps; t++) {
      const f = net.forward(cur.obs);
      const p = maskedSoftmax(f.logits, cur.mask);
      const a = sampleFrom(p, rand());
      const logp = Math.log(p[a]! + 1e-12);
      const out = env.step(a);
      epRet += out.reward;
      buf.push({ obs: cur.obs, mask: cur.mask, action: a, oldLogp: logp, value: f.v, reward: out.reward, done: out.done });
      if (out.done) { epReturns.push(epRet); epRet = 0; cur = env.reset(); }
      else cur = { obs: out.obs, mask: out.mask };
    }

    // GAE advantages + returns.
    const last = net.forward(cur.obs).v;
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

    // PPO epochs over shuffled minibatches.
    const idx = buf.map((_, i) => i);
    for (let e = 0; e < c.epochs; e++) {
      for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [idx[i], idx[j]] = [idx[j]!, idx[i]!]; }
      for (let mb = 0; mb < idx.length; mb += c.minibatch) {
        const batch = idx.slice(mb, mb + c.minibatch);
        // normalize advantages within the minibatch
        let mean = 0; for (const k of batch) mean += adv[k]!; mean /= batch.length;
        let varr = 0; for (const k of batch) varr += (adv[k]! - mean) ** 2; varr /= batch.length;
        const std = Math.sqrt(varr) + 1e-8;
        for (const k of batch) {
          const s = buf[k]!;
          const f = net.forward(s.obs);
          const p = maskedSoftmax(f.logits, s.mask);
          const logp = Math.log(p[s.action]! + 1e-12);
          const ratio = Math.exp(logp - s.oldLogp);
          const A = (adv[k]! - mean) / std;

          // clipped surrogate -> gradient wrt logp of the taken action
          const unclipped = ratio * A;
          const clippedRatio = Math.min(Math.max(ratio, 1 - c.clip), 1 + c.clip);
          const clipped = clippedRatio * A;
          let dObj_dlogp: number;
          if (unclipped <= clipped) dObj_dlogp = ratio * A;
          else dObj_dlogp = ratio > 1 + c.clip || ratio < 1 - c.clip ? 0 : ratio * A;
          const dPolicy = -dObj_dlogp; // minimize negative objective

          const H = entropy(p);
          const dLogits = new Array(net.nActions).fill(0);
          for (let aIdx = 0; aIdx < net.nActions; aIdx++) {
            if (!s.mask[aIdx]) continue;
            const onehot = aIdx === s.action ? 1 : 0;
            // policy term: dPolicy * d logp / d logit
            dLogits[aIdx] = dPolicy * (onehot - p[aIdx]!);
            // entropy bonus (maximize H): adds entCoef * p*(log p + H)
            dLogits[aIdx]! += c.entCoef * p[aIdx]! * (Math.log(p[aIdx]! + 1e-12) + H);
          }
          const dV = c.vfCoef * (f.v - ret[k]!);
          net.backward(s.obs, f.h, dLogits, dV);
        }
        net.adamStep(c.lr, batch.length);
      }
    }
  }
  return { net, returns: epReturns };
};

/** Greedy (argmax over legal) action — for deterministic evaluation. */
export const greedyAction = (net: ActorCritic, obs: number[], mask: boolean[]): number => {
  const f = net.forward(obs);
  let best = -1; let bv = -Infinity;
  for (let i = 0; i < mask.length; i++) if (mask[i] && f.logits[i]! > bv) { bv = f.logits[i]!; best = i; }
  return best;
};
