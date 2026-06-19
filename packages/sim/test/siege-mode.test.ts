import test from 'node:test';
import assert from 'node:assert/strict';
import { Kind, Order, Tech, Units } from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import { eid, slotOf } from '../src/entity/world.ts';
import { parseReplay } from '../src/replay.ts';
import { simScenario } from '../test-support/scenario.ts';

test('siege transform requires research and preserves unit state', () => {
  const { sim, state: s, spawn, grant } = simScenario({ players: 1, seed: 150 });
  const e = s.e;
  const tank = slotOf(spawn(Kind.SiegeTank, 0, fx(700), fx(700)));
  e.hp[tank] = 91;

  const blocked = sim.step([{ player: 0, cmds: [{ t: 'transform', unit: eid(e, tank), kind: Kind.SiegeTankSieged }] }]);
  assert.deepEqual(blocked, [{ player: 0, index: 0, t: 'transform', ok: false, reason: 'missing-requirement' }]);
  assert.equal(e.kind[tank], Kind.SiegeTank);

  grant(0, Tech.SiegeTech);
  const accepted = sim.step([{ player: 0, cmds: [{ t: 'transform', unit: eid(e, tank), kind: Kind.SiegeTankSieged }] }]);
  assert.deepEqual(accepted, [{ player: 0, index: 0, t: 'transform', ok: true }]);
  assert.equal(e.kind[tank], Kind.SiegeTankSieged);
  assert.equal(e.hp[tank], 91);
  assert.equal(e.order[tank], Order.Idle);
  assert.equal(e.flags[tank], Units[Kind.SiegeTankSieged]!.roles);

  const move = sim.step([{ player: 0, cmds: [{ t: 'move', unit: eid(e, tank), x: fx(900), y: fx(700) }] }]);
  assert.deepEqual(move, [{ player: 0, index: 0, t: 'move', ok: false, reason: 'missing-capability' }]);

  const unsiege = sim.step([{ player: 0, cmds: [{ t: 'transform', unit: eid(e, tank), kind: Kind.SiegeTank }] }]);
  assert.deepEqual(unsiege, [{ player: 0, index: 0, t: 'transform', ok: true }]);
  assert.equal(e.kind[tank], Kind.SiegeTank);
});

test('sieged tank respects minimum range and deals splash around the target', () => {
  const { sim, state: s, spawn } = simScenario({ seed: 151 });
  const e = s.e;
  const tank = slotOf(spawn(Kind.SiegeTankSieged, 0, fx(700), fx(700)));
  const close = slotOf(spawn(Kind.SupplyDepot, 1, fx(730), fx(700)));
  const target = slotOf(spawn(Kind.SupplyDepot, 1, fx(900), fx(700)));
  const splash = slotOf(spawn(Kind.SupplyDepot, 1, fx(930), fx(700)));
  const friendly = slotOf(spawn(Kind.SupplyDepot, 0, fx(900), fx(730)));
  const air = slotOf(spawn(Kind.Wraith, 1, fx(900), fx(730)));
  const closeHp = e.hp[close]!;
  const splashHp = e.hp[splash]!;
  const friendlyHp = e.hp[friendly]!;
  const airHp = e.hp[air]!;

  sim.step([{ player: 0, cmds: [{ t: 'attack', unit: eid(e, tank), target: eid(e, close) }] }]);
  for (let i = 0; i < Units[Kind.SiegeTankSieged]!.weapon!.cooldown + 2; i++) sim.step([]);
  assert.equal(e.hp[close], closeHp, 'minimum range prevents the close shot');

  sim.step([{ player: 0, cmds: [{ t: 'attack', unit: eid(e, tank), target: eid(e, target) }] }]);
  for (let i = 0; i < Units[Kind.SiegeTankSieged]!.weapon!.cooldown + 2; i++) sim.step([]);

  assert.ok(e.hp[target]! < Units[Kind.SupplyDepot]!.hp, 'target takes direct siege damage');
  assert.ok(e.hp[splash]! < splashHp, 'nearby ground enemy takes splash');
  assert.ok(e.hp[friendly]! < friendlyHp, 'siege splash includes friendly fire');
  assert.equal(e.hp[air], airHp, 'air units are not affected by ground siege splash');
});

test('replay parser accepts transform commands', () => {
  const replay = parseReplay(JSON.stringify({
    version: 1,
    map: { kind: 'slice' },
    players: 1,
    seed: 1,
    frames: [[{ player: 0, cmds: [{ t: 'transform', unit: 1, kind: Kind.SiegeTankSieged }] }]],
  }));

  assert.deepEqual(replay.frames[0]![0]!.cmds[0], { t: 'transform', unit: 1, kind: Kind.SiegeTankSieged });
});
