import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/sim.ts';
import { mapFromSpec, parseReplay, toReplay, play, replayHashes, type MapSpec } from '../src/replay.ts';
import { generateMap } from '../src/procedural.ts';
import { eid, ENTITY_COLUMNS, hashState, kill, makeState, slotOf, type State } from '../src/entity/world.ts';
import { sliceMap } from '../src/map.ts';
import { Kind, Protoss, Role, Units, Zerg } from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import type { Command, PlayerCommands } from '../src/commands.ts';
import { spawnUnit } from '../src/entity/factory.ts';
import { deserializeState, serializeState } from '../src/serialize.ts';

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

test('persistent movement velocity is serialized and hashed', () => {
  const s = makeState(sliceMap(), 1, 99);
  const slot = slotOf(spawnUnit(s, Kind.Marine, 0, fx(4 * 32), fx(4 * 32)));
  s.e.vx[slot] = fx(3);
  s.e.vy[slot] = -fx(2);
  const hash = hashState(s);

  const restored = deserializeState(serializeState(s));
  assert.equal(restored.e.vx[slot], fx(3));
  assert.equal(restored.e.vy[slot], -fx(2));
  assert.equal(hashState(restored), hash, 'velocity round-trip preserves hash');

  restored.e.vx[slot] = fx(4);
  assert.notEqual(hashState(restored), hash, 'velocity participates in desync hashes');
});

test('intent and combat target columns are serialized, hashed, and reset on reuse', () => {
  const s = makeState(sliceMap(), 1, 991);
  const unit = slotOf(spawnUnit(s, Kind.Marine, 0, fx(4 * 32), fx(4 * 32)));
  const friend = spawnUnit(s, Kind.SCV, 0, fx(5 * 32), fx(4 * 32));
  const enemy = spawnUnit(s, Kind.Zergling, 0, fx(6 * 32), fx(4 * 32));
  s.e.intentTarget[unit] = friend;
  s.e.combatTarget[unit] = enemy;
  const hash = hashState(s);

  const restored = deserializeState(serializeState(s));
  assert.equal(restored.e.intentTarget[unit], friend);
  assert.equal(restored.e.combatTarget[unit], enemy);
  assert.equal(hashState(restored), hash, 'target-split columns round-trip into hashes');

  restored.e.intentTarget[unit] = enemy;
  assert.notEqual(hashState(restored), hash, 'intent target participates in desync hashes');
  restored.e.intentTarget[unit] = friend;
  restored.e.combatTarget[unit] = friend;
  assert.notEqual(hashState(restored), hash, 'combat target participates in desync hashes');

  kill(s, unit);
  const reused = slotOf(spawnUnit(s, Kind.Marine, 0, fx(7 * 32), fx(4 * 32)));
  assert.equal(reused, unit, 'slot reuse keeps the reset check meaningful');
  assert.equal(s.e.intentTarget[reused], -1);
  assert.equal(s.e.combatTarget[reused], -1);
});

test('replay round-trips through JSON (the on-disk / on-wire form)', () => {
  const sim = new Sim({ map: generateMap(1, SEED), players: 2, seed: SEED, record: true });
  for (let t = 0; t < 200; t++) sim.step(batchFor(sim.fullState(), 2, t));
  const replay = toReplay(sim, SPEC);
  const round = parseReplay(JSON.stringify(replay));
  assert.deepEqual(replayHashes(round), replayHashes(replay), 'JSON-serialized replay is faithful');
});

test('procedural replay specs preserve optional generator knobs', () => {
  const spec: MapSpec = { kind: 'procedural', perTeam: 2, seed: 17, preset: 'teamPlateaus', midfield: 'dualChoke' };
  const parsed = parseReplay(JSON.stringify({
    version: 1,
    map: spec,
    players: 4,
    seed: 17,
    frames: [],
  }));

  assert.deepEqual(parsed.map, spec);
  assert.equal(mapFromSpec(parsed.map).bases?.filter((base) => base.kind === 'natural').length, 4);

  const isolated: MapSpec = { kind: 'procedural', perTeam: 2, seed: 18, preset: 'isolatedMains' };
  const parsedIsolated = parseReplay(JSON.stringify({
    version: 1,
    map: isolated,
    players: 4,
    seed: 18,
    frames: [],
  }));
  assert.deepEqual(parsedIsolated.map, isolated);
  assert.equal(mapFromSpec(parsedIsolated.map).bases?.every((base) => base.kind === 'main'), true);

  const fortress: MapSpec = { kind: 'procedural', perTeam: 2, seed: 19, preset: 'fortress' };
  const parsedFortress = parseReplay(JSON.stringify({
    version: 1,
    map: fortress,
    players: 4,
    seed: 19,
    frames: [],
  }));
  assert.deepEqual(parsedFortress.map, fortress);
  assert.equal(mapFromSpec(parsedFortress.map).bases?.filter((base) => base.kind === 'fortress').length, 4);
});

test('replay preserves selected player factions', () => {
  const sim = new Sim({ map: generateMap(1, SEED), players: 2, seed: SEED, record: true, factions: [Protoss, Zerg] });
  const replay = parseReplay(JSON.stringify(toReplay(sim, SPEC)));
  const restored = play(replay).fullState().e;

  assert.equal(replay.factions?.[0], 'protoss');
  assert.equal(replay.factions?.[1], 'zerg');
  let nexus = 0;
  let hatchery = 0;
  for (let i = 0; i < restored.hi; i++) {
    if (restored.alive[i] === 1 && restored.owner[i] === 0 && restored.kind[i] === Kind.Nexus) nexus++;
    if (restored.alive[i] === 1 && restored.owner[i] === 1 && restored.kind[i] === Kind.Hatchery) hatchery++;
  }
  assert.equal(nexus, 1);
  assert.equal(hatchery, 1);
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
