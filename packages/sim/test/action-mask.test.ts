import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/sim.ts';
import { sliceMap } from '../src/map.ts';
import { spawnUnit } from '../src/factory.ts';
import { Kind, Protoss, Tech, Units, Zerg } from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import { eid, slotOf } from '../src/world.ts';
import { setTechLevel } from '../src/tech.ts';
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

const assertMaskMatchesValidator = (
  sim: Sim,
  player: number,
  actor: number,
  opts: CommandMaskOptions = {},
): Uint8Array => {
  const s = sim.fullState();
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
  sim: Sim,
  player: number,
  producer: number,
  kinds: readonly number[],
): Uint8Array => {
  const s = sim.fullState();
  const mask = trainKindMask(s, player, producer, kinds);
  for (let i = 0; i < kinds.length; i++) {
    assert.equal(mask[i], validateCommand(s, player, { t: 'train', building: producer, kind: kinds[i]! }).ok ? 1 : 0, `${kinds[i]}`);
  }
  return mask;
};

const assertBuildMaskMatchesValidator = (
  sim: Sim,
  player: number,
  worker: number,
  kinds: readonly number[],
  x: number,
  y: number,
): Uint8Array => {
  const s = sim.fullState();
  const mask = buildKindMask(s, player, worker, { kinds, x, y });
  for (let i = 0; i < kinds.length; i++) {
    assert.equal(mask[i], validateCommand(s, player, { t: 'build', unit: worker, kind: kinds[i]!, x, y }).ok ? 1 : 0, `${kinds[i]}`);
  }
  return mask;
};

test('combat unit command mask exposes legal movement and target attack only', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 951 });
  const s = sim.fullState();
  const marine = spawnUnit(s, Kind.Marine, 0, fx(400), fx(400));
  const enemy = spawnUnit(s, Kind.Zergling, 1, fx(430), fx(400));

  const mask = assertMaskMatchesValidator(sim, 0, marine, { target: enemy, x: fx(500), y: fx(400) });

  assert.equal(commandHeadAllowed(mask, 'move'), true);
  assert.equal(commandHeadAllowed(mask, 'amove'), true);
  assert.equal(commandHeadAllowed(mask, 'attack'), true);
  assert.equal(commandHeadAllowed(mask, 'harvest'), false);
  assert.equal(commandHeadAllowed(mask, 'rally'), false);
});

test('worker command mask follows harvest and repair validation', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 952 });
  const s = sim.fullState();
  const e = s.e;
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;
  const scv = spawnUnit(s, Kind.SCV, 0, fx(400), fx(400));
  const mineral = spawnUnit(s, Kind.Mineral, -1, fx(430), fx(400));
  const tank = spawnUnit(s, Kind.SiegeTank, 0, fx(460), fx(400));
  e.hp[slotOf(tank)] = Units[Kind.SiegeTank]!.hp - 10;

  const harvest = assertMaskMatchesValidator(sim, 0, scv, { target: mineral, x: fx(450), y: fx(400) });
  assert.equal(commandHeadAllowed(harvest, 'harvest'), true);
  assert.equal(commandHeadAllowed(harvest, 'repair'), false);

  const repair = assertMaskMatchesValidator(sim, 0, scv, { target: tank, x: fx(450), y: fx(400) });
  assert.equal(commandHeadAllowed(repair, 'repair'), true);
  assert.equal(commandHeadAllowed(repair, 'harvest'), false);
});

test('structure command mask allows rally without mobile commands', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 953 });
  const s = sim.fullState();
  const e = s.e;
  const cc = spawnUnit(s, Kind.CommandCenter, 0, fx(400), fx(400));
  const mineral = spawnUnit(s, Kind.Mineral, -1, fx(460), fx(400));

  const mask = assertMaskMatchesValidator(sim, 0, cc, { target: mineral, x: fx(460), y: fx(400) });

  assert.equal(commandHeadAllowed(mask, 'rally'), true);
  assert.equal(commandHeadAllowed(mask, 'move'), false);
  assert.equal(commandHeadAllowed(mask, 'amove'), false);
  assert.equal(commandHeadAllowed(mask, 'stop'), false);

  e.built[slotOf(cc)] = 0;
  const unfinished = assertMaskMatchesValidator(sim, 0, cc, { target: mineral, x: fx(460), y: fx(400) });
  assert.equal(commandHeadAllowed(unfinished, 'rally'), false);
  assert.deepEqual(validateCommand(s, 0, { t: 'rally', building: cc, x: fx(460), y: fx(400), target: mineral }), {
    ok: false,
    reason: 'incomplete-producer',
  });
});

test('special command mask bits are controlled by tech and unit state', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 954 });
  const s = sim.fullState();
  const e = s.e;
  const vulture = spawnUnit(s, Kind.Vulture, 0, fx(400), fx(400));
  const zergling = spawnUnit(s, Kind.Zergling, 0, fx(460), fx(400));

  let vultureMask = assertMaskMatchesValidator(sim, 0, vulture);
  assert.equal(commandHeadAllowed(vultureMask, 'mine'), false);

  setTechLevel(s, 0, Tech.SpiderMines, 1);
  e.specialAmmo[slotOf(vulture)] = 1;
  vultureMask = assertMaskMatchesValidator(sim, 0, vulture);
  assert.equal(commandHeadAllowed(vultureMask, 'mine'), true);

  let zerglingMask = assertMaskMatchesValidator(sim, 0, zergling);
  assert.equal(commandHeadAllowed(zerglingMask, 'burrow'), false);
  assert.equal(commandHeadAllowed(zerglingMask, 'unburrow'), false);

  setTechLevel(s, 0, Tech.Burrow, 1);
  zerglingMask = assertMaskMatchesValidator(sim, 0, zergling);
  assert.equal(commandHeadAllowed(zerglingMask, 'burrow'), true);
  assert.equal(commandHeadAllowed(zerglingMask, 'unburrow'), false);

  e.burrowed[slotOf(zergling)] = 1;
  zerglingMask = assertMaskMatchesValidator(sim, 0, zergling);
  assert.equal(commandHeadAllowed(zerglingMask, 'burrow'), false);
  assert.equal(commandHeadAllowed(zerglingMask, 'unburrow'), true);
});

test('command mask generation is deterministic and side-effect free', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 955 });
  const s = sim.fullState();
  const marine = spawnUnit(s, Kind.Marine, 0, fx(400), fx(400));
  const enemy = spawnUnit(s, Kind.Zergling, 1, fx(430), fx(400));
  const beforeHash = sim.hash();
  const beforeRng = s.rng.s;

  const a = commandHeadMask(s, 0, marine, { target: enemy, x: fx(500), y: fx(400) });
  const b = commandHeadMask(s, 0, marine, { target: enemy, x: fx(500), y: fx(400) });

  assert.deepEqual([...a], [...b]);
  assert.equal(sim.hash(), beforeHash);
  assert.equal(s.rng.s, beforeRng);
  const attack = commandForHead(s, marine, 'attack', { target: enemy });
  assert.equal(attack.t, 'attack');
  assert.equal(attack.target, eid(s.e, slotOf(enemy)));
});

test('train option mask follows larva requirements through shared validation', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 956, factions: [Zerg] });
  const s = sim.fullState();
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;
  const larvaSlot = Array.from({ length: s.e.hi }, (_, i) => i)
    .find((i) => s.e.alive[i] === 1 && s.e.kind[i] === Kind.Larva)!;
  const larva = eid(s.e, larvaSlot);
  const kinds = [Kind.Drone, Kind.Zergling] as const;

  let mask = assertTrainMaskMatchesValidator(sim, 0, larva, kinds);
  assert.deepEqual([...mask], [1, 0]);

  spawnUnit(s, Kind.SpawningPool, 0, fx(700), fx(700));
  mask = assertTrainMaskMatchesValidator(sim, 0, larva, kinds);
  assert.deepEqual([...mask], [1, 1]);
});

test('build option mask follows creep-gated zerg placement through shared validation', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 957, factions: [Zerg] });
  const s = sim.fullState();
  const e = s.e;
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;
  const drone = spawnUnit(s, Kind.Drone, 0, fx(900), fx(900));
  const hatchery = slotOf(spawnUnit(s, Kind.Hatchery, 0, fx(1_000), fx(1_000)));
  const kinds = [Kind.CreepColony] as const;
  const nearX = e.x[hatchery]! + fx(192);
  const nearY = e.y[hatchery]!;

  const near = assertBuildMaskMatchesValidator(sim, 0, drone, kinds, nearX, nearY);
  assert.deepEqual([...near], [1]);

  const far = assertBuildMaskMatchesValidator(sim, 0, drone, kinds, fx(1_900), fx(1_900));
  assert.deepEqual([...far], [0]);
});

test('macro option masks follow protoss power placement and producer legality', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 958, factions: [Protoss] });
  const s = sim.fullState();
  const e = s.e;
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;
  s.players.supplyMax[0] = 20;
  const probe = spawnUnit(s, Kind.Probe, 0, fx(900), fx(900));
  const pylon = slotOf(spawnUnit(s, Kind.Pylon, 0, fx(1_000), fx(1_000)));
  const gatewayKind = [Kind.Gateway] as const;
  const nearX = e.x[pylon]! + fx(128);
  const nearY = e.y[pylon]!;

  const poweredPlacement = assertBuildMaskMatchesValidator(sim, 0, probe, gatewayKind, nearX, nearY);
  assert.deepEqual([...poweredPlacement], [1]);

  const unpoweredPlacement = assertBuildMaskMatchesValidator(sim, 0, probe, gatewayKind, fx(1_900), fx(1_900));
  assert.deepEqual([...unpoweredPlacement], [0]);

  const poweredGateway = spawnUnit(s, Kind.Gateway, 0, e.x[pylon]! + fx(64), e.y[pylon]!);
  const unpoweredGateway = spawnUnit(s, Kind.Gateway, 0, fx(1_900), fx(1_900));
  const zealotKind = [Kind.Zealot] as const;
  assert.deepEqual([...assertTrainMaskMatchesValidator(sim, 0, poweredGateway, zealotKind)], [1]);
  assert.deepEqual([...assertTrainMaskMatchesValidator(sim, 0, unpoweredGateway, zealotKind)], [0]);
});
