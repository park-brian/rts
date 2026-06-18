import test from 'node:test';
import assert from 'node:assert/strict';
import { Kind } from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import { spawnUnit } from '../src/factory.ts';
import { sliceMap } from '../src/map.ts';
import { makeState, slotOf } from '../src/world.ts';
import { applyCommands } from '../src/systems/ingest.ts';
import { loadUnitInto, unloadUnit } from '../src/cargo.ts';
import { setBurrowed } from '../src/burrow.ts';
import { liftStructure, startStructureLanding } from '../src/terran-mobility.ts';
import { applyTransform } from '../src/unit-transform.ts';
import { tickStatusTimers } from '../src/systems/status.ts';

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
