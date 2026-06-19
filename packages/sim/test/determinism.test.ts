import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/sim.ts';
import { sliceMap } from '../src/map.ts';
import { eid, type State } from '../src/entity/world.ts';
import { Kind, Units } from '../src/data.ts';
import type { Command, PlayerCommands } from '../src/commands/types.ts';

// Deterministic scripted controller used to drive a non-trivial game.
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

const batchFor = (sim: Sim, players: number): PlayerCommands[] => {
  const b: PlayerCommands[] = [];
  for (let p = 0; p < players; p++) b.push({ player: p, cmds: macro(sim.fullState(), p) });
  return b;
};

test('identical runs produce identical per-tick hash sequences', () => {
  const run = (): number[] => {
    const sim = new Sim({ map: sliceMap(), players: 2, seed: 777 });
    const hashes: number[] = [];
    for (let t = 0; t < 600; t++) {
      sim.step(batchFor(sim, 2));
      hashes.push(sim.hash());
    }
    return hashes;
  };
  assert.deepEqual(run(), run());
});

test('snapshot/restore reproduces the future exactly', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 4242 });
  for (let t = 0; t < 300; t++) sim.step(batchFor(sim, 2));

  const snap = sim.snapshot();
  const hashAtSnap = sim.hash();

  // Continue the original.
  for (let t = 0; t < 300; t++) sim.step(batchFor(sim, 2));
  const hashOriginalFuture = sim.hash();

  // Restore and replay the same 300 ticks.
  const restored = Sim.restore(snap);
  assert.equal(restored.hash(), hashAtSnap, 'restore matches snapshot');
  for (let t = 0; t < 300; t++) restored.step(batchFor(restored, 2));
  assert.equal(restored.hash(), hashOriginalFuture, 'restored future matches original');
});

test('snapshot is an independent copy', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 9 });
  for (let t = 0; t < 100; t++) sim.step(batchFor(sim, 1));
  const snap = sim.snapshot();
  const restored = Sim.restore(snap);
  for (let t = 0; t < 100; t++) restored.step(batchFor(restored, 1));
  // Mutating the restored sim must not have changed the snapshot.
  const restored2 = Sim.restore(snap);
  assert.notEqual(restored.hash(), restored2.hash());
  assert.equal(restored2.tick, 100);
});
