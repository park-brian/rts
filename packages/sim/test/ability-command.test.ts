import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAbilityCommand } from '../src/commands/ability.ts';
import type { Command, CommandRejectReason } from '../src/commands/types.ts';
import { Ability, Kind, Tech } from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import { validateCommand } from '../src/commands/validate.ts';
import { slotOf } from '../src/entity/world.ts';
import { simScenario } from '../test-support/scenario.ts';

type AbilityCommand = Extract<Command, { t: 'ability' }>;
type Expected = { ok: true } | { ok: false; reason: CommandRejectReason };
type ActorKey = 'templar' | 'enemy' | 'contained' | 'burrowed' | 'illusion' | 'disabled' | 'unfinished' | 'stale';

const setupAbilityScenario = () => {
  const scenario = simScenario({ players: 2, seed: 680 });
  const s = scenario.state;
  const e = s.e;
  const templar = scenario.spawn(Kind.HighTemplar, 0, fx(300), fx(300));
  const enemy = scenario.spawn(Kind.HighTemplar, 1, fx(330), fx(300));
  const contained = scenario.spawn(Kind.HighTemplar, 0, fx(360), fx(300));
  const burrowed = scenario.spawn(Kind.HighTemplar, 0, fx(390), fx(300));
  const illusion = scenario.spawn(Kind.HighTemplar, 0, fx(420), fx(300));
  const disabled = scenario.spawn(Kind.HighTemplar, 0, fx(450), fx(300));
  const unfinished = scenario.spawn(Kind.HighTemplar, 0, fx(480), fx(300));

  e.energy[slotOf(templar)] = 75;
  e.energy[slotOf(enemy)] = 75;
  e.energy[slotOf(contained)] = 75;
  e.energy[slotOf(burrowed)] = 75;
  e.energy[slotOf(illusion)] = 75;
  e.energy[slotOf(disabled)] = 75;
  e.energy[slotOf(unfinished)] = 75;
  e.container[slotOf(contained)] = scenario.spawn(Kind.Shuttle, 0, fx(360), fx(330));
  e.burrowed[slotOf(burrowed)] = 1;
  e.illusion[slotOf(illusion)] = 1;
  e.lockdownTimer[slotOf(disabled)] = 10;
  e.built[slotOf(unfinished)] = 0;
  scenario.grant(0, Tech.PsionicStorm, 1);

  return { scenario, ids: { templar, enemy, contained, burrowed, illusion, disabled, unfinished, stale: 999_999 } };
};

const expectAbility = (actor: ActorKey, expected: Expected): void => {
  const { scenario, ids } = setupAbilityScenario();
  const command: AbilityCommand = {
    t: 'ability',
    unit: ids[actor],
    ability: Ability.PsionicStorm,
    x: fx(320),
    y: fx(300),
  };

  assert.deepEqual(validateAbilityCommand(scenario.state, 0, command), expected);
  assert.deepEqual(validateCommand(scenario.state, 0, command), expected);
};

test('ability validation shares actor ownership and capability gates', () => {
  expectAbility('templar', { ok: true });
  expectAbility('enemy', { ok: false, reason: 'wrong-owner' });
  expectAbility('stale', { ok: false, reason: 'stale-entity' });
  expectAbility('contained', { ok: false, reason: 'missing-capability' });
  expectAbility('burrowed', { ok: false, reason: 'missing-capability' });
  expectAbility('illusion', { ok: false, reason: 'missing-capability' });
  expectAbility('disabled', { ok: false, reason: 'missing-capability' });
  expectAbility('unfinished', { ok: false, reason: 'missing-capability' });
});

test('entity ability target gates preserve range before team-specific legality', () => {
  const { state: s, spawn } = simScenario({ players: 2, seed: 681 });
  const e = s.e;
  const vessel = spawn(Kind.ScienceVessel, 0, fx(300), fx(300));
  const friendly = spawn(Kind.Marine, 0, fx(330), fx(300));
  const contained = spawn(Kind.Marine, 0, fx(360), fx(300));
  const farEnemy = spawn(Kind.Marine, 1, fx(900), fx(300));
  const closeEnemy = spawn(Kind.Marine, 1, fx(335), fx(300));
  e.energy[slotOf(vessel)] = 250;
  e.container[slotOf(contained)] = spawn(Kind.Dropship, 0, fx(360), fx(330));

  const command = (target: number): AbilityCommand => ({
    t: 'ability',
    unit: vessel,
    ability: Ability.DefensiveMatrix,
    target,
  });
  const assertAbility = (target: number, expected: Expected): void => {
    assert.deepEqual(validateAbilityCommand(s, 0, command(target)), expected);
    assert.deepEqual(validateCommand(s, 0, command(target)), expected);
  };

  assertAbility(friendly, { ok: true });
  assertAbility(contained, { ok: false, reason: 'target-not-allowed' });
  assertAbility(farEnemy, { ok: false, reason: 'target-out-of-range' });
  assertAbility(closeEnemy, { ok: false, reason: 'target-not-allowed' });
});
