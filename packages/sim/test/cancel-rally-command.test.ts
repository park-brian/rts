import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCancelBuildCommand } from '../src/cancel-command.ts';
import { validateRallyCommand } from '../src/rally-command.ts';
import type { Command, CommandRejectReason } from '../src/commands.ts';
import { Kind } from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import { validateCommand } from '../src/validation.ts';
import { slotOf } from '../src/entity/world.ts';
import { simScenario } from '../test-support/scenario.ts';

type CancelCommand = Extract<Command, { t: 'cancelBuild' }>;
type RallyCommand = Extract<Command, { t: 'rally' }>;
type Expected = { ok: true } | { ok: false; reason: CommandRejectReason };

test('cancel-build validation shares actor ownership gates', () => {
  const { state: s, spawn } = simScenario({ players: 2, seed: 692 });
  const e = s.e;
  const depot = spawn(Kind.SupplyDepot, 0, fx(300), fx(300));
  const enemyDepot = spawn(Kind.SupplyDepot, 1, fx(360), fx(300));
  e.built[slotOf(depot)] = 0;
  e.buildCostMinerals[slotOf(depot)] = 100;
  e.built[slotOf(enemyDepot)] = 0;
  e.buildCostMinerals[slotOf(enemyDepot)] = 100;

  const assertCancel = (command: CancelCommand, expected: Expected): void => {
    assert.deepEqual(validateCancelBuildCommand(s, 0, command), expected);
    assert.deepEqual(validateCommand(s, 0, command), expected);
  };

  assertCancel({ t: 'cancelBuild', building: depot }, { ok: true });
  assertCancel({ t: 'cancelBuild', building: enemyDepot }, { ok: false, reason: 'wrong-owner' });
  assertCancel({ t: 'cancelBuild', building: 999_999 }, { ok: false, reason: 'stale-entity' });
});

test('rally validation shares actor ownership gates', () => {
  const { state: s, spawn } = simScenario({ players: 2, seed: 693 });
  const cc = spawn(Kind.CommandCenter, 0, fx(300), fx(300));
  const enemyCc = spawn(Kind.CommandCenter, 1, fx(460), fx(300));
  const rally = { x: fx(600), y: fx(300) };

  const assertRally = (command: RallyCommand, expected: Expected): void => {
    assert.deepEqual(validateRallyCommand(s, 0, command), expected);
    assert.deepEqual(validateCommand(s, 0, command), expected);
  };

  assertRally({ t: 'rally', building: cc, ...rally }, { ok: true });
  assertRally({ t: 'rally', building: enemyCc, ...rally }, { ok: false, reason: 'wrong-owner' });
  assertRally({ t: 'rally', building: 999_999, ...rally }, { ok: false, reason: 'stale-entity' });
});
