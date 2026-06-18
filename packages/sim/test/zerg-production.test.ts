import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/sim.ts';
import type { MapDef } from '../src/map.ts';
import { count, eid, isAlive, kill, makeState, slotOf, type State } from '../src/world.ts';
import { spawnUnit } from '../src/factory.ts';
import { Kind, Tech, Units, Zerg, sec } from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import { placementForStructure, validateCommand } from '../src/validation.ts';
import { buildKindMask } from '../src/action-mask.ts';
import { simScenario, type SimScenario } from '../test-support/scenario.ts';

const zergScenario = (): SimScenario => simScenario({ players: 1, seed: 1, factions: [Zerg] });

const openMap = (): MapDef => {
  const w = 80;
  const h = 80;
  return {
    name: 'zerg-creep-scenario',
    w,
    h,
    walk: new Uint8Array(w * h).fill(1),
    build: new Uint8Array(w * h).fill(1),
    elev: new Uint8Array(w * h),
    starts: [],
    resources: [],
    teams: [],
  };
};

const find = (s: State, kind: number): number => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.owner[i] === 0 && e.kind[i] === kind) return i;
  }
  throw new Error(`missing kind ${kind}`);
};

const nearbyBuildSpot = (s: State, kind: number, origin: number): { x: number; y: number } => {
  const e = s.e;
  const baseX = e.x[origin]!;
  const baseY = e.y[origin]!;

  for (const dy of [0, -32, 32, -64, 64]) {
    for (const dx of [160, 192, 128, 224, 96, 256]) {
      const x = baseX + fx(dx);
      const y = baseY + fx(dy);
      if (placementForStructure(s, kind, x, y).ok) return { x, y };
    }
  }

  throw new Error(`no legal build spot near kind ${e.kind[origin]}`);
};

test('zerg starts with overlord supply and three larvae', () => {
  const { state: s } = zergScenario();

  assert.equal(count(s, Kind.Hatchery, 0), 1);
  assert.equal(count(s, Kind.Overlord, 0), 1);
  assert.equal(count(s, Kind.Larva, 0), 3);
  assert.ok(s.players.supplyMax[0]! >= s.players.supplyUsed[0]!);
});

test('zerg units train from larva as eggs, not directly from hatcheries', () => {
  const { sim, state: s, spawn } = zergScenario();
  const e = s.e;
  const hatchery = find(s, Kind.Hatchery);
  const larva = find(s, Kind.Larva);
  spawn(Kind.SpawningPool, 0, fx(700), fx(700));
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
  const { sim, state: s, spawn } = zergScenario();
  const e = s.e;
  spawn(Kind.SpawningPool, 0, fx(700), fx(700));
  const larva = find(s, Kind.Larva);

  sim.step([{ player: 0, cmds: [{ t: 'train', building: eid(e, larva), kind: Kind.Zergling }] }]);
  while (e.alive[larva] === 1 && e.kind[larva] === Kind.Egg) sim.step([]);
  sim.step([]);

  assert.equal(count(s, Kind.Zergling, 0), 2);
  assert.equal(count(s, Kind.Larva, 0), 3);
});

test('hatchery larva generation respects the three-larva cap', () => {
  const { sim, state: s } = zergScenario();
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.owner[i] === 0 && e.kind[i] === Kind.Larva) kill(s, i);
  }

  for (let i = 0; i < sec(60); i++) sim.step([]);

  assert.equal(count(s, Kind.Larva, 0), 3);
});

test('drones morph into zerg building foundations and cancel with partial refund', () => {
  const { sim, state: s, spawn, resources } = zergScenario();
  const e = s.e;
  const hatchery = find(s, Kind.Hatchery);
  const { x, y } = nearbyBuildSpot(s, Kind.SpawningPool, hatchery);
  const drone = slotOf(spawn(Kind.Drone, 0, x, y));
  const id = eid(e, drone);
  resources(0, 1_000);

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
  const { sim, state: s, spawn, resources } = zergScenario();
  const e = s.e;
  const drone = slotOf(spawn(Kind.Drone, 0, fx(1_600), fx(1_600)));
  resources(0, 1_000);

  const blocked = sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(e, drone), kind: Kind.SpawningPool, x: fx(1_600), y: fx(1_600) },
  ] }]);

  assert.deepEqual(blocked, [{ player: 0, index: 0, t: 'build', ok: false, reason: 'placement-blocked' }]);
  assert.equal(e.kind[drone], Kind.Drone);
  assert.equal(s.players.minerals[0], 1_000);
});

test('completed creep providers unlock shared placement validation and build masks', () => {
  const sim = Sim.fromState(makeState(openMap(), 1, 118));
  const s = sim.fullState();
  const e = s.e;
  s.players.minerals[0] = 2_000;
  spawnUnit(s, Kind.Hatchery, 0, fx(320), fx(320)); // satisfies tech, but is far from the expansion.
  const expansionDrone = slotOf(spawnUnit(s, Kind.Drone, 0, fx(960), fx(960)));
  const colonyDrone = slotOf(spawnUnit(s, Kind.Drone, 0, fx(1_152), fx(960)));
  const colony = [Kind.CreepColony] as const;
  const colonyX = e.x[colonyDrone]!;
  const colonyY = e.y[colonyDrone]!;

  assert.deepEqual(validateCommand(s, 0, { t: 'build', unit: eid(e, colonyDrone), kind: Kind.CreepColony, x: colonyX, y: colonyY }), {
    ok: false,
    reason: 'placement-blocked',
  });
  assert.deepEqual([...buildKindMask(s, 0, eid(e, colonyDrone), { kinds: colony, x: colonyX, y: colonyY })], [0]);

  const hatcheryStarted = sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(e, expansionDrone), kind: Kind.Hatchery, x: e.x[expansionDrone]!, y: e.y[expansionDrone]! },
  ] }]);
  assert.deepEqual(hatcheryStarted, [{ player: 0, index: 0, t: 'build', ok: true }]);
  assert.equal(e.kind[expansionDrone], Kind.Hatchery);
  assert.equal(e.built[expansionDrone], 0);
  assert.deepEqual([...buildKindMask(s, 0, eid(e, colonyDrone), { kinds: colony, x: colonyX, y: colonyY })], [0]);

  e.ctimer[expansionDrone] = 1;
  sim.step([]);
  assert.equal(e.built[expansionDrone], 1);
  assert.deepEqual([...buildKindMask(s, 0, eid(e, colonyDrone), { kinds: colony, x: colonyX, y: colonyY })], [1]);

  const colonyStarted = sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(e, colonyDrone), kind: Kind.CreepColony, x: colonyX, y: colonyY },
  ] }]);
  assert.deepEqual(colonyStarted, [{ player: 0, index: 0, t: 'build', ok: true }]);
  assert.equal(e.kind[colonyDrone], Kind.CreepColony);
  assert.equal(e.built[colonyDrone], 0);
});

test('zerg structure morphs require tech, refund on cancel, and finish in place', () => {
  const { sim, state: s, spawn, resources } = zergScenario();
  const e = s.e;
  const hatchery = find(s, Kind.Hatchery);
  const id = eid(e, hatchery);
  resources(0, 1_000, 1_000);

  const blocked = sim.step([{ player: 0, cmds: [{ t: 'transform', unit: id, kind: Kind.Lair }] }]);

  assert.deepEqual(blocked, [{ player: 0, index: 0, t: 'transform', ok: false, reason: 'missing-requirement' }]);
  assert.equal(e.kind[hatchery], Kind.Hatchery);

  spawn(Kind.SpawningPool, 0, e.x[hatchery]! + fx(160), e.y[hatchery]!);
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

  resources(0, 1_000, 1_000);
  sim.step([{ player: 0, cmds: [{ t: 'transform', unit: id, kind: Kind.Lair }] }]);
  while (e.built[hatchery] !== 1) sim.step([]);

  assert.equal(e.kind[hatchery], Kind.Lair);
  assert.equal(e.morphFromKind[hatchery], Kind.None);
  assert.equal(e.buildCostMinerals[hatchery], 0);
});

test('zerg combat unit morphs are teched, inert while morphing, and cancel back to source', () => {
  const { sim, state: s, spawn, resources, grant } = zergScenario();
  const e = s.e;
  const hydra = slotOf(spawn(Kind.Hydralisk, 0, fx(500), fx(500)));
  const hydraId = eid(e, hydra);
  spawn(Kind.HydraliskDen, 0, fx(650), fx(500));
  resources(0, 1_000, 1_000);

  const blocked = sim.step([{ player: 0, cmds: [{ t: 'transform', unit: hydraId, kind: Kind.Lurker }] }]);

  assert.deepEqual(blocked, [{ player: 0, index: 0, t: 'transform', ok: false, reason: 'missing-requirement' }]);

  grant(0, Tech.LurkerAspect);
  const started = sim.step([{ player: 0, cmds: [{ t: 'transform', unit: hydraId, kind: Kind.Lurker }] }]);

  assert.deepEqual(started, [{ player: 0, index: 0, t: 'transform', ok: true }]);
  assert.equal(e.kind[hydra], Kind.Lurker);
  assert.equal(e.built[hydra], 0);
  assert.equal(e.morphFromKind[hydra], Kind.Hydralisk);

  const inert = sim.step([{ player: 0, cmds: [
    { t: 'move', unit: hydraId, x: fx(800), y: fx(500) },
    { t: 'attack', unit: hydraId, target: spawn(Kind.Marine, 1, fx(540), fx(500)) },
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

test('zerg combat unit morphs require supply for larger target forms', () => {
  const { state: s, spawn, resources, grant } = zergScenario();
  const e = s.e;
  spawn(Kind.HydraliskDen, 0, fx(700), fx(700));
  const hydra = slotOf(spawn(Kind.Hydralisk, 0, fx(420), fx(400)));
  grant(0, Tech.LurkerAspect);
  resources(0, 1_000, 1_000);

  s.players.supplyUsed[0] = s.players.supplyMax[0];
  assert.deepEqual(validateCommand(s, 0, { t: 'transform', unit: eid(e, hydra), kind: Kind.Lurker }), {
    ok: false,
    reason: 'supply-blocked',
  });

  s.players.supplyUsed[0] -= Units[Kind.Lurker]!.supply - Units[Kind.Hydralisk]!.supply;
  assert.deepEqual(validateCommand(s, 0, { t: 'transform', unit: eid(e, hydra), kind: Kind.Lurker }), { ok: true });
});

test('mutalisks morph into guardian or devourer only after greater spire', () => {
  const { sim, state: s, spawn, resources } = zergScenario();
  const e = s.e;
  const muta = slotOf(spawn(Kind.Mutalisk, 0, fx(500), fx(500)));
  const mutaId = eid(e, muta);
  resources(0, 1_000, 1_000);

  const blocked = sim.step([{ player: 0, cmds: [
    { t: 'transform', unit: mutaId, kind: Kind.Guardian },
    { t: 'transform', unit: mutaId, kind: Kind.Devourer },
  ] }]);

  assert.deepEqual(blocked, [
    { player: 0, index: 0, t: 'transform', ok: false, reason: 'missing-requirement' },
    { player: 0, index: 1, t: 'transform', ok: false, reason: 'missing-requirement' },
  ]);

  spawn(Kind.GreaterSpire, 0, fx(700), fx(500));
  const started = sim.step([{ player: 0, cmds: [{ t: 'transform', unit: mutaId, kind: Kind.Devourer }] }]);

  assert.deepEqual(started, [{ player: 0, index: 0, t: 'transform', ok: true }]);
  assert.equal(e.kind[muta], Kind.Devourer);
  while (e.built[muta] !== 1) sim.step([]);
  assert.equal(e.morphFromKind[muta], Kind.None);
});
