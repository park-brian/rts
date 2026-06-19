import test from 'node:test';
import assert from 'node:assert/strict';
import { eid, slotOf } from '../src/entity/world.ts';
import { Kind, Order, Units } from '../src/data.ts';
import { repairCost } from '../src/repair.ts';
import { parseReplay } from '../src/replay.ts';
import { fx } from '../src/fixed.ts';
import { validateRepairCommand } from '../src/commands/repair.ts';
import { validateCommand } from '../src/commands/validate.ts';
import { simScenario } from '../test-support/scenario.ts';
import type { Command, CommandRejectReason } from '../src/commands/types.ts';

type RepairCommand = Extract<Command, { t: 'repair' }>;
type Expected = { ok: true } | { ok: false; reason: CommandRejectReason };

test('SCVs repair damaged mechanical units and spend resources', () => {
  const { sim, state: s, spawn } = simScenario({ players: 1, seed: 120 });
  const e = s.e;
  const scv = slotOf(spawn(Kind.SCV, 0, fx(400), fx(400)));
  const tank = slotOf(spawn(Kind.SiegeTank, 0, fx(408), fx(400)));
  e.hp[tank] = Units[Kind.SiegeTank]!.hp - 8;
  s.players.minerals[0] = 100;
  s.players.gas[0] = 100;
  const cost = repairCost(Kind.SiegeTank, 4);

  const results = sim.step([{ player: 0, cmds: [{ t: 'repair', unit: eid(e, scv), target: eid(e, tank) }] }]);

  assert.deepEqual(results, [{ player: 0, index: 0, t: 'repair', ok: true }]);
  assert.equal(e.order[scv], Order.Repair);
  assert.equal(e.hp[tank], Units[Kind.SiegeTank]!.hp - 4);
  assert.equal(s.players.minerals[0], 100 - cost.minerals);
  assert.equal(s.players.gas[0], 100 - cost.gas);
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
