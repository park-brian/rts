// Shared-memory publish/read for running the sim in a Worker while the main
// thread renders. The authoritative State lives wherever the sim runs (the
// worker); after each tick it is *published* into a SharedArrayBuffer, and the
// reader (render thread) copies a consistent snapshot out. Consistency is
// guaranteed by a seqlock: an atomic counter that is odd while a write is in
// flight, so a reader can detect — and retry — a torn read without locking the
// writer. This is the zero-postMessage, zero-GC-per-frame path that cross-origin
// isolation (SharedArrayBuffer) unlocks; see coi-serviceworker in the app.
//
// The buffer carries exactly the state that hashState() depends on (entity
// columns + scalars + player pools + teams). Vision is *derived* and omitted —
// the render host recomputes fog from the entities, matching serialize.ts.

import type { State } from './world.ts';
import { ENTITY_COLUMNS, type ColType, CAP } from './world.ts';

// ---- control region (Int32Array) index layout ----
const SEQ = 0; // seqlock counter (even = stable, odd = write in progress)
const TICK = 1;
const RNG = 2; // rng.s, stored as i32 bit pattern
const HI = 3; // entities high-water mark
const FREETOP = 4;
const OVER = 5; // result.over (0/1)
const WINNER = 6; // result.winner
const STARTTEAMS = 7;
const PLAYERS = 8; // player count (layout validation)
const CTRL_LEN = 16; // reserve headroom for future scalars

const BYTES: Record<ColType, number> = { u8: 1, u16: 2, u32: 4, i32: 4 };
const align = (o: number, a: number): number => Math.ceil(o / a) * a;

export type Layout = {
  byteLength: number;
  playerCount: number;
  ctrlOffset: number; // Int32Array(CTRL_LEN)
  players: { minerals: number; gas: number; supplyUsed: number; supplyMax: number; teams: number };
  cols: ReadonlyArray<readonly [keyof State['e'], ColType, number]>; // [key, type, byteOffset]
};

/** Compute byte offsets for one published snapshot of a `playerCount`-player game. */
export const computeLayout = (playerCount: number): Layout => {
  let o = 0;
  const ctrlOffset = o;
  o += CTRL_LEN * 4;
  const pool = (): number => { const at = align(o, 4); o = at + playerCount * 4; return at; };
  const players = { minerals: pool(), gas: pool(), supplyUsed: pool(), supplyMax: pool(), teams: pool() };
  const cols = ENTITY_COLUMNS.map(([k, t]) => {
    const at = align(o, BYTES[t]);
    o = at + CAP * BYTES[t];
    return [k, t, at] as const;
  });
  return { byteLength: align(o, 4), playerCount, ctrlOffset, players, cols };
};

/** True when SharedArrayBuffer is usable (crossOriginIsolated). Falls back to ArrayBuffer otherwise. */
export const sharedAvailable = (): boolean =>
  typeof SharedArrayBuffer !== 'undefined' &&
  (typeof globalThis.crossOriginIsolated === 'undefined' || globalThis.crossOriginIsolated === true);

/** Allocate the backing buffer for a snapshot — Shared when isolated, plain otherwise. */
export const allocSnapshot = (playerCount: number): SharedArrayBuffer | ArrayBuffer => {
  const { byteLength } = computeLayout(playerCount);
  return sharedAvailable() ? new SharedArrayBuffer(byteLength) : new ArrayBuffer(byteLength);
};

type ColView = Uint8Array | Uint16Array | Uint32Array | Int32Array;
// Explicit per-type construction: each `new XArray(buf, …)` accepts ArrayBufferLike
// (Shared or plain), whereas constructing through a union of constructors makes TS
// resolve to the non-shared overload and reject SharedArrayBuffer.
const makeView = (t: ColType, buf: ArrayBufferLike, off: number, len: number): ColView => {
  switch (t) {
    case 'u8': return new Uint8Array(buf, off, len);
    case 'u16': return new Uint16Array(buf, off, len);
    case 'u32': return new Uint32Array(buf, off, len);
    default: return new Int32Array(buf, off, len);
  }
};

/**
 * Typed-array views over a snapshot buffer, created once and reused every frame.
 * Named to avoid clashing with sim.ts's in-memory `Snapshot` (a cloned State).
 */
export class SharedSnapshot {
  readonly buf: ArrayBufferLike;
  readonly layout: Layout;
  readonly ctrl: Int32Array;
  readonly minerals: Int32Array;
  readonly gas: Int32Array;
  readonly supplyUsed: Int32Array;
  readonly supplyMax: Int32Array;
  readonly teams: Int32Array;
  readonly cols: Map<keyof State['e'], ColView>;

  constructor(buf: ArrayBufferLike, playerCount: number) {
    this.buf = buf;
    const L = (this.layout = computeLayout(playerCount));
    this.ctrl = new Int32Array(buf, L.ctrlOffset, CTRL_LEN);
    const P = playerCount;
    this.minerals = new Int32Array(buf, L.players.minerals, P);
    this.gas = new Int32Array(buf, L.players.gas, P);
    this.supplyUsed = new Int32Array(buf, L.players.supplyUsed, P);
    this.supplyMax = new Int32Array(buf, L.players.supplyMax, P);
    this.teams = new Int32Array(buf, L.players.teams, P);
    this.cols = new Map();
    for (const [k, t, off] of L.cols) this.cols.set(k, makeView(t, buf, off, CAP));
  }
}

/**
 * Publish `s` into the snapshot under the seqlock. Called by the sim host after a
 * tick. `Atomics.store` on the seq makes the odd→write→even transition visible to
 * readers on other threads.
 */
export const publish = (snap: SharedSnapshot, s: State): void => {
  const ctrl = snap.ctrl;
  Atomics.store(ctrl, SEQ, (Atomics.load(ctrl, SEQ) + 1) | 0); // → odd: write in progress
  ctrl[TICK] = s.tick | 0;
  ctrl[RNG] = s.rng.s | 0;
  ctrl[HI] = s.e.hi | 0;
  ctrl[FREETOP] = s.e.freeTop | 0;
  ctrl[OVER] = s.result.over ? 1 : 0;
  ctrl[WINNER] = s.result.winner | 0;
  ctrl[STARTTEAMS] = s.startTeams | 0;
  ctrl[PLAYERS] = snap.layout.playerCount | 0;
  snap.minerals.set(s.players.minerals);
  snap.gas.set(s.players.gas);
  snap.supplyUsed.set(s.players.supplyUsed);
  snap.supplyMax.set(s.players.supplyMax);
  snap.teams.set(s.teams);
  const e = s.e;
  for (const [k] of snap.layout.cols) snap.cols.get(k)!.set(e[k] as ArrayLike<number>);
  Atomics.store(ctrl, SEQ, (Atomics.load(ctrl, SEQ) + 1) | 0); // → even: stable
};

/**
 * Copy a consistent snapshot into `dst` (a State whose `map` matches the sim's).
 * Retries on a torn read; returns the seq of the snapshot read, or -1 if no stable
 * snapshot was observed within `spins` attempts (writer monopolizing — caller may
 * reuse last frame). `dst.vision` is untouched; recompute fog after reading.
 */
export const readInto = (snap: SharedSnapshot, dst: State, spins = 1024): number => {
  const ctrl = snap.ctrl;
  for (let attempt = 0; attempt < spins; attempt++) {
    const s1 = Atomics.load(ctrl, SEQ);
    if (s1 & 1) continue; // write in progress
    dst.tick = ctrl[TICK]!;
    dst.rng.s = ctrl[RNG]! >>> 0;
    dst.e.hi = ctrl[HI]!;
    dst.e.freeTop = ctrl[FREETOP]!;
    dst.result.over = ctrl[OVER]! === 1;
    dst.result.winner = ctrl[WINNER]!;
    dst.startTeams = ctrl[STARTTEAMS]!;
    dst.players.minerals.set(snap.minerals);
    dst.players.gas.set(snap.gas);
    dst.players.supplyUsed.set(snap.supplyUsed);
    dst.players.supplyMax.set(snap.supplyMax);
    dst.teams.set(snap.teams);
    const e = dst.e;
    for (const [k] of snap.layout.cols) (e[k] as { set(a: ArrayLike<number>): void }).set(snap.cols.get(k)!);
    // Re-check: if the writer touched anything since s1, our copy may be torn.
    if (Atomics.load(ctrl, SEQ) === s1) return s1;
  }
  return -1;
};
