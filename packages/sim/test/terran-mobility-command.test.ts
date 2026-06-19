import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLandCommand, validateLiftCommand } from '../src/terran-mobility-command.ts';
import { Kind, Tech } from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import { liftedStructureFlags } from '../src/terran-mobility.ts';
import { validateCommand } from '../src/validation.ts';
import { slotOf } from '../src/entity/world.ts';
import { simScenario } from '../test-support/scenario.ts';
import type { Command, CommandRejectReason } from '../src/commands.ts';

type LiftCommand = Extract<Command, { t: 'lift' }>;
type LandCommand = Extract<Command, { t: 'land' }>;
type Expected = { ok: true } | { ok: false; reason: CommandRejectReason };

type LiftKey =
  | 'cc'
  | 'enemy'
  | 'marine'
  | 'unfinished'
  | 'depot'
  | 'lifted'
  | 'linked'
  | 'linkedProducing'
  | 'producing'
  | 'researching'
  | 'stale';

const expectLift = (building: LiftKey | number, expected: Expected): void => {
  const scenario = simScenario({ players: 2, seed: 640 });
  const s = scenario.state;
  const e = s.e;
  const cc = scenario.spawn(Kind.CommandCenter, 0, fx(300), fx(300));
  const enemy = scenario.spawn(Kind.CommandCenter, 1, fx(420), fx(300));
  const marine = scenario.spawn(Kind.Marine, 0, fx(540), fx(300));
  const unfinished = scenario.spawn(Kind.CommandCenter, 0, fx(660), fx(300));
  const depot = scenario.spawn(Kind.SupplyDepot, 0, fx(780), fx(300));
  const lifted = scenario.spawn(Kind.CommandCenter, 0, fx(900), fx(300));
  const linked = scenario.spawn(Kind.CommandCenter, 0, fx(1_020), fx(300));
  const producing = scenario.spawn(Kind.CommandCenter, 0, fx(1_140), fx(300));
  const researching = scenario.spawn(Kind.CommandCenter, 0, fx(1_260), fx(300));
  const linkedProducing = scenario.spawn(Kind.CommandCenter, 0, fx(1_380), fx(300));

  e.built[slotOf(unfinished)] = 0;
  e.flags[slotOf(lifted)] = liftedStructureFlags(Kind.CommandCenter);
  e.target[slotOf(linked)] = scenario.spawn(Kind.ComsatStation, 0, fx(1_100), fx(300));
  e.prodKind[slotOf(producing)] = Kind.SCV;
  e.researchKind[slotOf(researching)] = Tech.StimPack;
  e.target[slotOf(linkedProducing)] = scenario.spawn(Kind.ComsatStation, 0, fx(1_460), fx(300));
  e.prodKind[slotOf(linkedProducing)] = Kind.SCV;

  const ids = {
    cc,
    enemy,
    marine,
    unfinished,
    depot,
    lifted,
    linked,
    linkedProducing,
    producing,
    researching,
    stale: 999_999,
  };
  const resolve = (value: LiftKey | number): number => typeof value === 'number' ? value : ids[value];
  const command: LiftCommand = { t: 'lift', building: resolve(building) };

  assert.deepEqual(validateLiftCommand(s, 0, command), expected);
  assert.deepEqual(validateCommand(s, 0, command), expected);
};

type LandKey = 'lifted' | 'enemy' | 'grounded' | 'depot' | 'blocked' | 'stale';

const expectLand = (building: LandKey | number, expected: Expected): void => {
  const scenario = simScenario({ players: 2, seed: 641 });
  const s = scenario.state;
  const e = s.e;
  const lifted = scenario.spawn(Kind.CommandCenter, 0, fx(300), fx(300));
  const enemy = scenario.spawn(Kind.CommandCenter, 1, fx(460), fx(300));
  const grounded = scenario.spawn(Kind.CommandCenter, 0, fx(620), fx(300));
  const depot = scenario.spawn(Kind.SupplyDepot, 0, fx(780), fx(300));
  const blocked = scenario.spawn(Kind.CommandCenter, 0, fx(940), fx(300));
  const blocker = scenario.spawn(Kind.SupplyDepot, 0, fx(1_100), fx(300));

  e.flags[slotOf(lifted)] = liftedStructureFlags(Kind.CommandCenter);
  e.flags[slotOf(enemy)] = liftedStructureFlags(Kind.CommandCenter);
  e.flags[slotOf(blocked)] = liftedStructureFlags(Kind.CommandCenter);

  const ids = { lifted, enemy, grounded, depot, blocked, stale: 999_999 };
  const resolve = (value: LandKey | number): number => typeof value === 'number' ? value : ids[value];
  const target = building === 'blocked'
    ? { x: e.x[slotOf(blocker)]!, y: e.y[slotOf(blocker)]! }
    : { x: fx(1_340), y: fx(300) };
  const command: LandCommand = { t: 'land', building: resolve(building), ...target };

  assert.deepEqual(validateLandCommand(s, 0, command), expected);
  assert.deepEqual(validateCommand(s, 0, command), expected);
};

test('lift validation lives in the Terran mobility command module', () => {
  expectLift('cc', { ok: true });
  expectLift('enemy', { ok: false, reason: 'wrong-owner' });
  expectLift('stale', { ok: false, reason: 'stale-entity' });
  expectLift('marine', { ok: false, reason: 'incomplete-producer' });
  expectLift('unfinished', { ok: false, reason: 'incomplete-producer' });
  expectLift('depot', { ok: false, reason: 'target-not-allowed' });
  expectLift('lifted', { ok: false, reason: 'target-not-allowed' });
  expectLift('linked', { ok: false, reason: 'target-not-allowed' });
  expectLift('linkedProducing', { ok: false, reason: 'target-not-allowed' });
  expectLift('producing', { ok: false, reason: 'queue-full' });
  expectLift('researching', { ok: false, reason: 'queue-full' });
});

test('land validation lives in the Terran mobility command module', () => {
  expectLand('lifted', { ok: true });
  expectLand('enemy', { ok: false, reason: 'wrong-owner' });
  expectLand('stale', { ok: false, reason: 'stale-entity' });
  expectLand('grounded', { ok: false, reason: 'target-not-allowed' });
  expectLand('depot', { ok: false, reason: 'target-not-allowed' });
  expectLand('blocked', { ok: false, reason: 'placement-blocked' });
});
