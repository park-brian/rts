import test from 'node:test';
import assert from 'node:assert/strict';
import { fieldAffordances, visibilityAffordances } from '../src/visibility-affordances.ts';
import type { Game } from '../src/game.ts';
import { EffectKind, ONE, Sim, TILE, fx, sliceMap, spawnEffect } from '../src/sim.ts';

const tileCenter = (t: number): number => fx(t * TILE + TILE / 2);

const fakeGame = (sim: Sim, human = 0): Game => {
  const s = sim.fullState();
  return {
    sim,
    human,
    tileVisible(tx: number, ty: number): number {
      if (tx < 0 || ty < 0 || tx >= s.map.w || ty >= s.map.h) return 0;
      return s.vision[human]![ty * s.map.w + tx]!;
    },
  } as unknown as Game;
};

test('visibility affordances show own scanner sweep without leaking hidden enemy scans', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 801, vision: true });
  const s = sim.fullState();
  const farX = tileCenter(54);
  const farY = tileCenter(54);
  spawnEffect(s, EffectKind.ScannerSweep, 1, farX, farY, fx(5 * TILE), 20, 0, 0);

  assert.deepEqual(visibilityAffordances(fakeGame(sim)), []);

  spawnEffect(s, EffectKind.ScannerSweep, 0, farX, farY, fx(5 * TILE), 20, 0, 0);

  const shown = visibilityAffordances(fakeGame(sim));
  assert.equal(shown.length, 1);
  assert.equal(shown[0]?.kind, 'scan');
  assert.equal(shown[0]?.x, farX / ONE);
});

test('nuclear warning affordance respects fog knowledge', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 802, vision: true });
  const s = sim.fullState();
  const tx = 54;
  const ty = 54;
  const x = tileCenter(tx);
  const y = tileCenter(ty);
  spawnEffect(s, EffectKind.NuclearStrike, 1, x, y, fx(6 * TILE), 40, 0, 500);

  assert.deepEqual(visibilityAffordances(fakeGame(sim)), []);

  s.vision[0]![ty * s.map.w + tx] = 1;

  const shown = visibilityAffordances(fakeGame(sim));
  assert.equal(shown.length, 1);
  assert.equal(shown[0]?.kind, 'nuke');
  assert.equal(shown[0]?.timer, 40);
});

test('spell field affordances expose visible persistent fields', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 803, vision: true });
  const s = sim.fullState();
  const tx = 54;
  const ty = 54;
  const x = tileCenter(tx);
  const y = tileCenter(ty);
  spawnEffect(s, EffectKind.PsionicStorm, 1, x, y, fx(2 * TILE), 18, 2, 14);

  assert.deepEqual(fieldAffordances(fakeGame(sim)), []);

  s.vision[0]![ty * s.map.w + tx] = 2;
  const shown = fieldAffordances(fakeGame(sim));
  assert.equal(shown.length, 1);
  assert.equal(shown[0]?.kind, 'storm');
  assert.equal(shown[0]?.timer, 18);
});
