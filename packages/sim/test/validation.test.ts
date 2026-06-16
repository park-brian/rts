import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/sim.ts';
import { sliceMap } from '../src/map.ts';
import { count, eid, kill, slotOf } from '../src/world.ts';
import { spawnUnit } from '../src/factory.ts';
import { Kind, Order, Units } from '../src/data.ts';
import { fx } from '../src/fixed.ts';

const findSlot = (sim: Sim, pred: (slot: number) => boolean): number => {
  const e = sim.fullState().e;
  for (let i = 0; i < e.hi; i++) if (e.alive[i] === 1 && pred(i)) return i;
  throw new Error('slot not found');
};

test('invalid commands do not mutate incompatible recipients', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 101 });
  const s = sim.fullState();
  const marine = slotOf(spawnUnit(s, Kind.Marine, 0, fx(360), fx(360)));
  const ownScv = findSlot(sim, (i) => s.e.kind[i] === Kind.SCV && s.e.owner[i] === 0);
  const cc = findSlot(sim, (i) => s.e.kind[i] === Kind.CommandCenter && s.e.owner[i] === 0);
  const mineral = findSlot(sim, (i) => s.e.kind[i] === Kind.Mineral);

  sim.step([{ player: 0, cmds: [
    { t: 'harvest', unit: eid(s.e, marine), patch: eid(s.e, mineral) },
    { t: 'move', unit: eid(s.e, cc), x: fx(100), y: fx(100) },
    { t: 'attack', unit: eid(s.e, marine), target: eid(s.e, ownScv) },
  ] }]);

  assert.equal(s.e.order[marine], Order.Idle, 'marine ignored invalid harvest/own attack');
  assert.equal(s.e.order[cc], Order.Idle, 'structure ignored move command');
});

test('build placement rejects occupied structures and resources without spending minerals', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 102 });
  const s = sim.fullState();
  s.players.minerals[0] = 1_000;
  const scv = findSlot(sim, (i) => s.e.kind[i] === Kind.SCV && s.e.owner[i] === 0);
  const cc = findSlot(sim, (i) => s.e.kind[i] === Kind.CommandCenter && s.e.owner[i] === 0);
  const mineral = findSlot(sim, (i) => s.e.kind[i] === Kind.Mineral);
  const before = s.players.minerals[0]!;

  sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(s.e, scv), kind: Kind.SupplyDepot, x: s.e.x[cc]!, y: s.e.y[cc]! },
    { t: 'build', unit: eid(s.e, scv), kind: Kind.SupplyDepot, x: s.e.x[mineral]!, y: s.e.y[mineral]! },
  ] }]);

  assert.equal(s.players.minerals[0], before, 'rejected placements do not spend');
  assert.equal(s.e.order[scv], Order.Harvest, 'worker keeps previous order');
  assert.equal(count(s, Kind.SupplyDepot, 0), 0);
});

test('refinery placement snaps to a nearby geyser and rejects non-geyser placement', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 103 });
  const s = sim.fullState();
  s.players.minerals[0] = 1_000;
  const scv = findSlot(sim, (i) => s.e.kind[i] === Kind.SCV && s.e.owner[i] === 0);
  const cc = findSlot(sim, (i) => s.e.kind[i] === Kind.CommandCenter && s.e.owner[i] === 0);
  const geyser = findSlot(sim, (i) => s.e.kind[i] === Kind.Geyser);

  sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(s.e, scv), kind: Kind.Refinery, x: s.e.x[cc]!, y: s.e.y[cc]! },
  ] }]);
  assert.notEqual(s.e.buildKind[scv], Kind.Refinery, 'refinery cannot start away from a geyser');

  sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(s.e, scv), kind: Kind.Refinery, x: s.e.x[geyser]! + fx(8), y: s.e.y[geyser]! },
  ] }]);
  assert.equal(s.e.buildKind[scv], Kind.Refinery);
  assert.equal(s.e.tx[scv], s.e.x[geyser], 'build target snapped to geyser x');
  assert.equal(s.e.ty[scv], s.e.y[geyser], 'build target snapped to geyser y');
});

test('same-tick production reserves supply across multiple producers', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 104 });
  const s = sim.fullState();
  const e = s.e;
  const b1 = slotOf(spawnUnit(s, Kind.Barracks, 0, fx(700), fx(700)));
  const b2 = slotOf(spawnUnit(s, Kind.Barracks, 0, fx(820), fx(700)));
  for (let i = 0; i < 5; i++) spawnUnit(s, Kind.Marine, 0, fx(900 + i * 20), fx(760));
  s.players.minerals[0] = 1_000;

  sim.step([{ player: 0, cmds: [
    { t: 'train', building: eid(e, b1), kind: Kind.Marine },
    { t: 'train', building: eid(e, b2), kind: Kind.Marine },
  ] }]);

  const queued = (e.prodKind[b1] === Kind.Marine ? 1 : 0) + (e.prodKind[b2] === Kind.Marine ? 1 : 0);
  assert.equal(queued, 1, 'only one marine can be queued with one free supply');
});

test('stopping a pending worker build refunds the full cost', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 105 });
  const s = sim.fullState();
  const e = s.e;
  s.players.minerals[0] = 1_000;
  const scv = findSlot(sim, (i) => e.kind[i] === Kind.SCV && e.owner[i] === 0);
  const before = s.players.minerals[0]!;

  sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(e, scv), kind: Kind.SupplyDepot, x: fx(900), y: fx(900) },
  ] }]);
  assert.equal(s.players.minerals[0], before - Units[Kind.SupplyDepot]!.minerals);
  assert.equal(e.buildCostMinerals[scv], Units[Kind.SupplyDepot]!.minerals);

  sim.step([{ player: 0, cmds: [{ t: 'stop', unit: eid(e, scv) }] }]);

  assert.equal(s.players.minerals[0], before);
  assert.equal(e.order[scv], Order.Idle);
  assert.equal(e.buildKind[scv], Kind.None);
  assert.equal(e.buildCostMinerals[scv], 0);
  assert.equal(count(s, Kind.SupplyDepot, 0), 0);
});

test('retargeting a pending build refunds the old ledger before spending the new one', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 106 });
  const s = sim.fullState();
  const e = s.e;
  s.players.minerals[0] = Units[Kind.SupplyDepot]!.minerals;
  const scv = findSlot(sim, (i) => e.kind[i] === Kind.SCV && e.owner[i] === 0);

  sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(e, scv), kind: Kind.SupplyDepot, x: fx(900), y: fx(900) },
  ] }]);
  assert.equal(s.players.minerals[0], 0);

  sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(e, scv), kind: Kind.SupplyDepot, x: fx(1_050), y: fx(900) },
  ] }]);

  assert.equal(s.players.minerals[0], 0, 'old cost was refunded before the replacement spent');
  assert.equal(e.buildKind[scv], Kind.SupplyDepot);
  assert.equal(e.tx[scv], fx(1_050));
  assert.equal(e.buildCostMinerals[scv], Units[Kind.SupplyDepot]!.minerals);
});

test('killing a worker before foundation placement refunds its pending build', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 107 });
  const s = sim.fullState();
  const e = s.e;
  s.players.minerals[0] = 1_000;
  const scv = findSlot(sim, (i) => e.kind[i] === Kind.SCV && e.owner[i] === 0);
  const before = s.players.minerals[0]!;

  sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(e, scv), kind: Kind.SupplyDepot, x: fx(900), y: fx(900) },
  ] }]);
  kill(s, scv);

  assert.equal(s.players.minerals[0], before);
  assert.equal(e.buildCostMinerals[scv], 0);
});

test('canceling an unfinished foundation refunds 75 percent and removes it', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 108 });
  const s = sim.fullState();
  const e = s.e;
  s.players.minerals[0] = 1_000;
  const scv = slotOf(spawnUnit(s, Kind.SCV, 0, fx(900), fx(900)));
  const before = s.players.minerals[0]!;

  sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(e, scv), kind: Kind.SupplyDepot, x: fx(912), y: fx(900) },
  ] }]);

  const depot = findSlot(sim, (i) => e.kind[i] === Kind.SupplyDepot && e.owner[i] === 0 && e.built[i] === 0);
  assert.equal(e.buildCostMinerals[depot], Units[Kind.SupplyDepot]!.minerals);

  const foundationId = eid(e, depot);
  const results = sim.step([{ player: 0, cmds: [
    { t: 'cancelBuild', building: foundationId },
    { t: 'cancelBuild', building: foundationId },
  ] }]);

  assert.equal(s.players.minerals[0], before - 25);
  assert.equal(count(s, Kind.SupplyDepot, 0), 0);
  assert.deepEqual(results, [
    { player: 0, index: 0, t: 'cancelBuild', ok: true },
    { player: 0, index: 1, t: 'cancelBuild', ok: false, reason: 'stale-entity' },
  ]);
});

test('pending build footprints reserve space before foundations are placed', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 109 });
  const s = sim.fullState();
  const e = s.e;
  s.players.minerals[0] = 1_000;
  const scvA = slotOf(spawnUnit(s, Kind.SCV, 0, fx(700), fx(700)));
  const scvB = slotOf(spawnUnit(s, Kind.SCV, 0, fx(740), fx(700)));

  sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(e, scvA), kind: Kind.SupplyDepot, x: fx(1_000), y: fx(1_000) },
    { t: 'build', unit: eid(e, scvB), kind: Kind.SupplyDepot, x: fx(1_000), y: fx(1_000) },
  ] }]);

  const pending = [scvA, scvB].filter((slot) => e.buildKind[slot] === Kind.SupplyDepot).length;
  assert.equal(pending, 1);
  assert.equal(s.players.minerals[0], 1_000 - Units[Kind.SupplyDepot]!.minerals);
});

test('step returns deterministic command acceptance and rejection results', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 110 });
  const s = sim.fullState();
  const e = s.e;
  s.players.minerals[0] = 1_000;
  const scv = findSlot(sim, (i) => e.kind[i] === Kind.SCV && e.owner[i] === 0);
  const cc = findSlot(sim, (i) => e.kind[i] === Kind.CommandCenter && e.owner[i] === 0);

  const results = sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(e, scv), kind: Kind.SupplyDepot, x: e.x[cc]!, y: e.y[cc]! },
    { t: 'move', unit: eid(e, scv), x: fx(700), y: fx(700) },
  ] }]);

  assert.deepEqual(results, [
    { player: 0, index: 0, t: 'build', ok: false, reason: 'placement-blocked' },
    { player: 0, index: 1, t: 'move', ok: true },
  ]);
  assert.deepEqual(sim.lastCommandResults, results);
});
