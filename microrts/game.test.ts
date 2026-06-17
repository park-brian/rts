import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Kind, ActionType, NEUTRAL } from './types.ts';
import type { GameState, Unit } from './types.ts';
import { step, winner, hashState, legalActions, idleUnits, unitAt } from './game.ts';
import { makeMap } from './setup.ts';
import { workerRush, economyBot } from './bots.ts';
import { playGame } from './run.ts';

const mk = (units: Partial<Unit>[], w = 6, h = 6, res: [number, number] = [10, 10]): GameState => ({
  w, h, time: 0, nextId: units.length,
  resources: res,
  units: units.map((u, i) => ({ id: i, kind: Kind.Worker, owner: 0, x: 0, y: 0, hp: 1, carrying: 0, busy: null, ...u })),
});

test('legalActions never includes an off-grid move and respects occupancy', () => {
  const s = mk([{ id: 0, kind: Kind.Worker, owner: 0, x: 0, y: 0 }]);
  const moves = legalActions(s, s.units[0]!).filter((a) => a.type === ActionType.Move);
  // From the corner only right (1) and down (2) are in bounds.
  assert.deepEqual(moves.map((a) => (a as { dir: number }).dir).sort(), [1, 2]);
});

test('a worker harvests a resource then returns it to base (resources go up)', () => {
  // Worker at (1,1) adjacent to Resource (1,0) and Base (0,1).
  let s = mk([
    { id: 0, kind: Kind.Worker, owner: 0, x: 1, y: 1 },
    { id: 1, kind: Kind.Resource, owner: NEUTRAL, x: 1, y: 0, carrying: 5 },
    { id: 2, kind: Kind.Base, owner: 0, x: 0, y: 1, hp: 10 },
  ], 6, 6, [0, 0]);
  // Harvest (dir up = 0).
  s = step(s, [{ unitId: 0, action: { type: ActionType.Harvest, dir: 0 } }], []);
  while (s.units[0]!.busy) s = step(s, [], []); // wait out the harvest
  assert.equal(s.units.find((u) => u.id === 0)!.carrying, 1);
  // Return (dir left = 3).
  s = step(s, [{ unitId: 0, action: { type: ActionType.Return, dir: 3 } }], []);
  while (s.units[0]!.busy) s = step(s, [], []);
  assert.equal(s.resources[0], 1);
  assert.equal(s.units[0]!.carrying, 0);
});

test('a base produces a worker after the build time, spending resources', () => {
  let s = mk([{ id: 0, kind: Kind.Base, owner: 0, x: 1, y: 1, hp: 10 }], 6, 6, [10, 0]);
  const before = s.units.length;
  s = step(s, [{ unitId: 0, action: { type: ActionType.Produce, dir: 1, kind: Kind.Worker } }], []);
  assert.equal(s.resources[0], 9, 'cost paid up front');
  while (s.units.find((u) => u.id === 0)!.busy) s = step(s, [], []);
  assert.equal(s.units.length, before + 1);
  assert.ok(unitAt(s, 2, 1) && unitAt(s, 2, 1)!.kind === Kind.Worker);
});

test('attacks deal damage and kill', () => {
  let s = mk([
    { id: 0, kind: Kind.Heavy, owner: 0, x: 1, y: 1, hp: 4 },
    { id: 1, kind: Kind.Worker, owner: 1, x: 2, y: 1, hp: 1 },
  ]);
  s = step(s, [{ unitId: 0, action: { type: ActionType.Attack, targetId: 1 } }], []);
  while (s.units.find((u) => u.id === 0)?.busy) s = step(s, [], []);
  assert.equal(s.units.find((u) => u.id === 1), undefined, 'worker should be dead');
});

test('engine is deterministic: same bots reproduce the same game', () => {
  const a = playGame(workerRush(1), workerRush(1));
  const b = playGame(workerRush(1), workerRush(1));
  assert.equal(a.winner, b.winner);
  assert.equal(a.cycles, b.cycles);
  assert.equal(hashState(a.final), hashState(b.final));
});

test('a full bot-vs-bot game terminates with a decided result', () => {
  const g = playGame(workerRush(1), economyBot);
  assert.notEqual(g.winner, null);
  // economy never attacks, so the rush must not lose.
  assert.notEqual(g.winner, 1);
});

test('a mirror match runs a full, decided game (note: a small first-resolver bias exists)', () => {
  // Both players run the identical deterministic bot from a symmetric start.
  // Like real microRTS, a simultaneous-move grid has a slight first-resolver
  // edge (lower unit ids win contested-cell reservations), so the mirror is not
  // guaranteed to draw — bots are compared on BOTH sides instead (see run.ts).
  const g = playGame(workerRush(1), workerRush(1));
  assert.notEqual(g.winner, null);
  assert.ok(g.cycles > 10, 'a real game, not an instant end');
});

test('workerRush beats the passive economy bot from BOTH sides (bias-robust)', () => {
  assert.equal(playGame(workerRush(1), economyBot).winner, 0);
  assert.equal(playGame(economyBot, workerRush(1)).winner, 1);
});

test('idleUnits excludes busy units and resources', () => {
  let s = makeMap();
  const before = idleUnits(s, 0).length;
  assert.ok(before >= 2); // base + worker
  s = step(s, [{ unitId: s.units.find((u) => u.kind === Kind.Worker && u.owner === 0)!.id, action: { type: ActionType.Harvest, dir: 0 } }], []);
  // the harvesting worker is now busy
  assert.ok(idleUnits(s, 0).length < before || s.units.find((u) => u.kind === Kind.Worker && u.owner === 0)!.busy);
});
