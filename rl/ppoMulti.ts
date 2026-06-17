import { ActorCritic, maskedSoftmax, sampleFrom, entropy } from './nn.ts';
import type { MicroRTSEnv } from './micrortsEnv.ts';

// Factored masked PPO for the multi-unit env. The joint policy over a frame is
// the PRODUCT of independent per-unit policies (GridNet/Gym-µRTS assumption), so
// the joint log-prob is the SUM of per-unit masked log-probs and the gradient
// distributes to each unit's head. A shared per-unit actor commands every unit;
// a separate critic values the global state.

export type MultiCfg = {
  steps: number; iterations: number; epochs: number; minibatch: number;
  gamma: number; lambda: number; clip: number; entCoef: number; vfCoef: number; lr: number; hidden: number; seed: number;
};
export const MULTI_DEFAULTS: MultiCfg = {
  steps: 512, iterations: 30, epochs: 4, minibatch: 128,
  gamma: 0.99, lambda: 0.95, clip: 0.2, entCoef: 0.01, vfCoef: 0.5, lr: 3e-3, hidden: 64, seed: 1,
};

type UnitRec = { obs: number[]; mask: boolean[]; slot: number };
type TS = { recs: UnitRec[]; global: number[]; value: number; reward: number; done: boolean; oldJoint: number };

const rng = (seed: number) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; }; };

export type MultiResult = { actor: ActorCritic; critic: ActorCritic; returns: number[] };

export const trainMulti = (makeEnv: () => MicroRTSEnv, cfg: Partial<MultiCfg> = {}): MultiResult => {
  const c = { ...MULTI_DEFAULTS, ...cfg };
  const env = makeEnv();
  const actor = new ActorCritic(env.unitObsDim, env.perUnitActions, c.hidden, c.seed);
  const critic = new ActorCritic(env.globalObsDim, 1, c.hidden, c.seed + 1);
  const rand = rng(c.seed);

  let cur = env.reset();
  const returns: number[] = [];
  let epRet = 0;

  for (let it = 0; it < c.iterations; it++) {
    const buf: TS[] = [];
    for (let t = 0; t < c.steps; t++) {
      const recs: UnitRec[] = [];
      let joint = 0;
      const acts: { unitId: number; slot: number }[] = [];
      for (const u of cur.units) {
        const f = actor.forward(u.obs);
        const p = maskedSoftmax(f.logits, u.mask);
        const slot = sampleFrom(p, rand());
        joint += Math.log(p[slot]! + 1e-12);
        recs.push({ obs: u.obs, mask: u.mask, slot });
        acts.push({ unitId: u.id, slot });
      }
      const value = critic.forward(cur.global).v;
      const out = env.step(acts);
      epRet += out.reward;
      buf.push({ recs, global: cur.global, value, reward: out.reward, done: out.done, oldJoint: joint });
      if (out.done) { returns.push(epRet); epRet = 0; cur = env.reset(); } else cur = out.obs;
    }

    const last = critic.forward(cur.global).v;
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
        let unitCount = 0;
        for (const k of batch) {
          const ts = buf[k]!;
          // recompute joint new log-prob and cache per-unit forward
          const fs = ts.recs.map((r) => actor.forward(r.obs));
          const ps = fs.map((f, i) => maskedSoftmax(f.logits, ts.recs[i]!.mask));
          let newJoint = 0;
          for (let i = 0; i < ts.recs.length; i++) newJoint += Math.log(ps[i]![ts.recs[i]!.slot]! + 1e-12);
          const ratio = Math.exp(newJoint - ts.oldJoint);
          const A = (adv[k]! - mean) / std;
          const unclipped = ratio * A;
          const clippedR = Math.min(Math.max(ratio, 1 - c.clip), 1 + c.clip);
          const clipped = clippedR * A;
          let dObj: number;
          if (unclipped <= clipped) dObj = ratio * A;
          else dObj = ratio > 1 + c.clip || ratio < 1 - c.clip ? 0 : ratio * A;
          const dPolicy = -dObj; // shared across all units (one joint ratio)

          for (let i = 0; i < ts.recs.length; i++) {
            const p = ps[i]!; const r = ts.recs[i]!; const H = entropy(p);
            const dLogits = new Array(actor.nActions).fill(0);
            for (let a = 0; a < actor.nActions; a++) {
              if (!r.mask[a]) continue;
              dLogits[a] = dPolicy * ((a === r.slot ? 1 : 0) - p[a]!) + c.entCoef * p[a]! * (Math.log(p[a]! + 1e-12) + H);
            }
            actor.backward(r.obs, fs[i]!.h, dLogits, 0);
            unitCount++;
          }
          const fv = critic.forward(ts.global);
          critic.backward(ts.global, fv.h, [0], c.vfCoef * (fv.v - ret[k]!));
        }
        if (unitCount > 0) actor.adamStep(c.lr, unitCount);
        critic.adamStep(c.lr, batch.length);
      }
    }
  }
  return { actor, critic, returns };
};

/** Greedy economy rollout: total reward (≈ net resources gained) over one game. */
export const evalEconomy = (actor: ActorCritic, env: MicroRTSEnv): number => {
  let obs = env.reset();
  let total = 0;
  for (;;) {
    const acts = obs.units.map((u) => {
      const f = actor.forward(u.obs);
      let best = 0, bv = -Infinity;
      for (let i = 0; i < u.mask.length; i++) if (u.mask[i] && f.logits[i]! > bv) { bv = f.logits[i]!; best = i; }
      return { unitId: u.id, slot: best };
    });
    const out = env.step(acts);
    total += out.reward;
    if (out.done) return total;
    obs = out.obs;
  }
};
