import test from 'node:test';
import assert from 'node:assert/strict';
import { eid, isAlive, slotOf } from '../src/entity/world.ts';
import { Kind, Units } from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import { parseReplay } from '../src/io/replay.ts';
import { simScenario } from '../test-support/scenario.ts';

test('templar merge consumes a nearby partner and creates an unfinished archon', () => {
  const { sim, state: s, spawn } = simScenario({ players: 1, seed: 501 });
  const e = s.e;
  const a = spawn(Kind.HighTemplar, 0, fx(400), fx(400));
  const b = spawn(Kind.HighTemplar, 0, fx(432), fx(400));
  const slot = slotOf(a);
  sim.step([]);
  const beforeSupply = s.players.supplyUsed[0]!;

  const results = sim.step([{ player: 0, cmds: [{ t: 'transform', unit: a, kind: Kind.Archon, target: b }] }]);

  assert.deepEqual(results, [{ player: 0, index: 0, t: 'transform', ok: true }]);
  assert.equal(e.kind[slot], Kind.Archon);
  assert.equal(Number(e.built[slot]), 0);
  assert.equal(e.ctimer[slot], Units[Kind.Archon]!.buildTime - 1);
  assert.equal(e.hp[slot], Units[Kind.Archon]!.hp);
  assert.equal(e.shield[slot], Units[Kind.Archon]!.shields);
  assert.equal(isAlive(e, b), false);
  assert.equal(e.x[slot], fx(416));
  assert.equal(s.players.supplyUsed[0], beforeSupply);

  const inert = sim.step([{ player: 0, cmds: [{ t: 'attack', unit: eid(e, slot), target: spawn(Kind.Marine, 1, fx(450), fx(400)) }] }]);
  assert.deepEqual(inert, [{ player: 0, index: 0, t: 'attack', ok: false, reason: 'missing-capability' }]);

  const cancel = sim.step([{ player: 0, cmds: [{ t: 'cancelBuild', building: eid(e, slot) }] }]);
  assert.deepEqual(cancel, [{ player: 0, index: 0, t: 'cancelBuild', ok: false, reason: 'target-not-allowed' }]);

  for (let guard = 0; Number(e.built[slot]) !== 1 && guard < Units[Kind.Archon]!.buildTime + 5; guard++) sim.step([]);

  assert.equal(e.kind[slot], Kind.Archon);
  assert.equal(Number(e.built[slot]), 1);
  assert.equal(e.ctimer[slot], 0);
  assert.equal(s.players.supplyUsed[0], beforeSupply);
});

test('dark templar merge creates a dark archon and rejects missing partners', () => {
  const { sim, state: s, spawn } = simScenario({ players: 1, seed: 502 });
  const e = s.e;
  const lone = spawn(Kind.DarkTemplar, 0, fx(400), fx(400));

  assert.deepEqual(sim.step([{ player: 0, cmds: [{ t: 'transform', unit: lone, kind: Kind.DarkArchon }] }]), [
    { player: 0, index: 0, t: 'transform', ok: false, reason: 'target-not-allowed' },
  ]);

  const partner = spawn(Kind.DarkTemplar, 0, fx(430), fx(400));
  assert.deepEqual(sim.step([{ player: 0, cmds: [{ t: 'transform', unit: lone, kind: Kind.DarkArchon, target: partner }] }]), [
    { player: 0, index: 0, t: 'transform', ok: true },
  ]);

  const slot = slotOf(lone);
  assert.equal(e.kind[slot], Kind.DarkArchon);
  assert.equal(e.built[slot], 0);
  assert.equal(e.energy[slot], Units[Kind.DarkArchon]!.startEnergy);
  assert.equal(isAlive(e, partner), false);
});

test('replay parser accepts transform merge partners', () => {
  const replay = parseReplay(JSON.stringify({
    version: 1,
    map: { kind: 'slice' },
    players: 1,
    seed: 503,
    frames: [[{ player: 0, cmds: [{ t: 'transform', unit: 1, kind: Kind.Archon, target: 2 }] }]],
  }));

  assert.deepEqual(replay.frames[0]![0]!.cmds[0], { t: 'transform', unit: 1, kind: Kind.Archon, target: 2 });
});
