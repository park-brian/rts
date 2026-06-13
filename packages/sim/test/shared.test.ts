import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/sim.ts';
import { sliceMap } from '../src/map.ts';
import { makeState, hashState, eid, type State } from '../src/world.ts';
import { Kind, Units } from '../src/data.ts';
import type { Command, PlayerCommands } from '../src/commands.ts';
import { computeLayout, allocSnapshot, SharedSnapshot, publish, readInto } from '../src/shared.ts';

// Same scripted macro the determinism tests use: produces a non-trivial,
// growing game (workers, economy, structures) so most columns get exercised.
const macro = (s: State, p: number): Command[] => {
  const cmds: Command[] = [];
  const e = s.e;
  const scv = Units[Kind.SCV]!;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.kind[i] !== Kind.CommandCenter || e.owner[i] !== p) continue;
    if (e.prodKind[i] !== Kind.None) continue;
    if (s.players.minerals[p]! < scv.minerals) continue;
    if (s.players.supplyUsed[p]! + scv.supply > s.players.supplyMax[p]!) continue;
    cmds.push({ t: 'train', building: eid(e, i), kind: Kind.SCV });
  }
  return cmds;
};
const batchFor = (sim: Sim, players: number): PlayerCommands[] =>
  Array.from({ length: players }, (_, p) => ({ player: p, cmds: macro(sim.fullState(), p) }));

test('layout offsets are aligned to each view element size', () => {
  const L = computeLayout(4);
  assert.equal(L.ctrlOffset % 4, 0);
  for (const off of Object.values(L.players)) assert.equal(off % 4, 0, 'player pools 4-aligned');
  const sz = { u8: 1, u16: 2, u32: 4, i32: 4 } as const;
  for (const [k, t, off] of L.cols) assert.equal(off % sz[t], 0, `${String(k)} (${t}) aligned`);
  assert.ok(L.byteLength >= L.cols[L.cols.length - 1]![2], 'buffer covers last column');
});

test('publish → readInto round-trips state with an identical hash, every tick', () => {
  const players = 2;
  const sim = new Sim({ map: sliceMap(), players, seed: 777 });
  const snap = new SharedSnapshot(allocSnapshot(players), players);
  // Reader owns its own State; map matches the sim's (immutable, shared in real use).
  const dst = makeState(sliceMap(), players, 0);

  for (let t = 0; t < 600; t++) {
    sim.step(batchFor(sim, players));
    publish(snap, sim.fullState());
    const seq = readInto(snap, dst);
    assert.notEqual(seq, -1, `stable read at tick ${t}`);
    assert.equal(dst.tick, sim.tick, `tick mirrored at ${t}`);
    assert.equal(hashState(dst), sim.hash(), `hash matches at tick ${t}`);
  }
  // A real, grown game — not a no-op round-trip.
  assert.ok(sim.fullState().e.hi > 4, 'game actually grew');
});

test('reader is decoupled: stepping the sim without republishing leaves the reader stale', () => {
  const players = 1;
  const sim = new Sim({ map: sliceMap(), players, seed: 9 });
  const snap = new SharedSnapshot(allocSnapshot(players), players);
  const dst = makeState(sliceMap(), players, 0);

  for (let t = 0; t < 50; t++) sim.step(batchFor(sim, players));
  publish(snap, sim.fullState());
  readInto(snap, dst);
  const stale = hashState(dst);
  for (let t = 0; t < 50; t++) sim.step(batchFor(sim, players)); // advance, do NOT publish
  readInto(snap, dst); // re-read same snapshot
  assert.equal(hashState(dst), stale, 'reader sees only published frames');
  assert.equal(dst.tick, 50);
  publish(snap, sim.fullState());
  readInto(snap, dst);
  assert.equal(dst.tick, 100, 'new publish is visible');
  assert.equal(hashState(dst), sim.hash());
});

test('seqlock rejects a torn read (writer mid-publish)', () => {
  const players = 1;
  const sim = new Sim({ map: sliceMap(), players, seed: 1 });
  for (let t = 0; t < 20; t++) sim.step(batchFor(sim, players));
  const snap = new SharedSnapshot(allocSnapshot(players), players);
  publish(snap, sim.fullState());
  const dst = makeState(sliceMap(), players, 0);

  // Force the seq odd (as if a writer is mid-publish) and bound the spin: the
  // reader must give up rather than return a torn snapshot.
  Atomics.store(snap.ctrl, 0, Atomics.load(snap.ctrl, 0) + 1);
  assert.equal(readInto(snap, dst, 64), -1, 'no stable read while seq is odd');
});

test('allocator picks SharedArrayBuffer when available (Node has no COI gate)', () => {
  // In Node, SharedArrayBuffer exists and there is no crossOriginIsolated gate,
  // so the allocator must hand back shared memory. In a non-isolated browser it
  // would fall back to a plain ArrayBuffer instead (same byte layout either way).
  const buf = allocSnapshot(2);
  assert.ok(buf instanceof SharedArrayBuffer, 'shared buffer in Node');
  assert.equal(buf.byteLength, computeLayout(2).byteLength);
});
