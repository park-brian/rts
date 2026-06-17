import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/sim.ts';
import { sliceMap } from '../src/map.ts';
import { setupMatch } from '../src/setup.ts';
import { count, eid, isAlive, kill, slotOf } from '../src/world.ts';
import { spawnUnit } from '../src/factory.ts';
import { Kind, Tech, Units, Zerg, sec } from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import { setTechLevel } from '../src/tech.ts';

const zergSim = (): Sim => Sim.fromState(setupMatch(sliceMap(), 1, 1, [Zerg]));

const find = (sim: Sim, kind: number): number => {
  const e = sim.fullState().e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.owner[i] === 0 && e.kind[i] === kind) return i;
  }
  throw new Error(`missing kind ${kind}`);
};

test('zerg starts with overlord supply and three larvae', () => {
  const sim = zergSim();
  const s = sim.fullState();

  assert.equal(count(s, Kind.Hatchery, 0), 1);
  assert.equal(count(s, Kind.Overlord, 0), 1);
  assert.equal(count(s, Kind.Larva, 0), 3);
  assert.ok(s.players.supplyMax[0]! >= s.players.supplyUsed[0]!);
});

test('zerg units train from larva as eggs, not directly from hatcheries', () => {
  const sim = zergSim();
  const s = sim.fullState();
  const e = s.e;
  const hatchery = find(sim, Kind.Hatchery);
  const larva = find(sim, Kind.Larva);
  spawnUnit(s, Kind.SpawningPool, 0, fx(700), fx(700));
  const beforeMinerals = s.players.minerals[0]!;

  const rejected = sim.step([{ player: 0, cmds: [{ t: 'train', building: eid(e, hatchery), kind: Kind.Drone }] }]);
  assert.deepEqual(rejected, [{ player: 0, index: 0, t: 'train', ok: false, reason: 'missing-capability' }]);

  const accepted = sim.step([{ player: 0, cmds: [{ t: 'train', building: eid(e, larva), kind: Kind.Zergling }] }]);
  assert.deepEqual(accepted, [{ player: 0, index: 0, t: 'train', ok: true }]);
  assert.equal(e.kind[larva], Kind.Egg);
  assert.equal(e.prodKind[larva], Kind.Zergling);
  assert.equal(s.players.minerals[0], beforeMinerals - 50);
});

test('eggs hatch pair units and hatcheries replenish larvae up to three', () => {
  const sim = zergSim();
  const s = sim.fullState();
  const e = s.e;
  spawnUnit(s, Kind.SpawningPool, 0, fx(700), fx(700));
  const larva = find(sim, Kind.Larva);

  sim.step([{ player: 0, cmds: [{ t: 'train', building: eid(e, larva), kind: Kind.Zergling }] }]);
  while (e.alive[larva] === 1 && e.kind[larva] === Kind.Egg) sim.step([]);
  sim.step([]);

  assert.equal(count(s, Kind.Zergling, 0), 2);
  assert.equal(count(s, Kind.Larva, 0), 3);
});

test('hatchery larva generation respects the three-larva cap', () => {
  const sim = zergSim();
  const s = sim.fullState();
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.owner[i] === 0 && e.kind[i] === Kind.Larva) kill(s, i);
  }

  for (let i = 0; i < sec(60); i++) sim.step([]);

  assert.equal(count(s, Kind.Larva, 0), 3);
});

test('drones morph into zerg building foundations and cancel with partial refund', () => {
  const sim = zergSim();
  const s = sim.fullState();
  const e = s.e;
  const hatchery = find(sim, Kind.Hatchery);
  const x = e.x[hatchery]! + fx(160);
  const y = e.y[hatchery]!;
  const drone = slotOf(spawnUnit(s, Kind.Drone, 0, x, y));
  const id = eid(e, drone);
  s.players.minerals[0] = 1_000;

  const started = sim.step([{ player: 0, cmds: [
    { t: 'build', unit: id, kind: Kind.SpawningPool, x, y },
  ] }]);

  assert.deepEqual(started, [{ player: 0, index: 0, t: 'build', ok: true }]);
  assert.equal(e.kind[drone], Kind.SpawningPool);
  assert.equal(e.built[drone], 0);
  assert.equal(e.buildCostMinerals[drone], 200);
  assert.equal(s.players.minerals[0], 800);

  const canceled = sim.step([{ player: 0, cmds: [{ t: 'cancelBuild', building: id }] }]);

  assert.deepEqual(canceled, [{ player: 0, index: 0, t: 'cancelBuild', ok: true }]);
  assert.equal(isAlive(e, id), false);
  assert.equal(s.players.minerals[0], 950);
});

test('zerg buildings other than hatcheries and extractors require creep', () => {
  const sim = zergSim();
  const s = sim.fullState();
  const e = s.e;
  const drone = slotOf(spawnUnit(s, Kind.Drone, 0, fx(1_600), fx(1_600)));
  s.players.minerals[0] = 1_000;

  const blocked = sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(e, drone), kind: Kind.SpawningPool, x: fx(1_600), y: fx(1_600) },
  ] }]);

  assert.deepEqual(blocked, [{ player: 0, index: 0, t: 'build', ok: false, reason: 'placement-blocked' }]);
  assert.equal(e.kind[drone], Kind.Drone);
  assert.equal(s.players.minerals[0], 1_000);
});

test('zerg structure morphs require tech, refund on cancel, and finish in place', () => {
  const sim = zergSim();
  const s = sim.fullState();
  const e = s.e;
  const hatchery = find(sim, Kind.Hatchery);
  const id = eid(e, hatchery);
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  const blocked = sim.step([{ player: 0, cmds: [{ t: 'transform', unit: id, kind: Kind.Lair }] }]);

  assert.deepEqual(blocked, [{ player: 0, index: 0, t: 'transform', ok: false, reason: 'missing-requirement' }]);
  assert.equal(e.kind[hatchery], Kind.Hatchery);

  spawnUnit(s, Kind.SpawningPool, 0, e.x[hatchery]! + fx(160), e.y[hatchery]!);
  const started = sim.step([{ player: 0, cmds: [{ t: 'transform', unit: id, kind: Kind.Lair }] }]);

  assert.deepEqual(started, [{ player: 0, index: 0, t: 'transform', ok: true }]);
  assert.equal(e.kind[hatchery], Kind.Lair);
  assert.equal(e.built[hatchery], 0);
  assert.equal(e.morphFromKind[hatchery], Kind.Hatchery);
  assert.equal(e.buildCostMinerals[hatchery], Units[Kind.Lair]!.minerals);
  assert.equal(s.players.minerals[0], 1_000 - Units[Kind.Lair]!.minerals);

  const canceled = sim.step([{ player: 0, cmds: [{ t: 'cancelBuild', building: id }] }]);

  assert.deepEqual(canceled, [{ player: 0, index: 0, t: 'cancelBuild', ok: true }]);
  assert.equal(e.kind[hatchery], Kind.Hatchery);
  assert.equal(e.built[hatchery], 1);
  assert.equal(e.morphFromKind[hatchery], Kind.None);
  assert.equal(s.players.minerals[0], 1_000 - Units[Kind.Lair]!.minerals + Math.trunc(Units[Kind.Lair]!.minerals * 3 / 4));

  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;
  sim.step([{ player: 0, cmds: [{ t: 'transform', unit: id, kind: Kind.Lair }] }]);
  while (e.built[hatchery] !== 1) sim.step([]);

  assert.equal(e.kind[hatchery], Kind.Lair);
  assert.equal(e.morphFromKind[hatchery], Kind.None);
  assert.equal(e.buildCostMinerals[hatchery], 0);
});

test('zerg combat unit morphs are teched, inert while morphing, and cancel back to source', () => {
  const sim = zergSim();
  const s = sim.fullState();
  const e = s.e;
  const hydra = slotOf(spawnUnit(s, Kind.Hydralisk, 0, fx(500), fx(500)));
  const hydraId = eid(e, hydra);
  spawnUnit(s, Kind.HydraliskDen, 0, fx(650), fx(500));
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  const blocked = sim.step([{ player: 0, cmds: [{ t: 'transform', unit: hydraId, kind: Kind.Lurker }] }]);

  assert.deepEqual(blocked, [{ player: 0, index: 0, t: 'transform', ok: false, reason: 'missing-requirement' }]);

  setTechLevel(s, 0, Tech.LurkerAspect, 1);
  const started = sim.step([{ player: 0, cmds: [{ t: 'transform', unit: hydraId, kind: Kind.Lurker }] }]);

  assert.deepEqual(started, [{ player: 0, index: 0, t: 'transform', ok: true }]);
  assert.equal(e.kind[hydra], Kind.Lurker);
  assert.equal(e.built[hydra], 0);
  assert.equal(e.morphFromKind[hydra], Kind.Hydralisk);

  const inert = sim.step([{ player: 0, cmds: [
    { t: 'move', unit: hydraId, x: fx(800), y: fx(500) },
    { t: 'attack', unit: hydraId, target: spawnUnit(s, Kind.Marine, 1, fx(540), fx(500)) },
  ] }]);
  assert.deepEqual(inert, [
    { player: 0, index: 0, t: 'move', ok: false, reason: 'missing-capability' },
    { player: 0, index: 1, t: 'attack', ok: false, reason: 'missing-capability' },
  ]);

  const canceled = sim.step([{ player: 0, cmds: [{ t: 'cancelBuild', building: hydraId }] }]);

  assert.deepEqual(canceled, [{ player: 0, index: 0, t: 'cancelBuild', ok: true }]);
  assert.equal(e.kind[hydra], Kind.Hydralisk);
  assert.equal(e.built[hydra], 1);
  assert.equal(e.morphFromKind[hydra], Kind.None);
});

test('mutalisks morph into guardian or devourer only after greater spire', () => {
  const sim = zergSim();
  const s = sim.fullState();
  const e = s.e;
  const muta = slotOf(spawnUnit(s, Kind.Mutalisk, 0, fx(500), fx(500)));
  const mutaId = eid(e, muta);
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  const blocked = sim.step([{ player: 0, cmds: [
    { t: 'transform', unit: mutaId, kind: Kind.Guardian },
    { t: 'transform', unit: mutaId, kind: Kind.Devourer },
  ] }]);

  assert.deepEqual(blocked, [
    { player: 0, index: 0, t: 'transform', ok: false, reason: 'missing-requirement' },
    { player: 0, index: 1, t: 'transform', ok: false, reason: 'missing-requirement' },
  ]);

  spawnUnit(s, Kind.GreaterSpire, 0, fx(700), fx(500));
  const started = sim.step([{ player: 0, cmds: [{ t: 'transform', unit: mutaId, kind: Kind.Devourer }] }]);

  assert.deepEqual(started, [{ player: 0, index: 0, t: 'transform', ok: true }]);
  assert.equal(e.kind[muta], Kind.Devourer);
  while (e.built[muta] !== 1) sim.step([]);
  assert.equal(e.morphFromKind[muta], Kind.None);
});
