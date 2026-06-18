import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import {
  isProjectilePresentationKind,
  isUserCommandableKind,
  readableProjectileRadius,
} from '../src/child-actors.ts';
import { Kind, ONE, childActorDef, eid, fx, slotOf, spawnUnit } from '../src/sim.ts';

const screenOf = (g: Game, id: number): { x: number; y: number } => {
  const e = g.sim.fullState().e;
  const slot = slotOf(id);
  return {
    x: (e.x[slot]! / ONE - g.camX) * g.zoom,
    y: (e.y[slot]! / ONE - g.camY) * g.zoom,
  };
};

test('projectile child actor presentation stays readable without changing gameplay radius', () => {
  assert.equal(isProjectilePresentationKind(Kind.Scarab), true);
  assert.equal(isProjectilePresentationKind(Kind.Interceptor), false);
  assert.equal(childActorDef(Kind.Scarab)?.presentation, 'projectile');
  assert.equal(childActorDef(Kind.Interceptor)?.commandable, false);
  assert.equal(readableProjectileRadius(Kind.Scarab, 3, 0.5), 10);
  assert.equal(readableProjectileRadius(Kind.Marine, 8, 0.5), 8);
});

test('internal child actors do not steal selection hit tests', () => {
  assert.equal(isUserCommandableKind(Kind.Scarab), false);
  assert.equal(isUserCommandableKind(Kind.Interceptor), false);
  assert.equal(isUserCommandableKind(Kind.Larva), true);

  const g = new Game('play', 7331);
  g.resize(480, 360);
  const s = g.sim.fullState();
  const scarab = spawnUnit(s, Kind.Scarab, 0, fx(1200), fx(1200));
  const interceptor = spawnUnit(s, Kind.Interceptor, 0, fx(1240), fx(1200));
  const scarabSlot = slotOf(scarab);
  const interceptorSlot = slotOf(interceptor);
  g.centerOn(1200, 1200);

  assert.equal(g.canSeeEntity(scarabSlot), true);
  assert.equal(g.canSeeEntity(interceptorSlot), true);
  assert.notEqual(g.hitTest(1200, 1200), scarab);
  assert.notEqual(g.hitTest(1240, 1200), interceptor);

  const p = screenOf(g, scarab);
  g.boxSelect(p.x - 20, p.y - 20, p.x + 60, p.y + 20);

  assert.equal(g.selection.has(eid(s.e, scarabSlot)), false);
  assert.equal(g.selection.has(eid(s.e, interceptorSlot)), false);
  assert.equal(g.selection.size, 0);
});
