import test from 'node:test';
import assert from 'node:assert/strict';
import { Ability, Kind, Protoss, Tech, Units, Zerg } from '../src/data/index.ts';
import { fx } from '../src/fixed.ts';
import { EFFECT_CAP, eid, slotOf } from '../src/entity/world.ts';
import {
  ACTION_SCHEMA_VERSION,
  COMMAND_HEADS,
  COMMAND_MASK_POLICY,
  abilityCandidates,
  abilityMask,
  addonKindCandidates,
  addonKindMask,
  buildKindMask,
  commandForHead,
  commandHeadAllowed,
  commandHeadMask,
  createBatchDecodeReservation,
  decodeActionBatch,
  decodeActionBatchInto,
  decodeBatchAction,
  decodeAction,
  encodeCommand,
  entityTargetMask,
  resetBatchDecodeReservation,
  researchTechCandidates,
  researchTechMask,
  trainKindMask,
  transformKindCandidates,
  transformKindMask,
  type CommandMaskOptions,
  writeAbilityMask,
  writeAddonKindMask,
  writeBuildKindMask,
  writeCommandHeadMask,
  writeEntityTargetMask,
  writeResearchTechMask,
  writeTrainKindMask,
  writeTransformKindMask,
} from '../src/io/action-mask.ts';
import { validateCommand } from '../src/commands/validate.ts';
import { simScenario, type SimScenario } from '../test-support/scenario.ts';
import { COMMAND_TYPES, type Command } from '../src/commands/types.ts';
import {
  attackModeCandidates, harvestModeCandidates, loadSelectionCandidates, rallyModeCandidates, repairModeCandidates,
  smartCommandCandidates,
} from '../src/commands/intent.ts';

const linkAddon = (s: SimScenario['state'], parent: number, addon: number): void => {
  const e = s.e;
  e.target[slotOf(parent)] = addon;
  e.target[slotOf(addon)] = parent;
};

const loadedSilo = (scenario: SimScenario, player: number, x: number, y: number): number => {
  const parent = scenario.spawn(Kind.CommandCenter, player, x - fx(80), y);
  const silo = scenario.spawn(Kind.NuclearSilo, player, x, y);
  linkAddon(scenario.state, parent, silo);
  scenario.state.e.specialAmmo[slotOf(silo)] = 1;
  return silo;
};

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

test('action schema covers every public command tag', () => {
  assert.equal(ACTION_SCHEMA_VERSION, 1);
  assert.deepEqual(Object.keys(COMMAND_MASK_POLICY).sort(), [...COMMAND_TYPES].sort());
  for (const head of COMMAND_HEADS) assert.ok(head.length > 0);
});

test('policy actions encode and decode through public commands', () => {
  const commands: Command[] = [
    { t: 'train', building: 10, kind: Kind.Marine },
    { t: 'research', building: 11, tech: Tech.StimPack },
    { t: 'build', unit: 12, kind: Kind.SupplyDepot, x: fx(10), y: fx(11) },
    { t: 'addon', building: 13, kind: Kind.MachineShop },
    { t: 'lift', building: 14 },
    { t: 'land', building: 15, x: fx(12), y: fx(13) },
    { t: 'transform', unit: 16, kind: Kind.Archon, target: 17 },
    { t: 'burrow', unit: 18, active: false },
    { t: 'mine', unit: 19 },
    { t: 'load', transport: 20, unit: 21 },
    { t: 'load', transport: 20, unit: 21, queue: true },
    { t: 'unload', transport: 22, unit: 23, x: fx(14), y: fx(15) },
    { t: 'unload', transport: 22, unit: 23, x: fx(14), y: fx(15), queue: true },
    { t: 'cancelBuild', building: 24 },
    { t: 'move', unit: 25, x: fx(16), y: fx(17) },
    { t: 'move', unit: 25, x: fx(16), y: fx(17), queue: true },
    { t: 'attack', unit: 26, target: 27 },
    { t: 'attack', unit: 26, target: 27, queue: true },
    { t: 'amove', unit: 28, x: fx(18), y: fx(19) },
    { t: 'amove', unit: 28, x: fx(18), y: fx(19), queue: true },
    { t: 'ability', unit: 29, ability: 3, target: 30, x: fx(20), y: fx(21) },
    { t: 'harvest', unit: 31, patch: 32 },
    { t: 'harvest', unit: 31, patch: 32, queue: true },
    { t: 'repair', unit: 33, target: 34 },
    { t: 'repair', unit: 33, target: 34, queue: true },
    { t: 'rally', building: 35, x: fx(22), y: fx(23), target: 36 },
    { t: 'hold', unit: 36 },
    { t: 'patrol', unit: 36, x: fx(24), y: fx(25) },
    { t: 'patrol', unit: 36, x: fx(24), y: fx(25), queue: true },
    { t: 'stop', unit: 37 },
  ];
  for (const command of commands) assert.deepEqual(decodeAction(encodeCommand(command)), command);
});

test('batch action decode reserves resources and supply across accepted actions', () => {
  const scenario = simScenario({ players: 1, seed: 960 });
  const { state: s, spawn } = scenario;
  const barracks = spawn(Kind.Barracks, 0, fx(300), fx(300));
  s.players.minerals[0] = Units[Kind.Marine]!.minerals;
  s.players.supplyMax[0] = 200;
  const action = { head: 'train' as const, actor: barracks, kind: Kind.Marine };

  const results = decodeActionBatch(s, 0, [action, action]);

  assert.equal(results[0]!.ok, true);
  assert.deepEqual(results[1], { ok: false, command: decodeAction(action), reason: 'not-affordable' });
  assert.equal(s.players.minerals[0], Units[Kind.Marine]!.minerals);
});

test('batch action decode can reuse caller-owned reservation and result arrays', () => {
  const scenario = simScenario({ players: 1, seed: 963 });
  const { state: s, spawn } = scenario;
  const barracks = spawn(Kind.Barracks, 0, fx(300), fx(300));
  s.players.minerals[0] = Units[Kind.Marine]!.minerals;
  s.players.supplyMax[0] = 200;
  const actions = [
    { head: 'train' as const, actor: barracks, kind: Kind.Marine },
    { head: 'train' as const, actor: barracks, kind: Kind.Marine },
  ];
  const ctx = createBatchDecodeReservation(s, 0);
  const out: ReturnType<typeof decodeActionBatch> = [];

  const first = decodeActionBatchInto(s, 0, actions, out, ctx);
  const expected = decodeActionBatch(s, 0, actions);
  assert.equal(first, out);
  assert.deepEqual(first, expected);
  assert.equal(ctx.energySlots.length, 0);

  s.players.minerals[0] = Units[Kind.Marine]!.minerals * 2;
  resetBatchDecodeReservation(s, 0, ctx);
  decodeActionBatchInto(s, 0, actions, out, ctx);
  assert.equal(out.every((result) => result.ok), true);
});

test('batch action decode reserves entity capacity and command ammo', () => {
  const scenario = simScenario({ players: 1, seed: 961 });
  const { state: s, spawn, grant } = scenario;
  const e = s.e;
  const vulture = spawn(Kind.Vulture, 0, fx(300), fx(300));
  grant(0, Tech.SpiderMines, 1);
  e.specialAmmo[slotOf(vulture)] = 2;
  s.e.freeTop = 1;
  const action = { head: 'mine' as const, actor: vulture };

  let ctx = createBatchDecodeReservation(s, 0);
  assert.equal(decodeBatchAction(s, ctx, action).ok, true);
  assert.deepEqual(decodeBatchAction(s, ctx, action), { ok: false, command: decodeAction(action), reason: 'capacity-full' });

  e.specialAmmo[slotOf(vulture)] = 1;
  s.e.freeTop = 10;
  ctx = createBatchDecodeReservation(s, 0);
  assert.equal(decodeBatchAction(s, ctx, action).ok, true);
  assert.deepEqual(decodeBatchAction(s, ctx, action), { ok: false, command: decodeAction(action), reason: 'target-not-allowed' });
});

test('batch action decode reserves descriptor-backed child spawns', () => {
  const scenario = simScenario({ players: 2, seed: 966 });
  const { state: s, spawn, grant } = scenario;
  const queen = spawn(Kind.Queen, 0, fx(300), fx(300));
  const zealotA = spawn(Kind.Zealot, 1, fx(330), fx(300));
  const zealotB = spawn(Kind.Zealot, 1, fx(360), fx(300));
  s.e.energy[slotOf(queen)] = 300;
  s.e.freeTop = 3;
  grant(0, Tech.SpawnBroodling, 1);

  const actionA = { head: 'ability' as const, actor: queen, ability: Ability.SpawnBroodling, target: zealotA };
  const actionB = { head: 'ability' as const, actor: queen, ability: Ability.SpawnBroodling, target: zealotB };
  const ctx = createBatchDecodeReservation(s, 0);

  assert.equal(decodeBatchAction(s, ctx, actionA).ok, true);
  assert.deepEqual(decodeBatchAction(s, ctx, actionB), { ok: false, command: decodeAction(actionB), reason: 'capacity-full' });
});

test('batch action decode reserves effect capacity and caster energy', () => {
  const scenario = simScenario({ players: 1, seed: 962, factions: [Protoss] });
  const { state: s, spawn, grant } = scenario;
  const e = s.e;
  const templar = spawn(Kind.HighTemplar, 0, fx(300), fx(300));
  grant(0, Tech.PsionicStorm, 1);
  const action = { head: 'ability' as const, actor: templar, ability: Ability.PsionicStorm, x: fx(320), y: fx(300) };

  e.energy[slotOf(templar)] = 150;
  s.effects.alive.fill(1);
  s.effects.alive[EFFECT_CAP - 1] = 0;
  s.effects.hi = EFFECT_CAP;
  let ctx = createBatchDecodeReservation(s, 0);
  assert.equal(decodeBatchAction(s, ctx, action).ok, true);
  assert.deepEqual(decodeBatchAction(s, ctx, action), { ok: false, command: decodeAction(action), reason: 'capacity-full' });

  s.effects.alive.fill(0);
  s.effects.hi = 0;
  e.energy[slotOf(templar)] = 100;
  ctx = createBatchDecodeReservation(s, 0);
  assert.equal(decodeBatchAction(s, ctx, action).ok, true);
  assert.deepEqual(decodeBatchAction(s, ctx, action), { ok: false, command: decodeAction(action), reason: 'not-enough-energy' });
});

test('batch action decode reserves nuclear missiles across ready silos', () => {
  const scenario = simScenario({ players: 1, seed: 963 });
  const { state: s, spawn } = scenario;
  const ghostA = spawn(Kind.Ghost, 0, fx(300), fx(300));
  const ghostB = spawn(Kind.Ghost, 0, fx(300), fx(330));
  loadedSilo(scenario, 0, fx(420), fx(300));
  const actionA = { head: 'ability' as const, actor: ghostA, ability: Ability.NuclearStrike, x: fx(360), y: fx(300) };
  const actionB = { head: 'ability' as const, actor: ghostB, ability: Ability.NuclearStrike, x: fx(360), y: fx(330) };

  assert.deepEqual(decodeActionBatch(s, 0, [actionA, actionB]), [
    { ok: true, command: decodeAction(actionA) },
    { ok: false, command: decodeAction(actionB), reason: 'missing-requirement' },
  ]);

  loadedSilo(scenario, 0, fx(520), fx(300));
  assert.deepEqual(decodeActionBatch(s, 0, [actionA, actionB]), [
    { ok: true, command: decodeAction(actionA) },
    { ok: true, command: decodeAction(actionB) },
  ]);
});

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

  const pointMask = assertMaskMatchesValidator(scenario, 0, marine, { x: fx(500), y: fx(400) });
  assert.equal(commandHeadAllowed(pointMask, 'move'), true);

  const mask = assertMaskMatchesValidator(scenario, 0, marine, { target: enemy, x: fx(500), y: fx(400) });

  assert.equal(commandHeadAllowed(mask, 'move'), false);
  assert.equal(commandHeadAllowed(mask, 'amove'), true);
  assert.equal(commandHeadAllowed(mask, 'attack'), true);
  assert.equal(commandHeadAllowed(mask, 'harvest'), false);
  assert.equal(commandHeadAllowed(mask, 'rally'), false);
});

test('queued travel, attack, repair, harvest, load, and unload action masks use shared validation and full-queue gates', () => {
  const scenario = simScenario({ players: 2, seed: 9511 });
  const { sim, state: s, spawn } = scenario;
  const e = s.e;
  const marine = spawn(Kind.Marine, 0, fx(400), fx(400));
  const enemy = spawn(Kind.Zergling, 1, fx(700), fx(400));
  const scv = spawn(Kind.SCV, 0, fx(400), fx(460));
  const bunker = spawn(Kind.Bunker, 0, fx(700), fx(460));
  const dropship = spawn(Kind.Dropship, 0, fx(760), fx(400));
  const cargo = spawn(Kind.Firebat, 0, fx(780), fx(400));
  sim.step([{ player: 0, cmds: [{ t: 'load', transport: dropship, unit: cargo }] }]);
  const mineral = spawn(Kind.Mineral, -1, fx(740), fx(460));
  e.hp[slotOf(bunker)] = Units[Kind.Bunker]!.hp - 40;
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;
  const point = { x: fx(500), y: fx(400), queue: true };

  assert.deepEqual(commandForHead(s, marine, 'move', point), { t: 'move', unit: marine, x: point.x, y: point.y, queue: true });
  assert.deepEqual(commandForHead(s, marine, 'patrol', point), { t: 'patrol', unit: marine, x: point.x, y: point.y, queue: true });
  assert.deepEqual(commandForHead(s, marine, 'attack', { target: enemy, queue: true }), {
    t: 'attack',
    unit: marine,
    target: enemy,
    queue: true,
  });
  assert.deepEqual(commandForHead(s, scv, 'repair', { target: bunker, queue: true }), {
    t: 'repair',
    unit: scv,
    target: bunker,
    queue: true,
  });
  assert.deepEqual(commandForHead(s, scv, 'harvest', { target: mineral, queue: true }), {
    t: 'harvest',
    unit: scv,
    patch: mineral,
    queue: true,
  });
  assert.deepEqual(commandForHead(s, dropship, 'load', { target: marine, queue: true }), {
    t: 'load',
    transport: dropship,
    unit: marine,
    queue: true,
  });
  assert.deepEqual(commandForHead(s, dropship, 'unload', { target: cargo, x: fx(820), y: fx(400), queue: true }), {
    t: 'unload',
    transport: dropship,
    unit: cargo,
    x: fx(820),
    y: fx(400),
    queue: true,
  });
  assert.equal(commandHeadAllowed(commandHeadMask(s, 0, marine, point), 'move'), true);
  assert.equal(commandHeadAllowed(commandHeadMask(s, 0, marine, point), 'patrol'), true);
  assert.equal(commandHeadAllowed(commandHeadMask(s, 0, scv, { target: bunker, queue: true }), 'repair'), true);
  assert.deepEqual([...entityTargetMask(s, 0, scv, 'repair', [bunker], { queue: true })], [1]);
  assert.equal(commandHeadAllowed(commandHeadMask(s, 0, scv, { target: mineral, queue: true }), 'harvest'), true);
  assert.deepEqual([...entityTargetMask(s, 0, scv, 'harvest', [mineral], { queue: true })], [1]);
  assert.equal(commandHeadAllowed(commandHeadMask(s, 0, dropship, { target: marine, queue: true }), 'load'), true);
  assert.deepEqual([...entityTargetMask(s, 0, dropship, 'load', [marine], { queue: true })], [1]);
  assert.equal(commandHeadAllowed(commandHeadMask(s, 0, dropship, { target: cargo, x: fx(820), y: fx(400), queue: true }), 'unload'), true);
  assert.deepEqual([...entityTargetMask(s, 0, dropship, 'unload', [cargo], { x: fx(820), y: fx(400), queue: true })], [1]);

  sim.step([{ player: 0, cmds: [
    { t: 'move', unit: marine, x: fx(520), y: fx(400) },
    { t: 'move', unit: marine, x: fx(540), y: fx(400), queue: true },
    { t: 'move', unit: marine, x: fx(560), y: fx(400), queue: true },
    { t: 'move', unit: marine, x: fx(580), y: fx(400), queue: true },
    { t: 'move', unit: marine, x: fx(600), y: fx(400), queue: true },
  ] }]);

  const queuedMask = commandHeadMask(s, 0, marine, { x: fx(620), y: fx(400), target: enemy, queue: true });
  const replacementMoveMask = commandHeadMask(s, 0, marine, { x: fx(620), y: fx(400) });
  const replacementAttackMask = commandHeadMask(s, 0, marine, { x: fx(620), y: fx(400), target: enemy });
  assert.equal(commandHeadAllowed(queuedMask, 'move'), false);
  assert.equal(commandHeadAllowed(queuedMask, 'amove'), false);
  assert.equal(commandHeadAllowed(queuedMask, 'patrol'), false);
  assert.equal(commandHeadAllowed(queuedMask, 'attack'), false);
  assert.equal(commandHeadAllowed(commandHeadMask(s, 0, dropship, { target: marine, queue: true }), 'load'), false);
  assert.equal(commandHeadAllowed(commandHeadMask(s, 0, dropship, { target: cargo, x: fx(820), y: fx(400), queue: true }), 'unload'), true);
  assert.equal(commandHeadAllowed(replacementMoveMask, 'move'), true);
  assert.equal(commandHeadAllowed(replacementAttackMask, 'attack'), true);

  sim.step([{ player: 0, cmds: [
    { t: 'move', unit: dropship, x: fx(1200), y: fx(400) },
    { t: 'move', unit: dropship, x: fx(1220), y: fx(400), queue: true },
    { t: 'move', unit: dropship, x: fx(1240), y: fx(400), queue: true },
    { t: 'move', unit: dropship, x: fx(1260), y: fx(400), queue: true },
    { t: 'move', unit: dropship, x: fx(1280), y: fx(400), queue: true },
  ] }]);
  assert.equal(commandHeadAllowed(commandHeadMask(s, 0, dropship, { target: cargo, x: fx(1300), y: fx(400), queue: true }), 'unload'), false);

  sim.step([{ player: 0, cmds: [
    { t: 'move', unit: scv, x: fx(520), y: fx(460) },
    { t: 'move', unit: scv, x: fx(540), y: fx(460), queue: true },
    { t: 'move', unit: scv, x: fx(560), y: fx(460), queue: true },
    { t: 'move', unit: scv, x: fx(580), y: fx(460), queue: true },
    { t: 'move', unit: scv, x: fx(600), y: fx(460), queue: true },
  ] }]);
  assert.equal(commandHeadAllowed(commandHeadMask(s, 0, scv, { target: bunker, queue: true }), 'repair'), false);
  assert.equal(commandHeadAllowed(commandHeadMask(s, 0, scv, { target: mineral, queue: true }), 'harvest'), false);
  assert.deepEqual(decodeAction({ head: 'amove', actor: marine, x: fx(620), y: fx(400), queue: true }), {
    t: 'amove',
    unit: marine,
    x: fx(620),
    y: fx(400),
    queue: true,
  });
  assert.deepEqual(decodeAction({ head: 'attack', actor: marine, target: enemy, queue: true }), {
    t: 'attack',
    unit: marine,
    target: enemy,
    queue: true,
  });
  assert.deepEqual(decodeAction({ head: 'repair', actor: scv, target: bunker, queue: true }), {
    t: 'repair',
    unit: scv,
    target: bunker,
    queue: true,
  });
  assert.deepEqual(decodeAction({ head: 'harvest', actor: scv, target: mineral, queue: true }), {
    t: 'harvest',
    unit: scv,
    patch: mineral,
    queue: true,
  });
  assert.deepEqual(decodeAction({ head: 'load', actor: dropship, target: marine, queue: true }), {
    t: 'load',
    transport: dropship,
    unit: marine,
    queue: true,
  });
  assert.deepEqual(decodeAction({ head: 'unload', actor: dropship, target: cargo, x: fx(820), y: fx(400), queue: true }), {
    t: 'unload',
    transport: dropship,
    unit: cargo,
    x: fx(820),
    y: fx(400),
    queue: true,
  });
});

test('entity target mask exposes targeted move follow candidates', () => {
  const scenario = simScenario({ players: 2, seed: 964 });
  const { state: s, spawn } = scenario;
  const marine = spawn(Kind.Marine, 0, fx(400), fx(400));
  const friendly = spawn(Kind.SCV, 0, fx(440), fx(400));
  const enemy = spawn(Kind.Zergling, 1, fx(480), fx(400));
  const mineral = spawn(Kind.Mineral, -1, fx(520), fx(400));
  const targets = [friendly, enemy, mineral, marine];
  const opts = { x: fx(500), y: fx(400) };

  const mask = entityTargetMask(s, 0, marine, 'move', targets, opts);

  assert.deepEqual([...mask], targets.map((target) =>
    validateCommand(s, 0, { t: 'move', unit: marine, x: opts.x, y: opts.y, target }).ok ? 1 : 0));
  assert.deepEqual([...mask], [1, 0, 0, 0]);
  assert.deepEqual([...writeEntityTargetMask(new Uint8Array(targets.length), s, 0, marine, 'move', targets, opts)], [...mask]);
});

test('armed attack target surfaces do not expose friendly escort entities yet', () => {
  const scenario = simScenario({ players: 2, seed: 966 });
  const { state: s, spawn } = scenario;
  const marine = spawn(Kind.Marine, 0, fx(400), fx(400));
  const friendly = spawn(Kind.SCV, 0, fx(440), fx(400));
  const enemy = spawn(Kind.Zergling, 1, fx(480), fx(400));
  const targets = [friendly, enemy, marine];
  const point = { hit: friendly, x: fx(440), y: fx(400) };

  assert.deepEqual(attackModeCandidates(s, 0, marine, point), []);
  assert.deepEqual(attackModeCandidates(s, 0, marine, { hit: enemy, x: fx(480), y: fx(400) }), [
    { t: 'attack', unit: marine, target: enemy },
  ]);
  assert.deepEqual(attackModeCandidates(s, 0, marine, { hit: -1, x: fx(520), y: fx(400) }), [
    { t: 'amove', unit: marine, x: fx(520), y: fx(400) },
  ]);

  const attackTargets = entityTargetMask(s, 0, marine, 'attack', targets, point);
  assert.deepEqual([...attackTargets], [0, 1, 0]);
  assert.deepEqual([...writeEntityTargetMask(new Uint8Array(targets.length), s, 0, marine, 'attack', targets, point)], [...attackTargets]);
  assert.deepEqual(commandForHead(s, marine, 'amove', point), { t: 'amove', unit: marine, x: point.x, y: point.y });
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

test('command intent candidates agree with policy target mask legality', () => {
  const scenario = simScenario({ players: 1, seed: 965 });
  const { state: s, spawn } = scenario;
  const e = s.e;
  s.players.minerals[0] = 1_000;
  const scv = spawn(Kind.SCV, 0, fx(400), fx(400));
  const marine = spawn(Kind.Marine, 0, fx(430), fx(400));
  const dropship = spawn(Kind.Dropship, 0, fx(455), fx(400));
  const cc = spawn(Kind.CommandCenter, 0, fx(500), fx(400));
  const mineral = spawn(Kind.Mineral, -1, fx(560), fx(400));
  const tank = spawn(Kind.SiegeTank, 0, fx(620), fx(400));
  e.hp[slotOf(tank)] = Units[Kind.SiegeTank]!.hp - 20;
  const target = { hit: mineral, x: fx(560), y: fx(400) };

  const smart = smartCommandCandidates(s, 0, scv, target, 'desktop');
  assert.equal(smart[0]?.t, 'harvest');
  assert.equal(entityTargetMask(s, 0, scv, 'harvest', [mineral], target)[0], 1);

  for (const command of harvestModeCandidates(s, 0, [scv, marine], mineral)) {
    if (command.t !== 'harvest') throw new Error('expected harvest candidate');
    assert.equal(entityTargetMask(s, 0, command.unit, 'harvest', [mineral])[0], 1);
  }
  for (const command of repairModeCandidates(s, 0, [scv, marine], tank)) {
    if (command.t !== 'repair') throw new Error('expected repair candidate');
    assert.equal(entityTargetMask(s, 0, command.unit, 'repair', [tank])[0], 1);
  }
  for (const command of loadSelectionCandidates(s, 0, [dropship, marine, tank])) {
    if (command.t !== 'load') throw new Error('expected load candidate');
    assert.equal(entityTargetMask(s, 0, command.transport, 'load', [command.unit])[0], 1);
  }
  for (const command of loadSelectionCandidates(s, 0, [dropship, marine, tank], { queueLoad: true })) {
    if (command.t !== 'load') throw new Error('expected queued load candidate');
    assert.equal(command.queue, true);
    assert.equal(entityTargetMask(s, 0, command.transport, 'load', [command.unit], { queue: true })[0], 1);
  }
  for (const command of rallyModeCandidates(s, 0, [cc, marine], target)) {
    if (command.t !== 'rally') throw new Error('expected rally candidate');
    assert.equal(entityTargetMask(s, 0, command.building, 'rally', [mineral], target)[0], command.target === mineral ? 1 : 0);
  }

  assert.equal(entityTargetMask(s, 0, marine, 'harvest', [mineral])[0], 0);
  assert.equal(entityTargetMask(s, 0, marine, 'rally', [mineral], target)[0], 0);
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

test('caller-owned mask writers match allocating wrappers', () => {
  const scenario = simScenario({ players: 2, seed: 964, factions: [Protoss, Zerg] });
  const { state: s, spawn, grant } = scenario;
  s.players.minerals[0] = 2_000;
  s.players.gas[0] = 2_000;
  s.players.supplyMax[0] = 40;
  const probe = spawn(Kind.Probe, 0, fx(900), fx(900));
  const pylon = spawn(Kind.Pylon, 0, fx(1_000), fx(900));
  const gateway = spawn(Kind.Gateway, 0, fx(1_064), fx(900));
  const academy = spawn(Kind.Academy, 0, fx(300), fx(300));
  const factory = spawn(Kind.Factory, 0, fx(500), fx(300));
  const hydra = spawn(Kind.Hydralisk, 0, fx(700), fx(300));
  const templar = spawn(Kind.HighTemplar, 0, fx(900), fx(300));
  const enemy = spawn(Kind.Zergling, 1, fx(940), fx(300));
  grant(0, Tech.LurkerAspect, 1);
  grant(0, Tech.PsionicStorm, 1);

  const commandOpts = { target: enemy, x: fx(940), y: fx(300) };
  assert.deepEqual([...writeCommandHeadMask(new Uint8Array(COMMAND_HEADS.length), s, 0, templar, commandOpts)],
    [...commandHeadMask(s, 0, templar, commandOpts)]);

  const trainKinds = [Kind.Zealot, Kind.Dragoon] as const;
  assert.deepEqual([...writeTrainKindMask(new Uint8Array(trainKinds.length), s, 0, gateway, trainKinds)],
    [...trainKindMask(s, 0, gateway, trainKinds)]);

  const buildKinds = [Kind.Gateway, Kind.Pylon] as const;
  const buildOpts = { x: fx(1_064), y: fx(964), kinds: buildKinds };
  assert.deepEqual([...writeBuildKindMask(new Uint8Array(buildKinds.length), s, 0, probe, buildOpts)],
    [...buildKindMask(s, 0, probe, buildOpts)]);

  const techs = researchTechCandidates(s, academy);
  assert.deepEqual([...writeResearchTechMask(new Uint8Array(techs.length), s, 0, academy, techs)],
    [...researchTechMask(s, 0, academy, techs)]);

  const addons = addonKindCandidates(s, factory);
  assert.deepEqual([...writeAddonKindMask(new Uint8Array(addons.length), s, 0, factory, addons)],
    [...addonKindMask(s, 0, factory, addons)]);

  const transforms = transformKindCandidates(s, hydra);
  assert.deepEqual([...writeTransformKindMask(new Uint8Array(transforms.length), s, 0, hydra, transforms)],
    [...transformKindMask(s, 0, hydra, transforms)]);

  const abilities = abilityCandidates(s, templar);
  const abilityOpts = { x: fx(940), y: fx(300) };
  assert.deepEqual([...writeAbilityMask(new Uint8Array(abilities.length), s, 0, templar, abilityOpts, abilities)],
    [...abilityMask(s, 0, templar, abilityOpts, abilities)]);

  const targets = [enemy, pylon];
  assert.deepEqual([...writeEntityTargetMask(new Uint8Array(targets.length), s, 0, templar, 'attack', targets)],
    [...entityTargetMask(s, 0, templar, 'attack', targets)]);
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

test('research, addon, transform, ability, and target masks follow shared validation', () => {
  const scenario = simScenario({ players: 2, seed: 959, factions: [Protoss, Zerg] });
  const { state: s, spawn, grant } = scenario;
  s.players.minerals[0] = 2_000;
  s.players.gas[0] = 2_000;
  s.players.supplyMax[0] = 40;

  const academy = spawn(Kind.Academy, 0, fx(300), fx(300));
  const cc = spawn(Kind.CommandCenter, 0, fx(500), fx(300));
  const factory = spawn(Kind.Factory, 0, fx(700), fx(300));
  const hydra = spawn(Kind.Hydralisk, 0, fx(900), fx(300));
  const templar = spawn(Kind.HighTemplar, 0, fx(1_100), fx(300));
  const enemy = spawn(Kind.Zergling, 1, fx(1_140), fx(300));
  grant(0, Tech.LurkerAspect, 1);
  grant(0, Tech.PsionicStorm, 1);

  const techs = researchTechCandidates(s, academy);
  const techMask = researchTechMask(s, 0, academy, techs);
  for (let i = 0; i < techs.length; i++) {
    assert.equal(techMask[i], validateCommand(s, 0, { t: 'research', building: academy, tech: techs[i]! }).ok ? 1 : 0);
  }

  const addons = addonKindCandidates(s, factory);
  const addonMask = addonKindMask(s, 0, factory, addons);
  for (let i = 0; i < addons.length; i++) {
    assert.equal(addonMask[i], validateCommand(s, 0, { t: 'addon', building: factory, kind: addons[i]! }).ok ? 1 : 0);
  }
  assert.ok(addonKindCandidates(s, cc).includes(Kind.ComsatStation));

  const transforms = transformKindCandidates(s, hydra);
  const transformMask = transformKindMask(s, 0, hydra, transforms);
  for (let i = 0; i < transforms.length; i++) {
    assert.equal(transformMask[i], validateCommand(s, 0, { t: 'transform', unit: hydra, kind: transforms[i]! }).ok ? 1 : 0);
  }

  const abilities = abilityCandidates(s, templar);
  const spellMask = abilityMask(s, 0, templar, { x: fx(1_140), y: fx(300) }, abilities);
  for (let i = 0; i < abilities.length; i++) {
    assert.equal(spellMask[i], validateCommand(s, 0, { t: 'ability', unit: templar, ability: abilities[i]!, x: fx(1_140), y: fx(300) }).ok ? 1 : 0);
  }

  const targets = [enemy, templar];
  const attackTargets = entityTargetMask(s, 0, templar, 'attack', targets);
  assert.deepEqual([...attackTargets], targets.map((target) =>
    validateCommand(s, 0, { t: 'attack', unit: templar, target }).ok ? 1 : 0));
});
