import test from 'node:test';
import assert from 'node:assert/strict';
import { Kind, Protoss, Tech, Units, Zerg } from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import { eid, slotOf } from '../src/world.ts';
import {
  COMMAND_HEADS,
  buildKindMask,
  commandForHead,
  commandHeadAllowed,
  commandHeadMask,
  trainKindMask,
  type CommandMaskOptions,
} from '../src/action-mask.ts';
import { validateCommand } from '../src/validation.ts';
import { simScenario, type SimScenario } from '../test-support/scenario.ts';

const assertMaskMatchesValidator = (
  scenario: SimScenario,
  player: number,
  actor: number,
  opts: CommandMaskOptions = {},
): Uint8Array => {
  const s = scenario.state;
  const mask = commandHeadMask(s, player, actor, opts);
  for (const head of COMMAND_HEADS) {
    assert.equal(
      commandHeadAllowed(mask, head),
      validateCommand(s, player, commandForHead(s, actor, head, opts)).ok,
      head,
    );
  }
  return mask;
};

const assertTrainMaskMatchesValidator = (
  scenario: SimScenario,
  player: number,
  producer: number,
  kinds: readonly number[],
): Uint8Array => {
  const s = scenario.state;
  const mask = trainKindMask(s, player, producer, kinds);
  for (let i = 0; i < kinds.length; i++) {
    assert.equal(mask[i], validateCommand(s, player, { t: 'train', building: producer, kind: kinds[i]! }).ok ? 1 : 0, `${kinds[i]}`);
  }
  return mask;
};

const assertBuildMaskMatchesValidator = (
  scenario: SimScenario,
  player: number,
  worker: number,
  kinds: readonly number[],
  x: number,
  y: number,
): Uint8Array => {
  const s = scenario.state;
  const mask = buildKindMask(s, player, worker, { kinds, x, y });
  for (let i = 0; i < kinds.length; i++) {
    assert.equal(mask[i], validateCommand(s, player, { t: 'build', unit: worker, kind: kinds[i]!, x, y }).ok ? 1 : 0, `${kinds[i]}`);
  }
  return mask;
};

test('combat unit command mask exposes legal movement and target attack only', () => {
  const scenario = simScenario({ seed: 951 });
  const { state: s, spawn } = scenario;
  const marine = spawn(Kind.Marine, 0, fx(400), fx(400));
  const enemy = spawn(Kind.Zergling, 1, fx(430), fx(400));

  const mask = assertMaskMatchesValidator(scenario, 0, marine, { target: enemy, x: fx(500), y: fx(400) });

  assert.equal(commandHeadAllowed(mask, 'move'), true);
  assert.equal(commandHeadAllowed(mask, 'amove'), true);
  assert.equal(commandHeadAllowed(mask, 'attack'), true);
  assert.equal(commandHeadAllowed(mask, 'harvest'), false);
  assert.equal(commandHeadAllowed(mask, 'rally'), false);
});

test('worker command mask follows harvest and repair validation', () => {
  const scenario = simScenario({ players: 1, seed: 952 });
  const { state: s, spawn } = scenario;
  const e = s.e;
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;
  const scv = spawn(Kind.SCV, 0, fx(400), fx(400));
  const mineral = spawn(Kind.Mineral, -1, fx(430), fx(400));
  const tank = spawn(Kind.SiegeTank, 0, fx(460), fx(400));
  e.hp[slotOf(tank)] = Units[Kind.SiegeTank]!.hp - 10;

  const harvest = assertMaskMatchesValidator(scenario, 0, scv, { target: mineral, x: fx(450), y: fx(400) });
  assert.equal(commandHeadAllowed(harvest, 'harvest'), true);
  assert.equal(commandHeadAllowed(harvest, 'repair'), false);

  const repair = assertMaskMatchesValidator(scenario, 0, scv, { target: tank, x: fx(450), y: fx(400) });
  assert.equal(commandHeadAllowed(repair, 'repair'), true);
  assert.equal(commandHeadAllowed(repair, 'harvest'), false);
});

test('structure command mask allows rally without mobile commands', () => {
  const scenario = simScenario({ players: 1, seed: 953 });
  const { state: s, spawn } = scenario;
  const e = s.e;
  const cc = spawn(Kind.CommandCenter, 0, fx(400), fx(400));
  const mineral = spawn(Kind.Mineral, -1, fx(460), fx(400));

  const mask = assertMaskMatchesValidator(scenario, 0, cc, { target: mineral, x: fx(460), y: fx(400) });

  assert.equal(commandHeadAllowed(mask, 'rally'), true);
  assert.equal(commandHeadAllowed(mask, 'move'), false);
  assert.equal(commandHeadAllowed(mask, 'amove'), false);
  assert.equal(commandHeadAllowed(mask, 'stop'), false);

  e.built[slotOf(cc)] = 0;
  const unfinished = assertMaskMatchesValidator(scenario, 0, cc, { target: mineral, x: fx(460), y: fx(400) });
  assert.equal(commandHeadAllowed(unfinished, 'rally'), false);
  assert.deepEqual(validateCommand(s, 0, { t: 'rally', building: cc, x: fx(460), y: fx(400), target: mineral }), {
    ok: false,
    reason: 'incomplete-producer',
  });
});

test('special command mask bits are controlled by tech and unit state', () => {
  const scenario = simScenario({ players: 1, seed: 954 });
  const { state: s, spawn, grant } = scenario;
  const e = s.e;
  const vulture = spawn(Kind.Vulture, 0, fx(400), fx(400));
  const zergling = spawn(Kind.Zergling, 0, fx(460), fx(400));

  let vultureMask = assertMaskMatchesValidator(scenario, 0, vulture);
  assert.equal(commandHeadAllowed(vultureMask, 'mine'), false);

  grant(0, Tech.SpiderMines, 1);
  e.specialAmmo[slotOf(vulture)] = 1;
  vultureMask = assertMaskMatchesValidator(scenario, 0, vulture);
  assert.equal(commandHeadAllowed(vultureMask, 'mine'), true);

  let zerglingMask = assertMaskMatchesValidator(scenario, 0, zergling);
  assert.equal(commandHeadAllowed(zerglingMask, 'burrow'), false);
  assert.equal(commandHeadAllowed(zerglingMask, 'unburrow'), false);

  grant(0, Tech.Burrow, 1);
  zerglingMask = assertMaskMatchesValidator(scenario, 0, zergling);
  assert.equal(commandHeadAllowed(zerglingMask, 'burrow'), true);
  assert.equal(commandHeadAllowed(zerglingMask, 'unburrow'), false);

  e.burrowed[slotOf(zergling)] = 1;
  zerglingMask = assertMaskMatchesValidator(scenario, 0, zergling);
  assert.equal(commandHeadAllowed(zerglingMask, 'burrow'), false);
  assert.equal(commandHeadAllowed(zerglingMask, 'unburrow'), true);
});

test('command mask generation is deterministic and side-effect free', () => {
  const scenario = simScenario({ seed: 955 });
  const { state: s, spawn } = scenario;
  const marine = spawn(Kind.Marine, 0, fx(400), fx(400));
  const enemy = spawn(Kind.Zergling, 1, fx(430), fx(400));
  const beforeHash = scenario.sim.hash();
  const beforeRng = s.rng.s;

  const a = commandHeadMask(s, 0, marine, { target: enemy, x: fx(500), y: fx(400) });
  const b = commandHeadMask(s, 0, marine, { target: enemy, x: fx(500), y: fx(400) });

  assert.deepEqual([...a], [...b]);
  assert.equal(scenario.sim.hash(), beforeHash);
  assert.equal(s.rng.s, beforeRng);
  const attack = commandForHead(s, marine, 'attack', { target: enemy });
  assert.equal(attack.t, 'attack');
  assert.equal(attack.target, eid(s.e, slotOf(enemy)));
});

test('train option mask follows larva requirements through shared validation', () => {
  const scenario = simScenario({ players: 1, seed: 956, factions: [Zerg] });
  const { state: s, spawn } = scenario;
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;
  const larvaSlot = Array.from({ length: s.e.hi }, (_, i) => i)
    .find((i) => s.e.alive[i] === 1 && s.e.kind[i] === Kind.Larva)!;
  const larva = eid(s.e, larvaSlot);
  const kinds = [Kind.Drone, Kind.Zergling] as const;

  let mask = assertTrainMaskMatchesValidator(scenario, 0, larva, kinds);
  assert.deepEqual([...mask], [1, 0]);

  spawn(Kind.SpawningPool, 0, fx(700), fx(700));
  mask = assertTrainMaskMatchesValidator(scenario, 0, larva, kinds);
  assert.deepEqual([...mask], [1, 1]);
});

test('build option mask follows creep-gated zerg placement through shared validation', () => {
  const scenario = simScenario({ players: 1, seed: 957, factions: [Zerg] });
  const { state: s, spawn } = scenario;
  const e = s.e;
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;
  const drone = spawn(Kind.Drone, 0, fx(900), fx(900));
  const hatchery = slotOf(spawn(Kind.Hatchery, 0, fx(1_000), fx(1_000)));
  const kinds = [Kind.CreepColony] as const;
  const nearX = e.x[hatchery]! + fx(192);
  const nearY = e.y[hatchery]!;

  const near = assertBuildMaskMatchesValidator(scenario, 0, drone, kinds, nearX, nearY);
  assert.deepEqual([...near], [1]);

  const far = assertBuildMaskMatchesValidator(scenario, 0, drone, kinds, fx(1_900), fx(1_900));
  assert.deepEqual([...far], [0]);
});

test('macro option masks follow protoss power placement and producer legality', () => {
  const scenario = simScenario({ players: 1, seed: 958, factions: [Protoss] });
  const { state: s, spawn } = scenario;
  const e = s.e;
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;
  s.players.supplyMax[0] = 20;
  const probe = spawn(Kind.Probe, 0, fx(900), fx(900));
  const pylon = slotOf(spawn(Kind.Pylon, 0, fx(1_000), fx(1_000)));
  const gatewayKind = [Kind.Gateway] as const;
  const nearX = e.x[pylon]! + fx(128);
  const nearY = e.y[pylon]!;

  const poweredPlacement = assertBuildMaskMatchesValidator(scenario, 0, probe, gatewayKind, nearX, nearY);
  assert.deepEqual([...poweredPlacement], [1]);

  const unpoweredPlacement = assertBuildMaskMatchesValidator(scenario, 0, probe, gatewayKind, fx(1_900), fx(1_900));
  assert.deepEqual([...unpoweredPlacement], [0]);

  const poweredGateway = spawn(Kind.Gateway, 0, e.x[pylon]! + fx(64), e.y[pylon]!);
  const unpoweredGateway = spawn(Kind.Gateway, 0, fx(1_900), fx(1_900));
  const zealotKind = [Kind.Zealot] as const;
  assert.deepEqual([...assertTrainMaskMatchesValidator(scenario, 0, poweredGateway, zealotKind)], [1]);
  assert.deepEqual([...assertTrainMaskMatchesValidator(scenario, 0, unpoweredGateway, zealotKind)], [0]);
});
