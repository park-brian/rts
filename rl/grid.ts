// GridNet: a small CNN over the H×W board that outputs, in ONE forward pass, an
// action distribution for EVERY cell (the unit standing there) plus a pooled
// state value. This is the efficient "command all units at once" policy — shared
// conv weights over the grid, per-cell logits, per-cell masking. Implemented with
// flat Float64Arrays and hand-written conv backprop (verified by a numerical
// gradient check in grid.test.ts).

const makeRandn = (seed: number) => {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    const u1 = s / 0x100000000 || 1e-9;
    s = (s * 1664525 + 1013904223) >>> 0;
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * (s / 0x100000000));
  };
};

class Param {
  v: Float64Array; g: Float64Array; m: Float64Array; u: Float64Array;
  constructor(n: number, scale: number, rnd: () => number) {
    this.v = new Float64Array(n); this.g = new Float64Array(n); this.m = new Float64Array(n); this.u = new Float64Array(n);
    for (let i = 0; i < n; i++) this.v[i] = rnd() * scale;
  }
}

// ---- conv (stride 1, 'same' padding) ----
const conv = (w: Float64Array, b: Float64Array, Cin: number, Cout: number, K: number, x: Float64Array, H: number, W: number, out: Float64Array): void => {
  const pad = (K - 1) >> 1;
  out.fill(0);
  for (let oc = 0; oc < Cout; oc++) {
    for (let oy = 0; oy < H; oy++) {
      for (let ox = 0; ox < W; ox++) {
        let acc = b[oc]!;
        for (let ic = 0; ic < Cin; ic++) {
          const xb = ic * H * W; const wb = ((oc * Cin) + ic) * K * K;
          for (let ky = 0; ky < K; ky++) { const iy = oy + ky - pad; if (iy < 0 || iy >= H) continue;
            for (let kx = 0; kx < K; kx++) { const ix = ox + kx - pad; if (ix < 0 || ix >= W) continue;
              acc += w[wb + ky * K + kx]! * x[xb + iy * W + ix]!; } }
        }
        out[(oc * H + oy) * W + ox] = acc;
      }
    }
  }
};

const convBack = (w: Float64Array, gw: Float64Array, gb: Float64Array, Cin: number, Cout: number, K: number, x: Float64Array, dout: Float64Array, H: number, W: number, dx: Float64Array | null): void => {
  const pad = (K - 1) >> 1;
  for (let oc = 0; oc < Cout; oc++) {
    for (let oy = 0; oy < H; oy++) {
      for (let ox = 0; ox < W; ox++) {
        const go = dout[(oc * H + oy) * W + ox]!;
        if (go === 0) continue;
        gb[oc]! += go;
        for (let ic = 0; ic < Cin; ic++) {
          const xb = ic * H * W; const wb = ((oc * Cin) + ic) * K * K;
          for (let ky = 0; ky < K; ky++) { const iy = oy + ky - pad; if (iy < 0 || iy >= H) continue;
            for (let kx = 0; kx < K; kx++) { const ix = ox + kx - pad; if (ix < 0 || ix >= W) continue;
              const xi = xb + iy * W + ix; const wi = wb + ky * K + kx;
              gw[wi]! += go * x[xi]!;
              if (dx) dx[xi]! += go * w[wi]!; } }
        }
      }
    }
  }
};

export type GridForward = { logits: Float64Array; value: number; cache: Cache };
type Cache = { planes: Float64Array; a1: Float64Array; z1: Float64Array; a2: Float64Array; z2: Float64Array; pooled: Float64Array };

export class GridNet {
  Cin: number; H: number; W: number; A: number; F: number;
  conv1: Param; b1: Param; conv2: Param; b2: Param; convP: Param; bP: Param; Wv: Param; bv: Param;
  private params: Param[];
  private t = 0;

  constructor(Cin: number, H: number, W: number, A: number, F = 16, seed = 1) {
    this.Cin = Cin; this.H = H; this.W = W; this.A = A; this.F = F;
    const rnd = makeRandn(seed);
    this.conv1 = new Param(F * Cin * 9, Math.sqrt(2 / (Cin * 9)), rnd); this.b1 = new Param(F, 0, rnd);
    this.conv2 = new Param(F * F * 9, Math.sqrt(2 / (F * 9)), rnd); this.b2 = new Param(F, 0, rnd);
    this.convP = new Param(A * F * 1, 0.01, rnd); this.bP = new Param(A, 0, rnd); // small-init policy head
    this.Wv = new Param(F, 1 / Math.sqrt(F), rnd); this.bv = new Param(1, 0, rnd);
    this.params = [this.conv1, this.b1, this.conv2, this.b2, this.convP, this.bP, this.Wv, this.bv];
  }

  forward(planes: Float64Array): GridForward {
    const { H, W, F, A, Cin } = this;
    const z1 = new Float64Array(F * H * W); conv(this.conv1.v, this.b1.v, Cin, F, 3, planes, H, W, z1);
    const a1 = z1.map((z) => (z > 0 ? z : 0));
    const z2 = new Float64Array(F * H * W); conv(this.conv2.v, this.b2.v, F, F, 3, a1, H, W, z2);
    const a2 = z2.map((z) => (z > 0 ? z : 0));
    const logits = new Float64Array(A * H * W); conv(this.convP.v, this.bP.v, F, A, 1, a2, H, W, logits);
    const pooled = new Float64Array(F);
    const hw = H * W;
    for (let f = 0; f < F; f++) { let s = 0; for (let i = 0; i < hw; i++) s += a2[f * hw + i]!; pooled[f] = s / hw; }
    let value = this.bv.v[0]!;
    for (let f = 0; f < F; f++) value += this.Wv.v[f]! * pooled[f]!;
    return { logits, value, cache: { planes, z1, a1, z2, a2, pooled } };
  }

  backward(cache: Cache, dLogits: Float64Array, dValue: number): void {
    const { H, W, F, A, Cin } = this;
    const hw = H * W;
    // value head
    const da2 = new Float64Array(F * hw);
    for (let f = 0; f < F; f++) {
      this.Wv.g[f]! += dValue * cache.pooled[f]!;
      const dp = (dValue * this.Wv.v[f]!) / hw;
      for (let i = 0; i < hw; i++) da2[f * hw + i]! += dp;
    }
    this.bv.g[0]! += dValue;
    // policy conv (K=1) -> gConvP, gbP, and accumulate into da2
    convBack(this.convP.v, this.convP.g, this.bP.g, F, A, 1, cache.a2, dLogits, H, W, da2);
    // relu2
    const dz2 = new Float64Array(F * hw);
    for (let i = 0; i < F * hw; i++) dz2[i] = cache.z2[i]! > 0 ? da2[i]! : 0;
    // conv2 -> gConv2, gb2, da1
    const da1 = new Float64Array(F * hw);
    convBack(this.conv2.v, this.conv2.g, this.b2.g, F, F, 3, cache.a1, dz2, H, W, da1);
    // relu1
    const dz1 = new Float64Array(F * hw);
    for (let i = 0; i < F * hw; i++) dz1[i] = cache.z1[i]! > 0 ? da1[i]! : 0;
    // conv1 -> gConv1, gb1 (no dplanes needed)
    convBack(this.conv1.v, this.conv1.g, this.b1.g, Cin, F, 3, cache.planes, dz1, H, W, null);
  }

  adamStep(lr: number, n: number, clip = 0.5): void {
    this.t += 1;
    const scale = 1 / n;
    let norm = 0;
    for (const p of this.params) for (let i = 0; i < p.g.length; i++) norm += (p.g[i]! * scale) ** 2;
    norm = Math.sqrt(norm);
    const cs = norm > clip ? clip / norm : 1;
    const b1 = 0.9, b2 = 0.999, eps = 1e-8;
    const bc1 = 1 - Math.pow(b1, this.t), bc2 = 1 - Math.pow(b2, this.t);
    for (const p of this.params) {
      for (let i = 0; i < p.v.length; i++) {
        const grad = p.g[i]! * scale * cs;
        p.m[i] = b1 * p.m[i]! + (1 - b1) * grad;
        p.u[i] = b2 * p.u[i]! + (1 - b2) * grad * grad;
        p.v[i]! -= (lr * (p.m[i]! / bc1)) / (Math.sqrt(p.u[i]! / bc2) + eps);
        p.g[i] = 0;
      }
    }
  }

  zeroGrad(): void { for (const p of this.params) p.g.fill(0); }
}

/** Masked softmax over a single cell's A logits (slice of the logits volume). */
export const cellSoftmax = (logits: Float64Array, base: number, A: number, hw: number, mask: boolean[]): number[] => {
  let mx = -Infinity;
  for (let a = 0; a < A; a++) if (mask[a] && logits[base + a * hw]! > mx) mx = logits[base + a * hw]!;
  const p = new Array(A).fill(0); let sum = 0;
  for (let a = 0; a < A; a++) if (mask[a]) { p[a] = Math.exp(logits[base + a * hw]! - mx); sum += p[a]; }
  for (let a = 0; a < A; a++) if (mask[a]) p[a] /= sum;
  return p;
};
