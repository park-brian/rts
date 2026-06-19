import test from 'node:test';
import assert from 'node:assert/strict';
import { Kind, Order, Units } from '../src/data/index.ts';
import { validatePatrolCommand } from '../src/commands/patrol.ts';
import { validateCommand } from '../src/commands/validate.ts';
import { fx } from '../src/fixed.ts';
import { REPLAY_VERSION, parseReplay } from '../src/io/replay.ts';
import { deserializeState, serializeState } from '../src/io/serialize.ts';
import { hashState, slotOf } from '../src/entity/world.ts';
import { simScenario } from '../test-support/scenario.ts';
import type { CommandRejectReason } from '../src/commands/types.ts';

type Expected = { ok: true } | { ok: false; reason: CommandRejectReason };
type PatrolCase = 'marine' | 'dropship' | 'enemy' | 'depot' | 'mine' | 'stale';

const assertPatrol = (unitKey: PatrolCase, expected: Expected): void => {
  const scenario = simScenario({ players: 2, seed: 664 });
  const s = scenario.state;
  const marine = scenario.spawn(Kind.Marine, 0, fx(300), fx(300));
  const dropship = scenario.spawn(Kind.Dropship, 0, fx(340), fx(300));
  const enemy = scenario.spawn(Kind.Marine, 1, fx(380), fx(300));
  const depot = scenario.spawn(Kind.SupplyDepot, 0, fx(420), fx(300));
  const mine = scenario.spawn(Kind.SpiderMine, 0, fx(460), fx(300));
  const ids = { marine, dropship, enemy, depot, mine, stale: 999_999 };
  const command = { t: 'patrol' as const, unit: ids[unitKey], x: fx(700), y: fx(300) };

  assert.deepEqual(validatePatrolCommand(s, 0, command), expected);
  assert.deepEqual(validateCommand(s, 0, command), expected);
};

test('patrol validation lives in the patrol command module', () => {
  assertPatrol('marine', { ok: true });
  assertPatrol('dropship', { ok: true });
  assertPatrol('enemy', { ok: false, reason: 'wrong-owner' });
  assertPatrol('depot', { ok: false, reason: 'missing-capability' });
  assertPatrol('mine', { ok: false, reason: 'missing-capability' });
  assertPatrol('stale', { ok: false, reason: 'stale-entity' });
});

test('patrol alternates between destination and origin using serialized route state', () => {
  const scenario = simScenario({ players: 1, seed: 665 });
  const s = scenario.state;
  const marine = scenario.spawn(Kind.Marine, 0, fx(300), fx(300));
  const slot = slotOf(marine);
  const origin = { x: s.e.x[slot]!, y: s.e.y[slot]! };
  const destination = { x: fx(360), y: fx(300) };

  const [result] = scenario.sim.step([{ player: 0, cmds: [{ t: 'patrol', unit: marine, ...destination }] }]);
  assert.equal(result?.ok, true);
  assert.equal(s.e.order[slot], Order.Patrol);
  assert.equal(s.e.tx[slot], destination.x);
  assert.equal(s.e.patrolX[slot], origin.x);

  const hash = hashState(s);
  const restored = deserializeState(serializeState(s));
  assert.equal(hashState(restored), hash, 'patrol route columns round-trip into hashes');
  restored.e.patrolX[slot] = restored.e.patrolX[slot]! + 1;
  assert.notEqual(hashState(restored), hash, 'patrol route columns participate in desync hashes');

  for (let i = 0; i < 120 && s.e.tx[slot] !== origin.x; i++) scenario.sim.step([]);

  assert.equal(s.e.order[slot], Order.Patrol);
  assert.equal(s.e.tx[slot], origin.x);
  assert.equal(s.e.ty[slot], origin.y);
  assert.equal(s.e.patrolX[slot], destination.x);
  assert.equal(s.e.patrolY[slot], destination.y);
});

test('queued patrol starts after current travel using the live start point', () => {
  const scenario = simScenario({ players: 1, seed: 667 });
  const s = scenario.state;
  const marine = scenario.spawn(Kind.Marine, 0, fx(300), fx(300));
  const slot = slotOf(marine);
  const currentOrder = (): number => s.e.order[slot]!;
  const movePoint = { x: fx(340), y: fx(300) };
  const patrolPoint = { x: fx(400), y: fx(300) };

  const results = scenario.sim.step([{ player: 0, cmds: [
    { t: 'move', unit: marine, ...movePoint },
    { t: 'patrol', unit: marine, ...patrolPoint, queue: true },
  ] }]);

  assert.deepEqual(results, [
    { player: 0, index: 0, t: 'move', ok: true },
    { player: 0, index: 1, t: 'patrol', ok: true },
  ]);
  assert.equal(currentOrder(), Order.Move);
  assert.equal(s.e.orderQueueLen[slot], 1);

  for (let i = 0; i < 120 && currentOrder() !== Order.Patrol; i++) scenario.sim.step([]);

  assert.equal(currentOrder(), Order.Patrol);
  assert.equal(s.e.orderQueueLen[slot], 0);
  assert.equal(s.e.tx[slot], patrolPoint.x);
  assert.equal(s.e.ty[slot], patrolPoint.y);
  assert.equal(s.e.patrolX[slot], s.e.x[slot]);
  assert.equal(s.e.patrolY[slot], s.e.y[slot]);
});

test('patrol engages enemies encountered without losing the patrol route', () => {
  const scenario = simScenario({ players: 2, seed: 666 });
  const s = scenario.state;
  const marine = scenario.spawn(Kind.Marine, 0, fx(300), fx(300));
  const enemy = scenario.spawn(Kind.Zergling, 1, fx(430), fx(300));
  const marineSlot = slotOf(marine);
  const enemySlot = slotOf(enemy);

  scenario.sim.step([{ player: 0, cmds: [{ t: 'patrol', unit: marine, x: fx(700), y: fx(300) }] }]);
  for (let i = 0; i < 80 && s.e.hp[enemySlot] === Units[Kind.Zergling]!.hp; i++) scenario.sim.step([]);

  assert.equal(s.e.order[marineSlot], Order.Patrol);
  assert.ok(s.e.hp[enemySlot]! < Units[Kind.Zergling]!.hp);
  assert.equal(s.e.patrolX[marineSlot], fx(300));
  assert.equal(s.e.patrolY[marineSlot], fx(300));
});

test('replay parser accepts patrol commands', () => {
  const replay = parseReplay(JSON.stringify({
    version: REPLAY_VERSION,
    map: { kind: 'slice' },
    players: 1,
    seed: 1,
    frames: [[{ player: 0, cmds: [{ t: 'patrol', unit: 1, x: 100, y: 200, queue: true }] }]],
  }));

  assert.deepEqual(replay.frames[0]?.[0]?.cmds[0], { t: 'patrol', unit: 1, x: 100, y: 200, queue: true });
});
