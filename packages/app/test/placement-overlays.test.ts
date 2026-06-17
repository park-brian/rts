import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { placementFieldOverlays } from '../src/render2d.ts';
import { CREEP_RADIUS, Kind, POWER_RADIUS, fx, slotOf, spawnUnit } from '../src/sim.ts';

const raceGame = (races: readonly string[]): Game => {
  const g = new Game('play', 2468);
  g.restart('play', 2468, 1, races);
  g.resize(800, 600);
  return g;
};

const findSlot = (g: Game, kind: number, owner: number): number => {
  const e = g.sim.fullState().e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.kind[i] === kind && e.owner[i] === owner) return i;
  }
  throw new Error(`missing kind=${kind} owner=${owner}`);
};

test('placement overlays expose existing Pylon power and candidate Pylon fields', () => {
  const g = raceGame(['protoss', 'terran']);
  const s = g.sim.fullState();
  const e = s.e;
  const nexus = findSlot(g, Kind.Nexus, 0);
  const pylon = slotOf(spawnUnit(s, Kind.Pylon, 0, e.x[nexus]! + fx(160), e.y[nexus]!));

  g.placementGhost = { kind: Kind.Gateway, x: e.x[pylon]! + fx(64), y: e.y[pylon]!, ok: true };
  const powered = placementFieldOverlays(g, []);
  assert.ok(powered.some((o) => o.kind === 'power' && o.source === 'existing' &&
    o.x === e.x[pylon] && o.y === e.y[pylon] && o.radius === POWER_RADIUS));

  g.placementGhost = { kind: Kind.Pylon, x: e.x[nexus]! - fx(160), y: e.y[nexus]!, ok: true };
  const candidate = placementFieldOverlays(g, []);
  assert.ok(candidate.some((o) => o.kind === 'power' && o.source === 'candidate' &&
    o.x === g.placementGhost!.x && o.y === g.placementGhost!.y && o.radius === POWER_RADIUS));
});

test('placement overlays expose creep providers and candidate Zerg creep fields', () => {
  const g = raceGame(['zerg', 'terran']);
  const e = g.sim.fullState().e;
  const hatchery = findSlot(g, Kind.Hatchery, 0);

  g.placementGhost = { kind: Kind.CreepColony, x: e.x[hatchery]! + fx(96), y: e.y[hatchery]!, ok: true };

  const overlays = placementFieldOverlays(g, []);
  assert.ok(overlays.some((o) => o.kind === 'creep' && o.source === 'existing' &&
    o.x === e.x[hatchery] && o.y === e.y[hatchery] && o.radius === CREEP_RADIUS));
  assert.ok(overlays.some((o) => o.kind === 'creep' && o.source === 'candidate' &&
    o.x === g.placementGhost!.x && o.y === g.placementGhost!.y && o.radius === CREEP_RADIUS));
});
