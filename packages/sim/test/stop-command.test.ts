import test from 'node:test';
import assert from 'node:assert/strict';
import { validateStopCommand } from '../src/commands/stop.ts';
import { Kind, Order } from '../src/data/index.ts';
import { fx } from '../src/fixed.ts';
import { applyCommands } from '../src/commands/ingest.ts';
import { validateCommand } from '../src/commands/validate.ts';
import { NONE, slotOf } from '../src/entity/world.ts';
import { simScenario } from '../test-support/scenario.ts';
import type { Command, CommandRejectReason } from '../src/commands/types.ts';

type StopCommand = Extract<Command, { t: 'stop' }>;
type Expected = { ok: true } | { ok: false; reason: CommandRejectReason };
type EntityKey = 'marine' | 'enemy' | 'contained' | 'depot' | 'foundation' | 'stale';
type StopCase = { unit: EntityKey | number };

const expectStop = (input: StopCase, expected: Expected): void => {
  const scenario = simScenario({ players: 2, seed: 630 });
  const s = scenario.state;
  const e = s.e;
  const marine = scenario.spawn(Kind.Marine, 0, fx(300), fx(300));
  const enemy = scenario.spawn(Kind.Marine, 1, fx(330), fx(300));
  const contained = scenario.spawn(Kind.Marine, 0, fx(360), fx(300));
  const depot = scenario.spawn(Kind.SupplyDepot, 0, fx(390), fx(300));
  const foundation = scenario.spawn(Kind.SupplyDepot, 0, fx(420), fx(300));

  e.container[slotOf(contained)] = scenario.spawn(Kind.Dropship, 0, fx(360), fx(330));
  e.order[slotOf(foundation)] = Order.Build;

  const ids = { marine, enemy, contained, depot, foundation, stale: 999_999 };
  const resolve = (value: EntityKey | number): number => typeof value === 'number' ? value : ids[value];
  const command: StopCommand = { t: 'stop', unit: resolve(input.unit) };

  assert.deepEqual(validateStopCommand(s, 0, command), expected);
  assert.deepEqual(validateCommand(s, 0, command), expected);
};

test('stop validation lives in the stop command module', () => {
  expectStop({ unit: 'marine' }, { ok: true });
  expectStop({ unit: 'enemy' }, { ok: false, reason: 'wrong-owner' });
  expectStop({ unit: 'stale' }, { ok: false, reason: 'stale-entity' });
  expectStop({ unit: 'contained' }, { ok: false, reason: 'missing-capability' });
  expectStop({ unit: 'depot' }, { ok: false, reason: 'missing-capability' });
  expectStop({ unit: 'foundation' }, { ok: true });
});

test('stop command clears order state through public ingestion', () => {
  const scenario = simScenario({ players: 1, seed: 631 });
  const s = scenario.state;
  const e = s.e;
  const marine = scenario.spawn(Kind.Marine, 0, fx(300), fx(300));
  const enemy = scenario.spawn(Kind.Zergling, 0, fx(340), fx(300));
  const slot = slotOf(marine);

  e.order[slot] = Order.Attack;
  e.target[slot] = enemy;
  e.intentTarget[slot] = enemy;
  e.combatTarget[slot] = enemy;
  e.vx[slot] = fx(3);
  e.vy[slot] = -fx(2);
  e.settled[slot] = 1;

  const [result] = applyCommands(s, [{ player: 0, cmds: [{ t: 'stop', unit: marine }] }]);

  assert.deepEqual(result, { player: 0, index: 0, t: 'stop', ok: true });
  assert.equal(e.order[slot], Order.Idle);
  assert.equal(e.target[slot], NONE);
  assert.equal(e.intentTarget[slot], NONE);
  assert.equal(e.combatTarget[slot], NONE);
  assert.equal(e.vx[slot], 0);
  assert.equal(e.vy[slot], 0);
  assert.equal(e.settled[slot], 0);
});

test('stop command discards queued future orders', () => {
  const scenario = simScenario({ players: 1, seed: 632 });
  const s = scenario.state;
  const e = s.e;
  const marine = scenario.spawn(Kind.Marine, 0, fx(300), fx(300));
  const slot = slotOf(marine);

  scenario.sim.step([{ player: 0, cmds: [
    { t: 'move', unit: marine, x: fx(340), y: fx(300) },
    { t: 'move', unit: marine, x: fx(380), y: fx(300), queue: true },
  ] }]);
  assert.equal(e.orderQueueLen[slot], 1);

  const [result] = applyCommands(s, [{ player: 0, cmds: [{ t: 'stop', unit: marine }] }]);

  assert.deepEqual(result, { player: 0, index: 0, t: 'stop', ok: true });
  assert.equal(e.orderQueueLen[slot], 0);
  assert.equal(e.orderQueue0[slot], 0);
  assert.equal(e.orderQueueTarget0[slot], NONE);
  assert.equal(e.orderQueueX0[slot], 0);
  assert.equal(e.orderQueueY0[slot], 0);
});
