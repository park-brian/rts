import test from 'node:test';
import assert from 'node:assert/strict';
import { validateHarvestCommand } from '../src/commands/harvest.ts';
import type { Command, CommandRejectReason } from '../src/commands/types.ts';
import { Kind } from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import { validateCommand } from '../src/commands/validate.ts';
import { slotOf } from '../src/entity/world.ts';
import { simScenario } from '../test-support/scenario.ts';

type HarvestCommand = Extract<Command, { t: 'harvest' }>;
type Expected = { ok: true } | { ok: false; reason: CommandRejectReason };

const assertHarvest = (
  s: ReturnType<typeof simScenario>['state'],
  command: HarvestCommand,
  expected: Expected,
): void => {
  assert.deepEqual(validateHarvestCommand(s, 0, command), expected);
  assert.deepEqual(validateCommand(s, 0, command), expected);
};

test('harvest validation shares actor ownership gates', () => {
  const { state: s, spawn } = simScenario({ players: 2, seed: 690 });
  const scv = spawn(Kind.SCV, 0, fx(300), fx(300));
  const enemyScv = spawn(Kind.SCV, 1, fx(330), fx(300));
  const mineral = spawn(Kind.Mineral, -1, fx(360), fx(300));

  assertHarvest(s, { t: 'harvest', unit: scv, patch: mineral }, { ok: true });
  assertHarvest(s, { t: 'harvest', unit: enemyScv, patch: mineral }, { ok: false, reason: 'wrong-owner' });
  assertHarvest(s, { t: 'harvest', unit: 999_999, patch: mineral }, { ok: false, reason: 'stale-entity' });
});

test('harvest validation keeps worker capability separate from target legality', () => {
  const { state: s, spawn } = simScenario({ players: 1, seed: 691 });
  const e = s.e;
  const scv = spawn(Kind.SCV, 0, fx(300), fx(300));
  const marine = spawn(Kind.Marine, 0, fx(330), fx(300));
  const contained = spawn(Kind.SCV, 0, fx(360), fx(300));
  const burrowed = spawn(Kind.Drone, 0, fx(390), fx(300));
  const illusion = spawn(Kind.SCV, 0, fx(420), fx(300));
  const disabled = spawn(Kind.SCV, 0, fx(450), fx(300));
  const unfinished = spawn(Kind.SCV, 0, fx(480), fx(300));
  const mineral = spawn(Kind.Mineral, -1, fx(510), fx(300));
  const geyser = spawn(Kind.Geyser, -1, fx(540), fx(300));
  e.container[slotOf(contained)] = spawn(Kind.Dropship, 0, fx(360), fx(330));
  e.burrowed[slotOf(burrowed)] = 1;
  e.illusion[slotOf(illusion)] = 1;
  e.lockdownTimer[slotOf(disabled)] = 10;
  e.built[slotOf(unfinished)] = 0;

  assertHarvest(s, { t: 'harvest', unit: marine, patch: mineral }, { ok: false, reason: 'missing-capability' });
  assertHarvest(s, { t: 'harvest', unit: contained, patch: mineral }, { ok: false, reason: 'missing-capability' });
  assertHarvest(s, { t: 'harvest', unit: burrowed, patch: mineral }, { ok: false, reason: 'missing-capability' });
  assertHarvest(s, { t: 'harvest', unit: illusion, patch: mineral }, { ok: false, reason: 'missing-capability' });
  assertHarvest(s, { t: 'harvest', unit: disabled, patch: mineral }, { ok: false, reason: 'missing-capability' });
  assertHarvest(s, { t: 'harvest', unit: unfinished, patch: mineral }, { ok: false, reason: 'missing-capability' });
  assertHarvest(s, { t: 'harvest', unit: scv, patch: geyser }, { ok: false, reason: 'target-not-allowed' });
  assertHarvest(s, { t: 'harvest', unit: scv, patch: 999_999 }, { ok: false, reason: 'target-not-found' });
});
