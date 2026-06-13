// Seeded deterministic PRNG (Mulberry32). State is a single uint32 and is part
// of game state, so every random draw is reproducible from the seed.

export type Rng = { s: number };

export const makeRng = (seed: number): Rng => ({ s: seed >>> 0 });

export const cloneRng = (r: Rng): Rng => ({ s: r.s });

/** Advance and return a uint32. */
export const nextU32 = (r: Rng): number => {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
};

/** Uniform integer in [0, n). */
export const range = (r: Rng, n: number): number => (n <= 0 ? 0 : nextU32(r) % n);
