import test from 'node:test';
import assert from 'node:assert/strict';
import { commandHeadAllowed, commandHeadMask, entityTargetMask } from '../src/action-mask.ts';
import { validateMoveCommand } from '../src/move-command.ts';
import { Kind } from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import { liftedStructureFlags } from '../src/terran-mobility.ts';
import { validateCommand } from '../src/validation.ts';
import { slotOf } from '../src/entity/world.ts';
import { simScenario } from '../test-support/scenario.ts';
import type { Command, CommandRejectReason } from '../src/commands.ts';

type MoveCommand = Extract<Command, { t: 'move' | 'amove' }>;
type Expected = { ok: true } | { ok: false; reason: CommandRejectReason };
type ActorKey =
  | 'marine' | 'enemy' | 'contained' | 'burrowed' | 'disabled' | 'unfinished' | 'mine' | 'depot' | 'lifted' | 'stale';

const setupMoveScenario = () => {
  const scenario = simScenario({ players: 2, seed: 650 });
  const s = scenario.state;
  const e = s.e;
  const marine = scenario.spawn(Kind.Marine, 0, fx(300), fx(300));
  const enemy = scenario.spawn(Kind.Marine, 1, fx(330), fx(300));
  const contained = scenario.spawn(Kind.Marine, 0, fx(360), fx(300));
  const burrowed = scenario.spawn(Kind.Zergling, 0, fx(390), fx(300));
  const disabled = scenario.spawn(Kind.Marine, 0, fx(420), fx(300));
  const unfinished = scenario.spawn(Kind.Marine, 0, fx(450), fx(300));
  const mine = scenario.spawn(Kind.SpiderMine, 0, fx(480), fx(300));
  const depot = scenario.spawn(Kind.SupplyDepot, 0, fx(510), fx(300));
  const lifted = scenario.spawn(Kind.CommandCenter, 0, fx(640), fx(300));

  e.container[slotOf(contained)] = scenario.spawn(Kind.Dropship, 0, fx(360), fx(330));
  e.burrowed[slotOf(burrowed)] = 1;
  e.lockdownTimer[slotOf(disabled)] = 10;
  e.built[slotOf(unfinished)] = 0;
  e.flags[slotOf(lifted)] = liftedStructureFlags(Kind.CommandCenter);

  return { scenario, ids: { marine, enemy, contained, burrowed, disabled, unfinished, mine, depot, lifted, stale: 999_999 } };
};

const expectMove = (actor: ActorKey | number, command: 'move' | 'amove', expected: Expected): void => {
  const { scenario, ids } = setupMoveScenario();
  const resolve = (value: ActorKey | number): number => typeof value === 'number' ? value : ids[value];
  const unit = resolve(actor);
  const c: MoveCommand = command === 'move'
    ? { t: 'move', unit, x: fx(700), y: fx(300) }
    : { t: 'amove', unit, x: fx(700), y: fx(300) };

  assert.deepEqual(validateMoveCommand(scenario.state, 0, c), expected);
  assert.deepEqual(validateCommand(scenario.state, 0, c), expected);
};

type TargetKey = 'friendly' | 'enemy' | 'self' | 'contained' | 'mineral' | 'stale';

const expectTargetedMove = (targetKey: TargetKey, expected: Expected): void => {
  const scenario = simScenario({ players: 2, seed: 651 });
  const s = scenario.state;
  const e = s.e;
  const marine = scenario.spawn(Kind.Marine, 0, fx(300), fx(300));
  const friendly = scenario.spawn(Kind.SCV, 0, fx(330), fx(300));
  const enemy = scenario.spawn(Kind.Marine, 1, fx(360), fx(300));
  const contained = scenario.spawn(Kind.SCV, 0, fx(390), fx(300));
  const mineral = scenario.spawn(Kind.Mineral, -1, fx(420), fx(300));

  e.container[slotOf(contained)] = scenario.spawn(Kind.Dropship, 0, fx(390), fx(330));

  const targets = { friendly, enemy, self: marine, contained, mineral, stale: 999_999 };
  const target = targets[targetKey];
  const command: MoveCommand = { t: 'move', unit: marine, x: fx(700), y: fx(300), target };

  assert.deepEqual(validateMoveCommand(s, 0, command), expected);
  assert.deepEqual(validateCommand(s, 0, command), expected);
};

test('move and attack-move validation lives in the move command module', () => {
  expectMove('marine', 'move', { ok: true });
  expectMove('marine', 'amove', { ok: true });
  expectMove('lifted', 'move', { ok: true });
  expectMove('enemy', 'move', { ok: false, reason: 'wrong-owner' });
  expectMove('stale', 'move', { ok: false, reason: 'stale-entity' });
  expectMove('contained', 'move', { ok: false, reason: 'missing-capability' });
  expectMove('burrowed', 'move', { ok: false, reason: 'missing-capability' });
  expectMove('disabled', 'move', { ok: false, reason: 'missing-capability' });
  expectMove('unfinished', 'move', { ok: false, reason: 'missing-capability' });
  expectMove('mine', 'move', { ok: false, reason: 'missing-capability' });
  expectMove('depot', 'move', { ok: false, reason: 'missing-capability' });
});

test('targeted move validation keeps follow targets explicit', () => {
  expectTargetedMove('friendly', { ok: true });
  expectTargetedMove('enemy', { ok: false, reason: 'target-not-allowed' });
  expectTargetedMove('self', { ok: false, reason: 'target-not-allowed' });
  expectTargetedMove('contained', { ok: false, reason: 'target-not-allowed' });
  expectTargetedMove('mineral', { ok: false, reason: 'target-not-allowed' });
  expectTargetedMove('stale', { ok: false, reason: 'target-not-found' });
});

test('move masks follow shared move validation', () => {
  const scenario = simScenario({ players: 2, seed: 652 });
  const s = scenario.state;
  const marine = scenario.spawn(Kind.Marine, 0, fx(300), fx(300));
  const depot = scenario.spawn(Kind.SupplyDepot, 0, fx(340), fx(300));
  const point = { x: fx(500), y: fx(300) };

  assert.equal(commandHeadAllowed(commandHeadMask(s, 0, marine, point), 'move'), true);
  assert.equal(commandHeadAllowed(commandHeadMask(s, 0, marine, point), 'amove'), true);
  assert.equal(commandHeadAllowed(commandHeadMask(s, 0, depot, point), 'move'), false);
  assert.equal(commandHeadAllowed(commandHeadMask(s, 0, depot, point), 'amove'), false);
});

test('targeted move masks follow shared follow-target validation', () => {
  const scenario = simScenario({ players: 2, seed: 653 });
  const s = scenario.state;
  const marine = scenario.spawn(Kind.Marine, 0, fx(300), fx(300));
  const friendly = scenario.spawn(Kind.SCV, 0, fx(330), fx(300));
  const enemy = scenario.spawn(Kind.Marine, 1, fx(360), fx(300));
  const mineral = scenario.spawn(Kind.Mineral, -1, fx(390), fx(300));
  const targets = [friendly, enemy, mineral];
  const opts = { x: fx(700), y: fx(300) };
  const mask = entityTargetMask(s, 0, marine, 'move', targets, opts);

  assert.deepEqual([...mask], targets.map((target) =>
    validateCommand(s, 0, { t: 'move', unit: marine, x: opts.x, y: opts.y, target }).ok ? 1 : 0));
});
