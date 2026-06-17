// A tiny actor-critic MLP with hand-written backprop and Adam. One shared hidden
// layer (tanh) feeding a policy head (logits over nActions) and a value head.
// No autodiff framework — just the explicit gradients, which is all we need for
// a small flat policy and keeps the package dependency-free.

const randn = (() => {
  // deterministic-ish small init; seedable for reproducibility
  let s = 12345 >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    const u1 = (s >>> 0) / 0x100000000 || 1e-9;
    s = (s * 1664525 + 1013904223) >>> 0;
    const u2 = (s >>> 0) / 0x100000000;
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };
})();

const mat = (r: number, c: number, scale: number): number[][] =>
  Array.from({ length: r }, () => Array.from({ length: c }, () => randn() * scale));

export type Forward = { h: number[]; logits: number[]; v: number };

type Adam = { m: number; v: number };
const adam = (): Adam => ({ m: 0, v: 0 });

export class ActorCritic {
  obsDim: number;
  hidden: number;
  nActions: number;
  W1: number[][]; b1: number[];
  Wp: number[][]; bp: number[];
  Wv: number[]; bv: number;
  // grad accumulators
  gW1: number[][]; gb1: number[];
  gWp: number[][]; gbp: number[];
  gWv: number[]; gbv: number;
  // adam state (parallel shape)
  aW1: Adam[][]; ab1: Adam[];
  aWp: Adam[][]; abp: Adam[];
  aWv: Adam[]; abv: Adam;
  t = 0;

  constructor(obsDim: number, nActions: number, hidden = 64) {
    this.obsDim = obsDim; this.hidden = hidden; this.nActions = nActions;
    this.W1 = mat(hidden, obsDim, 1 / Math.sqrt(obsDim));
    this.b1 = new Array(hidden).fill(0);
    this.Wp = mat(nActions, hidden, 0.01); // small-init policy head (PPO best practice)
    this.bp = new Array(nActions).fill(0);
    this.Wv = mat(1, hidden, 1 / Math.sqrt(hidden))[0]!;
    this.bv = 0;
    this.gW1 = mat(hidden, obsDim, 0); this.gb1 = new Array(hidden).fill(0);
    this.gWp = mat(nActions, hidden, 0); this.gbp = new Array(nActions).fill(0);
    this.gWv = new Array(hidden).fill(0); this.gbv = 0;
    this.aW1 = this.W1.map((r) => r.map(adam)); this.ab1 = this.b1.map(adam);
    this.aWp = this.Wp.map((r) => r.map(adam)); this.abp = this.bp.map(adam);
    this.aWv = this.Wv.map(adam); this.abv = adam();
  }

  forward(x: number[]): Forward {
    const h = new Array(this.hidden);
    for (let i = 0; i < this.hidden; i++) {
      let s = this.b1[i]!;
      const row = this.W1[i]!;
      for (let j = 0; j < this.obsDim; j++) s += row[j]! * x[j]!;
      h[i] = Math.tanh(s);
    }
    const logits = new Array(this.nActions);
    for (let a = 0; a < this.nActions; a++) {
      let s = this.bp[a]!;
      const row = this.Wp[a]!;
      for (let i = 0; i < this.hidden; i++) s += row[i]! * h[i]!;
      logits[a] = s;
    }
    let v = this.bv;
    for (let i = 0; i < this.hidden; i++) v += this.Wv[i]! * h[i]!;
    return { h, logits, v };
  }

  // Accumulate gradients for one sample given dL/dlogits and dL/dv.
  backward(x: number[], h: number[], dLogits: number[], dV: number): void {
    const dh = new Array(this.hidden).fill(0);
    for (let a = 0; a < this.nActions; a++) {
      const g = dLogits[a]!;
      if (g === 0) continue;
      const row = this.gWp[a]!;
      for (let i = 0; i < this.hidden; i++) { row[i]! += g * h[i]!; dh[i]! += g * this.Wp[a]![i]!; }
      this.gbp[a]! += g;
    }
    for (let i = 0; i < this.hidden; i++) { this.gWv[i]! += dV * h[i]!; dh[i]! += dV * this.Wv[i]!; }
    this.gbv += dV;
    for (let i = 0; i < this.hidden; i++) {
      const dpre = dh[i]! * (1 - h[i]! * h[i]!); // tanh'
      const row = this.gW1[i]!;
      for (let j = 0; j < this.obsDim; j++) row[j]! += dpre * x[j]!;
      this.gb1[i]! += dpre;
    }
  }

  private stepParam(p: number[], g: number[], a: Adam[], lr: number, scale: number): void {
    const b1 = 0.9, b2 = 0.999, eps = 1e-8;
    const bc1 = 1 - Math.pow(b1, this.t), bc2 = 1 - Math.pow(b2, this.t);
    for (let i = 0; i < p.length; i++) {
      const grad = g[i]! * scale;
      a[i]!.m = b1 * a[i]!.m + (1 - b1) * grad;
      a[i]!.v = b2 * a[i]!.v + (1 - b2) * grad * grad;
      p[i]! -= (lr * (a[i]!.m / bc1)) / (Math.sqrt(a[i]!.v / bc2) + eps);
      g[i]! = 0;
    }
  }

  // Adam update averaging the accumulated grads over `n` samples, then zero them.
  adamStep(lr: number, n: number, clip = 0.5): void {
    this.t += 1;
    const scale = 1 / n;
    // global grad-norm clip
    let norm = 0;
    const acc = (g: number[]) => { for (const x of g) norm += (x * scale) ** 2; };
    this.gW1.forEach(acc); acc(this.gb1); this.gWp.forEach(acc); acc(this.gbp); acc(this.gWv); norm += (this.gbv * scale) ** 2;
    norm = Math.sqrt(norm);
    const cs = norm > clip ? clip / norm : 1;
    for (let i = 0; i < this.hidden; i++) this.stepParam(this.W1[i]!, this.gW1[i]!, this.aW1[i]!, lr, scale * cs);
    this.stepParam(this.b1, this.gb1, this.ab1, lr, scale * cs);
    for (let a = 0; a < this.nActions; a++) this.stepParam(this.Wp[a]!, this.gWp[a]!, this.aWp[a]!, lr, scale * cs);
    this.stepParam(this.bp, this.gbp, this.abp, lr, scale * cs);
    this.stepParam(this.Wv, this.gWv, this.aWv, lr, scale * cs);
    { const g = this.gbv * scale * cs; const a = this.abv; const b1 = 0.9, b2 = 0.999, eps = 1e-8;
      a.m = b1 * a.m + (1 - b1) * g; a.v = b2 * a.v + (1 - b2) * g * g;
      this.bv -= (lr * (a.m / (1 - Math.pow(b1, this.t)))) / (Math.sqrt(a.v / (1 - Math.pow(b2, this.t))) + eps); this.gbv = 0; }
  }
}

// ---- masked softmax helpers ----

/** Softmax over only the legal (masked) logits; illegal entries get probability 0. */
export const maskedSoftmax = (logits: number[], mask: boolean[]): number[] => {
  let mx = -Infinity;
  for (let i = 0; i < logits.length; i++) if (mask[i] && logits[i]! > mx) mx = logits[i]!;
  const p = new Array(logits.length).fill(0);
  let sum = 0;
  for (let i = 0; i < logits.length; i++) if (mask[i]) { p[i] = Math.exp(logits[i]! - mx); sum += p[i]; }
  for (let i = 0; i < logits.length; i++) if (mask[i]) p[i] /= sum;
  return p;
};

export const sampleFrom = (p: number[], r: number): number => {
  // strict `<` so a zero-probability bucket (c unchanged) is never selected
  let c = 0;
  for (let i = 0; i < p.length; i++) { c += p[i]!; if (r < c) return i; }
  for (let i = p.length - 1; i >= 0; i--) if (p[i]! > 0) return i;
  return 0;
};

/** Entropy of a (masked) distribution. */
export const entropy = (p: number[]): number => {
  let h = 0;
  for (const x of p) if (x > 0) h -= x * Math.log(x);
  return h;
};
