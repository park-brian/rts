// Fixed-point integer math. Determinism depends on *never* using floats in the
// hot path; all positions/velocities/distances are integers scaled by ONE.
//
// Safe range (these hold for our maps, which are << these bounds):
//   - values stored in Int32Array: |v| < 2^31
//   - mul/div intermediates use JS doubles, exact while products < 2^53
//   - at SCALE 4096, positions up to ~33.5M (8192px) keep dx*dx < ~1.1e15 < 2^53.

export const FRAC_BITS = 12;
export const ONE = 1 << FRAC_BITS; // 4096

/** integer/float -> fixed (truncates fractional input). */
export const fx = (n: number): number => Math.trunc(n * ONE);

/** fixed -> integer (floor toward zero). */
export const toInt = (a: number): number => Math.trunc(a / ONE);

/** fixed * fixed -> fixed. */
export const mul = (a: number, b: number): number => Math.trunc((a * b) / ONE);

/** fixed / fixed -> fixed (b != 0). */
export const div = (a: number, b: number): number => Math.trunc((a * ONE) / b);

/**
 * Exact integer square root (floor(sqrt(n))). Uses Math.sqrt (IEEE-754
 * correctly-rounded, hence deterministic) then corrects ±1 for any rounding.
 */
export const isqrt = (n: number): number => {
  if (n <= 0) return 0;
  let r = Math.floor(Math.sqrt(n));
  while ((r + 1) * (r + 1) <= n) r++;
  while (r * r > n) r--;
  return r;
};
