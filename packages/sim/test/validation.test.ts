import test from 'node:test';
import assert from 'node:assert/strict';
import { type MapDef } from '../src/map/core.ts';
import { count, eid, kill, makeState, NEUTRAL, NONE, slotOf, type State } from '../src/entity/world.ts';
import { spawnUnit } from '../src/entity/factory.ts';
import { Ability, Kind, Order, Role, Tech, TILE, Units } from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import { snapBuildAnchor } from '../src/spatial/footprint.ts';
import { placementForStructure, validateCommand } from '../src/commands/validate.ts';
import { canPlayerGatherTarget, isGatherTarget } from '../src/mechanics/resources.ts';
import { simScenario } from '../test-support/scenario.ts';
import type { Command } from '../src/commands/types.ts';
import { stepWorld } from '../src/tick.ts';
import { setTechLevel } from '../src/tech.ts';

const findSlot = (s: State, pred: (slot: number) => boolean): number => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) if (e.alive[i] === 1 && pred(i)) return i;
  throw new Error('slot not found');
};

const snapped = (px: number): number => fx(Math.floor(px / TILE) * TILE + TILE / 2);
const tc = (t: number): number => fx(t * TILE + (TILE >> 1));
const open = (resources: MapDef['resources'] = []): MapDef => {
  const w = 32;
  const h = 32;
  return {
    name: 'open',
    w,
    h,
    walk: new Uint8Array(w * h).fill(1),
    build: new Uint8Array(w * h).fill(1),
    elev: new Uint8Array(w * h),
    starts: [],
    resources,
    teams: [],
  };
};

test('invalid commands do not mutate incompatible recipients', () => {
  const { sim, state: s, spawn } = simScenario({ players: 2, seed: 101 });
  const marine = slotOf(spawn(Kind.Marine, 0, fx(360), fx(360)));
  const ownScv = findSlot(s, (i) => s.e.kind[i] === Kind.SCV && s.e.owner[i] === 0);
  const cc = findSlot(s, (i) => s.e.kind[i] === Kind.CommandCenter && s.e.owner[i] === 0);
  const mineral = findSlot(s, (i) => s.e.kind[i] === Kind.Mineral);

  sim.step([{ player: 0, cmds: [
    { t: 'harvest', unit: eid(s.e, marine), patch: eid(s.e, mineral) },
    { t: 'move', unit: eid(s.e, cc), x: fx(100), y: fx(100) },
    { t: 'attack', unit: eid(s.e, marine), target: eid(s.e, ownScv) },
  ] }]);

  assert.equal(s.e.order[marine], Order.Idle, 'marine ignored invalid harvest/own attack');
  assert.equal(s.e.order[cc], Order.Idle, 'structure ignored move command');
});

test('commands clear stale movement and combat targets at command boundaries', () => {
  const s = makeState(open(), 2, 116);
  const e = s.e;
  const spawn = (kind: number, owner: number, x: number, y: number): number => spawnUnit(s, kind, owner, x, y);
  s.players.minerals[0] = 10_000;
  s.players.gas[0] = 10_000;
  setTechLevel(s, 0, Tech.StimPack, 1);
  setTechLevel(s, 0, Tech.Burrow, 1);
  setTechLevel(s, 0, Tech.SiegeTech, 1);

  const staleTarget = spawn(Kind.Marine, 0, tc(3), tc(3));
  const enemy = spawn(Kind.Zealot, 1, tc(7), tc(5));
  spawn(Kind.CommandCenter, 0, tc(25), tc(15));
  const mark = (id: number): number => {
    const slot = slotOf(id);
    e.intentTarget[slot] = staleTarget;
    e.combatTarget[slot] = enemy;
    return slot;
  };
  const stepOk = (cmd: Command): void => {
    const result = stepWorld(s, [{ player: 0, cmds: [cmd] }]);
    assert.equal(result[0]?.ok, true, `${cmd.t} should be accepted`);
  };

  const marine = spawn(Kind.Marine, 0, tc(5), tc(5));
  stepOk({ t: 'attack', unit: marine, target: enemy });
  assert.equal(e.intentTarget[mark(marine)], staleTarget, 'test should be able to dirty intent after attack');
  assert.equal(e.combatTarget[slotOf(marine)], enemy);
  stepOk({ t: 'attack', unit: marine, target: enemy });
  assert.equal(e.intentTarget[slotOf(marine)], NONE);
  assert.equal(e.combatTarget[slotOf(marine)], enemy);

  const mover = spawn(Kind.Marine, 0, tc(5), tc(6));
  mark(mover);
  stepOk({ t: 'move', unit: mover, x: tc(6), y: tc(6) });
  assert.equal(e.intentTarget[slotOf(mover)], NONE);
  assert.equal(e.combatTarget[slotOf(mover)], NONE);

  const attacker = spawn(Kind.Marine, 0, tc(25), tc(25));
  mark(attacker);
  stepOk({ t: 'amove', unit: attacker, x: tc(26), y: tc(25) });
  assert.equal(e.intentTarget[slotOf(attacker)], NONE);
  assert.equal(e.combatTarget[slotOf(attacker)], NONE);

  const stopper = spawn(Kind.Marine, 0, tc(25), tc(27));
  mark(stopper);
  stepOk({ t: 'stop', unit: stopper });
  assert.equal(e.intentTarget[slotOf(stopper)], NONE);
  assert.equal(e.combatTarget[slotOf(stopper)], NONE);

  const mineral = spawn(Kind.Mineral, NEUTRAL, tc(9), tc(5));
  const harvester = spawn(Kind.SCV, 0, tc(8), tc(6));
  mark(harvester);
  stepOk({ t: 'harvest', unit: harvester, patch: mineral });
  assert.equal(e.intentTarget[slotOf(harvester)], NONE);
  assert.equal(e.combatTarget[slotOf(harvester)], NONE);

  const depot = spawn(Kind.SupplyDepot, 0, tc(12), tc(5));
  e.hp[slotOf(depot)] = Units[Kind.SupplyDepot]!.hp - 20;
  const repairScv = spawn(Kind.SCV, 0, tc(11), tc(6));
  mark(repairScv);
  stepOk({ t: 'repair', unit: repairScv, target: depot });
  assert.equal(e.intentTarget[slotOf(repairScv)], NONE);
  assert.equal(e.combatTarget[slotOf(repairScv)], NONE);

  const builder = spawn(Kind.SCV, 0, tc(16), tc(6));
  mark(builder);
  stepOk({ t: 'build', unit: builder, kind: Kind.SupplyDepot, x: tc(18), y: tc(6) });
  assert.equal(e.intentTarget[slotOf(builder)], NONE);
  assert.equal(e.combatTarget[slotOf(builder)], NONE);

  const stimMarine = spawn(Kind.Marine, 0, tc(25), tc(29));
  mark(stimMarine);
  stepOk({ t: 'ability', unit: stimMarine, ability: Ability.StimPack });
  assert.equal(e.intentTarget[slotOf(stimMarine)], NONE);
  assert.equal(e.combatTarget[slotOf(stimMarine)], NONE);

  const zergling = spawn(Kind.Zergling, 0, tc(7), tc(8));
  mark(zergling);
  stepOk({ t: 'burrow', unit: zergling, active: true });
  assert.equal(e.intentTarget[slotOf(zergling)], NONE);
  assert.equal(e.combatTarget[slotOf(zergling)], NONE);

  const tank = spawn(Kind.SiegeTank, 0, tc(22), tc(29));
  mark(tank);
  stepOk({ t: 'transform', unit: tank, kind: Kind.SiegeTankSieged });
  assert.equal(e.intentTarget[slotOf(tank)], NONE);
  assert.equal(e.combatTarget[slotOf(tank)], NONE);

  const commandCenter = spawn(Kind.CommandCenter, 0, tc(6), tc(18));
  mark(commandCenter);
  stepOk({ t: 'lift', building: commandCenter });
  assert.equal(e.intentTarget[slotOf(commandCenter)], NONE);
  assert.equal(e.combatTarget[slotOf(commandCenter)], NONE);

  mark(commandCenter);
  stepOk({ t: 'land', building: commandCenter, x: tc(6), y: tc(21) });
  assert.equal(e.intentTarget[slotOf(commandCenter)], commandCenter);
  assert.equal(e.combatTarget[slotOf(commandCenter)], NONE);
});

test('gather targets are complete resource actors, not bare geysers or unfinished collectors', () => {
  const s = makeState(open(), 1, 104);
  const mineral = spawnUnit(s, Kind.Mineral, NEUTRAL, tc(8), tc(8));
  const geyser = spawnUnit(s, Kind.Geyser, NEUTRAL, tc(10), tc(8));
  const refinery = spawnUnit(s, Kind.Refinery, 0, tc(12), tc(8));
  const unfinishedRefinery = spawnUnit(s, Kind.Refinery, 0, tc(14), tc(8));
  const scv = spawnUnit(s, Kind.SCV, 0, tc(8), tc(10));
  s.e.built[slotOf(unfinishedRefinery)] = 0;

  assert.equal(isGatherTarget(s, mineral), true);
  assert.equal(isGatherTarget(s, refinery), true);
  assert.equal(isGatherTarget(s, geyser), false);
  assert.equal(isGatherTarget(s, unfinishedRefinery), false);

  assert.deepEqual(validateCommand(s, 0, { t: 'harvest', unit: scv, patch: mineral }), { ok: true });
  assert.deepEqual(validateCommand(s, 0, { t: 'harvest', unit: scv, patch: refinery }), { ok: true });
  assert.deepEqual(validateCommand(s, 0, { t: 'harvest', unit: scv, patch: geyser }), {
    ok: false,
    reason: 'target-not-allowed',
  });
  assert.deepEqual(validateCommand(s, 0, { t: 'harvest', unit: scv, patch: unfinishedRefinery }), {
    ok: false,
    reason: 'target-not-allowed',
  });
});

test('gas gather targets must be friendly or allied, not hostile', () => {
  const s = makeState(open(), 2, 105);
  const scv = spawnUnit(s, Kind.SCV, 0, tc(8), tc(10));
  const friendlyRefinery = spawnUnit(s, Kind.Refinery, 0, tc(10), tc(8));
  const enemyRefinery = spawnUnit(s, Kind.Refinery, 1, tc(12), tc(8));
  const mineral = spawnUnit(s, Kind.Mineral, NEUTRAL, tc(14), tc(8));

  assert.equal(canPlayerGatherTarget(s, 0, friendlyRefinery), true);
  assert.equal(canPlayerGatherTarget(s, 0, mineral), true);
  assert.equal(isGatherTarget(s, enemyRefinery), true, 'hostile refinery has a gatherable shape');
  assert.equal(canPlayerGatherTarget(s, 0, enemyRefinery), false, 'hostile refinery is not legal to gather');

  assert.deepEqual(validateCommand(s, 0, { t: 'harvest', unit: scv, patch: friendlyRefinery }), { ok: true });
  assert.deepEqual(validateCommand(s, 0, { t: 'harvest', unit: scv, patch: enemyRefinery }), {
    ok: false,
    reason: 'target-not-allowed',
  });
  assert.deepEqual(validateCommand(s, 0, { t: 'rally', building: spawnUnit(s, Kind.CommandCenter, 0, tc(8), tc(14)), x: tc(12), y: tc(8), target: enemyRefinery }), {
    ok: false,
    reason: 'target-not-allowed',
  });
});

test('build placement rejects occupied structures and resources without spending minerals', () => {
  const { sim, state: s, resources } = simScenario({ players: 1, seed: 102 });
  resources(0, 1_000);
  const scv = findSlot(s, (i) => s.e.kind[i] === Kind.SCV && s.e.owner[i] === 0);
  const cc = findSlot(s, (i) => s.e.kind[i] === Kind.CommandCenter && s.e.owner[i] === 0);
  const mineral = findSlot(s, (i) => s.e.kind[i] === Kind.Mineral);
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
  const { sim, state: s, resources } = simScenario({ players: 1, seed: 103 });
  resources(0, 1_000);
  const scv = findSlot(s, (i) => s.e.kind[i] === Kind.SCV && s.e.owner[i] === 0);
  const cc = findSlot(s, (i) => s.e.kind[i] === Kind.CommandCenter && s.e.owner[i] === 0);
  const geyser = findSlot(s, (i) => s.e.kind[i] === Kind.Geyser);

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

test('build placement snaps raw cursor coordinates to the build grid anchor', () => {
  const { sim, state: s, resources } = simScenario({ players: 1, seed: 116 });
  const e = s.e;
  resources(0, 1_000);
  const scv = findSlot(s, (i) => e.kind[i] === Kind.SCV && e.owner[i] === 0);

  const rawX = 901;
  const rawY = 923;
  const results = sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(e, scv), kind: Kind.SupplyDepot, x: fx(rawX), y: fx(rawY) },
  ] }]);

  assert.deepEqual(results, [{ player: 0, index: 0, t: 'build', ok: true }]);
  assert.equal(e.tx[scv], snapped(rawX));
  assert.equal(e.ty[scv], snapped(rawY));
});

test('land placement snaps raw cursor coordinates to the build grid anchor', () => {
  const { sim, state: s } = simScenario({ players: 1, seed: 117 });
  const e = s.e;
  const cc = findSlot(s, (i) => e.kind[i] === Kind.CommandCenter && e.owner[i] === 0);

  assert.deepEqual(sim.step([{ player: 0, cmds: [{ t: 'lift', building: eid(e, cc) }] }]), [
    { player: 0, index: 0, t: 'lift', ok: true },
  ]);

  const rawX = 1600;
  const rawY = 1600;
  const results = sim.step([{ player: 0, cmds: [
    { t: 'land', building: eid(e, cc), x: fx(rawX), y: fx(rawY) },
  ] }]);

  assert.deepEqual(results, [{ player: 0, index: 0, t: 'land', ok: true }]);
  const target = snapBuildAnchor(fx(rawX), fx(rawY));
  assert.equal(e.order[cc], Order.Move);
  assert.notEqual((e.flags[cc]! & Role.Air), 0);
  assert.notEqual(e.x[cc], target.x, 'land command should not teleport lifted structures');

  for (let i = 0; i < 2_000 && (e.flags[cc]! & Role.Air) !== 0; i++) sim.step([]);

  assert.equal(e.order[cc], Order.Idle);
  assert.equal(e.flags[cc], Units[Kind.CommandCenter]!.roles);
  assert.equal(e.x[cc], target.x);
  assert.equal(e.y[cc], target.y);
});

test('resource depots use BWAPI mineral placement exclusion boundaries', () => {
  const depotKinds = [Kind.CommandCenter, Kind.Nexus, Kind.Hatchery];
  for (const kind of depotKinds) {
    const blocked = makeState(open([{ x: 6, y: 8, amount: 1500, gas: false }]), 1, 1);
    assert.deepEqual(placementForStructure(blocked, kind, tc(12), tc(12)), { ok: false, reason: 'placement-blocked' });

    const leftBoundary = makeState(open([{ x: 5, y: 8, amount: 1500, gas: false }]), 1, 1);
    assert.equal(placementForStructure(leftBoundary, kind, tc(12), tc(12)).ok, true);

    const topBoundary = makeState(open([{ x: 6, y: 7, amount: 1500, gas: false }]), 1, 1);
    assert.equal(placementForStructure(topBoundary, kind, tc(12), tc(12)).ok, true);
  }
});

test('resource depots use BWAPI geyser placement exclusion boundaries', () => {
  const depotKinds = [Kind.CommandCenter, Kind.Nexus, Kind.Hatchery];
  for (const kind of depotKinds) {
    const blocked = makeState(open([{ x: 4, y: 7, amount: 0, gas: true }]), 1, 1);
    assert.deepEqual(placementForStructure(blocked, kind, tc(12), tc(12)), { ok: false, reason: 'placement-blocked' });

    const leftBoundary = makeState(open([{ x: 3, y: 7, amount: 0, gas: true }]), 1, 1);
    assert.equal(placementForStructure(leftBoundary, kind, tc(12), tc(12)).ok, true);

    const topBoundary = makeState(open([{ x: 4, y: 6, amount: 0, gas: true }]), 1, 1);
    assert.equal(placementForStructure(topBoundary, kind, tc(12), tc(12)).ok, true);
  }
});

test('resource depot placement follows live resources after map setup', () => {
  const s = makeState(open([{ x: 6, y: 8, amount: 1500, gas: false }]), 1, 1);
  const mineral = slotOf(spawnUnit(s, Kind.Mineral, NEUTRAL, fx(7 * TILE), fx(8.5 * TILE)));

  assert.deepEqual(placementForStructure(s, Kind.CommandCenter, tc(12), tc(12)), { ok: false, reason: 'placement-blocked' });

  kill(s, mineral);

  assert.equal(placementForStructure(s, Kind.CommandCenter, tc(12), tc(12)).ok, true);
});

test('same-tick production reserves supply across multiple producers', () => {
  const { sim, state: s, spawn, resources } = simScenario({ players: 1, seed: 104 });
  const e = s.e;
  const b1 = slotOf(spawn(Kind.Barracks, 0, fx(700), fx(700)));
  const b2 = slotOf(spawn(Kind.Barracks, 0, fx(820), fx(700)));
  for (let i = 0; i < 5; i++) spawn(Kind.Marine, 0, fx(900 + i * 20), fx(760));
  resources(0, 1_000);

  sim.step([{ player: 0, cmds: [
    { t: 'train', building: eid(e, b1), kind: Kind.Marine },
    { t: 'train', building: eid(e, b2), kind: Kind.Marine },
  ] }]);

  const queued = (e.prodKind[b1] === Kind.Marine ? 1 : 0) + (e.prodKind[b2] === Kind.Marine ? 1 : 0);
  assert.equal(queued, 1, 'only one marine can be queued with one free supply');
});

test('tech requirements gate production even when the producer can make the unit', () => {
  const { sim, state: s, spawn, resources } = simScenario({ players: 1, seed: 111 });
  const e = s.e;
  const barracks = slotOf(spawn(Kind.Barracks, 0, fx(700), fx(700)));
  resources(0, 1_000, 1_000);

  const blocked = sim.step([{ player: 0, cmds: [{ t: 'train', building: eid(e, barracks), kind: Kind.Firebat }] }]);
  assert.deepEqual(blocked, [{ player: 0, index: 0, t: 'train', ok: false, reason: 'missing-requirement' }]);
  assert.equal(e.prodKind[barracks], Kind.None);

  spawn(Kind.Academy, 0, fx(820), fx(700));
  const allowed = sim.step([{ player: 0, cmds: [{ t: 'train', building: eid(e, barracks), kind: Kind.Firebat }] }]);
  assert.deepEqual(allowed, [{ player: 0, index: 0, t: 'train', ok: true }]);
  assert.equal(e.prodKind[barracks], Kind.Firebat);
});

test('tech requirements gate new structures', () => {
  const { sim, state: s, resources } = simScenario({ players: 1, seed: 112 });
  const e = s.e;
  resources(0, 1_000, 1_000);
  const scv = findSlot(s, (i) => e.kind[i] === Kind.SCV && e.owner[i] === 0);

  const blocked = sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(e, scv), kind: Kind.Factory, x: fx(900), y: fx(900) },
  ] }]);

  assert.deepEqual(blocked, [{ player: 0, index: 0, t: 'build', ok: false, reason: 'missing-requirement' }]);
  assert.equal(e.buildKind[scv], Kind.None);
});

test('zerg worker builds respect completed tech tree and exclude structure morph upgrades', () => {
  const { sim, state: s, spawn, resources } = simScenario({ players: 1, seed: 113 });
  const e = s.e;
  resources(0, 2_000, 2_000);
  const drone = slotOf(spawn(Kind.Drone, 0, fx(760), fx(700)));
  spawn(Kind.Hatchery, 0, fx(700), fx(700));
  spawn(Kind.SpawningPool, 0, fx(700), fx(860));

  const earlySpire = sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(e, drone), kind: Kind.Spire, x: fx(900), y: fx(700) },
  ] }]);
  assert.deepEqual(earlySpire, [{ player: 0, index: 0, t: 'build', ok: false, reason: 'missing-requirement' }]);
  assert.equal(e.buildKind[drone], Kind.None);

  const illegalLair = sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(e, drone), kind: Kind.Lair, x: fx(900), y: fx(700) },
  ] }]);
  assert.deepEqual(illegalLair, [{ player: 0, index: 0, t: 'build', ok: false, reason: 'missing-capability' }]);
  assert.equal(e.buildKind[drone], Kind.None);

  spawn(Kind.Lair, 0, fx(700), fx(540));
  const allowedSpire = sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(e, drone), kind: Kind.Spire, x: fx(900), y: fx(700) },
  ] }]);
  assert.deepEqual(allowedSpire, [{ player: 0, index: 0, t: 'build', ok: true }]);
  assert.equal(e.buildKind[drone], Kind.Spire);
});

test('stopping a pending worker build refunds the full cost', () => {
  const { sim, state: s, resources } = simScenario({ players: 1, seed: 105 });
  const e = s.e;
  resources(0, 1_000);
  const scv = findSlot(s, (i) => e.kind[i] === Kind.SCV && e.owner[i] === 0);
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
  const { sim, state: s, resources } = simScenario({ players: 1, seed: 106 });
  const e = s.e;
  resources(0, Units[Kind.SupplyDepot]!.minerals);
  const scv = findSlot(s, (i) => e.kind[i] === Kind.SCV && e.owner[i] === 0);

  sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(e, scv), kind: Kind.SupplyDepot, x: fx(900), y: fx(900) },
  ] }]);
  assert.equal(s.players.minerals[0], 0);

  sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(e, scv), kind: Kind.SupplyDepot, x: fx(1_050), y: fx(900) },
  ] }]);

  assert.equal(s.players.minerals[0], 0, 'old cost was refunded before the replacement spent');
  assert.equal(e.buildKind[scv], Kind.SupplyDepot);
  assert.equal(e.tx[scv], snapped(1_050));
  assert.equal(e.buildCostMinerals[scv], Units[Kind.SupplyDepot]!.minerals);
});

test('killing a worker before foundation placement refunds its pending build', () => {
  const { sim, state: s, resources } = simScenario({ players: 1, seed: 107 });
  const e = s.e;
  resources(0, 1_000);
  const scv = findSlot(s, (i) => e.kind[i] === Kind.SCV && e.owner[i] === 0);
  const before = s.players.minerals[0]!;

  sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(e, scv), kind: Kind.SupplyDepot, x: fx(900), y: fx(900) },
  ] }]);
  kill(s, scv);

  assert.equal(s.players.minerals[0], before);
  assert.equal(e.buildCostMinerals[scv], 0);
});

test('canceling an unfinished foundation refunds 75 percent and removes it', () => {
  const { sim, state: s, spawn, resources } = simScenario({ players: 1, seed: 108 });
  const e = s.e;
  resources(0, 1_000);
  const scv = slotOf(spawn(Kind.SCV, 0, fx(900), fx(900)));
  const before = s.players.minerals[0]!;

  sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(e, scv), kind: Kind.SupplyDepot, x: fx(912), y: fx(900) },
  ] }]);

  const depot = findSlot(s, (i) => e.kind[i] === Kind.SupplyDepot && e.owner[i] === 0 && e.built[i] === 0);
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

test('terran SCVs stay committed and paused foundations need their builder', () => {
  const { sim, state: s, spawn, resources } = simScenario({ players: 1, seed: 113 });
  const e = s.e;
  resources(0, 1_000);
  const scv = slotOf(spawn(Kind.SCV, 0, fx(900), fx(900)));

  sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(e, scv), kind: Kind.SupplyDepot, x: fx(912), y: fx(900) },
  ] }]);

  const depot = findSlot(s, (i) => e.kind[i] === Kind.SupplyDepot && e.owner[i] === 0 && e.built[i] === 0);
  assert.equal(e.order[scv], Order.Build);
  assert.equal(e.target[scv], eid(e, depot));

  const before = e.ctimer[depot]!;
  sim.step([{ player: 0, cmds: [{ t: 'stop', unit: eid(e, scv) }] }]);
  for (let i = 0; i < 5; i++) sim.step([]);

  assert.equal(e.ctimer[depot], before, 'foundation pauses without its SCV');
});

test('terran SCVs are released when their structure completes', () => {
  const { sim, state: s, spawn, resources } = simScenario({ players: 1, seed: 114 });
  const e = s.e;
  resources(0, 1_000);
  const scv = slotOf(spawn(Kind.SCV, 0, fx(900), fx(900)));

  sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(e, scv), kind: Kind.SupplyDepot, x: fx(912), y: fx(900) },
  ] }]);
  const depot = findSlot(s, (i) => e.kind[i] === Kind.SupplyDepot && e.owner[i] === 0 && e.built[i] === 0);
  e.ctimer[depot] = 1;
  sim.step([]);

  assert.equal(e.built[depot], 1);
  assert.notEqual(e.order[scv], Order.Build);
  assert.equal(e.target[depot], -1);
  assert.equal(e.buildCostMinerals[depot], 0);
});

test('another SCV can resume a paused Terran foundation', () => {
  const { sim, state: s, spawn, resources } = simScenario({ players: 1, seed: 115 });
  const e = s.e;
  resources(0, 1_000);
  const builder = slotOf(spawn(Kind.SCV, 0, fx(900), fx(900)));

  sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(e, builder), kind: Kind.Barracks, x: fx(940), y: fx(900) },
  ] }]);
  let barracks = -1;
  for (let t = 0; t < 80 && barracks < 0; t++) {
    sim.step([]);
    for (let i = 0; i < e.hi; i++) {
      if (e.alive[i] === 1 && e.kind[i] === Kind.Barracks && e.owner[i] === 0 && e.built[i] === 0) barracks = i;
    }
  }
  assert.notEqual(barracks, -1, 'foundation was placed');
  sim.step([{ player: 0, cmds: [{ t: 'stop', unit: eid(e, builder) }] }]);
  const pausedAt = e.ctimer[barracks]!;
  for (let i = 0; i < 5; i++) sim.step([]);
  assert.equal(e.ctimer[barracks], pausedAt, 'foundation is paused without an active SCV');

  const replacement = slotOf(spawn(Kind.SCV, 0, fx(980), fx(900)));
  const results = sim.step([{ player: 0, cmds: [
    { t: 'repair', unit: eid(e, replacement), target: eid(e, barracks) },
  ] }]);

  assert.deepEqual(results, [{ player: 0, index: 0, t: 'repair', ok: true }]);
  assert.equal(e.order[replacement], Order.Build);
  assert.equal(e.target[replacement], eid(e, barracks));
  assert.equal(e.target[barracks], eid(e, replacement));
  assert.equal(e.order[builder], Order.Idle);

  for (let i = 0; i < 5; i++) sim.step([]);
  assert.ok(e.ctimer[barracks]! < pausedAt, 'replacement SCV advances construction');
});

test('pending build footprints reserve space before foundations are placed', () => {
  const { sim, state: s, spawn, resources } = simScenario({ players: 1, seed: 109 });
  const e = s.e;
  resources(0, 1_000);
  const scvA = slotOf(spawn(Kind.SCV, 0, fx(700), fx(700)));
  const scvB = slotOf(spawn(Kind.SCV, 0, fx(740), fx(700)));

  sim.step([{ player: 0, cmds: [
    { t: 'build', unit: eid(e, scvA), kind: Kind.SupplyDepot, x: fx(1_000), y: fx(1_000) },
    { t: 'build', unit: eid(e, scvB), kind: Kind.SupplyDepot, x: fx(1_000), y: fx(1_000) },
  ] }]);

  const pending = [scvA, scvB].filter((slot) => e.buildKind[slot] === Kind.SupplyDepot).length;
  assert.equal(pending, 1);
  assert.equal(s.players.minerals[0], 1_000 - Units[Kind.SupplyDepot]!.minerals);
});

test('step returns deterministic command acceptance and rejection results', () => {
  const { sim, state: s, resources } = simScenario({ players: 1, seed: 110 });
  const e = s.e;
  resources(0, 1_000);
  const scv = findSlot(s, (i) => e.kind[i] === Kind.SCV && e.owner[i] === 0);
  const cc = findSlot(s, (i) => e.kind[i] === Kind.CommandCenter && e.owner[i] === 0);

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
