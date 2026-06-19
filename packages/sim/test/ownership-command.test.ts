import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBuildCommand } from '../src/build-command.ts';
import { validateLoadCommand, validateUnloadCommand } from '../src/cargo-command.ts';
import type { Command, CommandRejectReason } from '../src/commands.ts';
import { Kind } from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import { validateCommand } from '../src/validation.ts';
import { eid, slotOf } from '../src/entity/world.ts';
import { simScenario } from '../test-support/scenario.ts';

type BuildCommand = Extract<Command, { t: 'build' }>;
type LoadCommand = Extract<Command, { t: 'load' }>;
type UnloadCommand = Extract<Command, { t: 'unload' }>;
type Expected = { ok: true } | { ok: false; reason: CommandRejectReason };

const assertBuild = (
  s: ReturnType<typeof simScenario>['state'],
  command: BuildCommand,
  expected: Expected,
): void => {
  assert.deepEqual(validateBuildCommand(s, 0, command), expected);
  assert.deepEqual(validateCommand(s, 0, command), expected);
};

const assertLoad = (
  s: ReturnType<typeof simScenario>['state'],
  player: number,
  command: LoadCommand,
  expected: Expected,
): void => {
  assert.deepEqual(validateLoadCommand(s, player, command), expected);
  assert.deepEqual(validateCommand(s, player, command), expected);
};

const assertUnload = (
  s: ReturnType<typeof simScenario>['state'],
  player: number,
  command: UnloadCommand,
  expected: Expected,
): void => {
  assert.deepEqual(validateUnloadCommand(s, player, command), expected);
  assert.deepEqual(validateCommand(s, player, command), expected);
};

test('build validation shares actor ownership gates', () => {
  const { state: s, spawn, resources } = simScenario({ players: 2, seed: 699 });
  resources(0, 2_000, 2_000);
  const scv = spawn(Kind.SCV, 0, fx(300), fx(300));
  const enemyScv = spawn(Kind.SCV, 1, fx(340), fx(300));
  spawn(Kind.CommandCenter, 0, fx(300), fx(520));
  const build = (unit: number): BuildCommand => ({
    t: 'build',
    unit,
    kind: Kind.SupplyDepot,
    x: fx(560),
    y: fx(300),
  });

  assertBuild(s, build(scv), { ok: true });
  assertBuild(s, build(enemyScv), { ok: false, reason: 'wrong-owner' });
  assertBuild(s, build(999_999), { ok: false, reason: 'stale-entity' });
});

test('cargo validation shares owned actor gates while preserving allied nydus transport access', () => {
  const { state: s, spawn } = simScenario({ players: 3, seed: 700 });
  s.teams[1] = s.teams[0]!;
  const e = s.e;
  const dropship = spawn(Kind.Dropship, 0, fx(300), fx(300));
  const enemyDropship = spawn(Kind.Dropship, 2, fx(340), fx(300));
  const marine = spawn(Kind.Marine, 0, fx(310), fx(300));
  const enemyMarine = spawn(Kind.Marine, 2, fx(320), fx(300));

  assertLoad(s, 0, { t: 'load', transport: dropship, unit: marine }, { ok: true });
  assertLoad(s, 0, { t: 'load', transport: enemyDropship, unit: marine }, { ok: false, reason: 'wrong-owner' });
  assertLoad(s, 0, { t: 'load', transport: dropship, unit: enemyMarine }, { ok: false, reason: 'wrong-owner' });
  assertLoad(s, 0, { t: 'load', transport: 999_999, unit: marine }, { ok: false, reason: 'stale-entity' });

  const entrance = slotOf(spawn(Kind.NydusCanal, 0, fx(700), fx(700)));
  const exit = slotOf(spawn(Kind.NydusCanal, 0, fx(880), fx(700)));
  const drone = slotOf(spawn(Kind.Drone, 1, fx(710), fx(700)));
  assertLoad(s, 1, { t: 'load', transport: eid(e, entrance), unit: eid(e, drone) }, { ok: true });

  e.container[drone] = eid(e, entrance);
  assertUnload(s, 1, {
    t: 'unload',
    transport: eid(e, entrance),
    unit: eid(e, drone),
    x: e.x[exit]! + fx(32),
    y: e.y[exit]!,
  }, { ok: true });
});
