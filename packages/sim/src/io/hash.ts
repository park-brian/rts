// FNV-1a 32-bit hashing, used to fingerprint sim state for the determinism tests
// and (later) desync detection in lockstep network play.

export const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Fold one 32-bit value into the running hash. */
export const fold = (h: number, x: number): number =>
  Math.imul(h ^ (x | 0), FNV_PRIME) >>> 0;

/** Fold an entire integer typed array into the running hash. */
export const foldArray = (
  h: number,
  a: Int32Array | Uint32Array | Uint16Array | Uint8Array,
  len: number,
): number => {
  let acc = h;
  for (let i = 0; i < len; i++) acc = fold(acc, a[i]!);
  return acc;
};
