import test from 'node:test';
import assert from 'node:assert/strict';
import { entityLifecycle } from '../src/entity-lifecycle.ts';
import { Kind, Order, Tech, Units } from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import { slotOf } from '../src/world.ts';
import { simScenario } from '../test-support/scenario.ts';

test('entityLifecycle reports dead and complete entities without progress', () => {
  const { state: s, spawn } = simScenario({ seed: 9001 });
  const marine = slotOf(spawn(Kind.Marine, 0, fx(400), fx(400)));

  assert.deepEqual(entityLifecycle(s, marine), {
    state: 'complete',
    label: 'Complete',
    detail: '',
    progress: 0,
    remaining: 0,
    total: 0,
    displayKind: Kind.Marine,
    sourceKind: Kind.Marine,
    targetKind: Kind.Marine,
    busy: false,
    cancelable: false,
  });

  s.e.alive[marine] = 0;
  assert.equal(entityLifecycle(s, marine).state, 'dead');
  assert.equal(entityLifecycle(s, marine).busy, false);
});

test('entityLifecycle classifies unfinished construction and warp-ins with cancelability', () => {
  const { state: s, spawn } = simScenario({ seed: 9002 });
  const depot = slotOf(spawn(Kind.SupplyDepot, 0, fx(400), fx(400)));
  s.e.built[depot] = 0;
  s.e.ctimer[depot] = Math.floor(Units[Kind.SupplyDepot]!.buildTime / 2);
  s.e.buildCostMinerals[depot] = Units[Kind.SupplyDepot]!.minerals;

  let life = entityLifecycle(s, depot);
  assert.equal(life.state, 'constructing');
  assert.equal(life.label, 'Building');
  assert.equal(life.detail, 'Supply Depot');
  assert.equal(life.cancelable, true);
  assert.ok(life.progress > 0.45 && life.progress < 0.55);

  const gateway = slotOf(spawn(Kind.Gateway, 0, fx(500), fx(400)));
  s.e.built[gateway] = 0;
  s.e.ctimer[gateway] = 100;
  s.e.buildCostMinerals[gateway] = Units[Kind.Gateway]!.minerals;
  life = entityLifecycle(s, gateway);
  assert.equal(life.state, 'constructing');
  assert.equal(life.label, 'Warping');
  assert.equal(life.cancelable, true);
});

test('entityLifecycle distinguishes zerg morphs from protoss merge summons', () => {
  const { sim, state: s, spawn, grant } = simScenario({ seed: 9003 });
  const hydra = spawn(Kind.Hydralisk, 0, fx(400), fx(400));
  spawn(Kind.HydraliskDen, 0, fx(500), fx(400));
  grant(0, Tech.LurkerAspect);
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  assert.deepEqual(sim.step([{ player: 0, cmds: [{ t: 'transform', unit: hydra, kind: Kind.Lurker }] }]), [
    { player: 0, index: 0, t: 'transform', ok: true },
  ]);
  let life = entityLifecycle(s, slotOf(hydra));
  assert.equal(life.state, 'morphing');
  assert.equal(life.label, 'Morphing');
  assert.equal(life.sourceKind, Kind.Hydralisk);
  assert.equal(life.targetKind, Kind.Lurker);
  assert.equal(life.cancelable, true);

  const a = spawn(Kind.HighTemplar, 0, fx(700), fx(400));
  const b = spawn(Kind.HighTemplar, 0, fx(732), fx(400));
  assert.deepEqual(sim.step([{ player: 0, cmds: [{ t: 'transform', unit: a, kind: Kind.Archon, target: b }] }]), [
    { player: 0, index: 0, t: 'transform', ok: true },
  ]);
  life = entityLifecycle(s, slotOf(a));
  assert.equal(life.state, 'merging');
  assert.equal(life.label, 'Summoning');
  assert.equal(life.targetKind, Kind.Archon);
  assert.equal(life.cancelable, false);
});

test('entityLifecycle reports active production, research, and channeling', () => {
  const { state: s, spawn } = simScenario({ seed: 9004 });
  const barracks = slotOf(spawn(Kind.Barracks, 0, fx(400), fx(400)));
  s.e.prodKind[barracks] = Kind.Marine;
  s.e.prodTimer[barracks] = Math.floor(Units[Kind.Marine]!.buildTime / 2);
  s.e.prodQueued[barracks] = 1;

  let life = entityLifecycle(s, barracks);
  assert.equal(life.state, 'training');
  assert.equal(life.label, 'Training');
  assert.equal(life.detail, 'Marine +1');
  assert.equal(life.targetKind, Kind.Marine);
  assert.ok(life.progress > 0.45 && life.progress < 0.55);

  s.e.prodKind[barracks] = Kind.None;
  s.e.prodTimer[barracks] = 0;
  s.e.prodQueued[barracks] = 0;
  s.e.researchKind[barracks] = Tech.StimPack;
  s.e.researchTimer[barracks] = 12;
  life = entityLifecycle(s, barracks);
  assert.equal(life.state, 'researching');
  assert.equal(life.label, 'Researching');
  assert.equal(life.detail, 'Stim Pack');
  assert.equal(life.targetKind, Tech.StimPack);

  s.e.researchKind[barracks] = Kind.None;
  s.e.researchTimer[barracks] = 0;
  s.e.order[barracks] = Order.Cast;
  life = entityLifecycle(s, barracks);
  assert.equal(life.state, 'channeling');
  assert.equal(life.label, 'Casting');
  assert.equal(life.busy, true);
});
