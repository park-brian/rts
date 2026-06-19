import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBurrowCommand } from '../src/commands/burrow.ts';
import { Kind, Tech } from '../src/data/index.ts';
import { fx } from '../src/fixed.ts';
import { validateCommand } from '../src/commands/validate.ts';
import { slotOf } from '../src/entity/world.ts';
import { simScenario } from '../test-support/scenario.ts';
import type { Command, CommandRejectReason } from '../src/commands/types.ts';

type BurrowCommand = Extract<Command, { t: 'burrow' }>;
type Expected = { ok: true } | { ok: false; reason: CommandRejectReason };
type EntityKey = 'zergling' | 'marine' | 'enemy' | 'illusion' | 'disabled' | 'contained' | 'burrowed' | 'stale';
type BurrowCase = { unit: EntityKey | number; active: boolean };

const expectBurrow = (input: BurrowCase, expected: Expected): void => {
  const scenario = simScenario({ players: 2, seed: 620 });
  const s = scenario.state;
  const e = s.e;
  const zergling = scenario.spawn(Kind.Zergling, 0, fx(300), fx(300));
  const marine = scenario.spawn(Kind.Marine, 0, fx(330), fx(300));
  const enemy = scenario.spawn(Kind.Zergling, 1, fx(360), fx(300));
  const illusion = scenario.spawn(Kind.Zergling, 0, fx(390), fx(300));
  const disabled = scenario.spawn(Kind.Zergling, 0, fx(420), fx(300));
  const contained = scenario.spawn(Kind.Zergling, 0, fx(450), fx(300));
  const burrowed = scenario.spawn(Kind.Zergling, 0, fx(480), fx(300));

  scenario.grant(0, Tech.Burrow);
  e.illusion[slotOf(illusion)] = 1;
  e.lockdownTimer[slotOf(disabled)] = 10;
  e.container[slotOf(contained)] = scenario.spawn(Kind.Overlord, 0, fx(450), fx(330));
  e.burrowed[slotOf(burrowed)] = 1;

  const ids = { zergling, marine, enemy, illusion, disabled, contained, burrowed, stale: 999_999 };
  const resolve = (value: EntityKey | number): number => typeof value === 'number' ? value : ids[value];
  const command: BurrowCommand = { t: 'burrow', unit: resolve(input.unit), active: input.active };

  assert.deepEqual(validateBurrowCommand(s, 0, command), expected);
  assert.deepEqual(validateCommand(s, 0, command), expected);
};

test('burrow validation lives in the burrow command module', () => {
  expectBurrow({ unit: 'zergling', active: true }, { ok: true });
  expectBurrow({ unit: 'enemy', active: true }, { ok: false, reason: 'wrong-owner' });
  expectBurrow({ unit: 'stale', active: true }, { ok: false, reason: 'stale-entity' });
  expectBurrow({ unit: 'marine', active: true }, { ok: false, reason: 'missing-capability' });
  expectBurrow({ unit: 'illusion', active: true }, { ok: false, reason: 'missing-capability' });
  expectBurrow({ unit: 'disabled', active: true }, { ok: false, reason: 'missing-capability' });
  expectBurrow({ unit: 'contained', active: true }, { ok: false, reason: 'missing-capability' });
  expectBurrow({ unit: 'burrowed', active: true }, { ok: false, reason: 'target-not-allowed' });
  expectBurrow({ unit: 'burrowed', active: false }, { ok: true });
});

test('burrow validation keeps tech gates separate from unit capability', () => {
  const scenario = simScenario({ players: 1, seed: 621 });
  const zergling = scenario.spawn(Kind.Zergling, 0, fx(300), fx(300));
  const command: BurrowCommand = { t: 'burrow', unit: zergling, active: true };

  assert.deepEqual(validateBurrowCommand(scenario.state, 0, command), { ok: false, reason: 'missing-requirement' });
  assert.deepEqual(validateCommand(scenario.state, 0, command), { ok: false, reason: 'missing-requirement' });
});
