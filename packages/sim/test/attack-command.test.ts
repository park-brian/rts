import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAttackCommand } from '../src/attack-command.ts';
import { Kind } from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import { validateCommand } from '../src/validation.ts';
import { kill, slotOf } from '../src/world.ts';
import { simScenario } from '../test-support/scenario.ts';
import type { Command, CommandRejectReason } from '../src/commands.ts';

type AttackCommand = Extract<Command, { t: 'attack' }>;
type Expected = { ok: true } | { ok: false; reason: CommandRejectReason };
type EntityKey =
  | 'marine' | 'enemy' | 'friendly' | 'firebat' | 'mutalisk' | 'depot' | 'hidden'
  | 'reaver' | 'contained' | 'enemyContained' | 'disabled' | 'unfinished' | 'stale';
type AttackCase = { unit: EntityKey | number; target: EntityKey | number };

const expectAttack = (input: AttackCase, expected: Expected): void => {
  const scenario = simScenario({ players: 2, seed: 610 });
  const s = scenario.state;
  const e = s.e;
  const marine = scenario.spawn(Kind.Marine, 0, fx(300), fx(300));
  const enemy = scenario.spawn(Kind.Zealot, 1, fx(340), fx(300));
  const friendly = scenario.spawn(Kind.SCV, 0, fx(320), fx(300));
  const firebat = scenario.spawn(Kind.Firebat, 0, fx(300), fx(330));
  const mutalisk = scenario.spawn(Kind.Mutalisk, 1, fx(340), fx(330));
  const depot = scenario.spawn(Kind.SupplyDepot, 0, fx(280), fx(300));
  const hidden = scenario.spawn(Kind.Zergling, 1, fx(360), fx(300));
  const reaver = scenario.spawn(Kind.Reaver, 0, fx(300), fx(360));
  const contained = scenario.spawn(Kind.Marine, 0, fx(300), fx(390));
  const enemyContained = scenario.spawn(Kind.Zealot, 1, fx(340), fx(390));
  const disabled = scenario.spawn(Kind.Marine, 0, fx(330), fx(390));
  const unfinished = scenario.spawn(Kind.Marine, 0, fx(360), fx(390));

  e.burrowed[slotOf(hidden)] = 1;
  e.container[slotOf(contained)] = scenario.spawn(Kind.Dropship, 0, fx(300), fx(420));
  e.container[slotOf(enemyContained)] = scenario.spawn(Kind.Dropship, 1, fx(340), fx(420));
  e.lockdownTimer[slotOf(disabled)] = 10;
  e.built[slotOf(unfinished)] = 0;
  kill(s, enemy);

  const ids = {
    marine,
    enemy,
    friendly,
    firebat,
    mutalisk,
    depot,
    hidden,
    reaver,
    contained,
    enemyContained,
    disabled,
    unfinished,
    stale: enemy,
  };
  const resolve = (value: EntityKey | number): number => typeof value === 'number' ? value : ids[value];
  const resolved: AttackCommand = { t: 'attack', unit: resolve(input.unit), target: resolve(input.target) };

  assert.deepEqual(validateAttackCommand(s, 0, resolved), expected);
  assert.deepEqual(validateCommand(s, 0, resolved), expected);
};

test('targeted attack validation lives in the attack command module', () => {
  expectAttack({ unit: 'marine', target: 'mutalisk' }, { ok: true });
  expectAttack({ unit: 'mutalisk', target: 'marine' }, {
    ok: false,
    reason: 'wrong-owner',
  });
  expectAttack({ unit: 999_999, target: 'mutalisk' }, { ok: false, reason: 'stale-entity' });
  expectAttack({ unit: 'depot', target: 'mutalisk' }, {
    ok: false,
    reason: 'missing-capability',
  });
  expectAttack({ unit: 'contained', target: 'mutalisk' }, {
    ok: false,
    reason: 'missing-capability',
  });
  expectAttack({ unit: 'disabled', target: 'mutalisk' }, {
    ok: false,
    reason: 'missing-capability',
  });
  expectAttack({ unit: 'unfinished', target: 'mutalisk' }, {
    ok: false,
    reason: 'missing-capability',
  });
  expectAttack({ unit: 'marine', target: 'friendly' }, {
    ok: false,
    reason: 'target-not-allowed',
  });
  expectAttack({ unit: 'marine', target: 'hidden' }, {
    ok: false,
    reason: 'target-not-allowed',
  });
  expectAttack({ unit: 'marine', target: 'enemyContained' }, {
    ok: false,
    reason: 'target-not-allowed',
  });
  expectAttack({ unit: 'marine', target: 'stale' }, {
    ok: false,
    reason: 'target-not-found',
  });
  expectAttack({ unit: 'firebat', target: 'mutalisk' }, {
    ok: false,
    reason: 'target-not-allowed',
  });
  expectAttack({ unit: 'reaver', target: 'hidden' }, {
    ok: false,
    reason: 'target-not-allowed',
  });
});
