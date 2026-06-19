import test from 'node:test';
import assert from 'node:assert/strict';
import { Ability, Kind, Tech, TILE, Units } from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import type { MapDef } from '../src/map.ts';
import {
  abilitySelectionOptions, addonSelectionCandidates, addonSelectionOptions, attackModeCandidates, harvestModeCandidates, loadSelectionCandidates, producedUnitRallyIntent,
  rallyModeCandidates, repairModeCandidates, researchSelectionCandidates, researchSelectionOptions, selfAbilitySelectionCandidates, smartCommandCandidates,
  trainSelectionCandidates, trainSelectionOptions, transformSelectionCandidates, transformSelectionOptions,
  unloadSelectionCandidates, workerBuildSelectionOptions,
} from '../src/command-intent.ts';
import { spawnUnit } from '../src/factory.ts';
import { setTechLevel } from '../src/tech.ts';
import { eid, makeState, NEUTRAL, NONE, slotOf } from '../src/world.ts';

const tc = (t: number): number => fx(t * TILE + (TILE >> 1));

const open = (): MapDef => {
  const w = 24;
  const h = 24;
  return {
    name: 'smart-command-open',
    w,
    h,
    walk: new Uint8Array(w * h).fill(1),
    build: new Uint8Array(w * h).fill(1),
    elev: new Uint8Array(w * h),
    starts: [],
    resources: [],
    teams: [],
  };
};

test('smart command attacks enemy entities', () => {
  const s = makeState(open(), 2, 1201);
  const marine = spawnUnit(s, Kind.Marine, 0, tc(8), tc(8));
  const enemy = spawnUnit(s, Kind.Marine, 1, tc(10), tc(8));

  assert.deepEqual(smartCommandCandidates(s, 0, marine, { hit: enemy, x: tc(10), y: tc(8) }, 'desktop'), [
    { t: 'attack', unit: marine, target: enemy },
  ]);
});

test('smart command harvests legal resources and not bare geysers', () => {
  const s = makeState(open(), 1, 1202);
  const scv = spawnUnit(s, Kind.SCV, 0, tc(8), tc(8));
  const mineral = spawnUnit(s, Kind.Mineral, NEUTRAL, tc(10), tc(8));
  const geyser = spawnUnit(s, Kind.Geyser, NEUTRAL, tc(12), tc(8));

  assert.deepEqual(smartCommandCandidates(s, 0, scv, { hit: mineral, x: tc(10), y: tc(8) }, 'desktop'), [
    { t: 'harvest', unit: scv, patch: mineral },
  ]);
  assert.deepEqual(smartCommandCandidates(s, 0, scv, { hit: geyser, x: tc(12), y: tc(8) }, 'desktop'), [
    { t: 'move', unit: scv, x: tc(12), y: tc(8) },
  ]);
});

test('smart command attacks hostile gas collectors instead of harvesting them', () => {
  const s = makeState(open(), 2, 1203);
  const scv = spawnUnit(s, Kind.SCV, 0, tc(8), tc(8));
  const refinery = spawnUnit(s, Kind.Refinery, 1, tc(10), tc(8));

  assert.deepEqual(smartCommandCandidates(s, 0, scv, { hit: refinery, x: tc(10), y: tc(8) }, 'desktop'), [
    { t: 'attack', unit: scv, target: refinery },
  ]);
});

test('smart command repairs damaged friendly mechanical targets', () => {
  const s = makeState(open(), 1, 1204);
  s.players.minerals[0] = 500;
  const scv = spawnUnit(s, Kind.SCV, 0, tc(8), tc(8));
  const bunker = spawnUnit(s, Kind.Bunker, 0, tc(10), tc(8));
  s.e.hp[slotOf(bunker)] = Units[Kind.Bunker]!.hp - 40;

  assert.deepEqual(smartCommandCandidates(s, 0, scv, { hit: bunker, x: tc(10), y: tc(8) }, 'desktop'), [
    { t: 'repair', unit: scv, target: bunker },
  ]);
});

test('smart command loads valid cargo into transports and structures', () => {
  const s = makeState(open(), 1, 1205);
  const marine = spawnUnit(s, Kind.Marine, 0, tc(8), tc(8));
  const bunker = spawnUnit(s, Kind.Bunker, 0, tc(9), tc(8));

  assert.deepEqual(smartCommandCandidates(s, 0, marine, { hit: bunker, x: tc(9), y: tc(8) }, 'desktop'), [
    { t: 'load', transport: bunker, unit: marine },
  ]);
});

test('smart command follows ordinary friendly entities', () => {
  const s = makeState(open(), 1, 1206);
  const marine = spawnUnit(s, Kind.Marine, 0, tc(8), tc(8));
  const leader = spawnUnit(s, Kind.Marine, 0, tc(10), tc(8));

  assert.deepEqual(smartCommandCandidates(s, 0, marine, { hit: leader, x: tc(10), y: tc(8) }, 'desktop'), [
    { t: 'move', unit: marine, x: tc(10), y: tc(8), target: leader },
  ]);
});

test('smart command gives structures targeted rally or point rally', () => {
  const s = makeState(open(), 1, 1207);
  const cc = spawnUnit(s, Kind.CommandCenter, 0, tc(8), tc(8));
  const marine = spawnUnit(s, Kind.Marine, 0, tc(12), tc(8));

  assert.deepEqual(smartCommandCandidates(s, 0, cc, { hit: marine, x: tc(12), y: tc(8) }, 'desktop'), [
    { t: 'rally', building: cc, x: tc(12), y: tc(8), target: marine },
  ]);
  assert.deepEqual(smartCommandCandidates(s, 0, cc, { hit: -1, x: tc(14), y: tc(8) }, 'desktop'), [
    { t: 'rally', building: cc, x: tc(14), y: tc(8) },
  ]);
});

test('armed attack mode attacks enemies, amoves points, and rejects friendly targets', () => {
  const s = makeState(open(), 2, 1211);
  const marine = spawnUnit(s, Kind.Marine, 0, tc(8), tc(8));
  const enemy = spawnUnit(s, Kind.Marine, 1, tc(10), tc(8));
  const leader = spawnUnit(s, Kind.Marine, 0, tc(12), tc(8));
  const mineral = spawnUnit(s, Kind.Mineral, NEUTRAL, tc(14), tc(8));

  assert.deepEqual(attackModeCandidates(s, 0, marine, { hit: enemy, x: tc(10), y: tc(8) }), [
    { t: 'attack', unit: marine, target: enemy },
  ]);
  assert.deepEqual(attackModeCandidates(s, 0, marine, { hit: -1, x: tc(11), y: tc(8) }), [
    { t: 'amove', unit: marine, x: tc(11), y: tc(8) },
  ]);
  assert.deepEqual(attackModeCandidates(s, 0, marine, { hit: mineral, x: tc(14), y: tc(8) }), [
    { t: 'amove', unit: marine, x: tc(14), y: tc(8) },
  ]);
  assert.deepEqual(attackModeCandidates(s, 0, marine, { hit: leader, x: tc(12), y: tc(8) }), []);
});

test('armed harvest mode queues every selected valid worker for a gather target', () => {
  const s = makeState(open(), 1, 1212);
  const a = spawnUnit(s, Kind.SCV, 0, tc(8), tc(8));
  const b = spawnUnit(s, Kind.SCV, 0, tc(9), tc(8));
  const marine = spawnUnit(s, Kind.Marine, 0, tc(10), tc(8));
  const mineral = spawnUnit(s, Kind.Mineral, NEUTRAL, tc(12), tc(8));

  assert.deepEqual(harvestModeCandidates(s, 0, [a, b, marine], mineral), [
    { t: 'harvest', unit: a, patch: mineral },
    { t: 'harvest', unit: b, patch: mineral },
  ]);
});

test('armed repair mode queues all valid repairers for built targets', () => {
  const s = makeState(open(), 1, 1213);
  s.players.minerals[0] = 500;
  const a = spawnUnit(s, Kind.SCV, 0, tc(8), tc(8));
  const b = spawnUnit(s, Kind.SCV, 0, tc(9), tc(8));
  const marine = spawnUnit(s, Kind.Marine, 0, tc(10), tc(8));
  const bunker = spawnUnit(s, Kind.Bunker, 0, tc(12), tc(8));
  s.e.hp[slotOf(bunker)] = Units[Kind.Bunker]!.hp - 40;

  assert.deepEqual(repairModeCandidates(s, 0, [a, b, marine], bunker), [
    { t: 'repair', unit: a, target: bunker },
    { t: 'repair', unit: b, target: bunker },
  ]);
});

test('armed repair mode picks the nearest valid worker for unfinished construction', () => {
  const s = makeState(open(), 1, 1214);
  const far = spawnUnit(s, Kind.SCV, 0, tc(6), tc(8));
  const near = spawnUnit(s, Kind.SCV, 0, tc(11), tc(8));
  const depot = spawnUnit(s, Kind.SupplyDepot, 0, tc(12), tc(8));
  s.e.built[slotOf(depot)] = 0;
  s.e.ctimer[slotOf(depot)] = 100;

  assert.deepEqual(repairModeCandidates(s, 0, [far, near], depot), [
    { t: 'repair', unit: near, target: depot },
  ]);
});

test('load command-card candidates load selected cargo into selected transports', () => {
  const s = makeState(open(), 1, 1215);
  const marine = spawnUnit(s, Kind.Marine, 0, tc(8), tc(8));
  const firebat = spawnUnit(s, Kind.Firebat, 0, tc(9), tc(8));
  const dropship = spawnUnit(s, Kind.Dropship, 0, tc(10), tc(8));
  const bunker = spawnUnit(s, Kind.Bunker, 0, tc(11), tc(8));

  assert.deepEqual(loadSelectionCandidates(s, 0, [dropship, bunker, marine, firebat]), [
    { t: 'load', transport: dropship, unit: marine },
    { t: 'load', transport: dropship, unit: firebat },
    { t: 'load', transport: bunker, unit: marine },
    { t: 'load', transport: bunker, unit: firebat },
  ]);
});

test('load command-card candidates ignore invalid cargo and non-selected transports', () => {
  const s = makeState(open(), 1, 1216);
  const marine = spawnUnit(s, Kind.Marine, 0, tc(8), tc(8));
  const tank = spawnUnit(s, Kind.SiegeTank, 0, tc(9), tc(8));
  const dropship = spawnUnit(s, Kind.Dropship, 0, tc(10), tc(8));
  const bunker = spawnUnit(s, Kind.Bunker, 0, tc(11), tc(8));

  assert.deepEqual(loadSelectionCandidates(s, 0, [dropship, bunker, marine, tank]), [
    { t: 'load', transport: dropship, unit: marine },
    { t: 'load', transport: dropship, unit: tank },
    { t: 'load', transport: bunker, unit: marine },
  ]);
});

test('unload command-card candidates fan out contained units around selected transports', () => {
  const s = makeState(open(), 1, 1225);
  const dropship = spawnUnit(s, Kind.Dropship, 0, tc(10), tc(8));
  const marine = spawnUnit(s, Kind.Marine, 0, tc(10), tc(8));
  const firebat = spawnUnit(s, Kind.Firebat, 0, tc(10), tc(8));
  s.e.container[slotOf(marine)] = dropship;
  s.e.container[slotOf(firebat)] = dropship;

  assert.deepEqual(unloadSelectionCandidates(s, 0, [dropship]), [
    { t: 'unload', transport: dropship, unit: marine, x: tc(10), y: tc(8) + fx(64) },
    { t: 'unload', transport: dropship, unit: firebat, x: tc(10) + fx(64), y: tc(8) },
  ]);
});

test('unload command-card candidates route Nydus cargo to the default network exit', () => {
  const s = makeState(open(), 1, 1226);
  const entrance = spawnUnit(s, Kind.NydusCanal, 0, tc(8), tc(8));
  const exit = spawnUnit(s, Kind.NydusCanal, 0, tc(16), tc(8));
  const marine = spawnUnit(s, Kind.Marine, 0, tc(8), tc(8));
  s.e.container[slotOf(marine)] = entrance;

  assert.deepEqual(unloadSelectionCandidates(s, 0, [entrance]), [
    { t: 'unload', transport: entrance, unit: marine, x: tc(16), y: tc(8) + fx(64) },
  ]);
  assert.deepEqual(unloadSelectionCandidates(s, 0, [exit]), []);
});

test('transform command-card candidates queue simple valid transforms', () => {
  const s = makeState(open(), 1, 1227);
  const hydra = spawnUnit(s, Kind.Hydralisk, 0, tc(8), tc(8));
  const marine = spawnUnit(s, Kind.Marine, 0, tc(9), tc(8));
  spawnUnit(s, Kind.HydraliskDen, 0, tc(12), tc(8));

  assert.deepEqual(transformSelectionCandidates(s, 0, [hydra, marine], Kind.Lurker), []);
  setTechLevel(s, 0, Tech.LurkerAspect, 1);
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;
  s.players.supplyMax[0] = 1_000;

  assert.deepEqual(transformSelectionCandidates(s, 0, [hydra, marine], Kind.Lurker), [
    { t: 'transform', unit: hydra, kind: Kind.Lurker },
  ]);
});

test('transform command-card candidates pair merge units deterministically', () => {
  const s = makeState(open(), 1, 1228);
  const a = spawnUnit(s, Kind.HighTemplar, 0, tc(8), tc(8));
  const b = spawnUnit(s, Kind.HighTemplar, 0, tc(9), tc(8));
  const c = spawnUnit(s, Kind.HighTemplar, 0, tc(12), tc(8));
  const d = spawnUnit(s, Kind.HighTemplar, 0, tc(13), tc(8));

  assert.deepEqual(transformSelectionCandidates(s, 0, [a, b, c, d], Kind.Archon), [
    { t: 'transform', unit: a, kind: Kind.Archon, target: b },
    { t: 'transform', unit: c, kind: Kind.Archon, target: d },
  ]);
});

test('transform command-card options expose sim-owned availability records', () => {
  const s = makeState(open(), 1, 1209);
  const hydra = spawnUnit(s, Kind.Hydralisk, 0, tc(8), tc(8));
  const templarA = spawnUnit(s, Kind.HighTemplar, 0, tc(10), tc(8));
  const templarB = spawnUnit(s, Kind.HighTemplar, 0, tc(11), tc(8));
  spawnUnit(s, Kind.HydraliskDen, 0, tc(13), tc(8));
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;
  s.players.supplyMax[0] = 1_000;

  let options = transformSelectionOptions(s, 0, [hydra, templarA, templarB]);
  assert.deepEqual(options.find((o) => o.id === Kind.Lurker), {
    id: Kind.Lurker,
    ok: false,
    representative: hydra,
    reason: 'missing-requirement',
  });
  assert.deepEqual(options.find((o) => o.id === Kind.Archon), {
    id: Kind.Archon,
    ok: true,
    representative: templarA,
    commands: [{ t: 'transform', unit: templarA, kind: Kind.Archon, target: templarB }],
  });

  setTechLevel(s, 0, Tech.LurkerAspect, 1);
  options = transformSelectionOptions(s, 0, [hydra]);
  assert.deepEqual(options.find((o) => o.id === Kind.Lurker), {
    id: Kind.Lurker,
    ok: true,
    representative: hydra,
    commands: [{ t: 'transform', unit: hydra, kind: Kind.Lurker }],
  });
});

test('train command-card candidates choose the least-loaded valid producer', () => {
  const s = makeState(open(), 1, 1229);
  const busy = spawnUnit(s, Kind.Barracks, 0, tc(8), tc(8));
  const idle = spawnUnit(s, Kind.Barracks, 0, tc(12), tc(8));
  const academy = spawnUnit(s, Kind.Academy, 0, tc(16), tc(8));
  const busySlot = slotOf(busy);
  s.e.prodKind[busySlot] = Kind.Marine;
  s.e.prodTimer[busySlot] = 100;
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;
  s.players.supplyMax[0] = 1_000;

  assert.deepEqual(trainSelectionCandidates(s, 0, [busy, academy, idle], Kind.Marine), [
    { t: 'train', building: idle, kind: Kind.Marine },
  ]);
  assert.deepEqual(trainSelectionCandidates(s, 0, [academy], Kind.Marine), []);
});

test('train command-card options expose sim-owned availability records', () => {
  const s = makeState(open(), 1, 1234);
  const busy = spawnUnit(s, Kind.Barracks, 0, tc(8), tc(8));
  const idle = spawnUnit(s, Kind.Barracks, 0, tc(12), tc(8));
  const academy = spawnUnit(s, Kind.Academy, 0, tc(16), tc(8));
  const busySlot = slotOf(busy);
  s.e.prodKind[busySlot] = Kind.Marine;
  s.e.prodTimer[busySlot] = 100;
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;
  s.players.supplyMax[0] = 1_000;

  let marine = trainSelectionOptions(s, 0, [busy, academy, idle]).find((o) => o.id === Kind.Marine);
  assert.deepEqual(marine, {
    id: Kind.Marine,
    ok: true,
    representative: idle,
    commands: [{ t: 'train', building: idle, kind: Kind.Marine }],
  });

  s.players.minerals[0] = 0;
  marine = trainSelectionOptions(s, 0, [idle]).find((o) => o.id === Kind.Marine);
  assert.deepEqual(marine, {
    id: Kind.Marine,
    ok: false,
    representative: idle,
    reason: 'not-affordable',
  });
});

test('add-on command-card candidates choose the first valid selected producer', () => {
  const s = makeState(open(), 1, 1230);
  const busy = spawnUnit(s, Kind.Factory, 0, tc(8), tc(8));
  const idle = spawnUnit(s, Kind.Factory, 0, tc(12), tc(8));
  const barracks = spawnUnit(s, Kind.Barracks, 0, tc(20), tc(8));
  s.e.target[slotOf(busy)] = busy;
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  assert.deepEqual(addonSelectionCandidates(s, 0, [busy, barracks, idle], Kind.MachineShop), [
    { t: 'addon', building: idle, kind: Kind.MachineShop },
  ]);
  assert.deepEqual(addonSelectionCandidates(s, 0, [barracks], Kind.MachineShop), []);
});

test('worker build command-card options expose sim-owned availability records', () => {
  const s = makeState(open(), 1, 1237);
  const scv = spawnUnit(s, Kind.SCV, 0, tc(8), tc(8));
  const marine = spawnUnit(s, Kind.Marine, 0, tc(9), tc(8));
  spawnUnit(s, Kind.CommandCenter, 0, tc(12), tc(8));
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  let depot = workerBuildSelectionOptions(s, 0, [marine, scv]).find((o) => o.id === Kind.SupplyDepot);
  assert.deepEqual(depot, { id: Kind.SupplyDepot, ok: true, representative: scv });

  s.players.minerals[0] = 0;
  depot = workerBuildSelectionOptions(s, 0, [scv]).find((o) => o.id === Kind.SupplyDepot);
  assert.deepEqual(depot, {
    id: Kind.SupplyDepot,
    ok: false,
    representative: scv,
    reason: 'not-affordable',
  });

  s.players.minerals[0] = 1_000;
  const academy = workerBuildSelectionOptions(s, 0, [scv]).find((o) => o.id === Kind.Academy);
  assert.deepEqual(academy, {
    id: Kind.Academy,
    ok: false,
    representative: scv,
    reason: 'missing-requirement',
  });

  s.e.illusion[slotOf(scv)] = 1;
  assert.equal(workerBuildSelectionOptions(s, 0, [marine, scv]).length, 0);
});

test('add-on command-card options expose sim-owned availability records', () => {
  const s = makeState(open(), 1, 1236);
  const busy = spawnUnit(s, Kind.Factory, 0, tc(8), tc(8));
  const idle = spawnUnit(s, Kind.Factory, 0, tc(12), tc(8));
  const barracks = spawnUnit(s, Kind.Barracks, 0, tc(20), tc(8));
  s.e.target[slotOf(busy)] = busy;
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  let machineShop = addonSelectionOptions(s, 0, [busy, barracks, idle]).find((o) => o.id === Kind.MachineShop);
  assert.deepEqual(machineShop, {
    id: Kind.MachineShop,
    ok: true,
    representative: idle,
    commands: [{ t: 'addon', building: idle, kind: Kind.MachineShop }],
  });

  s.players.minerals[0] = 0;
  machineShop = addonSelectionOptions(s, 0, [idle]).find((o) => o.id === Kind.MachineShop);
  assert.deepEqual(machineShop, {
    id: Kind.MachineShop,
    ok: false,
    representative: idle,
    reason: 'not-affordable',
  });
  assert.equal(addonSelectionOptions(s, 0, [barracks]).find((o) => o.id === Kind.MachineShop), undefined);
});

test('research command-card candidates choose the first valid selected producer', () => {
  const s = makeState(open(), 1, 1231);
  const busy = spawnUnit(s, Kind.Academy, 0, tc(8), tc(8));
  const idle = spawnUnit(s, Kind.Academy, 0, tc(12), tc(8));
  const barracks = spawnUnit(s, Kind.Barracks, 0, tc(16), tc(8));
  s.e.researchKind[slotOf(busy)] = Tech.U238Shells;
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  assert.deepEqual(researchSelectionCandidates(s, 0, [busy, barracks, idle], Tech.StimPack), [
    { t: 'research', building: idle, tech: Tech.StimPack },
  ]);
  assert.deepEqual(researchSelectionCandidates(s, 0, [barracks], Tech.StimPack), []);
});

test('research command-card options expose sim-owned availability records', () => {
  const s = makeState(open(), 1, 1232);
  const busy = spawnUnit(s, Kind.Academy, 0, tc(8), tc(8));
  const idle = spawnUnit(s, Kind.Academy, 0, tc(12), tc(8));
  const barracks = spawnUnit(s, Kind.Barracks, 0, tc(16), tc(8));
  s.e.researchKind[slotOf(busy)] = Tech.U238Shells;
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  const stim = researchSelectionOptions(s, 0, [busy, barracks, idle]).find((o) => o.id === Tech.StimPack);
  assert.deepEqual(stim, {
    id: Tech.StimPack,
    ok: true,
    representative: idle,
    commands: [{ t: 'research', building: idle, tech: Tech.StimPack }],
  });

  s.players.minerals[0] = 0;
  assert.deepEqual(researchSelectionOptions(s, 0, [idle]).find((o) => o.id === Tech.StimPack), {
    id: Tech.StimPack,
    ok: false,
    representative: idle,
    reason: 'not-affordable',
  });
});

test('self ability command-card candidates include every valid selected caster', () => {
  const s = makeState(open(), 1, 1233);
  const validMarine = spawnUnit(s, Kind.Marine, 0, tc(8), tc(8));
  const hurtMarine = spawnUnit(s, Kind.Marine, 0, tc(10), tc(8));
  const validFirebat = spawnUnit(s, Kind.Firebat, 0, tc(12), tc(8));
  const medic = spawnUnit(s, Kind.Medic, 0, tc(14), tc(8));
  s.e.hp[slotOf(hurtMarine)] = 10;
  setTechLevel(s, 0, Tech.StimPack, 1);

  assert.deepEqual(
    selfAbilitySelectionCandidates(s, 0, [validMarine, hurtMarine, medic, validFirebat], Ability.StimPack),
    [
      { t: 'ability', unit: validMarine, ability: Ability.StimPack },
      { t: 'ability', unit: validFirebat, ability: Ability.StimPack },
    ],
  );
  assert.deepEqual(selfAbilitySelectionCandidates(s, 0, [validMarine], Ability.PsionicStorm), []);
});

test('ability command-card options expose sim-owned availability records', () => {
  const s = makeState(open(), 1, 1235);
  const marine = spawnUnit(s, Kind.Marine, 0, tc(8), tc(8));
  const templar = spawnUnit(s, Kind.HighTemplar, 0, tc(10), tc(8));
  s.e.energy[slotOf(templar)] = 75;
  setTechLevel(s, 0, Tech.StimPack, 1);

  let options = abilitySelectionOptions(s, 0, [marine, templar]);
  assert.deepEqual(options.find((o) => o.id === Ability.StimPack), {
    id: Ability.StimPack,
    ok: true,
    target: 'self',
    representative: marine,
    commands: [{ t: 'ability', unit: marine, ability: Ability.StimPack }],
  });
  assert.deepEqual(options.find((o) => o.id === Ability.PsionicStorm), {
    id: Ability.PsionicStorm,
    ok: false,
    target: 'point',
    representative: templar,
    reason: 'missing-requirement',
  });

  setTechLevel(s, 0, Tech.PsionicStorm, 1);
  options = abilitySelectionOptions(s, 0, [templar]);
  const storm = options.find((o) => o.id === Ability.PsionicStorm);
  assert.deepEqual(storm, {
    id: Ability.PsionicStorm,
    ok: true,
    target: 'point',
    representative: templar,
  });
});

test('armed rally mode targets valid friendly units and gather targets', () => {
  const s = makeState(open(), 1, 1217);
  const cc = spawnUnit(s, Kind.CommandCenter, 0, tc(8), tc(8));
  const barracks = spawnUnit(s, Kind.Barracks, 0, tc(9), tc(8));
  const marine = spawnUnit(s, Kind.Marine, 0, tc(12), tc(8));
  const mineral = spawnUnit(s, Kind.Mineral, NEUTRAL, tc(14), tc(8));

  assert.deepEqual(rallyModeCandidates(s, 0, [cc, barracks, marine], { hit: marine, x: tc(12), y: tc(8) }), [
    { t: 'rally', building: cc, x: tc(12), y: tc(8), target: marine },
    { t: 'rally', building: barracks, x: tc(12), y: tc(8), target: marine },
  ]);
  assert.deepEqual(rallyModeCandidates(s, 0, [cc], { hit: mineral, x: tc(14), y: tc(8) }), [
    { t: 'rally', building: cc, x: tc(14), y: tc(8), target: mineral },
  ]);
});

test('armed rally mode falls back to point rally for invalid entity targets', () => {
  const s = makeState(open(), 1, 1218);
  const barracks = spawnUnit(s, Kind.Barracks, 0, tc(8), tc(8));
  const mineral = spawnUnit(s, Kind.Mineral, NEUTRAL, tc(14), tc(8));

  assert.deepEqual(rallyModeCandidates(s, 0, [barracks], { hit: mineral, x: tc(14), y: tc(8) }), [
    { t: 'rally', building: barracks, x: tc(14), y: tc(8) },
  ]);
});

test('produced worker rally intent distinguishes mineral spread from gas target harvest', () => {
  const s = makeState(open(), 1, 1208);
  const e = s.e;
  const cc = slotOf(spawnUnit(s, Kind.CommandCenter, 0, tc(8), tc(8)));
  const scv = slotOf(spawnUnit(s, Kind.SCV, 0, tc(8), tc(9)));
  const mineral = slotOf(spawnUnit(s, Kind.Mineral, NEUTRAL, tc(11), tc(8)));
  const refinery = slotOf(spawnUnit(s, Kind.Refinery, 0, tc(13), tc(8)));

  e.workerRallyTarget[cc] = eid(e, mineral);
  e.workerRallyX[cc] = e.x[mineral]!;
  e.workerRallyY[cc] = e.y[mineral]!;

  assert.deepEqual(producedUnitRallyIntent(s, cc, scv), {
    kind: 'gather-near',
    x: e.x[mineral]!,
    y: e.y[mineral]!,
  });

  e.workerRallyTarget[cc] = eid(e, refinery);
  e.workerRallyX[cc] = e.x[refinery]!;
  e.workerRallyY[cc] = e.y[refinery]!;

  assert.deepEqual(producedUnitRallyIntent(s, cc, scv), {
    kind: 'gather-target',
    target: refinery,
  });
});

test('produced non-workers use unit rally instead of worker resource rally', () => {
  const s = makeState(open(), 1, 1209);
  const e = s.e;
  const hatchery = slotOf(spawnUnit(s, Kind.Hatchery, 0, tc(8), tc(8)));
  const zergling = slotOf(spawnUnit(s, Kind.Zergling, 0, tc(8), tc(9)));
  const mineral = slotOf(spawnUnit(s, Kind.Mineral, NEUTRAL, tc(11), tc(8)));
  const leader = slotOf(spawnUnit(s, Kind.Zergling, 0, tc(14), tc(8)));

  e.workerRallyTarget[hatchery] = eid(e, mineral);
  e.workerRallyX[hatchery] = e.x[mineral]!;
  e.workerRallyY[hatchery] = e.y[mineral]!;
  e.rallyTarget[hatchery] = eid(e, leader);
  e.rallyX[hatchery] = e.x[leader]!;
  e.rallyY[hatchery] = e.y[leader]!;

  assert.deepEqual(producedUnitRallyIntent(s, hatchery, zergling), {
    kind: 'travel',
    endpoint: { x: e.x[leader]!, y: e.y[leader]!, target: leader },
    intent: 'smart',
  });
});

test('town halls derive default worker mineral rally without storing hidden rally state', () => {
  const cases = [
    [Kind.CommandCenter, Kind.SCV],
    [Kind.Nexus, Kind.Probe],
    [Kind.Hatchery, Kind.Drone],
  ] as const;

  cases.forEach(([producerKind, workerKind], index) => {
    const s = makeState(open(), 1, 1220 + index);
    const e = s.e;
    const producer = slotOf(spawnUnit(s, producerKind, 0, tc(8), tc(8)));
    const worker = slotOf(spawnUnit(s, workerKind, 0, tc(8), tc(9)));
    const mineral = slotOf(spawnUnit(s, Kind.Mineral, NEUTRAL, tc(11), tc(8)));

    assert.equal(e.workerRallyTarget[producer], NONE);
    assert.deepEqual(producedUnitRallyIntent(s, producer, worker), {
      kind: 'gather-near',
      x: e.x[mineral]!,
      y: e.y[mineral]!,
    });
  });
});

test('default worker mineral rally yields to explicit unit rally and ignores combat units', () => {
  const s = makeState(open(), 1, 1223);
  const e = s.e;
  const cc = slotOf(spawnUnit(s, Kind.CommandCenter, 0, tc(8), tc(8)));
  const scv = slotOf(spawnUnit(s, Kind.SCV, 0, tc(8), tc(9)));
  const leader = slotOf(spawnUnit(s, Kind.Marine, 0, tc(12), tc(8)));
  spawnUnit(s, Kind.Mineral, NEUTRAL, tc(10), tc(8));

  e.rallyTarget[cc] = eid(e, leader);
  e.rallyX[cc] = e.x[leader]!;
  e.rallyY[cc] = e.y[leader]!;

  assert.deepEqual(producedUnitRallyIntent(s, cc, scv), {
    kind: 'travel',
    endpoint: { x: e.x[leader]!, y: e.y[leader]!, target: leader },
    intent: 'move',
  });

  const hatchery = slotOf(spawnUnit(s, Kind.Hatchery, 0, tc(16), tc(8)));
  const zergling = slotOf(spawnUnit(s, Kind.Zergling, 0, tc(16), tc(9)));
  spawnUnit(s, Kind.Mineral, NEUTRAL, tc(18), tc(8));

  assert.deepEqual(producedUnitRallyIntent(s, hatchery, zergling), { kind: 'none' });
});

test('produced units can instantiate load rally or default worker gather intent', () => {
  const s = makeState(open(), 1, 1210);
  const e = s.e;
  const barracks = slotOf(spawnUnit(s, Kind.Barracks, 0, tc(8), tc(8)));
  const marine = slotOf(spawnUnit(s, Kind.Marine, 0, tc(8), tc(9)));
  const bunker = slotOf(spawnUnit(s, Kind.Bunker, 0, tc(9), tc(8)));
  const cc = slotOf(spawnUnit(s, Kind.CommandCenter, 0, tc(14), tc(8)));
  const scv = slotOf(spawnUnit(s, Kind.SCV, 0, tc(14), tc(9)));

  e.rallyTarget[barracks] = eid(e, bunker);
  e.rallyX[barracks] = e.x[bunker]!;
  e.rallyY[barracks] = e.y[bunker]!;

  assert.deepEqual(producedUnitRallyIntent(s, barracks, marine), {
    kind: 'load',
    transport: bunker,
    endpoint: { x: e.x[bunker]!, y: e.y[bunker]!, target: bunker },
  });
  assert.deepEqual(producedUnitRallyIntent(s, cc, scv), {
    kind: 'gather-near',
    x: e.x[scv]!,
    y: e.y[scv]!,
  });
});
