// World state: a data-oriented (Struct-of-Arrays) entity store plus per-player
// economy, teams, the RNG, the tick counter, the (immutable) map, and per-player
// vision. Everything here is plain data so it clones cheaply (fork/reset) and
// hashes deterministically.

import type { MapDef } from './map.ts';
import { type Rng, cloneRng } from './rng.ts';
import { fold, foldArray, FNV_OFFSET } from './hash.ts';

export const CAP = 4096; // max simultaneous entities (grow later if needed)
export const NONE = -1; // null EntityId sentinel
export const NEUTRAL = 255; // owner id for non-player entities (resources)
export const MAXPATH = 32; // max stored waypoints per unit (string-pulled paths are short)

// Parallel component columns. EntityId encodes (slot, generation) so stale
// references are detected after a slot is reused.
export type Entities = {
  hi: number; // high-water mark: scan slots [0, hi)
  freeTop: number; // top of the free-slot stack
  free: Int32Array; // stack of reusable slots
  gen: Uint32Array; // generation per slot
  alive: Uint8Array;
  kind: Uint16Array;
  owner: Uint8Array; // player id, 255 = neutral
  x: Int32Array; // fixed-point position
  y: Int32Array;
  hp: Int32Array; // current hit points (integer)
  flags: Uint16Array; // Role bitflags (copied from the unit def at spawn)
  order: Uint8Array;
  target: Int32Array; // EntityId or NONE (harvest node / attack target / depot)
  tx: Int32Array; // fixed-point target/destination point
  ty: Int32Array;
  timer: Int32Array; // generic countdown (mining)
  wcd: Int32Array; // weapon cooldown (ticks)
  ctimer: Int32Array; // construction remaining (ticks)
  built: Uint8Array; // 1 once a structure is complete (0 while constructing)
  buildKind: Uint16Array; // for a worker en route to build: the structure kind
  cargo: Int32Array; // carried resources (workers) / remaining amount (nodes)
  cargoType: Uint8Array; // ResourceType currently carried by a worker
  // navigation cache (derived; cloned but not hashed)
  pathGoal: Int32Array; // goal tile index the current path was built for (-1 none)
  pathLen: Uint8Array;
  pathIdx: Uint8Array;
  pathPts: Int32Array; // CAP * MAXPATH waypoint tile indices
  prodKind: Uint16Array; // structure: in-progress unit kind (0 = idle)
  prodTimer: Int32Array; // ticks remaining
  prodQueued: Int32Array; // additional queued units of prodKind
};

export type Players = {
  minerals: Int32Array;
  gas: Int32Array;
  supplyUsed: Int32Array;
  supplyMax: Int32Array;
};

export type Result = { over: boolean; winner: number }; // winner = team id, or -1

export type State = {
  tick: number;
  rng: Rng;
  map: MapDef; // immutable; shared across clones
  players: Players;
  teams: Int32Array; // team id per player
  startTeams: number; // distinct teams at match start (victory needs >= 2)
  result: Result;
  vision: Uint8Array[]; // per-player visibility grid (0 unseen, 1 explored, 2 visible)
  e: Entities;
};

// ---- EntityId helpers ----
export const slotOf = (id: number): number => id % CAP;
export const genOf = (id: number): number => (id - (id % CAP)) / CAP;
export const eid = (e: Entities, slot: number): number => slot + e.gen[slot]! * CAP;
export const isAlive = (e: Entities, id: number): boolean => {
  if (id < 0) return false;
  const s = id % CAP;
  return e.alive[s] === 1 && e.gen[s] === genOf(id);
};

/** Two owners are enemies if both are players on different teams. */
export const isEnemy = (s: State, a: number, b: number): boolean =>
  a < s.teams.length && b < s.teams.length && s.teams[a] !== s.teams[b];

// ---- construction ----
const makeEntities = (): Entities => {
  const free = new Int32Array(CAP);
  for (let i = 0; i < CAP; i++) free[i] = CAP - 1 - i; // pop yields ascending slots
  return {
    hi: 0,
    freeTop: CAP,
    free,
    gen: new Uint32Array(CAP),
    alive: new Uint8Array(CAP),
    kind: new Uint16Array(CAP),
    owner: new Uint8Array(CAP),
    x: new Int32Array(CAP),
    y: new Int32Array(CAP),
    hp: new Int32Array(CAP),
    flags: new Uint16Array(CAP),
    order: new Uint8Array(CAP),
    target: new Int32Array(CAP),
    tx: new Int32Array(CAP),
    ty: new Int32Array(CAP),
    timer: new Int32Array(CAP),
    wcd: new Int32Array(CAP),
    ctimer: new Int32Array(CAP),
    built: new Uint8Array(CAP),
    buildKind: new Uint16Array(CAP),
    cargo: new Int32Array(CAP),
    cargoType: new Uint8Array(CAP),
    pathGoal: new Int32Array(CAP).fill(-1),
    pathLen: new Uint8Array(CAP),
    pathIdx: new Uint8Array(CAP),
    pathPts: new Int32Array(CAP * MAXPATH),
    prodKind: new Uint16Array(CAP),
    prodTimer: new Int32Array(CAP),
    prodQueued: new Int32Array(CAP),
  };
};

export const makeState = (map: MapDef, playerCount: number, seed: number): State => {
  const vision: Uint8Array[] = [];
  for (let p = 0; p < playerCount; p++) vision.push(new Uint8Array(map.w * map.h));
  const teams = new Int32Array(playerCount);
  for (let p = 0; p < playerCount; p++) teams[p] = p; // default: each player own team
  return {
    tick: 0,
    rng: { s: seed >>> 0 },
    map,
    players: {
      minerals: new Int32Array(playerCount),
      gas: new Int32Array(playerCount),
      supplyUsed: new Int32Array(playerCount),
      supplyMax: new Int32Array(playerCount),
    },
    teams,
    startTeams: 0, // set by setupMatch once teams are finalized
    result: { over: false, winner: -1 },
    vision,
    e: makeEntities(),
  };
};

/** Allocate an entity, resetting all columns to defaults. Returns its EntityId. */
export const spawn = (
  s: State,
  kind: number,
  owner: number,
  x: number,
  y: number,
  hp = 0,
  flags = 0,
): number => {
  const e = s.e;
  if (e.freeTop === 0) throw new Error('entity capacity exceeded');
  const slot = e.free[--e.freeTop]!;
  if (slot + 1 > e.hi) e.hi = slot + 1;
  e.alive[slot] = 1;
  e.kind[slot] = kind;
  e.owner[slot] = owner;
  e.x[slot] = x;
  e.y[slot] = y;
  e.hp[slot] = hp;
  e.flags[slot] = flags;
  e.order[slot] = 0;
  e.target[slot] = NONE;
  e.tx[slot] = 0;
  e.ty[slot] = 0;
  e.timer[slot] = 0;
  e.wcd[slot] = 0;
  e.ctimer[slot] = 0;
  e.built[slot] = 1; // complete by default; construction sets 0
  e.buildKind[slot] = 0;
  e.cargo[slot] = 0;
  e.cargoType[slot] = 0;
  e.pathGoal[slot] = -1;
  e.pathLen[slot] = 0;
  e.pathIdx[slot] = 0;
  e.prodKind[slot] = 0;
  e.prodTimer[slot] = 0;
  e.prodQueued[slot] = 0;
  return eid(e, slot);
};

/** Free an entity slot, bumping its generation so old EntityIds become invalid. */
export const kill = (s: State, slot: number): void => {
  const e = s.e;
  if (e.alive[slot] !== 1) return;
  e.alive[slot] = 0;
  e.gen[slot] = (e.gen[slot]! + 1) >>> 0;
  e.free[e.freeTop++] = slot;
};

// ---- queries (linear scans; fine at slice scale, optimize with a grid later) ----
export const count = (s: State, kind: number, owner: number): number => {
  const e = s.e;
  let n = 0;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.kind[i] === kind && e.owner[i] === owner) n++;
  }
  return n;
};

/** Nearest alive entity matching `pred` to (x,y); returns slot index or NONE. */
export const nearest = (
  s: State,
  x: number,
  y: number,
  pred: (slot: number) => boolean,
): number => {
  const e = s.e;
  let best = NONE;
  let bestD = Infinity;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || !pred(i)) continue;
    const dx = e.x[i]! - x;
    const dy = e.y[i]! - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
};

// ---- clone (fork / snapshot) ----
const cloneEntities = (e: Entities): Entities => ({
  hi: e.hi,
  freeTop: e.freeTop,
  free: e.free.slice(),
  gen: e.gen.slice(),
  alive: e.alive.slice(),
  kind: e.kind.slice(),
  owner: e.owner.slice(),
  x: e.x.slice(),
  y: e.y.slice(),
  hp: e.hp.slice(),
  flags: e.flags.slice(),
  order: e.order.slice(),
  target: e.target.slice(),
  tx: e.tx.slice(),
  ty: e.ty.slice(),
  timer: e.timer.slice(),
  wcd: e.wcd.slice(),
  ctimer: e.ctimer.slice(),
  built: e.built.slice(),
  buildKind: e.buildKind.slice(),
  cargo: e.cargo.slice(),
  cargoType: e.cargoType.slice(),
  pathGoal: e.pathGoal.slice(),
  pathLen: e.pathLen.slice(),
  pathIdx: e.pathIdx.slice(),
  pathPts: e.pathPts.slice(),
  prodKind: e.prodKind.slice(),
  prodTimer: e.prodTimer.slice(),
  prodQueued: e.prodQueued.slice(),
});

export const cloneState = (s: State): State => ({
  tick: s.tick,
  rng: cloneRng(s.rng),
  map: s.map, // immutable
  players: {
    minerals: s.players.minerals.slice(),
    gas: s.players.gas.slice(),
    supplyUsed: s.players.supplyUsed.slice(),
    supplyMax: s.players.supplyMax.slice(),
  },
  teams: s.teams.slice(),
  startTeams: s.startTeams,
  result: { over: s.result.over, winner: s.result.winner },
  vision: s.vision.map((v) => v.slice()),
  e: cloneEntities(s.e),
});

// ---- deterministic state fingerprint (vision is derived, so excluded) ----
export const hashState = (s: State): number => {
  let h = FNV_OFFSET;
  h = fold(h, s.tick);
  h = fold(h, s.rng.s);
  h = fold(h, s.result.over ? 1 : 0);
  h = fold(h, s.result.winner);
  const p = s.players;
  h = foldArray(h, p.minerals, p.minerals.length);
  h = foldArray(h, p.gas, p.gas.length);
  h = foldArray(h, p.supplyUsed, p.supplyUsed.length);
  h = foldArray(h, p.supplyMax, p.supplyMax.length);
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1) continue;
    h = fold(h, i);
    h = fold(h, e.gen[i]!);
    h = fold(h, e.kind[i]!);
    h = fold(h, e.owner[i]!);
    h = fold(h, e.x[i]!);
    h = fold(h, e.y[i]!);
    h = fold(h, e.hp[i]!);
    h = fold(h, e.order[i]!);
    h = fold(h, e.target[i]!);
    h = fold(h, e.tx[i]!);
    h = fold(h, e.ty[i]!);
    h = fold(h, e.timer[i]!);
    h = fold(h, e.wcd[i]!);
    h = fold(h, e.ctimer[i]!);
    h = fold(h, e.built[i]!);
    h = fold(h, e.buildKind[i]!);
    h = fold(h, e.cargo[i]!);
    h = fold(h, e.cargoType[i]!);
    h = fold(h, e.prodKind[i]!);
    h = fold(h, e.prodTimer[i]!);
    h = fold(h, e.prodQueued[i]!);
  }
  return h >>> 0;
};
