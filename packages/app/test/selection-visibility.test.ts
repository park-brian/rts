import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { ui } from '../src/store.ts';
import { EffectKind, Kind, TILE, fx, slotOf, spawnEffect, spawnUnit } from '../src/sim.ts';

const freshGame = (): Game => {
  const g = new Game('play', 3210);
  g.resize(640, 700);
  g.queued = [];
  return g;
};

const publish = (g: Game): void => {
  g.fastForward(0);
};

const select = (g: Game, id: number): void => {
  g.selection.clear();
  g.selection.add(id);
  publish(g);
};

const tileCenter = (t: number): number => fx(t * TILE + TILE / 2);

test('selected own burrowed units publish cloaked and burrowed status without detected leak', () => {
  const g = freshGame();
  const s = g.sim.fullState();
  const lurker = spawnUnit(s, Kind.Lurker, 0, fx(400), fx(400));
  s.e.burrowed[slotOf(lurker)] = 1;

  select(g, lurker);

  assert.ok(ui.selectionView.value.status.stats.includes('Burrowed'));
  assert.ok(ui.selectionView.value.status.stats.includes('Cloaked'));
  assert.equal(ui.selectionView.value.status.stats.includes('Detected'), false);
});

test('selected own permanent cloak publishes cloaked status without asking enemy detection', () => {
  const g = freshGame();
  const s = g.sim.fullState();
  const templar = spawnUnit(s, Kind.DarkTemplar, 0, fx(400), fx(430));

  select(g, templar);

  assert.ok(ui.selectionView.value.status.stats.includes('Cloaked'));
  assert.equal(ui.selectionView.value.status.stats.includes('Detected'), false);
});

test('stale hidden enemy selections do not publish status through fog', () => {
  const g = freshGame();
  const s = g.sim.fullState();
  const hidden = spawnUnit(s, Kind.DarkTemplar, 1, tileCenter(54), tileCenter(54));

  select(g, hidden);

  assert.equal(ui.selectionView.value.count, 0);
  assert.equal(ui.selectionView.value.kindName, '');
  assert.deepEqual(ui.selectionView.value.status.stats, []);

  assert.equal(g.canSeeEntity(slotOf(hidden)), false);
  s.trackVision = false;
  assert.equal(g.canSeeEntity(slotOf(hidden)), true);
});

test('full-vision sessions keep hidden enemy selections visible for debugging', () => {
  const g = freshGame();
  g.restart('play', 3211, 1, ['terran', 'protoss'], 0, undefined, [0, 1], [true, true], true);
  const s = g.sim.fullState();
  const hidden = spawnUnit(s, Kind.DarkTemplar, 1, tileCenter(54), tileCenter(54));

  select(g, hidden);

  assert.equal(s.trackVision, false);
  assert.equal(g.canSeeEntity(slotOf(hidden)), true);
  assert.equal(ui.selectionView.value.count, 1);
  assert.equal(ui.selectionView.value.kindName, 'Dark Templar');
});

test('detected enemy cloak status only publishes after visibility and detection exist', () => {
  const g = freshGame();
  const s = g.sim.fullState();
  const tx = 54;
  const ty = 54;
  const x = tileCenter(tx);
  const y = tileCenter(ty);
  const enemy = spawnUnit(s, Kind.DarkTemplar, 1, x, y);
  s.vision[0]![ty * s.map.w + tx] = 2;
  spawnEffect(s, EffectKind.ScannerSweep, 0, x, y, fx(5 * TILE), 20, 0, 0);

  select(g, enemy);

  assert.equal(ui.selectionView.value.count, 1);
  assert.ok(ui.selectionView.value.status.stats.includes('Cloaked'));
  assert.ok(ui.selectionView.value.status.stats.includes('Detected'));
  assert.equal(g.canSeeEntity(slotOf(enemy)), true);
});

test('selected unit status labels come from sim presentation descriptors', () => {
  const g = freshGame();
  const s = g.sim.fullState();
  const marine = spawnUnit(s, Kind.Marine, 0, fx(400), fx(430));
  const slot = slotOf(marine);
  s.e.irradiateTimer[slot] = 8;
  s.e.plagueTimer[slot] = 15;

  select(g, marine);

  assert.ok(ui.selectionView.value.status.stats.includes('Irradiated'));
  assert.ok(ui.selectionView.value.status.stats.includes('Plagued'));
});
