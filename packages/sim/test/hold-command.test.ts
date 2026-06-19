import test from 'node:test';
import assert from 'node:assert/strict';
import { Kind, Order, Units } from '../src/data/index.ts';
import { validateHoldCommand } from '../src/commands/hold.ts';
import { validateCommand } from '../src/commands/validate.ts';
import { fx } from '../src/fixed.ts';
import { REPLAY_VERSION, parseReplay } from '../src/io/replay.ts';
import { slotOf } from '../src/entity/world.ts';
import { simScenario } from '../test-support/scenario.ts';
import type { CommandRejectReason } from '../src/commands/types.ts';

type Expected = { ok: true } | { ok: false; reason: CommandRejectReason };
type HoldCase = 'marine' | 'enemy' | 'depot' | 'mine' | 'stale';

const assertHold = (unitKey: HoldCase, expected: Expected): void => {
  const scenario = simScenario({ players: 2, seed: 662 });
  const s = scenario.state;
  const marine = scenario.spawn(Kind.Marine, 0, fx(300), fx(300));
  const enemy = scenario.spawn(Kind.Marine, 1, fx(340), fx(300));
  const depot = scenario.spawn(Kind.SupplyDepot, 0, fx(380), fx(300));
  const mine = scenario.spawn(Kind.SpiderMine, 0, fx(420), fx(300));
  const ids = { marine, enemy, depot, mine, stale: 999_999 };
  const command = { t: 'hold' as const, unit: ids[unitKey] };

  assert.deepEqual(validateHoldCommand(s, 0, command), expected);
  assert.deepEqual(validateCommand(s, 0, command), expected);
};

test('hold validation lives in the hold command module', () => {
  assertHold('marine', { ok: true });
  assertHold('enemy', { ok: false, reason: 'wrong-owner' });
  assertHold('depot', { ok: false, reason: 'missing-capability' });
  assertHold('mine', { ok: false, reason: 'missing-capability' });
  assertHold('stale', { ok: false, reason: 'stale-entity' });
});

test('hold position fires in range without chasing out-of-range targets', () => {
  const scenario = simScenario({ players: 2, seed: 663 });
  const s = scenario.state;
  const marine = scenario.spawn(Kind.Marine, 0, fx(300), fx(300));
  const marineSlot = slotOf(marine);
  const marineX = s.e.x[marineSlot]!;
  const marineY = s.e.y[marineSlot]!;
  const range = Units[Kind.Marine]!.weapon!.range;
  const farMarine = scenario.spawn(Kind.Marine, 1, marineX + range + fx(40), marineY);
  s.e.order[slotOf(farMarine)] = Order.Hold;

  const [hold] = scenario.sim.step([{ player: 0, cmds: [{ t: 'hold', unit: marine }] }]);
  assert.equal(hold?.ok, true);
  assert.equal(s.e.order[marineSlot], Order.Hold);

  for (let i = 0; i < 40; i++) scenario.sim.step([]);

  assert.equal(s.e.x[marineSlot], marineX);
  assert.equal(s.e.y[marineSlot], marineY);
  assert.equal(s.e.hp[slotOf(farMarine)], Units[Kind.Marine]!.hp);

  const closeDepot = scenario.spawn(Kind.SupplyDepot, 1, marineX + Math.trunc(range / 2), marineY);
  for (let i = 0; i < 40; i++) scenario.sim.step([]);

  assert.equal(s.e.x[marineSlot], marineX);
  assert.ok(s.e.hp[slotOf(closeDepot)]! < Units[Kind.SupplyDepot]!.hp);
});

test('replay parser accepts hold commands', () => {
  const replay = parseReplay(JSON.stringify({
    version: REPLAY_VERSION,
    map: { kind: 'slice' },
    players: 1,
    seed: 1,
    frames: [[{ player: 0, cmds: [{ t: 'hold', unit: 1 }] }]],
  }));

  assert.deepEqual(replay.frames[0]?.[0]?.cmds[0], { t: 'hold', unit: 1 });
});
