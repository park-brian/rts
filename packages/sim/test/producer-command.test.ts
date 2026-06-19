import test from 'node:test';
import assert from 'node:assert/strict';
import { addonKindMask, researchTechMask, trainKindCandidates, trainKindMask } from '../src/io/action-mask.ts';
import { validateAddonCommand } from '../src/commands/addon.ts';
import type { Command, CommandRejectReason } from '../src/commands/types.ts';
import { Kind, Tech } from '../src/data/index.ts';
import { fx } from '../src/fixed.ts';
import { validateTrainCommand } from '../src/commands/production.ts';
import { validateResearchCommand } from '../src/commands/research.ts';
import {
  canProduceKind,
  producedKindsFor,
  producerKindDirectlyProducesOnlyWorkers,
  producerKindSupportsWorkerRally,
} from '../src/mechanics/capabilities.ts';
import { liftedStructureFlags } from '../src/mechanics/terran-mobility.ts';
import { validateCommand } from '../src/commands/validate.ts';
import { NONE, slotOf } from '../src/entity/world.ts';
import { simScenario } from '../test-support/scenario.ts';

type TrainCommand = Extract<Command, { t: 'train' }>;
type ResearchCommand = Extract<Command, { t: 'research' }>;
type AddonCommand = Extract<Command, { t: 'addon' }>;
type Expected = { ok: true } | { ok: false; reason: CommandRejectReason };

const assertTrain = (
  s: ReturnType<typeof simScenario>['state'],
  command: TrainCommand,
  expected: Expected,
): void => {
  assert.deepEqual(validateTrainCommand(s, 0, command), expected);
  assert.deepEqual(validateCommand(s, 0, command), expected);
};

const assertResearch = (
  s: ReturnType<typeof simScenario>['state'],
  command: ResearchCommand,
  expected: Expected,
): void => {
  assert.deepEqual(validateResearchCommand(s, 0, command), expected);
  assert.deepEqual(validateCommand(s, 0, command), expected);
};

const assertAddon = (
  s: ReturnType<typeof simScenario>['state'],
  command: AddonCommand,
  expected: Expected,
): void => {
  assert.deepEqual(validateAddonCommand(s, 0, command), expected);
  assert.deepEqual(validateCommand(s, 0, command), expected);
};

test('producer capability facts own products and worker-rally classification', () => {
  const scenario = simScenario({ players: 1, seed: 693 });
  const { state: s, spawn } = scenario;
  const gateway = spawn(Kind.Gateway, 0, fx(300), fx(300));

  assert.deepEqual([...producedKindsFor(Kind.CommandCenter)], [Kind.SCV]);
  assert.equal(canProduceKind(Kind.CommandCenter, Kind.SCV), true);
  assert.equal(canProduceKind(Kind.CommandCenter, Kind.Marine), false);
  assert.equal(producerKindSupportsWorkerRally(Kind.CommandCenter), true);
  assert.equal(producerKindDirectlyProducesOnlyWorkers(Kind.CommandCenter), true);
  assert.equal(producerKindSupportsWorkerRally(Kind.Gateway), false);
  assert.equal(producerKindDirectlyProducesOnlyWorkers(Kind.Gateway), false);
  assert.equal(producerKindSupportsWorkerRally(Kind.Hatchery), true);
  assert.equal(producerKindDirectlyProducesOnlyWorkers(Kind.Hatchery), false);

  assert.deepEqual([...trainKindCandidates(s, gateway)], [...producedKindsFor(Kind.Gateway)]);
});

test('train validation shares producer preflight without hiding product rules', () => {
  const scenario = simScenario({ players: 2, seed: 694 });
  const { state: s, spawn, resources } = scenario;
  resources(0, 2_000, 2_000);
  const gateway = spawn(Kind.Gateway, 0, fx(300), fx(300));
  spawn(Kind.Pylon, 0, fx(300), fx(300));
  const enemyGateway = spawn(Kind.Gateway, 1, fx(460), fx(300));
  const unpoweredGateway = spawn(Kind.Gateway, 0, fx(700), fx(300));
  const marine = spawn(Kind.Marine, 0, fx(780), fx(300));

  assertTrain(s, { t: 'train', building: gateway, kind: Kind.Zealot }, { ok: true });
  assertTrain(s, { t: 'train', building: enemyGateway, kind: Kind.Zealot }, { ok: false, reason: 'wrong-owner' });
  assertTrain(s, { t: 'train', building: 999_999, kind: Kind.Zealot }, { ok: false, reason: 'stale-entity' });
  assertTrain(s, { t: 'train', building: unpoweredGateway, kind: Kind.Zealot }, { ok: false, reason: 'missing-capability' });
  assertTrain(s, { t: 'train', building: marine, kind: Kind.Zealot }, { ok: false, reason: 'missing-capability' });

  const kinds = [Kind.Zealot] as const;
  assert.deepEqual([...trainKindMask(s, 0, gateway, kinds)], [1]);
  assert.deepEqual([...trainKindMask(s, 0, unpoweredGateway, kinds)], [0]);
});

test('research validation shares producer preflight and keeps research-specific gates local', () => {
  const scenario = simScenario({ players: 1, seed: 695 });
  const { state: s, spawn, resources } = scenario;
  resources(0, 2_000, 2_000);
  const forge = spawn(Kind.Forge, 0, fx(300), fx(300));
  spawn(Kind.Pylon, 0, fx(300), fx(300));
  const unpoweredForge = spawn(Kind.Forge, 0, fx(700), fx(300));
  const liftedFactory = spawn(Kind.Factory, 0, fx(820), fx(300));
  s.e.flags[slotOf(liftedFactory)] = liftedStructureFlags(Kind.Factory);

  assertResearch(s, { t: 'research', building: forge, tech: Tech.GroundWeapons }, { ok: true });
  assertResearch(s, { t: 'research', building: unpoweredForge, tech: Tech.GroundWeapons }, { ok: false, reason: 'missing-capability' });
  assertResearch(s, { t: 'research', building: liftedFactory, tech: Tech.GroundWeapons }, { ok: false, reason: 'missing-capability' });
  s.e.researchKind[slotOf(forge)] = Tech.GroundWeapons;
  assertResearch(s, { t: 'research', building: forge, tech: 999_999 }, { ok: false, reason: 'queue-full' });
  s.e.researchKind[slotOf(forge)] = Kind.None;
  assertResearch(s, { t: 'research', building: forge, tech: 999_999 }, { ok: false, reason: 'target-not-allowed' });

  const techs = [Tech.GroundWeapons] as const;
  assert.deepEqual([...researchTechMask(s, 0, forge, techs)], [1]);
  assert.deepEqual([...researchTechMask(s, 0, unpoweredForge, techs)], [0]);
});

test('add-on validation shares producer preflight and leaves placement/cost local', () => {
  const scenario = simScenario({ players: 1, seed: 696 });
  const { state: s, spawn, resources } = scenario;
  resources(0, 2_000, 2_000);
  const factory = spawn(Kind.Factory, 0, fx(300), fx(300));
  const liftedFactory = spawn(Kind.Factory, 0, fx(700), fx(300));
  const marine = spawn(Kind.Marine, 0, fx(820), fx(300));
  s.e.flags[slotOf(liftedFactory)] = liftedStructureFlags(Kind.Factory);

  assertAddon(s, { t: 'addon', building: factory, kind: Kind.MachineShop }, { ok: true });
  assertAddon(s, { t: 'addon', building: liftedFactory, kind: Kind.MachineShop }, { ok: false, reason: 'missing-capability' });
  assertAddon(s, { t: 'addon', building: marine, kind: Kind.MachineShop }, { ok: false, reason: 'incomplete-producer' });
  assertAddon(s, { t: 'addon', building: factory, kind: Kind.ControlTower }, { ok: false, reason: 'target-not-allowed' });
  s.e.target[slotOf(factory)] = spawn(Kind.MachineShop, 0, fx(1_200), fx(300));
  assertAddon(s, { t: 'addon', building: factory, kind: Kind.ControlTower }, { ok: false, reason: 'target-not-allowed' });
  assertAddon(s, { t: 'addon', building: factory, kind: Kind.MachineShop }, { ok: false, reason: 'queue-full' });
  s.e.target[slotOf(factory)] = NONE;

  const addons = [Kind.MachineShop] as const;
  assert.deepEqual([...addonKindMask(s, 0, factory, addons)], [1]);
  assert.deepEqual([...addonKindMask(s, 0, liftedFactory, addons)], [0]);
});
