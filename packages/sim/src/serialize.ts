// Byte (de)serialization of a full game State — fulfils the architecture spec's
// `snapshot(): ArrayBuffer` / `restore(buf)`: a flat buffer that persists to disk,
// crosses a Worker boundary cheaply, and round-trips bit-for-bit (verified by the
// replay tests). Entity columns are driven by ENTITY_COLUMNS, so a new column is
// picked up automatically. Vision grids are included so a byte snapshot preserves
// fair-observation memory as well as gameplay state.

import type { State } from './world.ts';
import { TECH_CAP } from './data.ts';
import { makeState, ENTITY_COLUMNS, EFFECT_COLUMNS, type ColType } from './world.ts';
import type { MapDef, StartLoc, ResourceSpawn } from './map.ts';

const MAGIC = 0x52545331; // 'RTS1'
const VERSION = 17;
const BYTES: Record<ColType, number> = { u8: 1, u16: 2, u32: 4, i32: 4 };

// ---- cursor over a DataView ----
class Writer {
  buf: ArrayBuffer;
  view: DataView;
  o = 0;
  constructor(size: number) { this.buf = new ArrayBuffer(size); this.view = new DataView(this.buf); }
  u8(v: number): void { this.view.setUint8(this.o, v); this.o += 1; }
  u32(v: number): void { this.view.setUint32(this.o, v >>> 0, true); this.o += 4; }
  i32(v: number): void { this.view.setInt32(this.o, v | 0, true); this.o += 4; }
  bytes(a: Uint8Array): void { new Uint8Array(this.view.buffer, this.o, a.length).set(a); this.o += a.length; }
  col(a: ArrayLike<number>, t: ColType, n: number): void {
    for (let i = 0; i < n; i++) {
      if (t === 'u8') this.u8(a[i]!);
      else if (t === 'u16') { this.view.setUint16(this.o, a[i]!, true); this.o += 2; }
      else if (t === 'u32') this.u32(a[i]!);
      else this.i32(a[i]!);
    }
  }
}
class Reader {
  view: DataView;
  o = 0;
  constructor(buf: ArrayBuffer) { this.view = new DataView(buf); }
  u8(): number { const v = this.view.getUint8(this.o); this.o += 1; return v; }
  u32(): number { const v = this.view.getUint32(this.o, true); this.o += 4; return v; }
  i32(): number { const v = this.view.getInt32(this.o, true); this.o += 4; return v; }
  bytes(n: number): Uint8Array { const a = new Uint8Array(this.view.buffer.slice(this.o, this.o + n)); this.o += n; return a; }
  col(dst: { [i: number]: number }, t: ColType, n: number): void {
    for (let i = 0; i < n; i++) {
      if (t === 'u8') dst[i] = this.u8();
      else if (t === 'u16') { dst[i] = this.view.getUint16(this.o, true); this.o += 2; }
      else if (t === 'u32') dst[i] = this.u32();
      else dst[i] = this.i32();
    }
  }
}

const enc = new TextEncoder();
const dec = new TextDecoder();

const sizeOf = (s: State): number => {
  const m = s.map;
  const name = enc.encode(m.name);
  const cap = s.e.alive.length;
  let n = 8; // magic + version
  n += 4 + name.length + 4 + 4 + 3 * m.w * m.h; // map header + 3 terrain grids
  n += 4 + m.starts.length * 8; // starts
  n += 4 + m.resources.length * 13; // resources (x,y,amount i32 ×3 + gas u8)
  n += 4 + m.teams.length * 4; // map teams
  const P = s.teams.length;
  n += 4 + 4 + 4 + 1 + 4 + 1; // tick, rng, startTeams, over, winner, trackVision
  n += 4 + P * 4 * 4 + P * TECH_CAP + P * 4; // P + 4 player pools + tech + state teams
  n += P * m.w * m.h; // per-player vision grids
  n += 4 + 4; // hi, freeTop
  for (const [, t] of ENTITY_COLUMNS) n += cap * BYTES[t];
  n += 4; // effect hi
  const effectCap = s.effects.alive.length;
  for (const [, t] of EFFECT_COLUMNS) n += effectCap * BYTES[t];
  return n;
};

export const serializeState = (s: State): ArrayBuffer => {
  const w = new Writer(sizeOf(s));
  const m = s.map;
  w.u32(MAGIC); w.u32(VERSION);
  // map
  const name = enc.encode(m.name);
  w.u32(name.length); w.bytes(name);
  w.u32(m.w); w.u32(m.h);
  w.bytes(m.walk); w.bytes(m.build); w.bytes(m.elev);
  w.u32(m.starts.length);
  for (const st of m.starts) { w.i32(st.x); w.i32(st.y); }
  w.u32(m.resources.length);
  for (const r of m.resources) { w.i32(r.x); w.i32(r.y); w.i32(r.amount); w.u8(r.gas ? 1 : 0); }
  w.u32(m.teams.length);
  for (const t of m.teams) w.i32(t);
  // state scalars
  w.i32(s.tick); w.u32(s.rng.s); w.i32(s.startTeams);
  w.u8(s.result.over ? 1 : 0); w.i32(s.result.winner); w.u8(s.trackVision ? 1 : 0);
  // players
  const P = s.teams.length;
  w.u32(P);
  w.col(s.players.minerals, 'i32', P); w.col(s.players.gas, 'i32', P);
  w.col(s.players.supplyUsed, 'i32', P); w.col(s.players.supplyMax, 'i32', P);
  w.bytes(s.players.tech);
  w.col(s.teams, 'i32', P);
  for (let p = 0; p < P; p++) w.bytes(s.vision[p]!);
  // entities
  const e = s.e;
  w.i32(e.hi); w.i32(e.freeTop);
  const cap = e.alive.length;
  for (const [k, t] of ENTITY_COLUMNS) w.col(e[k] as ArrayLike<number>, t, cap);
  // effects
  w.i32(s.effects.hi);
  const effectCap = s.effects.alive.length;
  for (const [k, t] of EFFECT_COLUMNS) w.col(s.effects[k] as ArrayLike<number>, t, effectCap);
  return w.buf;
};

export const deserializeState = (buf: ArrayBuffer): State => {
  const r = new Reader(buf);
  if (r.u32() !== MAGIC) throw new Error('serialize: bad magic');
  if (r.u32() !== VERSION) throw new Error('serialize: version mismatch');
  // map
  const name = dec.decode(r.bytes(r.u32()));
  const mw = r.u32(); const mh = r.u32();
  const walk = r.bytes(mw * mh); const build = r.bytes(mw * mh); const elev = r.bytes(mw * mh);
  const starts: StartLoc[] = [];
  for (let i = r.u32(); i > 0; i--) starts.push({ x: r.i32(), y: r.i32() });
  const resources: ResourceSpawn[] = [];
  for (let i = r.u32(); i > 0; i--) resources.push({ x: r.i32(), y: r.i32(), amount: r.i32(), gas: r.u8() === 1 });
  const mapTeams: number[] = [];
  for (let i = r.u32(); i > 0; i--) mapTeams.push(r.i32());
  const map: MapDef = { name, w: mw, h: mh, walk, build, elev, starts, resources, teams: mapTeams };
  // state scalars
  const tick = r.i32(); const rng = r.u32(); const startTeams = r.i32();
  const over = r.u8() === 1; const winner = r.i32(); const trackVision = r.u8() === 1;
  // players
  const P = r.u32();
  const s = makeState(map, P, rng); // fresh fast-shape state; columns overwritten below
  s.tick = tick; s.rng.s = rng; s.startTeams = startTeams; s.trackVision = trackVision;
  s.result.over = over; s.result.winner = winner;
  r.col(s.players.minerals, 'i32', P); r.col(s.players.gas, 'i32', P);
  r.col(s.players.supplyUsed, 'i32', P); r.col(s.players.supplyMax, 'i32', P);
  s.players.tech.set(r.bytes(P * TECH_CAP));
  r.col(s.teams, 'i32', P);
  for (let p = 0; p < P; p++) s.vision[p]!.set(r.bytes(mw * mh));
  // entities
  const e = s.e;
  e.hi = r.i32(); e.freeTop = r.i32();
  const cap = e.alive.length;
  for (const [k, t] of ENTITY_COLUMNS) r.col(e[k] as { [i: number]: number }, t, cap);
  // effects
  s.effects.hi = r.i32();
  const effectCap = s.effects.alive.length;
  for (const [k, t] of EFFECT_COLUMNS) r.col(s.effects[k] as { [i: number]: number }, t, effectCap);
  return s;
};
