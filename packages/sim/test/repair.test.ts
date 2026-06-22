import test from 'node:test';
import assert from 'node:assert/strict';
import { eid, NONE, slotOf } from '../src/entity/world.ts';
import { Kind, Order, Units } from '../src/data/index.ts';
import { repairCostDelta, repairDuration } from '../src/mechanics/repair.ts';
import { parseReplay } from '../src/io/replay.ts';
import { fx } from '../src/fixed.ts';
import { validateRepairCommand } from '../src/commands/repair.ts';
import { validateCommand } from '../src/commands/validate.ts';
import { simScenario } from '../test-support/scenario.ts';
import type { Command, CommandRejectReason } from '../src/commands/types.ts';

type RepairCommand = Extract<Command, { t: 'repair' }>;
type Expected = { ok: true } | { ok: false; reason: CommandRejectReason };

const idleWorkers = (e: ReturnType<typeof simScenario>['state']['e']): void => {
  for (let i = 0; i < e.hi; i++) {
    if (e.order[i] !== Order.Harvest) continue;
    e.order[i] = Order.Idle;
    e.target[i] = NONE;
    e.intentTarget[i] = NONE;
    e.combatTarget[i] = NONE;
    e.cargo[i] = 0;
    e.timer[i] = 0;
  }
};

test('one SCV fully repairs over the target build time for 25 percent total cost', () => {
  const { sim, state: s, spawn } = simScenario({ players: 1, seed: 120 });
  const e = s.e;
  idleWorkers(e);
  const scv = slotOf(spawn(Kind.SCV, 0, fx(400), fx(400)));
  const tank = slotOf(spawn(Kind.SiegeTank, 0, fx(408), fx(400)));
  e.hp[tank] = 0;
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;
  const cost = repairCostDelta(Kind.SiegeTank, 0, Units[Kind.SiegeTank]!.hp);
  const duration = repairDuration(Kind.SiegeTank);

  const results = sim.step([{ player: 0, cmds: [{ t: 'repair', unit: eid(e, scv), target: eid(e, tank) }] }]);
  for (let t = 1; t < duration; t++) sim.step([]);

  assert.deepEqual(results, [{ player: 0, index: 0, t: 'repair', ok: true }]);
  assert.equal(e.hp[tank], Units[Kind.SiegeTank]!.hp);
  assert.equal(e.order[scv], Order.Idle);
  assert.equal(s.players.minerals[0], 1_000 - cost.minerals);
  assert.equal(s.players.gas[0], 1_000 - cost.gas);
});

test('multiple SCVs repair linearly faster without multiplying total cost', () => {
  const { sim, state: s, spawn } = simScenario({ players: 1, seed: 123 });
  const e = s.e;
  idleWorkers(e);
  const depot = slotOf(spawn(Kind.SupplyDepot, 0, fx(408), fx(400)));
  e.hp[depot] = 0;
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;
  const workers = [
    slotOf(spawn(Kind.SCV, 0, fx(360), fx(376))),
    slotOf(spawn(Kind.SCV, 0, fx(456), fx(376))),
    slotOf(spawn(Kind.SCV, 0, fx(360), fx(424))),
    slotOf(spawn(Kind.SCV, 0, fx(456), fx(424))),
    slotOf(spawn(Kind.SCV, 0, fx(408), fx(352))),
  ];
  const cost = repairCostDelta(Kind.SupplyDepot, 0, Units[Kind.SupplyDepot]!.hp);
  const frames = Math.ceil(repairDuration(Kind.SupplyDepot) / workers.length);

  const results = sim.step([{ player: 0, cmds: workers.map((worker) => ({
    t: 'repair' as const,
    unit: eid(e, worker),
    target: eid(e, depot),
  })) }]);
  for (let t = 1; t < frames; t++) sim.step([]);

  assert.deepEqual(results, workers.map((_, index) => ({ player: 0, index, t: 'repair', ok: true })));
  assert.equal(e.hp[depot], Units[Kind.SupplyDepot]!.hp);
  assert.equal(s.players.minerals[0], 1_000 - cost.minerals);
  assert.equal(s.players.gas[0], 1_000 - cost.gas);
});

test('repair rejects invalid targets but allows SCVs to resume Terran foundations', () => {
  const { sim, state: s, spawn } = simScenario({ players: 1, seed: 121 });
  const e = s.e;
  const scv = slotOf(spawn(Kind.SCV, 0, fx(400), fx(400)));
  const marine = slotOf(spawn(Kind.Marine, 0, fx(430), fx(400)));
  const depot = slotOf(spawn(Kind.SupplyDepot, 0, fx(470), fx(400)));
  const pylon = slotOf(spawn(Kind.Pylon, 0, fx(490), fx(400)));
  const tank = slotOf(spawn(Kind.SiegeTank, 0, fx(510), fx(400)));
  e.hp[marine] = Units[Kind.Marine]!.hp - 5;
  e.hp[tank] = Units[Kind.SiegeTank]!.hp - 5;
  e.built[depot] = 0;
  e.hp[depot] = Units[Kind.SupplyDepot]!.hp - 5;
  e.built[pylon] = 0;
  s.players.minerals[0] = 0;
  s.players.gas[0] = 0;

  const results = sim.step([{ player: 0, cmds: [
    { t: 'repair', unit: eid(e, scv), target: eid(e, marine) },
    { t: 'repair', unit: eid(e, scv), target: eid(e, depot) },
    { t: 'repair', unit: eid(e, scv), target: eid(e, pylon) },
    { t: 'repair', unit: eid(e, scv), target: eid(e, tank) },
  ] }]);

  assert.deepEqual(results, [
    { player: 0, index: 0, t: 'repair', ok: false, reason: 'target-not-allowed' },
    { player: 0, index: 1, t: 'repair', ok: true },
    { player: 0, index: 2, t: 'repair', ok: false, reason: 'target-not-allowed' },
    { player: 0, index: 3, t: 'repair', ok: false, reason: 'not-affordable' },
  ]);
  assert.equal(e.order[scv], Order.Build);
  assert.equal(e.target[scv], eid(e, depot));
});

test('multiple SCVs build Terran foundations linearly faster', () => {
  const { sim, state: s, spawn } = simScenario({ players: 1, seed: 124 });
  const e = s.e;
  const depot = slotOf(spawn(Kind.SupplyDepot, 0, fx(408), fx(400)));
  const builder = slotOf(spawn(Kind.SCV, 0, fx(392), fx(400)));
  const helpers = [
    slotOf(spawn(Kind.SCV, 0, fx(400), fx(400))),
    slotOf(spawn(Kind.SCV, 0, fx(416), fx(400))),
  ];
  e.built[depot] = 0;
  e.ctimer[depot] = 6;
  e.order[builder] = Order.Build;
  e.target[builder] = eid(e, depot);
  e.buildKind[builder] = Kind.None;
  e.target[depot] = eid(e, builder);

  const results = sim.step([{ player: 0, cmds: helpers.map((helper) => ({
    t: 'repair' as const,
    unit: eid(e, helper),
    target: eid(e, depot),
  })) }]);

  assert.deepEqual(results, helpers.map((_, index) => ({ player: 0, index, t: 'repair', ok: true })));
  assert.equal(e.ctimer[depot], 3);

  sim.step([]);

  assert.equal(e.built[depot], 1);
  assert.equal(e.ctimer[depot], 0);
  for (const worker of [builder, ...helpers]) assert.notEqual(e.order[worker], Order.Build);
});

test('repair validation shares actor ownership gates', () => {
  const { state: s, spawn } = simScenario({ players: 2, seed: 122 });
  const e = s.e;
  const scv = spawn(Kind.SCV, 0, fx(400), fx(400));
  const enemyScv = spawn(Kind.SCV, 1, fx(430), fx(400));
  const contained = spawn(Kind.SCV, 0, fx(460), fx(400));
  const burrowed = spawn(Kind.Drone, 0, fx(490), fx(400));
  const illusion = spawn(Kind.SCV, 0, fx(520), fx(400));
  const disabled = spawn(Kind.SCV, 0, fx(550), fx(400));
  const unfinished = spawn(Kind.SCV, 0, fx(580), fx(400));
  const tank = spawn(Kind.SiegeTank, 0, fx(610), fx(400));
  e.container[slotOf(contained)] = spawn(Kind.Dropship, 0, fx(460), fx(430));
  e.burrowed[slotOf(burrowed)] = 1;
  e.illusion[slotOf(illusion)] = 1;
  e.lockdownTimer[slotOf(disabled)] = 10;
  e.built[slotOf(unfinished)] = 0;
  e.hp[slotOf(tank)] = Units[Kind.SiegeTank]!.hp - 8;
  s.players.minerals[0] = 100;
  s.players.gas[0] = 100;

  const assertRepair = (command: RepairCommand, expected: Expected): void => {
    assert.deepEqual(validateRepairCommand(s, 0, command), expected);
    assert.deepEqual(validateCommand(s, 0, command), expected);
  };

  assertRepair({ t: 'repair', unit: scv, target: tank }, { ok: true });
  assertRepair({ t: 'repair', unit: enemyScv, target: tank }, { ok: false, reason: 'wrong-owner' });
  assertRepair({ t: 'repair', unit: 999_999, target: tank }, { ok: false, reason: 'stale-entity' });
  assertRepair({ t: 'repair', unit: contained, target: tank }, { ok: false, reason: 'missing-capability' });
  assertRepair({ t: 'repair', unit: burrowed, target: tank }, { ok: false, reason: 'missing-capability' });
  assertRepair({ t: 'repair', unit: illusion, target: tank }, { ok: false, reason: 'missing-capability' });
  assertRepair({ t: 'repair', unit: disabled, target: tank }, { ok: false, reason: 'missing-capability' });
  assertRepair({ t: 'repair', unit: unfinished, target: tank }, { ok: false, reason: 'missing-capability' });
});

test('queued repair commands append and dispatch after current travel settles', () => {
  const { sim, state: s, spawn } = simScenario({ players: 1, seed: 125 });
  const e = s.e;
  idleWorkers(e);
  const scv = slotOf(spawn(Kind.SCV, 0, fx(300), fx(300)));
  const bunker = spawn(Kind.Bunker, 0, fx(700), fx(300));
  e.hp[slotOf(bunker)] = Units[Kind.Bunker]!.hp - 40;
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  const results = sim.step([{ player: 0, cmds: [
    { t: 'move', unit: eid(e, scv), x: fx(340), y: fx(300) },
    { t: 'repair', unit: eid(e, scv), target: bunker, queue: true },
  ] }]);

  assert.deepEqual(results.map((r) => r.ok), [true, true]);
  assert.equal(e.order[scv], Order.Move);
  assert.equal(e.orderQueueLen[scv], 1);
  assert.equal(e.orderQueue0[scv], Order.Repair);
  assert.equal(e.orderQueueTarget0[scv], bunker);

  const currentOrder = (): number => e.order[scv]!;
  for (let i = 0; i < 300 && currentOrder() !== Order.Repair; i++) sim.step([]);

  assert.equal(e.orderQueueLen[scv], 0);
  assert.equal(e.order[scv], Order.Repair);
  assert.equal(e.target[scv], bunker);
});

test('repair completion advances to the next queued order', () => {
  const { sim, state: s, spawn } = simScenario({ players: 1, seed: 126 });
  const e = s.e;
  idleWorkers(e);
  const scv = slotOf(spawn(Kind.SCV, 0, fx(300), fx(300)));
  const depot = slotOf(spawn(Kind.SupplyDepot, 0, fx(330), fx(300)));
  e.hp[depot] = Units[Kind.SupplyDepot]!.hp - 1;
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;
  const move = { x: fx(720), y: fx(300) };

  const results = sim.step([{ player: 0, cmds: [
    { t: 'repair', unit: eid(e, scv), target: eid(e, depot) },
    { t: 'move', unit: eid(e, scv), ...move, queue: true },
  ] }]);

  assert.deepEqual(results.map((r) => r.ok), [true, true]);
  assert.equal(e.order[scv], Order.Repair);
  assert.equal(e.orderQueueLen[scv], 1);

  const currentOrder = (): number => e.order[scv]!;
  for (let i = 0; i < 200 && currentOrder() !== Order.Move; i++) sim.step([]);

  assert.equal(e.hp[depot], Units[Kind.SupplyDepot]!.hp);
  assert.equal(e.orderQueueLen[scv], 0);
  assert.equal(e.order[scv], Order.Move);
  assert.equal(e.tx[scv], move.x);
  assert.equal(e.ty[scv], move.y);
});

test('queued repair validation rejects busy construction resume and full queues', () => {
  const { sim, state: s, spawn } = simScenario({ players: 1, seed: 127 });
  const e = s.e;
  idleWorkers(e);
  const scv = spawn(Kind.SCV, 0, fx(300), fx(300));
  const depot = slotOf(spawn(Kind.SupplyDepot, 0, fx(420), fx(300)));
  const bunker = slotOf(spawn(Kind.Bunker, 0, fx(460), fx(300)));
  e.built[depot] = 0;
  e.ctimer[depot] = 100;
  e.hp[bunker] = Units[Kind.Bunker]!.hp - 40;
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  const construction = sim.step([{ player: 0, cmds: [
    { t: 'move', unit: scv, x: fx(340), y: fx(300) },
    { t: 'repair', unit: scv, target: eid(e, depot), queue: true },
  ] }]);

  assert.deepEqual(construction, [
    { player: 0, index: 0, t: 'move', ok: true },
    { player: 0, index: 1, t: 'repair', ok: false, reason: 'target-not-allowed' },
  ]);

  const fullQueue = sim.step([{ player: 0, cmds: [
    { t: 'move', unit: scv, x: fx(360), y: fx(300), queue: true },
    { t: 'move', unit: scv, x: fx(380), y: fx(300), queue: true },
    { t: 'move', unit: scv, x: fx(400), y: fx(300), queue: true },
    { t: 'move', unit: scv, x: fx(420), y: fx(300), queue: true },
    { t: 'repair', unit: scv, target: eid(e, bunker), queue: true },
  ] }]);

  assert.equal(e.orderQueueLen[slotOf(scv)], 4);
  assert.deepEqual(fullQueue.map((r) => r.ok), [true, true, true, true, false]);
  assert.deepEqual(fullQueue.at(-1), { player: 0, index: 4, t: 'repair', ok: false, reason: 'queue-full' });
});

test('replay parser accepts repair commands', () => {
  const replay = parseReplay(JSON.stringify({
    version: 1,
    map: { kind: 'slice' },
    players: 1,
    seed: 1,
    frames: [[{ player: 0, cmds: [{ t: 'repair', unit: 1, target: 2 }] }]],
  }));

  assert.deepEqual(replay.frames[0]![0]!.cmds[0], { t: 'repair', unit: 1, target: 2 });
});
