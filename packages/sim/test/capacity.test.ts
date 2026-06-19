import test from 'node:test';
import assert from 'node:assert/strict';
import { Ability, EffectKind, Kind, Tech } from '../src/data/index.ts';
import { fx } from '../src/fixed.ts';
import { CAP, canSpawnEntity, eid, spawnEffect, slotOf } from '../src/entity/world.ts';
import { spawnUnit } from '../src/entity/factory.ts';
import { validateCommand } from '../src/commands/validate.ts';
import { simScenario } from '../test-support/scenario.ts';

const fillEntityCapacity = (spawn: (kind: number, owner: number, x: number, y: number) => number): void => {
  for (let i = 0; i < CAP; i++) {
    try {
      spawn(Kind.Marine, 0, fx(64 + (i % 64) * 8), fx(64 + Math.trunc(i / 64) * 8));
    } catch {
      return;
    }
  }
};

test('empty command steps return caller-isolated result arrays', () => {
  const { sim } = simScenario({ players: 1, seed: 1401 });
  const first = sim.step([]);
  first.push({ player: 0, index: 0, t: 'stop', ok: true });
  const second = sim.step([]);
  assert.equal(second.length, 0);
  assert.equal(sim.lastCommandResults.length, 0);
});

test('entity-capacity command validation rejects spawning commands without throwing', () => {
  const scenario = simScenario({ players: 1, seed: 1402 });
  const { state: s, spawn, grant } = scenario;
  s.players.minerals[0] = 10_000;
  s.players.gas[0] = 10_000;
  s.players.supplyMax[0] = 10_000;
  const barracks = spawn(Kind.Barracks, 0, fx(400), fx(400));
  const vulture = spawn(Kind.Vulture, 0, fx(460), fx(400));
  const hydra = spawn(Kind.Hydralisk, 0, fx(520), fx(400));
  spawn(Kind.HydraliskDen, 0, fx(540), fx(460));
  const templar = spawn(Kind.HighTemplar, 0, fx(580), fx(400));
  s.e.energy[slotOf(templar)] = 200;
  const marine = spawn(Kind.Marine, 0, fx(620), fx(400));
  grant(0, Tech.SpiderMines, 1);
  grant(0, Tech.LurkerAspect, 1);
  grant(0, Tech.Hallucination, 1);
  s.e.specialAmmo[slotOf(vulture)] = 1;
  fillEntityCapacity(spawn);
  assert.equal(canSpawnEntity(s), false);

  assert.deepEqual(validateCommand(s, 0, { t: 'train', building: barracks, kind: Kind.Marine }), {
    ok: false,
    reason: 'capacity-full',
  });
  assert.deepEqual(validateCommand(s, 0, { t: 'mine', unit: vulture }), {
    ok: false,
    reason: 'capacity-full',
  });
  assert.deepEqual(validateCommand(s, 0, { t: 'transform', unit: hydra, kind: Kind.Lurker }), {
    ok: true,
  });
  assert.deepEqual(validateCommand(s, 0, { t: 'ability', unit: templar, ability: Ability.Hallucination, target: marine }), {
    ok: false,
    reason: 'capacity-full',
  });
});

test('timed production holds ready when entity capacity is full', () => {
  const scenario = simScenario({ players: 1, seed: 1403 });
  const { sim, state: s, spawn } = scenario;
  const barracks = slotOf(spawn(Kind.Barracks, 0, fx(400), fx(400)));
  s.e.prodKind[barracks] = Kind.Marine;
  s.e.prodTimer[barracks] = 0;
  fillEntityCapacity(spawn);

  assert.doesNotThrow(() => sim.step([]));
  assert.equal(s.e.prodKind[barracks], Kind.Marine);
  assert.equal(s.e.prodTimer[barracks], 0);
});

test('effect-capacity ability validation rejects effect-creating spells', () => {
  const scenario = simScenario({ players: 1, seed: 1404 });
  const { state: s, spawn, grant } = scenario;
  const templar = spawn(Kind.HighTemplar, 0, fx(400), fx(400));
  s.e.energy[slotOf(templar)] = 200;
  grant(0, Tech.PsionicStorm, 1);
  for (let i = 0; i < 256; i++) {
    spawnEffect(s, EffectKind.ScannerSweep, 0, fx(64 + i), fx(64), fx(32), 10, 0, 0);
  }
  assert.deepEqual(validateCommand(s, 0, { t: 'ability', unit: templar, ability: Ability.PsionicStorm, x: fx(430), y: fx(400) }), {
    ok: false,
    reason: 'capacity-full',
  });
});
