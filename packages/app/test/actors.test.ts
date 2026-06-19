import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import {
  actorDef,
  actorRenderPresentation,
  isUserCommandableKind,
  Kind, ONE, eid, fx, slotOf, spawnUnit,
} from '../src/sim.ts';

const screenOf = (g: Game, id: number): { x: number; y: number } => {
  const e = g.sim.fullState().e;
  const slot = slotOf(id);
  return {
    x: (e.x[slot]! / ONE - g.camX) * g.zoom,
    y: (e.y[slot]! / ONE - g.camY) * g.zoom,
  };
};

test('projectile actor presentation stays readable without changing gameplay radius', () => {
  assert.equal(actorRenderPresentation(Kind.Scarab, 3, 0.5).role, 'projectile');
  assert.equal(actorRenderPresentation(Kind.Interceptor, 3, 0.5).role, 'unit');
  assert.equal(actorDef(Kind.Scarab)?.presentation, 'projectile');
  assert.equal(actorDef(Kind.Interceptor)?.commandable, false);
  assert.equal(actorRenderPresentation(Kind.Scarab, 3, 0.5).radius, 10);
  assert.equal(actorRenderPresentation(Kind.Marine, 8, 0.5).radius, 8);
  assert.equal(actorRenderPresentation(Kind.Scarab, 3, 0.5).minimapVisible, false);
});

test('internal actors do not steal selection hit tests', () => {
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
