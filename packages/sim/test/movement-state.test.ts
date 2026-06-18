import test from 'node:test';
import assert from 'node:assert/strict';
import { Kind, Order } from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import { spawnUnit } from '../src/factory.ts';
import { sliceMap } from '../src/map.ts';
import { eid, hashState, makeState, slotOf } from '../src/world.ts';
import { applyCommands } from '../src/systems/ingest.ts';
import { stepWorld } from '../src/tick.ts';
import { loadUnitInto, unloadUnit } from '../src/cargo.ts';
import { setBurrowed } from '../src/burrow.ts';
import { liftStructure, startStructureLanding } from '../src/terran-mobility.ts';
import { applyTransform } from '../src/unit-transform.ts';
import { tickStatusTimers } from '../src/systems/status.ts';
import { navigate } from '../src/pathing.ts';
import { localAvoidanceVelocity } from '../src/local-avoidance.ts';

const setVelocity = (s: ReturnType<typeof makeState>, slot: number): void => {
  s.e.vx[slot] = fx(5);
  s.e.vy[slot] = -fx(3);
};

const assertVelocityCleared = (s: ReturnType<typeof makeState>, slot: number): void => {
  assert.equal(s.e.vx[slot], 0);
  assert.equal(s.e.vy[slot], 0);
};

test('stop commands clear persistent movement velocity', () => {
  const s = makeState(sliceMap(), 1, 201);
  const id = spawnUnit(s, Kind.Marine, 0, fx(4 * 32), fx(4 * 32));
  const slot = slotOf(id);
  setVelocity(s, slot);

  const [result] = applyCommands(s, [{ player: 0, cmds: [{ t: 'stop', unit: id }] }]);

  assert.equal(result?.ok, true);
  assertVelocityCleared(s, slot);
});

test('ground movement accelerates through persisted velocity and stop prevents drift', () => {
  const s = makeState(sliceMap(), 1, 205);
  const id = spawnUnit(s, Kind.Marine, 0, fx(4 * 32), fx(4 * 32));
  const slot = slotOf(id);
  const x0 = s.e.x[slot]!;

  stepWorld(s, [{ player: 0, cmds: [{ t: 'move', unit: id, x: fx(10 * 32), y: s.e.y[slot]! }] }]);
  assert.equal(s.e.vx[slot], fx(1));
  assert.equal(s.e.vy[slot], 0);
  assert.equal(s.e.x[slot], x0 + fx(1));

  stepWorld(s, [{ player: 0, cmds: [{ t: 'stop', unit: id }] }]);
  assertVelocityCleared(s, slot);
  const stopped = `${s.e.x[slot]},${s.e.y[slot]}`;
  for (let t = 0; t < 8; t++) stepWorld(s, []);
  assert.equal(`${s.e.x[slot]},${s.e.y[slot]}`, stopped);
});

test('crossing ground movers settle deterministically with bounded velocity', () => {
  const run = (): { hash: number; stable: boolean } => {
    const s = makeState(sliceMap(), 1, 206);
    const a = slotOf(spawnUnit(s, Kind.Marine, 0, fx(5 * 32), fx(8 * 32)));
    const b = slotOf(spawnUnit(s, Kind.Marine, 0, fx(8 * 32), fx(5 * 32)));
    stepWorld(s, [{ player: 0, cmds: [
      { t: 'move', unit: eid(s.e, a), x: fx(11 * 32), y: fx(8 * 32) },
      { t: 'move', unit: eid(s.e, b), x: fx(8 * 32), y: fx(11 * 32) },
    ] }]);
    for (let t = 0; t < 220; t++) {
      stepWorld(s, []);
      assert.ok(Math.abs(s.e.vx[a]!) <= fx(2) && Math.abs(s.e.vy[a]!) <= fx(2));
      assert.ok(Math.abs(s.e.vx[b]!) <= fx(2) && Math.abs(s.e.vy[b]!) <= fx(2));
    }
    const before = `${s.e.x[a]},${s.e.y[a]}|${s.e.x[b]},${s.e.y[b]}`;
    for (let t = 0; t < 20; t++) stepWorld(s, []);
    return {
      hash: hashState(s),
      stable: before === `${s.e.x[a]},${s.e.y[a]}|${s.e.x[b]},${s.e.y[b]}` &&
        s.e.order[a] === Order.Idle &&
        s.e.order[b] === Order.Idle,
    };
  };

  const first = run();
  const second = run();
  assert.equal(first.stable, true);
  assert.equal(first.hash, second.hash);
});

test('ground arrival shaping eases exact destinations without overshoot', () => {
  const s = makeState(sliceMap(), 1, 207);
  const targetX = fx(8 * 32);
  const marine = slotOf(spawnUnit(s, Kind.Marine, 0, targetX - fx(6), fx(8 * 32)));
  s.e.vx[marine] = fx(2);

  const arrived = navigate(s, marine, targetX, s.e.y[marine]!, fx(2));

  assert.equal(arrived, false);
  assert.ok(s.e.x[marine]! < targetX, 'arrival easing should not overshoot the exact destination');
  assert.ok(s.e.vx[marine]! > 0 && s.e.vx[marine]! < fx(2), 'velocity should ease down inside the arrival band');
});

test('reciprocal avoidance adjusts velocity for predicted head-on overlap', () => {
  const s = makeState(sliceMap(), 1, 208);
  const a = slotOf(spawnUnit(s, Kind.Marine, 0, fx(10 * 32), fx(10 * 32)));
  const b = slotOf(spawnUnit(s, Kind.Marine, 0, fx(10 * 32) + fx(28), fx(10 * 32)));
  s.e.vx[b] = -fx(2);

  const adjusted = localAvoidanceVelocity(s, a, fx(2), 0, fx(2));

  assert.ok(adjusted.x > 0 && adjusted.x <= fx(2), 'head-on prediction should keep forward intent bounded');
  assert.notEqual(adjusted.y, 0, 'head-on prediction should introduce deterministic lateral separation');
});

test('containment transitions clear persistent movement velocity', () => {
  const s = makeState(sliceMap(), 1, 202);
  const transport = slotOf(spawnUnit(s, Kind.Dropship, 0, fx(5 * 32), fx(5 * 32)));
  const marine = slotOf(spawnUnit(s, Kind.Marine, 0, fx(5 * 32), fx(5 * 32)));

  setVelocity(s, marine);
  loadUnitInto(s, transport, marine);
  assertVelocityCleared(s, marine);

  setVelocity(s, marine);
  unloadUnit(s, marine, fx(6 * 32), fx(5 * 32));
  assertVelocityCleared(s, marine);
});

test('hard unit-state transitions clear persistent movement velocity', () => {
  const s = makeState(sliceMap(), 1, 203);
  const zergling = slotOf(spawnUnit(s, Kind.Zergling, 0, fx(4 * 32), fx(4 * 32)));
  const commandCenter = slotOf(spawnUnit(s, Kind.CommandCenter, 0, fx(8 * 32), fx(8 * 32)));
  const siegeTank = slotOf(spawnUnit(s, Kind.SiegeTank, 0, fx(12 * 32), fx(12 * 32)));

  setVelocity(s, zergling);
  setBurrowed(s, zergling, true);
  assertVelocityCleared(s, zergling);

  setVelocity(s, commandCenter);
  liftStructure(s, commandCenter);
  assertVelocityCleared(s, commandCenter);

  setVelocity(s, commandCenter);
  startStructureLanding(s, commandCenter, fx(9 * 32), fx(9 * 32));
  assertVelocityCleared(s, commandCenter);

  setVelocity(s, siegeTank);
  applyTransform(s, siegeTank, Kind.SiegeTankSieged);
  assertVelocityCleared(s, siegeTank);
});

test('disabling status timers clear persistent movement velocity', () => {
  const s = makeState(sliceMap(), 1, 204);
  const marine = slotOf(spawnUnit(s, Kind.Marine, 0, fx(4 * 32), fx(4 * 32)));
  setVelocity(s, marine);
  s.e.lockdownTimer[marine] = 10;

  tickStatusTimers(s.e);

  assertVelocityCleared(s, marine);
});
