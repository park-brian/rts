import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/sim.ts';
import { parseReplay, toReplay, play, replayHashes, type MapSpec } from '../src/replay.ts';
import { generateMap } from '../src/procedural.ts';
import { eid, ENTITY_COLUMNS, makeState, type State } from '../src/world.ts';
import { sliceMap } from '../src/map.ts';
import { Kind, Role, Units } from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import type { Command, PlayerCommands } from '../src/commands.ts';

// A deterministic controller exercising train + group amove (movement/flow/separation),
// standing in for a mixed human/bot command stream.
const control = (s: State, p: number, t: number): Command[] => {
  const cmds: Command[] = [];
  const e = s.e;
  const scv = Units[Kind.SCV]!;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.owner[i] !== p) continue;
    if (e.kind[i] === Kind.CommandCenter && e.prodKind[i] === Kind.None &&
        s.players.minerals[p]! >= scv.minerals &&
        s.players.supplyUsed[p]! + scv.supply <= s.players.supplyMax[p]!) {
      cmds.push({ t: 'train', building: eid(e, i), kind: Kind.SCV });
    }
  }
  if (t % 150 === 149) {
    for (let i = 0; i < e.hi; i++) {
      if (e.alive[i] === 1 && e.owner[i] === p && (e.flags[i]! & Role.Structure) === 0 && (e.flags[i]! & Role.Mobile) !== 0) {
        cmds.push({ t: 'amove', unit: eid(e, i), x: fx(32 * 32), y: fx(48 * 32) });
      }
    }
  }
  return cmds;
};

const batchFor = (s: State, players: number, t: number): PlayerCommands[] => {
  const b: PlayerCommands[] = [];
  for (let p = 0; p < players; p++) b.push({ player: p, cmds: control(s, p, t) });
  return b;
};

const SEED = 1234;
const SPEC: MapSpec = { kind: 'procedural', perTeam: 1, seed: SEED };

test('a recorded session replays to an identical per-tick hash sequence', () => {
  const sim = new Sim({ map: generateMap(1, SEED), players: 2, seed: SEED, record: true });
  const hashes: number[] = [];
  for (let t = 0; t < 700; t++) {
    sim.step(batchFor(sim.fullState(), 2, t));
    hashes.push(sim.hash());
  }
  const replay = toReplay(sim, SPEC);
  assert.equal(replay.frames.length, 700, 'every tick recorded');
  assert.deepEqual(replayHashes(replay), hashes, 'replay reproduces the game exactly');
});

test('byte serialize/deserialize round-trips and continues identically', () => {
  const sim = new Sim({ map: generateMap(1, SEED), players: 2, seed: SEED });
  for (let t = 0; t < 400; t++) sim.step(batchFor(sim.fullState(), 2, t));

  const buf = sim.serialize();
  const restored = Sim.deserialize(buf);
  assert.equal(restored.hash(), sim.hash(), 'deserialized state matches');
  assert.equal(restored.tick, sim.tick, 'tick preserved');

  // Both advance identically from the same point.
  for (let t = 400; t < 700; t++) {
    sim.step(batchFor(sim.fullState(), 2, t));
    restored.step(batchFor(restored.fullState(), 2, t));
  }
  assert.equal(restored.hash(), sim.hash(), 'restored future matches original');
});

test('snapshot branches into divergent "what-ifs"', () => {
  const sim = new Sim({ map: generateMap(1, SEED), players: 2, seed: SEED });
  for (let t = 0; t < 300; t++) sim.step(batchFor(sim.fullState(), 2, t));

  const snap = sim.snapshot();
  const hashAtSnap = sim.hash();
  const e = sim.fullState().e;
  // Find a mobile unit of player 0 to redirect in one branch (a move always applies).
  let unit = -1;
  for (let i = 0; i < e.hi; i++) if (e.alive[i] === 1 && e.owner[i] === 0 && (e.flags[i]! & Role.Mobile) !== 0) { unit = i; break; }
  assert.ok(unit >= 0, 'have a mobile unit to branch on');

  const branchA = Sim.restore(snap);
  const branchB = Sim.restore(snap);
  assert.equal(branchA.hash(), branchB.hash(), 'branches start equal');
  // A redirects the unit; B does nothing.
  branchA.step([{ player: 0, cmds: [{ t: 'move', unit: eid(e, unit), x: fx(10 * 32), y: fx(10 * 32) }] }]);
  branchB.step([]);
  assert.notEqual(branchA.hash(), branchB.hash(), 'different commands diverge the future');

  // The original snapshot is untouched by either branch.
  assert.equal(Sim.restore(snap).hash(), hashAtSnap, 'snapshot is independent of its branches');
});

test('ENTITY_COLUMNS covers every typed-array column (clone/serialize guard)', () => {
  const e = makeState(sliceMap(), 1, 1).e as unknown as Record<string, unknown>;
  const typed = Object.keys(e).filter((k) => ArrayBuffer.isView(e[k] as object)).sort();
  const registered = ENTITY_COLUMNS.map(([k]) => k as string).sort();
  assert.deepEqual(typed, registered, 'a new typed-array column must be added to ENTITY_COLUMNS');
});

test('replay round-trips through JSON (the on-disk / on-wire form)', () => {
  const sim = new Sim({ map: generateMap(1, SEED), players: 2, seed: SEED, record: true });
  for (let t = 0; t < 200; t++) sim.step(batchFor(sim.fullState(), 2, t));
  const replay = toReplay(sim, SPEC);
  const round = parseReplay(JSON.stringify(replay));
  assert.deepEqual(replayHashes(round), replayHashes(replay), 'JSON-serialized replay is faithful');
});

test('recording stores idle ticks as compact empty frames', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 4321, record: true });
  sim.step([{ player: 0, cmds: [] }, { player: 1, cmds: [] }]);
  sim.step([]);

  assert.deepEqual(sim.frames, [[], []]);
});

test('replay parser rejects wrong versions and malformed commands', () => {
  const good = toReplay(new Sim({ map: generateMap(1, SEED), players: 2, seed: SEED, record: true }), SPEC);
  assert.throws(() => parseReplay(JSON.stringify({ ...good, version: 999 })), /unsupported version/);
  assert.throws(() => parseReplay(JSON.stringify({ ...good, frames: [[{ player: 0, cmds: [{ t: 'warp', unit: 1 }] }]] })), /unknown command type/);
  assert.throws(() => parseReplay('{nope'), /invalid JSON/);
});
