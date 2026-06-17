// World state: a data-oriented (Struct-of-Arrays) entity store plus per-player
// economy, teams, the RNG, the tick counter, the (immutable) map, and per-player
// vision. Everything here is plain data so it clones cheaply (fork/reset) and
// hashes deterministically.

import type { MapDef } from './map.ts';
import { type Rng, cloneRng } from './rng.ts';
import { fold, foldArray, FNV_OFFSET } from './hash.ts';
import { TECH_CAP } from './data.ts';

export const CAP = 4096; // max simultaneous entities (grow later if needed)
export const NONE = -1; // null EntityId sentinel
export const NEUTRAL = 255; // owner id for non-player entities (resources)

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
  shield: Int32Array; // current Protoss shields (integer; 0 for non-shielded entities)
  energy: Int32Array; // current caster energy
  energyMax: Int32Array; // max caster energy; 0 for non-casters
  energyTimer: Int32Array; // countdown to next energy point
  stimTimer: Int32Array; // active Stim Pack duration
  matrixHp: Int32Array; // Defensive Matrix absorb pool
  matrixTimer: Int32Array;
  irradiateTimer: Int32Array;
  plagueTimer: Int32Array;
  ensnareTimer: Int32Array;
  lockdownTimer: Int32Array;
  stasisTimer: Int32Array;
  maelstromTimer: Int32Array;
  acidSporeCount: Uint8Array;
  acidSporeTimer: Int32Array;
  opticalFlare: Uint8Array;
  parasiteOwner: Uint8Array;
  illusion: Uint8Array;
  lifeTimer: Int32Array;
  cloakActive: Uint8Array;
  cloakTimer: Int32Array;
  cloakAura: Uint8Array;
  burrowed: Uint8Array;
  flags: Uint16Array; // Role bitflags (copied from the unit def at spawn)
  order: Uint8Array;
  target: Int32Array; // EntityId or NONE (harvest node / attack target / depot)
  tx: Int32Array; // fixed-point target/destination point
  ty: Int32Array;
  faceX: Int32Array; // last intentional facing vector (fixed-point delta)
  faceY: Int32Array;
  timer: Int32Array; // generic countdown (mining)
  wcd: Int32Array; // weapon cooldown (ticks)
  ctimer: Int32Array; // construction remaining (ticks)
  built: Uint8Array; // 1 once a structure is complete (0 while constructing)
  buildKind: Uint16Array; // for a worker en route to build: the structure kind
  morphFromKind: Uint16Array; // for in-place structure morphs: original kind to restore on cancel
  buildCostMinerals: Int32Array; // refundable cost ledger for pending/foundation builds
  buildCostGas: Int32Array;
  specialAmmo: Uint8Array; // unit-specific charges/ammo (Spider Mines now; scarabs/interceptors later)
  cargo: Int32Array; // carried resources (workers) / remaining amount (nodes)
  cargoType: Uint8Array; // ResourceType currently carried by a worker
  container: Int32Array; // EntityId of containing transport/garrison, or NONE
  prodKind: Uint16Array; // structure: in-progress unit kind (0 = idle)
  prodTimer: Int32Array; // ticks remaining
  prodQueued: Int32Array; // additional queued units of prodKind
  researchKind: Uint16Array; // structure: in-progress Tech id (0 = idle)
  researchTimer: Int32Array;
  rallyX: Int32Array; // structure rally point (fixed px); produced units head here
  rallyY: Int32Array;
  rallyTarget: Int32Array; // rally onto an entity (resource → harvest), or NONE
};

// Single source of truth for the typed-array columns: every per-slot column lives
// here exactly once, so allocation, cloning, and (de)serialization all stay in
// sync. A coverage test asserts this list matches the Entities shape, so a new
// column can't silently escape clone/serialize. (`hi`/`freeTop` are plain scalars.)
export type ColType = 'u8' | 'u16' | 'u32' | 'i32';
export const ENTITY_COLUMNS: ReadonlyArray<readonly [keyof Entities, ColType]> = [
  ['free', 'i32'], ['gen', 'u32'], ['alive', 'u8'], ['kind', 'u16'], ['owner', 'u8'],
  ['x', 'i32'], ['y', 'i32'], ['hp', 'i32'], ['shield', 'i32'], ['energy', 'i32'], ['energyMax', 'i32'],
  ['energyTimer', 'i32'], ['stimTimer', 'i32'], ['matrixHp', 'i32'], ['matrixTimer', 'i32'],
  ['irradiateTimer', 'i32'], ['plagueTimer', 'i32'], ['ensnareTimer', 'i32'], ['lockdownTimer', 'i32'],
  ['stasisTimer', 'i32'], ['maelstromTimer', 'i32'], ['acidSporeCount', 'u8'], ['acidSporeTimer', 'i32'],
  ['cloakActive', 'u8'], ['cloakTimer', 'i32'],
  ['opticalFlare', 'u8'], ['parasiteOwner', 'u8'], ['illusion', 'u8'], ['lifeTimer', 'i32'],
  ['cloakAura', 'u8'], ['burrowed', 'u8'], ['flags', 'u16'], ['order', 'u8'],
  ['target', 'i32'], ['tx', 'i32'], ['ty', 'i32'], ['faceX', 'i32'], ['faceY', 'i32'], ['timer', 'i32'], ['wcd', 'i32'],
  ['ctimer', 'i32'], ['built', 'u8'], ['buildKind', 'u16'], ['morphFromKind', 'u16'], ['buildCostMinerals', 'i32'],
  ['buildCostGas', 'i32'], ['specialAmmo', 'u8'], ['cargo', 'i32'],
  ['cargoType', 'u8'], ['container', 'i32'], ['prodKind', 'u16'], ['prodTimer', 'i32'], ['prodQueued', 'i32'],
  ['researchKind', 'u16'], ['researchTimer', 'i32'],
  ['rallyX', 'i32'], ['rallyY', 'i32'], ['rallyTarget', 'i32'],
];

export const EFFECT_CAP = 256;
export type Effects = {
  hi: number;
  alive: Uint8Array;
  kind: Uint8Array;
  owner: Uint8Array;
  x: Int32Array;
  y: Int32Array;
  radius: Int32Array;
  timer: Int32Array;
  period: Int32Array;
  nextTick: Int32Array;
  damage: Int32Array;
  source: Int32Array;
  sourceX: Int32Array;
  sourceY: Int32Array;
};
export const EFFECT_COLUMNS: ReadonlyArray<readonly [keyof Effects, ColType]> = [
  ['alive', 'u8'], ['kind', 'u8'], ['owner', 'u8'], ['x', 'i32'], ['y', 'i32'],
  ['radius', 'i32'], ['timer', 'i32'], ['period', 'i32'], ['nextTick', 'i32'], ['damage', 'i32'],
  ['source', 'i32'], ['sourceX', 'i32'], ['sourceY', 'i32'],
];

export type Players = {
  minerals: Int32Array;
  gas: Int32Array;
  supplyUsed: Int32Array;
  supplyMax: Int32Array;
  tech: Uint8Array; // P-major table: players.tech[player * TECH_CAP + tech] = completed level
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
  trackVision: boolean; // compute fog each tick? (off by default for headless throughput)
  e: Entities;
  effects: Effects;
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
// NOTE: built as an explicit object literal (not a loop over ENTITY_COLUMNS) so the
// Entities object gets a fast, fixed hidden class. Adding columns via dynamic keys
// would drop it into V8 dictionary mode and slow every `e.x[i]` access in the hot
// loop (~2× across all systems). `cloneEntities`/`deserializeEntities` reuse this
// factory and only *reassign* existing columns, which preserves the fast shape.
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
    shield: new Int32Array(CAP),
    energy: new Int32Array(CAP),
    energyMax: new Int32Array(CAP),
    energyTimer: new Int32Array(CAP),
    stimTimer: new Int32Array(CAP),
    matrixHp: new Int32Array(CAP),
    matrixTimer: new Int32Array(CAP),
    irradiateTimer: new Int32Array(CAP),
    plagueTimer: new Int32Array(CAP),
    ensnareTimer: new Int32Array(CAP),
    lockdownTimer: new Int32Array(CAP),
    stasisTimer: new Int32Array(CAP),
    maelstromTimer: new Int32Array(CAP),
    acidSporeCount: new Uint8Array(CAP),
    acidSporeTimer: new Int32Array(CAP),
    opticalFlare: new Uint8Array(CAP),
    parasiteOwner: new Uint8Array(CAP),
    illusion: new Uint8Array(CAP),
    lifeTimer: new Int32Array(CAP),
    cloakActive: new Uint8Array(CAP),
    cloakTimer: new Int32Array(CAP),
    cloakAura: new Uint8Array(CAP),
    burrowed: new Uint8Array(CAP),
    flags: new Uint16Array(CAP),
    order: new Uint8Array(CAP),
    target: new Int32Array(CAP),
    tx: new Int32Array(CAP),
    ty: new Int32Array(CAP),
    faceX: new Int32Array(CAP),
    faceY: new Int32Array(CAP),
    timer: new Int32Array(CAP),
    wcd: new Int32Array(CAP),
    ctimer: new Int32Array(CAP),
    built: new Uint8Array(CAP),
    buildKind: new Uint16Array(CAP),
    morphFromKind: new Uint16Array(CAP),
    buildCostMinerals: new Int32Array(CAP),
    buildCostGas: new Int32Array(CAP),
    specialAmmo: new Uint8Array(CAP),
    cargo: new Int32Array(CAP),
    cargoType: new Uint8Array(CAP),
    container: new Int32Array(CAP),
    prodKind: new Uint16Array(CAP),
    prodTimer: new Int32Array(CAP),
    prodQueued: new Int32Array(CAP),
    researchKind: new Uint16Array(CAP),
    researchTimer: new Int32Array(CAP),
    rallyX: new Int32Array(CAP),
    rallyY: new Int32Array(CAP),
    rallyTarget: new Int32Array(CAP),
  };
};

const makeEffects = (): Effects => ({
  hi: 0,
  alive: new Uint8Array(EFFECT_CAP),
  kind: new Uint8Array(EFFECT_CAP),
  owner: new Uint8Array(EFFECT_CAP),
  x: new Int32Array(EFFECT_CAP),
  y: new Int32Array(EFFECT_CAP),
  radius: new Int32Array(EFFECT_CAP),
  timer: new Int32Array(EFFECT_CAP),
  period: new Int32Array(EFFECT_CAP),
  nextTick: new Int32Array(EFFECT_CAP),
  damage: new Int32Array(EFFECT_CAP),
  source: new Int32Array(EFFECT_CAP),
  sourceX: new Int32Array(EFFECT_CAP),
  sourceY: new Int32Array(EFFECT_CAP),
});

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
      tech: new Uint8Array(playerCount * TECH_CAP),
    },
    teams,
    startTeams: 0, // set by setupMatch once teams are finalized
    result: { over: false, winner: -1 },
    vision,
    trackVision: false,
    e: makeEntities(),
    effects: makeEffects(),
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
  shield = 0,
  energyMax = 0,
  energy = 0,
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
  e.shield[slot] = shield;
  e.energy[slot] = energy;
  e.energyMax[slot] = energyMax;
  e.energyTimer[slot] = 0;
  e.stimTimer[slot] = 0;
  e.matrixHp[slot] = 0;
  e.matrixTimer[slot] = 0;
  e.irradiateTimer[slot] = 0;
  e.plagueTimer[slot] = 0;
  e.ensnareTimer[slot] = 0;
  e.lockdownTimer[slot] = 0;
  e.stasisTimer[slot] = 0;
  e.maelstromTimer[slot] = 0;
  e.acidSporeCount[slot] = 0;
  e.acidSporeTimer[slot] = 0;
  e.opticalFlare[slot] = 0;
  e.parasiteOwner[slot] = NEUTRAL;
  e.illusion[slot] = 0;
  e.lifeTimer[slot] = 0;
  e.cloakActive[slot] = 0;
  e.cloakTimer[slot] = 0;
  e.cloakAura[slot] = 0;
  e.burrowed[slot] = 0;
  e.flags[slot] = flags;
  e.order[slot] = 0;
  e.target[slot] = NONE;
  e.tx[slot] = 0;
  e.ty[slot] = 0;
  e.faceX[slot] = 0;
  e.faceY[slot] = -1;
  e.timer[slot] = 0;
  e.wcd[slot] = 0;
  e.ctimer[slot] = 0;
  e.built[slot] = 1; // complete by default; construction sets 0
  e.buildKind[slot] = 0;
  e.morphFromKind[slot] = 0;
  e.buildCostMinerals[slot] = 0;
  e.buildCostGas[slot] = 0;
  e.specialAmmo[slot] = 0;
  e.cargo[slot] = 0;
  e.cargoType[slot] = 0;
  e.container[slot] = NONE;
  e.prodKind[slot] = 0;
  e.prodTimer[slot] = 0;
  e.prodQueued[slot] = 0;
  e.researchKind[slot] = 0;
  e.researchTimer[slot] = 0;
  e.rallyX[slot] = NONE;
  e.rallyY[slot] = NONE;
  e.rallyTarget[slot] = NONE;
  return eid(e, slot);
};

export const spawnEffect = (
  s: State,
  kind: number,
  owner: number,
  x: number,
  y: number,
  radius: number,
  timer: number,
  period: number,
  damage: number,
  source = NONE,
  sourceX = 0,
  sourceY = 0,
): number => {
  const fx = s.effects;
  let slot = -1;
  for (let i = 0; i < EFFECT_CAP; i++) {
    if (fx.alive[i] === 0) { slot = i; break; }
  }
  if (slot < 0) throw new Error('effect capacity exceeded');
  if (slot + 1 > fx.hi) fx.hi = slot + 1;
  fx.alive[slot] = 1;
  fx.kind[slot] = kind;
  fx.owner[slot] = owner;
  fx.x[slot] = x;
  fx.y[slot] = y;
  fx.radius[slot] = radius;
  fx.timer[slot] = timer;
  fx.period[slot] = period;
  fx.nextTick[slot] = 0;
  fx.damage[slot] = damage;
  fx.source[slot] = source;
  fx.sourceX[slot] = sourceX;
  fx.sourceY[slot] = sourceY;
  return slot;
};

/** Free an entity slot, bumping its generation so old EntityIds become invalid. */
export const kill = (s: State, slot: number): void => {
  const e = s.e;
  if (e.alive[slot] !== 1) return;
  const id = eid(e, slot);
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.container[i] === id) kill(s, i);
  }
  if (e.buildKind[slot] !== 0) {
    const owner = e.owner[slot]!;
    if (owner < s.players.minerals.length) {
      s.players.minerals[owner] = s.players.minerals[owner]! + e.buildCostMinerals[slot]!;
      s.players.gas[owner] = s.players.gas[owner]! + e.buildCostGas[slot]!;
    }
  }
  e.buildCostMinerals[slot] = 0;
  e.buildCostGas[slot] = 0;
  e.buildKind[slot] = 0;
  e.morphFromKind[slot] = 0;
  e.container[slot] = NONE;
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
// Reuse the fast-shape factory, then reassign existing columns from the registry
// (keeps the hidden class fast; can't forget a column — the registry is the source).
const cloneEntities = (e: Entities): Entities => {
  const c = makeEntities();
  c.hi = e.hi; c.freeTop = e.freeTop;
  for (const [k] of ENTITY_COLUMNS) (c[k] as Int32Array).set(e[k] as Int32Array);
  return c;
};

const cloneEffects = (fx: Effects): Effects => {
  const c = makeEffects();
  c.hi = fx.hi;
  for (const [k] of EFFECT_COLUMNS) (c[k] as Int32Array).set(fx[k] as Int32Array);
  return c;
};

export const cloneState = (s: State): State => ({
  tick: s.tick,
  rng: cloneRng(s.rng),
  map: s.map, // immutable
  players: {
    minerals: s.players.minerals.slice(),
    gas: s.players.gas.slice(),
    supplyUsed: s.players.supplyUsed.slice(),
    supplyMax: s.players.supplyMax.slice(),
    tech: s.players.tech.slice(),
  },
  teams: s.teams.slice(),
  startTeams: s.startTeams,
  result: { over: s.result.over, winner: s.result.winner },
  vision: s.vision.map((v) => v.slice()),
  trackVision: s.trackVision,
  e: cloneEntities(s.e),
  effects: cloneEffects(s.effects),
});

// ---- deterministic state fingerprint (vision is derived, so excluded) ----
export const hashState = (s: State): number => {
  let h = FNV_OFFSET;
  h = fold(h, s.tick);
  h = fold(h, s.rng.s);
  h = fold(h, s.result.over ? 1 : 0);
  h = fold(h, s.result.winner);
  h = fold(h, s.startTeams);
  h = foldArray(h, s.teams, s.teams.length);
  const p = s.players;
  h = foldArray(h, p.minerals, p.minerals.length);
  h = foldArray(h, p.gas, p.gas.length);
  h = foldArray(h, p.supplyUsed, p.supplyUsed.length);
  h = foldArray(h, p.supplyMax, p.supplyMax.length);
  h = foldArray(h, p.tech, p.tech.length);
  const e = s.e;
  h = fold(h, e.hi);
  h = fold(h, e.freeTop);
  h = foldArray(h, e.gen, e.gen.length);
  h = foldArray(h, e.free, e.freeTop);
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1) continue;
    h = fold(h, i);
    h = fold(h, e.gen[i]!);
    h = fold(h, e.kind[i]!);
    h = fold(h, e.owner[i]!);
    h = fold(h, e.x[i]!);
    h = fold(h, e.y[i]!);
    h = fold(h, e.hp[i]!);
    h = fold(h, e.shield[i]!);
    h = fold(h, e.energy[i]!);
    h = fold(h, e.energyMax[i]!);
    h = fold(h, e.energyTimer[i]!);
    h = fold(h, e.stimTimer[i]!);
    h = fold(h, e.matrixHp[i]!);
    h = fold(h, e.matrixTimer[i]!);
    h = fold(h, e.irradiateTimer[i]!);
    h = fold(h, e.plagueTimer[i]!);
    h = fold(h, e.ensnareTimer[i]!);
    h = fold(h, e.lockdownTimer[i]!);
    h = fold(h, e.stasisTimer[i]!);
    h = fold(h, e.maelstromTimer[i]!);
    h = fold(h, e.acidSporeCount[i]!);
    h = fold(h, e.acidSporeTimer[i]!);
    h = fold(h, e.opticalFlare[i]!);
    h = fold(h, e.parasiteOwner[i]!);
    h = fold(h, e.illusion[i]!);
    h = fold(h, e.lifeTimer[i]!);
    h = fold(h, e.cloakActive[i]!);
    h = fold(h, e.cloakTimer[i]!);
    h = fold(h, e.cloakAura[i]!);
    h = fold(h, e.burrowed[i]!);
    h = fold(h, e.order[i]!);
    h = fold(h, e.target[i]!);
    h = fold(h, e.tx[i]!);
    h = fold(h, e.ty[i]!);
    h = fold(h, e.faceX[i]!);
    h = fold(h, e.faceY[i]!);
    h = fold(h, e.timer[i]!);
    h = fold(h, e.wcd[i]!);
    h = fold(h, e.ctimer[i]!);
    h = fold(h, e.built[i]!);
    h = fold(h, e.buildKind[i]!);
    h = fold(h, e.morphFromKind[i]!);
    h = fold(h, e.buildCostMinerals[i]!);
    h = fold(h, e.buildCostGas[i]!);
    h = fold(h, e.specialAmmo[i]!);
    h = fold(h, e.cargo[i]!);
    h = fold(h, e.cargoType[i]!);
    h = fold(h, e.container[i]!);
    h = fold(h, e.prodKind[i]!);
    h = fold(h, e.prodTimer[i]!);
    h = fold(h, e.prodQueued[i]!);
    h = fold(h, e.researchKind[i]!);
    h = fold(h, e.researchTimer[i]!);
    h = fold(h, e.rallyTarget[i]!);
    h = fold(h, e.rallyX[i]!);
    h = fold(h, e.rallyY[i]!);
  }
  const fx = s.effects;
  h = fold(h, fx.hi);
  for (let i = 0; i < fx.hi; i++) {
    if (fx.alive[i] !== 1) continue;
    h = fold(h, i);
    h = fold(h, fx.kind[i]!);
    h = fold(h, fx.owner[i]!);
    h = fold(h, fx.x[i]!);
    h = fold(h, fx.y[i]!);
    h = fold(h, fx.radius[i]!);
    h = fold(h, fx.timer[i]!);
    h = fold(h, fx.period[i]!);
    h = fold(h, fx.nextTick[i]!);
    h = fold(h, fx.damage[i]!);
    h = fold(h, fx.source[i]!);
    h = fold(h, fx.sourceX[i]!);
    h = fold(h, fx.sourceY[i]!);
  }
  return h >>> 0;
};
