import test from 'node:test';
import assert from 'node:assert/strict';
import { addonKindMask, buildKindMask, researchTechMask, trainKindMask } from '../src/io/action-mask.ts';
import { validateAddonCommand } from '../src/commands/addon.ts';
import { validateBuildCommand } from '../src/commands/build.ts';
import { workerBuildSelectionOptions } from '../src/commands/intent.ts';
import type { Command, CommandRejectReason } from '../src/commands/types.ts';
import { Kind, Order, Tech } from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import { validateTrainCommand } from '../src/commands/production.ts';
import { validateResearchCommand } from '../src/commands/research.ts';
import { validateCommand } from '../src/commands/validate.ts';
import { slotOf } from '../src/entity/world.ts';
import { simScenario } from '../test-support/scenario.ts';

type TrainCommand = Extract<Command, { t: 'train' }>;
type ResearchCommand = Extract<Command, { t: 'research' }>;
type AddonCommand = Extract<Command, { t: 'addon' }>;
type BuildCommand = Extract<Command, { t: 'build' }>;
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

const assertBuild = (
  s: ReturnType<typeof simScenario>['state'],
  command: BuildCommand,
  expected: Expected,
): void => {
  assert.deepEqual(validateBuildCommand(s, 0, command), expected);
  assert.deepEqual(validateCommand(s, 0, command), expected);
};

test('macro command affordability uses shared validation and masks', () => {
  const scenario = simScenario({ players: 1, seed: 697 });
  const { state: s, spawn, resources } = scenario;
  const barracks = spawn(Kind.Barracks, 0, fx(300), fx(300));
  const forge = spawn(Kind.Forge, 0, fx(500), fx(300));
  const factory = spawn(Kind.Factory, 0, fx(700), fx(300));
  const scv = spawn(Kind.SCV, 0, fx(900), fx(300));
  spawn(Kind.Pylon, 0, fx(500), fx(300));
  spawn(Kind.CommandCenter, 0, fx(900), fx(520));

  resources(0, 49, 0);
  assertTrain(s, { t: 'train', building: barracks, kind: Kind.Marine }, { ok: false, reason: 'not-affordable' });
  assert.deepEqual([...trainKindMask(s, 0, barracks, [Kind.Marine])], [0]);

  resources(0, 100, 99);
  assertResearch(s, { t: 'research', building: forge, tech: Tech.GroundWeapons }, { ok: false, reason: 'not-affordable' });
  assert.deepEqual([...researchTechMask(s, 0, forge, [Tech.GroundWeapons])], [0]);

  resources(0, 49, 50);
  assertAddon(s, { t: 'addon', building: factory, kind: Kind.MachineShop }, { ok: false, reason: 'not-affordable' });
  assert.deepEqual([...addonKindMask(s, 0, factory, [Kind.MachineShop])], [0]);

  resources(0, 99, 0);
  const build = { t: 'build', unit: scv, kind: Kind.SupplyDepot, x: fx(1_080), y: fx(300) } satisfies BuildCommand;
  assertBuild(s, build, { ok: false, reason: 'not-affordable' });
  assert.deepEqual([...buildKindMask(s, 0, scv, { x: build.x, y: build.y, kinds: [Kind.SupplyDepot] })], [0]);
});

test('pending worker build credit is shared by validation and command-card discovery', () => {
  const scenario = simScenario({ players: 1, seed: 698 });
  const { state: s, spawn, resources } = scenario;
  const scv = spawn(Kind.SCV, 0, fx(300), fx(300));
  spawn(Kind.CommandCenter, 0, fx(300), fx(520));
  const slot = slotOf(scv);
  s.e.order[slot] = Order.Build;
  s.e.buildKind[slot] = Kind.SupplyDepot;
  s.e.buildCostMinerals[slot] = 100;
  resources(0, 50, 0);

  const build = { t: 'build', unit: scv, kind: Kind.Barracks, x: fx(520), y: fx(300) } satisfies BuildCommand;
  assertBuild(s, build, { ok: true });
  assert.deepEqual([...buildKindMask(s, 0, scv, { x: build.x, y: build.y, kinds: [Kind.Barracks] })], [1]);

  assert.deepEqual(workerBuildSelectionOptions(s, 0, [scv]).find((option) => option.id === Kind.Barracks), {
    id: Kind.Barracks,
    ok: true,
    representative: scv,
  });
});
