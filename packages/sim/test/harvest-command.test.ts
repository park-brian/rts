import test from 'node:test';
import assert from 'node:assert/strict';
import { validateHarvestCommand } from '../src/harvest-command.ts';
import type { Command, CommandRejectReason } from '../src/commands.ts';
import { Kind } from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import { validateCommand } from '../src/validation.ts';
import { slotOf } from '../src/world.ts';
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
  const mineral = spawn(Kind.Mineral, -1, fx(390), fx(300));
  const geyser = spawn(Kind.Geyser, -1, fx(420), fx(300));
  e.container[slotOf(contained)] = spawn(Kind.Dropship, 0, fx(360), fx(330));

  assertHarvest(s, { t: 'harvest', unit: marine, patch: mineral }, { ok: false, reason: 'missing-capability' });
  assertHarvest(s, { t: 'harvest', unit: contained, patch: mineral }, { ok: false, reason: 'missing-capability' });
  assertHarvest(s, { t: 'harvest', unit: scv, patch: geyser }, { ok: false, reason: 'target-not-allowed' });
  assertHarvest(s, { t: 'harvest', unit: scv, patch: 999_999 }, { ok: false, reason: 'target-not-found' });
});
