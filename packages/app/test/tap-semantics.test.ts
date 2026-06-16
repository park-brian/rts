import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { ui } from '../src/store.ts';
import { Kind, ONE, Role, eid, slotOf } from '../src/sim.ts';

const freshGame = (): Game => {
  const g = new Game('play', 1234);
  g.resize(390, 844);
  const cc = findEntity(g, Kind.CommandCenter, 0);
  centerOnEntity(g, cc);
  g.queued = [];
  ui.placement.value = 0;
  ui.rally.value = false;
  ui.amove.value = false;
  return g;
};

const findEntity = (g: Game, kind: number, owner: number): number => {
  const e = g.sim.fullState().e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.kind[i] === kind && e.owner[i] === owner) return eid(e, i);
  }
  throw new Error(`missing entity kind=${kind} owner=${owner}`);
};

const findOwnedWorkers = (g: Game): number[] => {
  const e = g.sim.fullState().e;
  const ids: number[] = [];
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.owner[i] === 0 && (e.flags[i]! & Role.Worker) !== 0) ids.push(eid(e, i));
  }
  return ids;
};

const centerOnEntity = (g: Game, id: number): void => {
  const e = g.sim.fullState().e;
  const slot = slotOf(id);
  g.centerOn(e.x[slot]! / ONE, e.y[slot]! / ONE);
};

const screenOf = (g: Game, id: number): { x: number; y: number } => {
  const e = g.sim.fullState().e;
  const slot = slotOf(id);
  return {
    x: (e.x[slot]! / ONE - g.camX) * g.zoom,
    y: (e.y[slot]! / ONE - g.camY) * g.zoom,
  };
};

const select = (g: Game, ids: number[]): void => {
  g.selection.clear();
  for (const id of ids) g.selection.add(id);
};

test('normal tap on an owned building selects it instead of commanding selected workers', () => {
  const g = freshGame();
  const cc = findEntity(g, Kind.CommandCenter, 0);
  const workers = findOwnedWorkers(g);
  select(g, workers);

  const p = screenOf(g, cc);
  g.tap(p.x, p.y);

  assert.deepEqual([...g.selection], [cc]);
  assert.deepEqual(g.queued, []);
});

test('attack-move is an explicit target mode and consumes the next owned-entity tap', () => {
  const g = freshGame();
  const cc = findEntity(g, Kind.CommandCenter, 0);
  const workers = findOwnedWorkers(g);
  select(g, workers);
  ui.amove.value = true;

  const p = screenOf(g, cc);
  g.tap(p.x, p.y);

  assert.deepEqual(new Set(g.selection), new Set(workers));
  assert.equal(g.queued.length, workers.length);
  assert.ok(g.queued.every((c) => c.t === 'amove'));
  assert.equal(ui.amove.value, false);
});

test('production buildings set rally on a normal ground tap', () => {
  const g = freshGame();
  const cc = findEntity(g, Kind.CommandCenter, 0);
  select(g, [cc]);

  g.tap(g.viewW / 2 + 80, g.viewH / 2 + 80);

  assert.equal(g.queued.length, 1);
  assert.deepEqual(g.queued[0], {
    t: 'rally',
    building: cc,
    x: ((g.camX + (g.viewW / 2 + 80) / g.zoom) * ONE) | 0,
    y: ((g.camY + (g.viewH / 2 + 80) / g.zoom) * ONE) | 0,
  });
});

test('box select prefers units but falls back to buildings when no units are inside', () => {
  const g = freshGame();
  const cc = findEntity(g, Kind.CommandCenter, 0);
  const p = screenOf(g, cc);

  g.boxSelect(p.x - 2, p.y - 2, p.x + 2, p.y + 2);

  assert.deepEqual([...g.selection], [cc]);
});
