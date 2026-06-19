import test from 'node:test';
import assert from 'node:assert/strict';
import { eid, isAlive, kill, slotOf } from '../src/entity/world.ts';
import { Ability, Kind, Tech, Units } from '../src/data.ts';
import { addonPosition } from '../src/mechanics/addons.ts';
import { parseReplay } from '../src/replay.ts';
import { fx } from '../src/fixed.ts';
import { validateCommand } from '../src/commands/validate.ts';
import { liftedStructureFlags } from '../src/terran-mobility.ts';
import { simScenario } from '../test-support/scenario.ts';

test('terran parent buildings construct one linked add-on', () => {
  const { sim, state: s, spawn, resources } = simScenario({ players: 1, seed: 130 });
  const e = s.e;
  const factory = slotOf(spawn(Kind.Factory, 0, fx(700), fx(700)));
  resources(0, 1_000, 1_000);
  const pos = addonPosition(s, factory, Kind.MachineShop);

  const results = sim.step([{ player: 0, cmds: [{ t: 'addon', building: eid(e, factory), kind: Kind.MachineShop }] }]);

  assert.deepEqual(results, [{ player: 0, index: 0, t: 'addon', ok: true }]);
  const shop = slotOf(e.target[factory]!);
  assert.equal(e.kind[shop], Kind.MachineShop);
  assert.equal(e.built[shop], 0);
  assert.equal(e.target[shop], eid(e, factory));
  assert.equal(e.x[shop], pos.x);
  assert.equal(e.y[shop], pos.y);
  assert.equal(s.players.minerals[0], 1_000 - Units[Kind.MachineShop]!.minerals);
  assert.equal(s.players.gas[0], 1_000 - Units[Kind.MachineShop]!.gas);

  const duplicate = sim.step([{ player: 0, cmds: [{ t: 'addon', building: eid(e, factory), kind: Kind.MachineShop }] }]);
  assert.deepEqual(duplicate, [{ player: 0, index: 0, t: 'addon', ok: false, reason: 'queue-full' }]);
});

test('add-ons enforce parent type, prerequisites, placement, and cancel refunds', () => {
  const { sim, state: s, spawn, resources } = simScenario({ players: 1, seed: 131 });
  const e = s.e;
  const factory = slotOf(spawn(Kind.Factory, 0, fx(700), fx(700)));
  const cc = slotOf(spawn(Kind.CommandCenter, 0, fx(1_300), fx(700)));
  const academy = slotOf(spawn(Kind.Academy, 0, fx(1_300), fx(900)));
  resources(0, 1_000, 1_000);

  const wrongParent = sim.step([{ player: 0, cmds: [{ t: 'addon', building: eid(e, factory), kind: Kind.ControlTower }] }]);
  assert.deepEqual(wrongParent, [{ player: 0, index: 0, t: 'addon', ok: false, reason: 'target-not-allowed' }]);

  e.built[academy] = 0;
  const missingReq = sim.step([{ player: 0, cmds: [{ t: 'addon', building: eid(e, cc), kind: Kind.ComsatStation }] }]);
  assert.deepEqual(missingReq, [{ player: 0, index: 0, t: 'addon', ok: false, reason: 'missing-requirement' }]);

  e.built[academy] = 1;
  const accepted = sim.step([{ player: 0, cmds: [{ t: 'addon', building: eid(e, cc), kind: Kind.ComsatStation }] }]);
  assert.deepEqual(accepted, [{ player: 0, index: 0, t: 'addon', ok: true }]);
  const comsat = slotOf(e.target[cc]!);
  const before = s.players.minerals[0]!;
  const canceled = sim.step([{ player: 0, cmds: [{ t: 'cancelBuild', building: eid(e, comsat) }] }]);

  assert.deepEqual(canceled, [{ player: 0, index: 0, t: 'cancelBuild', ok: true }]);
  assert.equal(isAlive(e, eid(e, comsat)), false);
  assert.equal(e.target[cc], -1);
  assert.equal(s.players.minerals[0], before + Math.trunc(Units[Kind.ComsatStation]!.minerals * 3 / 4));
});

test('completed add-ons require a live linked landed parent for validation', () => {
  const { sim, state: s, spawn, resources } = simScenario({ players: 1, seed: 132 });
  const e = s.e;
  const factory = slotOf(spawn(Kind.Factory, 0, fx(700), fx(700)));
  const spareFactory = slotOf(spawn(Kind.Factory, 0, fx(1_100), fx(700)));
  resources(0, 1_000, 1_000);
  s.players.supplyMax[0] = 100;

  assert.deepEqual(sim.step([{ player: 0, cmds: [{ t: 'addon', building: eid(e, factory), kind: Kind.MachineShop }] }]), [
    { player: 0, index: 0, t: 'addon', ok: true },
  ]);
  const shop = slotOf(e.target[factory]!);
  e.built[shop] = 1;
  e.ctimer[shop] = 0;

  assert.deepEqual(validateCommand(s, 0, { t: 'research', building: eid(e, shop), tech: Tech.SiegeTech }), { ok: true });
  assert.deepEqual(validateCommand(s, 0, { t: 'train', building: eid(e, spareFactory), kind: Kind.SiegeTank }), { ok: true });

  const landedFlags = e.flags[factory]!;
  e.flags[factory] = liftedStructureFlags(Kind.Factory);
  assert.deepEqual(validateCommand(s, 0, { t: 'research', building: eid(e, shop), tech: Tech.SiegeTech }), {
    ok: false,
    reason: 'missing-capability',
  });
  assert.deepEqual(validateCommand(s, 0, { t: 'train', building: eid(e, spareFactory), kind: Kind.SiegeTank }), {
    ok: false,
    reason: 'missing-requirement',
  });

  e.flags[factory] = landedFlags;
  kill(s, factory);
  assert.deepEqual(validateCommand(s, 0, { t: 'research', building: eid(e, shop), tech: Tech.SiegeTech }), {
    ok: false,
    reason: 'missing-capability',
  });
  assert.deepEqual(validateCommand(s, 0, { t: 'train', building: eid(e, spareFactory), kind: Kind.SiegeTank }), {
    ok: false,
    reason: 'missing-requirement',
  });
});

test('comsat scanner sweep requires a live linked landed command center', () => {
  const { sim, state: s, spawn, resources } = simScenario({ players: 1, seed: 134 });
  const e = s.e;
  const commandCenter = slotOf(spawn(Kind.CommandCenter, 0, fx(700), fx(700)));
  spawn(Kind.Academy, 0, fx(900), fx(700));
  resources(0, 1_000, 1_000);

  assert.deepEqual(sim.step([{ player: 0, cmds: [{ t: 'addon', building: eid(e, commandCenter), kind: Kind.ComsatStation }] }]), [
    { player: 0, index: 0, t: 'addon', ok: true },
  ]);
  const comsat = slotOf(e.target[commandCenter]!);
  e.built[comsat] = 1;
  e.ctimer[comsat] = 0;
  e.energy[comsat] = 100;
  const sweep = { t: 'ability' as const, unit: eid(e, comsat), ability: Ability.ScannerSweep, x: fx(900), y: fx(700) };

  assert.deepEqual(validateCommand(s, 0, sweep), { ok: true });

  const landedFlags = e.flags[commandCenter]!;
  e.flags[commandCenter] = liftedStructureFlags(Kind.CommandCenter);
  assert.deepEqual(validateCommand(s, 0, sweep), {
    ok: false,
    reason: 'missing-capability',
  });

  e.flags[commandCenter] = landedFlags;
  kill(s, commandCenter);
  assert.deepEqual(validateCommand(s, 0, sweep), {
    ok: false,
    reason: 'missing-capability',
  });
});

test('orphaned add-on production and research do not complete', () => {
  const { sim, state: s, spawn, resources } = simScenario({ players: 1, seed: 133 });
  const e = s.e;
  const factory = slotOf(spawn(Kind.Factory, 0, fx(700), fx(700)));
  const commandCenter = slotOf(spawn(Kind.CommandCenter, 0, fx(1_200), fx(700)));
  resources(0, 2_000, 2_000);

  assert.deepEqual(sim.step([{ player: 0, cmds: [{ t: 'addon', building: eid(e, factory), kind: Kind.MachineShop }] }]), [
    { player: 0, index: 0, t: 'addon', ok: true },
  ]);
  const shop = slotOf(e.target[factory]!);
  e.built[shop] = 1;
  e.ctimer[shop] = 0;
  assert.deepEqual(sim.step([{ player: 0, cmds: [{ t: 'research', building: eid(e, shop), tech: Tech.SiegeTech }] }]), [
    { player: 0, index: 0, t: 'research', ok: true },
  ]);

  const silo = slotOf(spawn(Kind.NuclearSilo, 0, fx(1_280), fx(700)));
  e.target[commandCenter] = eid(e, silo);
  e.target[silo] = eid(e, commandCenter);
  assert.deepEqual(sim.step([{ player: 0, cmds: [{ t: 'train', building: eid(e, silo), kind: Kind.NuclearMissile }] }]), [
    { player: 0, index: 0, t: 'train', ok: true },
  ]);
  e.researchTimer[shop] = 1;
  e.prodTimer[silo] = 1;

  kill(s, factory);
  kill(s, commandCenter);
  sim.step([]);

  assert.equal(e.researchKind[shop], Tech.SiegeTech);
  assert.equal(e.prodKind[silo], Kind.NuclearMissile);
  assert.equal(e.specialAmmo[silo], 0);
});

test('replay parser accepts addon commands', () => {
  const replay = parseReplay(JSON.stringify({
    version: 1,
    map: { kind: 'slice' },
    players: 1,
    seed: 1,
    frames: [[{ player: 0, cmds: [{ t: 'addon', building: 1, kind: Kind.MachineShop }] }]],
  }));

  assert.deepEqual(replay.frames[0]![0]!.cmds[0], { t: 'addon', building: 1, kind: Kind.MachineShop });
});
