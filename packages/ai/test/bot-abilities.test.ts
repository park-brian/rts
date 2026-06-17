import test from 'node:test';
import assert from 'node:assert/strict';
import { createBot } from '../src/bot.ts';
import { Sim, sliceMap, spawnUnit, Ability, Kind, Tech, Terran, Protoss, Zerg, eid, slotOf, fx, setTechLevel, NONE, validateCommand } from '@rts/sim';

const commandTypes = (cmds: ReturnType<ReturnType<typeof createBot>>): string[] => cmds.map((c) => c.t);

const entityPos = (sim: Sim, id: number): { x: number; y: number } => {
  const e = sim.fullState().e;
  const slot = slotOf(id);
  return { x: e.x[slot]!, y: e.y[slot]! };
};

const findEntity = (sim: Sim, kind: number, owner: number): number => {
  const e = sim.fullState().e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.kind[i] === kind && e.owner[i] === owner) return eid(e, i);
  }
  throw new Error(`missing entity kind=${kind} owner=${owner}`);
};

const hasAbility = (cmds: ReturnType<ReturnType<typeof createBot>>, unit: number, ability: number): boolean =>
  cmds.some((c) => c.t === 'ability' && c.unit === unit && c.ability === ability);

const grant = (sim: Sim, player: number, tech: number): void => setTechLevel(sim.fullState(), player, tech, 1);

test('bot uses Stim when committing idle bio to defend', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 40 });
  const s = sim.fullState();
  const base = entityPos(sim, findEntity(sim, Kind.CommandCenter, 0));
  const marine = spawnUnit(s, Kind.Marine, 0, base.x + fx(20), base.y);
  spawnUnit(s, Kind.Marine, 1, base.x + fx(50), base.y);
  grant(sim, 0, Tech.StimPack);
  const bot = createBot(Terran);

  const cmds = bot(s, 0);

  assert.ok(cmds.some((c) => c.t === 'ability' && c.unit === marine && c.ability === Ability.StimPack));
  assert.ok(commandTypes(cmds).includes('attack'));
});

test('bot sieges tanks when an enemy is in useful siege range', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 401 });
  const s = sim.fullState();
  const base = entityPos(sim, findEntity(sim, Kind.CommandCenter, 0));
  const tank = spawnUnit(s, Kind.SiegeTank, 0, base.x, base.y);
  spawnUnit(s, Kind.Marine, 1, base.x + fx(190), base.y);
  grant(sim, 0, Tech.SiegeTech);

  const cmds = createBot(Terran)(s, 0);

  assert.ok(cmds.some((c) => c.t === 'transform' && c.unit === tank && c.kind === Kind.SiegeTankSieged));
});

test('bot lays spider mines from charged vultures near ground threats', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 405 });
  const s = sim.fullState();
  const base = entityPos(sim, findEntity(sim, Kind.CommandCenter, 0));
  const vulture = spawnUnit(s, Kind.Vulture, 0, base.x, base.y);
  s.e.specialAmmo[slotOf(vulture)] = 3;
  spawnUnit(s, Kind.Zealot, 1, base.x + fx(40), base.y);
  grant(sim, 0, Tech.SpiderMines);

  const cmds = createBot(Terran)(s, 0);

  assert.ok(cmds.some((c) => c.t === 'mine' && c.unit === vulture));
});

test('bot burrows lurkers before using their attack', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 403 });
  const s = sim.fullState();
  spawnUnit(s, Kind.Hatchery, 0, fx(400), fx(400));
  const lurker = spawnUnit(s, Kind.Lurker, 0, fx(420), fx(400));
  spawnUnit(s, Kind.Marine, 1, fx(470), fx(400));

  const cmds = createBot(Zerg)(s, 0);

  assert.ok(cmds.some((c) => c.t === 'burrow' && c.unit === lurker && c.active));
});

test('bot attacks with already burrowed lurkers', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 404 });
  const s = sim.fullState();
  spawnUnit(s, Kind.Hatchery, 0, fx(400), fx(400));
  const lurker = spawnUnit(s, Kind.Lurker, 0, fx(420), fx(400));
  s.e.burrowed[slotOf(lurker)] = 1;
  const marine = spawnUnit(s, Kind.Marine, 1, fx(470), fx(400));

  const cmds = createBot(Zerg)(s, 0);

  assert.ok(cmds.some((c) => c.t === 'attack' && c.unit === lurker && c.target === marine));
});

test('bot starts hatchery to lair morph when zerg tech and resources are legal', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 406, factions: [Zerg, Terran] });
  const s = sim.fullState();
  const hatchery = findEntity(sim, Kind.Hatchery, 0);
  const base = entityPos(sim, hatchery);
  spawnUnit(s, Kind.SpawningPool, 0, base.x + fx(120), base.y);
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  const cmds = createBot(Zerg)(s, 0);

  assert.ok(cmds.some((c) => c.t === 'transform' && c.unit === hatchery && c.kind === Kind.Lair));
});

test('bot keeps using a completed lair as the zerg base anchor', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 407, factions: [Zerg, Terran] });
  const s = sim.fullState();
  const hatchery = findEntity(sim, Kind.Hatchery, 0);
  s.e.kind[slotOf(hatchery)] = Kind.Lair;
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  const cmds = createBot(Zerg)(s, 0);

  assert.ok(cmds.some((c) => c.t === 'train' && c.kind === Kind.Drone));
});

test('bot morphs hydralisks into lurkers through shared transform validation', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 408, factions: [Zerg, Terran] });
  const s = sim.fullState();
  const hatchery = findEntity(sim, Kind.Hatchery, 0);
  const base = entityPos(sim, hatchery);
  spawnUnit(s, Kind.HydraliskDen, 0, base.x + fx(120), base.y);
  const hydra = spawnUnit(s, Kind.Hydralisk, 0, base.x + fx(32), base.y);
  grant(sim, 0, Tech.LurkerAspect);
  sim.step();
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  const cmds = createBot(Zerg)(s, 0);

  assert.ok(cmds.some((c) => c.t === 'transform' && c.unit === hydra && c.kind === Kind.Lurker));
});

test('bot queues a legal machine shop on an idle completed factory', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 409, factions: [Terran, Zerg] });
  const s = sim.fullState();
  const factory = spawnUnit(s, Kind.Factory, 0, fx(1_200), fx(1_200));
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  const cmds = createBot(Terran)(s, 0);
  const addon = cmds.find((c) => c.t === 'addon' && c.building === factory && c.kind === Kind.MachineShop);

  assert.ok(addon);
  assert.deepEqual(validateCommand(s, 0, addon), { ok: true });
});

test('bot does not duplicate or unaffordably queue machine shop add-ons', () => {
  const duplicate = new Sim({ map: sliceMap(), players: 2, seed: 410, factions: [Terran, Zerg] });
  const dupState = duplicate.fullState();
  const dupE = dupState.e;
  const factory = slotOf(spawnUnit(dupState, Kind.Factory, 0, fx(1_200), fx(1_200)));
  const shop = slotOf(spawnUnit(dupState, Kind.MachineShop, 0, fx(1_280), fx(1_200)));
  dupE.target[factory] = eid(dupE, shop);
  dupE.target[shop] = eid(dupE, factory);
  dupState.players.minerals[0] = 1_000;
  dupState.players.gas[0] = 1_000;

  assert.equal(createBot(Terran)(dupState, 0).some((c) => c.t === 'addon' && c.kind === Kind.MachineShop), false);

  const broke = new Sim({ map: sliceMap(), players: 2, seed: 411, factions: [Terran, Zerg] });
  const brokeState = broke.fullState();
  spawnUnit(brokeState, Kind.Factory, 0, fx(1_200), fx(1_200));
  brokeState.players.minerals[0] = 1_000;
  brokeState.players.gas[0] = 0;

  assert.equal(createBot(Terran)(brokeState, 0).some((c) => c.t === 'addon' && c.kind === Kind.MachineShop), false);
});

test('bot queues a legal comsat station on an idle completed command center', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 412, factions: [Terran, Zerg] });
  const s = sim.fullState();
  const commandCenter = findEntity(sim, Kind.CommandCenter, 0);
  const base = entityPos(sim, commandCenter);
  spawnUnit(s, Kind.Academy, 0, base.x - fx(160), base.y);
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  const cmds = createBot(Terran)(s, 0);
  const addon = cmds.find((c) => c.t === 'addon' && c.building === commandCenter && c.kind === Kind.ComsatStation);

  assert.ok(addon);
  assert.deepEqual(validateCommand(s, 0, addon), { ok: true });
});

test('bot respects comsat add-on prerequisites, duplicates, and gas budget', () => {
  const missingAcademy = new Sim({ map: sliceMap(), players: 2, seed: 413, factions: [Terran, Zerg] });
  const missingState = missingAcademy.fullState();
  missingState.players.minerals[0] = 1_000;
  missingState.players.gas[0] = 1_000;

  assert.equal(createBot(Terran)(missingState, 0).some((c) => c.t === 'addon' && c.kind === Kind.ComsatStation), false);

  const duplicate = new Sim({ map: sliceMap(), players: 2, seed: 414, factions: [Terran, Zerg] });
  const dupState = duplicate.fullState();
  const dupE = dupState.e;
  const commandCenter = slotOf(findEntity(duplicate, Kind.CommandCenter, 0));
  const base = entityPos(duplicate, eid(dupE, commandCenter));
  spawnUnit(dupState, Kind.Academy, 0, base.x - fx(160), base.y);
  const comsat = slotOf(spawnUnit(dupState, Kind.ComsatStation, 0, base.x + fx(80), base.y));
  dupE.target[commandCenter] = eid(dupE, comsat);
  dupE.target[comsat] = eid(dupE, commandCenter);
  dupState.players.minerals[0] = 1_000;
  dupState.players.gas[0] = 1_000;

  assert.equal(createBot(Terran)(dupState, 0).some((c) => c.t === 'addon' && c.kind === Kind.ComsatStation), false);

  const broke = new Sim({ map: sliceMap(), players: 2, seed: 415, factions: [Terran, Zerg] });
  const brokeState = broke.fullState();
  const brokeBase = entityPos(broke, findEntity(broke, Kind.CommandCenter, 0));
  spawnUnit(brokeState, Kind.Academy, 0, brokeBase.x - fx(160), brokeBase.y);
  brokeState.players.minerals[0] = 1_000;
  brokeState.players.gas[0] = 0;

  assert.equal(createBot(Terran)(brokeState, 0).some((c) => c.t === 'addon' && c.kind === Kind.ComsatStation), false);
});

test('bot queues a legal control tower on an idle completed starport', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 416, factions: [Terran, Zerg] });
  const s = sim.fullState();
  const starport = spawnUnit(s, Kind.Starport, 0, fx(1_200), fx(1_200));
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  const cmds = createBot(Terran)(s, 0);
  const addon = cmds.find((c) => c.t === 'addon' && c.building === starport && c.kind === Kind.ControlTower);

  assert.ok(addon);
  assert.deepEqual(validateCommand(s, 0, addon), { ok: true });
});

test('bot respects control tower parent, duplicates, and gas budget', () => {
  const missingParent = new Sim({ map: sliceMap(), players: 2, seed: 417, factions: [Terran, Zerg] });
  const missingState = missingParent.fullState();
  missingState.players.minerals[0] = 1_000;
  missingState.players.gas[0] = 1_000;

  assert.equal(createBot(Terran)(missingState, 0).some((c) => c.t === 'addon' && c.kind === Kind.ControlTower), false);

  const duplicate = new Sim({ map: sliceMap(), players: 2, seed: 418, factions: [Terran, Zerg] });
  const dupState = duplicate.fullState();
  const dupE = dupState.e;
  const starport = slotOf(spawnUnit(dupState, Kind.Starport, 0, fx(1_200), fx(1_200)));
  const tower = slotOf(spawnUnit(dupState, Kind.ControlTower, 0, fx(1_280), fx(1_200)));
  dupE.target[starport] = eid(dupE, tower);
  dupE.target[tower] = eid(dupE, starport);
  dupState.players.minerals[0] = 1_000;
  dupState.players.gas[0] = 1_000;

  assert.equal(createBot(Terran)(dupState, 0).some((c) => c.t === 'addon' && c.kind === Kind.ControlTower), false);

  const broke = new Sim({ map: sliceMap(), players: 2, seed: 419, factions: [Terran, Zerg] });
  const brokeState = broke.fullState();
  spawnUnit(brokeState, Kind.Starport, 0, fx(1_200), fx(1_200));
  brokeState.players.minerals[0] = 1_000;
  brokeState.players.gas[0] = 0;

  assert.equal(createBot(Terran)(brokeState, 0).some((c) => c.t === 'addon' && c.kind === Kind.ControlTower), false);
});

test('bot queues a legal physics lab for science facilities on the air tech path', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 422, factions: [Terran, Zerg] });
  const s = sim.fullState();
  const facility = spawnUnit(s, Kind.ScienceFacility, 0, fx(1_200), fx(1_200));
  spawnUnit(s, Kind.ControlTower, 0, fx(900), fx(1_200));
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  const cmds = createBot(Terran)(s, 0);
  const addon = cmds.find((c) => c.t === 'addon' && c.building === facility && c.kind === Kind.PhysicsLab);

  assert.ok(addon);
  assert.deepEqual(validateCommand(s, 0, addon), { ok: true });
});

test('bot queues a legal covert ops for science facilities off the air tech path', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 423, factions: [Terran, Zerg] });
  const s = sim.fullState();
  const facility = spawnUnit(s, Kind.ScienceFacility, 0, fx(1_200), fx(1_200));
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  const cmds = createBot(Terran)(s, 0);
  const addon = cmds.find((c) => c.t === 'addon' && c.building === facility && c.kind === Kind.CovertOps);

  assert.ok(addon);
  assert.deepEqual(validateCommand(s, 0, addon), { ok: true });
});

test('bot respects science facility add-on parent, duplicates, and gas budget', () => {
  const missingParent = new Sim({ map: sliceMap(), players: 2, seed: 424, factions: [Terran, Zerg] });
  const missingState = missingParent.fullState();
  missingState.players.minerals[0] = 1_000;
  missingState.players.gas[0] = 1_000;

  const missingCommands = createBot(Terran)(missingState, 0);
  assert.equal(missingCommands.some((c) => c.t === 'addon' && (c.kind === Kind.PhysicsLab || c.kind === Kind.CovertOps)), false);

  const duplicate = new Sim({ map: sliceMap(), players: 2, seed: 425, factions: [Terran, Zerg] });
  const dupState = duplicate.fullState();
  const dupE = dupState.e;
  const facility = slotOf(spawnUnit(dupState, Kind.ScienceFacility, 0, fx(1_200), fx(1_200)));
  const covertOps = slotOf(spawnUnit(dupState, Kind.CovertOps, 0, fx(1_280), fx(1_200)));
  dupE.target[facility] = eid(dupE, covertOps);
  dupE.target[covertOps] = eid(dupE, facility);
  dupState.players.minerals[0] = 1_000;
  dupState.players.gas[0] = 1_000;

  const duplicateCommands = createBot(Terran)(dupState, 0);
  assert.equal(duplicateCommands.some((c) => c.t === 'addon' && (c.kind === Kind.PhysicsLab || c.kind === Kind.CovertOps)), false);

  const broke = new Sim({ map: sliceMap(), players: 2, seed: 426, factions: [Terran, Zerg] });
  const brokeState = broke.fullState();
  spawnUnit(brokeState, Kind.ScienceFacility, 0, fx(1_200), fx(1_200));
  brokeState.players.minerals[0] = 1_000;
  brokeState.players.gas[0] = 0;

  const brokeCommands = createBot(Terran)(brokeState, 0);
  assert.equal(brokeCommands.some((c) => c.t === 'addon' && (c.kind === Kind.PhysicsLab || c.kind === Kind.CovertOps)), false);
});

test('protoss bot places gateways from completed pylon power anchors', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 420, factions: [Protoss, Zerg] });
  const s = sim.fullState();
  spawnUnit(s, Kind.Pylon, 0, fx(1_200), fx(1_200));
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  const cmds = createBot(Protoss, { barracksTarget: 1 })(s, 0);
  const build = cmds.find((c) => c.t === 'build' && c.kind === Kind.Gateway);

  assert.ok(build);
  assert.deepEqual(validateCommand(s, 0, build), { ok: true });
});

test('protoss bot avoids unpowered gateway placements', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 421, factions: [Protoss, Zerg] });
  const s = sim.fullState();
  const pylon = slotOf(spawnUnit(s, Kind.Pylon, 0, fx(1_200), fx(1_200)));
  s.e.built[pylon] = 0;
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  const cmds = createBot(Protoss, { barracksTarget: 1 })(s, 0);

  assert.equal(cmds.some((c) => c.t === 'build' && c.kind === Kind.Gateway), false);
});

test('bot unsieges tanks when the focus is inside minimum range', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 402 });
  const s = sim.fullState();
  const base = entityPos(sim, findEntity(sim, Kind.CommandCenter, 0));
  const tank = spawnUnit(s, Kind.SiegeTankSieged, 0, base.x, base.y);
  spawnUnit(s, Kind.Marine, 1, base.x + fx(20), base.y);

  const cmds = createBot(Terran)(s, 0);

  assert.ok(cmds.some((c) => c.t === 'transform' && c.unit === tank && c.kind === Kind.SiegeTank));
});

test('bot does not Stim badly wounded units', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 41 });
  const s = sim.fullState();
  const base = entityPos(sim, findEntity(sim, Kind.CommandCenter, 0));
  const marine = spawnUnit(s, Kind.Marine, 0, base.x + fx(20), base.y);
  s.e.hp[slotOf(marine)] = 20;
  spawnUnit(s, Kind.Marine, 1, base.x + fx(50), base.y);
  const bot = createBot(Terran);

  const cmds = bot(s, 0);

  assert.ok(!cmds.some((c) => c.t === 'ability' && c.unit === marine && c.ability === Ability.StimPack));
});

test('bot casts EMP on valuable shield and energy clusters', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 42 });
  const s = sim.fullState();
  const base = entityPos(sim, findEntity(sim, Kind.CommandCenter, 0));
  const vessel = spawnUnit(s, Kind.ScienceVessel, 0, base.x - fx(120), base.y);
  s.e.energy[slotOf(vessel)] = 100;
  grant(sim, 0, Tech.EMPShockwave);
  spawnUnit(s, Kind.Zealot, 1, base.x + fx(30), base.y);
  const templar = spawnUnit(s, Kind.HighTemplar, 1, base.x + fx(38), base.y);
  s.e.energy[slotOf(templar)] = 75;
  const bot = createBot(Terran);

  const cmds = bot(s, 0);

  assert.ok(cmds.some((c) => c.t === 'ability' && c.unit === vessel && c.ability === Ability.EMPShockwave));
});

test('bot casts Storm on enemy clusters', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 43 });
  const s = sim.fullState();
  spawnUnit(s, Kind.Nexus, 0, fx(400), fx(400));
  const templar = spawnUnit(s, Kind.HighTemplar, 0, fx(250), fx(400));
  s.e.energy[slotOf(templar)] = 75;
  grant(sim, 0, Tech.PsionicStorm);
  spawnUnit(s, Kind.Medic, 1, fx(430), fx(400));
  spawnUnit(s, Kind.Medic, 1, fx(438), fx(400));
  const bot = createBot(Protoss, { attackThreshold: 99 });

  const cmds = bot(s, 0);

  assert.ok(cmds.some((c) => c.t === 'ability' && c.unit === templar && c.ability === Ability.PsionicStorm));
});

test('bot casts Hallucination on valuable friendly combat units', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 60 });
  const s = sim.fullState();
  spawnUnit(s, Kind.Nexus, 0, fx(400), fx(400));
  const templar = spawnUnit(s, Kind.HighTemplar, 0, fx(390), fx(400));
  const archon = spawnUnit(s, Kind.Archon, 0, fx(420), fx(400));
  s.e.energy[slotOf(templar)] = 100;
  spawnUnit(s, Kind.Ultralisk, 1, fx(450), fx(400));
  grant(sim, 0, Tech.Hallucination);

  const cmds = createBot(Protoss, { attackThreshold: 99 })(s, 0);
  assert.ok(hasAbility(cmds, templar, Ability.Hallucination));
  assert.ok(cmds.some((c) => c.t === 'ability' && c.target === archon));
});

test('bot avoids Storm when friendly fire dominates the target area', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 44 });
  const s = sim.fullState();
  spawnUnit(s, Kind.Nexus, 0, fx(400), fx(400));
  const templar = spawnUnit(s, Kind.HighTemplar, 0, fx(250), fx(400));
  s.e.energy[slotOf(templar)] = 75;
  grant(sim, 0, Tech.PsionicStorm);
  spawnUnit(s, Kind.Medic, 1, fx(430), fx(400));
  spawnUnit(s, Kind.Medic, 0, fx(432), fx(400));
  spawnUnit(s, Kind.Medic, 0, fx(436), fx(400));
  const bot = createBot(Protoss, { attackThreshold: 99 });

  const cmds = bot(s, 0);

  assert.ok(!cmds.some((c) => c.t === 'ability' && c.ability === Ability.PsionicStorm));
});

test('bot casts Defensive Matrix on a threatened damaged ally', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 45 });
  const s = sim.fullState();
  const base = entityPos(sim, findEntity(sim, Kind.CommandCenter, 0));
  const vessel = spawnUnit(s, Kind.ScienceVessel, 0, base.x - fx(80), base.y);
  const goliath = spawnUnit(s, Kind.Goliath, 0, base.x + fx(20), base.y);
  s.e.energy[slotOf(vessel)] = 100;
  s.e.hp[slotOf(goliath)] = 50;
  spawnUnit(s, Kind.Vulture, 1, base.x + fx(60), base.y);

  const cmds = createBot(Terran)(s, 0);

  assert.ok(hasAbility(cmds, vessel, Ability.DefensiveMatrix));
});

test('bot uses Medic support abilities for wounded and disabled allies', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 55 });
  const s = sim.fullState();
  const base = entityPos(sim, findEntity(sim, Kind.CommandCenter, 0));
  const medic = spawnUnit(s, Kind.Medic, 0, base.x + fx(10), base.y);
  const marine = spawnUnit(s, Kind.Marine, 0, base.x + fx(24), base.y);
  s.e.hp[slotOf(marine)] = 20;
  s.e.energy[slotOf(medic)] = 50;
  spawnUnit(s, Kind.Marine, 1, base.x + fx(50), base.y);

  let cmds = createBot(Terran)(s, 0);
  assert.ok(hasAbility(cmds, medic, Ability.Heal));

  s.e.hp[slotOf(marine)] = 40;
  s.e.lockdownTimer[slotOf(marine)] = 100;
  grant(sim, 0, Tech.Restoration);
  cmds = createBot(Terran)(s, 0);
  assert.ok(hasAbility(cmds, medic, Ability.Restoration));
});

test('bot uses Optical Flare on valuable enemy vision units', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 56 });
  const s = sim.fullState();
  const base = entityPos(sim, findEntity(sim, Kind.CommandCenter, 0));
  const medic = spawnUnit(s, Kind.Medic, 0, base.x, base.y);
  s.e.energy[slotOf(medic)] = 75;
  spawnUnit(s, Kind.ScienceVessel, 1, base.x + fx(50), base.y);
  grant(sim, 0, Tech.OpticalFlare);

  const cmds = createBot(Terran)(s, 0);
  assert.ok(hasAbility(cmds, medic, Ability.OpticalFlare));
});

test('bot casts Irradiate on biological clusters', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 46 });
  const s = sim.fullState();
  const base = entityPos(sim, findEntity(sim, Kind.CommandCenter, 0));
  const vessel = spawnUnit(s, Kind.ScienceVessel, 0, base.x + fx(180), base.y);
  s.e.energy[slotOf(vessel)] = 75;
  grant(sim, 0, Tech.Irradiate);
  spawnUnit(s, Kind.Marine, 1, base.x + fx(230), base.y);
  spawnUnit(s, Kind.Marine, 1, base.x + fx(238), base.y);

  const cmds = createBot(Terran, { attackThreshold: 0 })(s, 0);

  assert.ok(hasAbility(cmds, vessel, Ability.Irradiate));
});

test('bot casts Lockdown on valuable mechanical enemies', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 47 });
  const s = sim.fullState();
  const base = entityPos(sim, findEntity(sim, Kind.CommandCenter, 0));
  const ghost = spawnUnit(s, Kind.Ghost, 0, base.x - fx(60), base.y);
  s.e.energy[slotOf(ghost)] = 100;
  grant(sim, 0, Tech.Lockdown);
  spawnUnit(s, Kind.Goliath, 1, base.x + fx(30), base.y);

  const cmds = createBot(Terran)(s, 0);

  assert.ok(hasAbility(cmds, ghost, Ability.Lockdown));
});

test('bot casts Yamato on high-value targets', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 48 });
  const s = sim.fullState();
  const base = entityPos(sim, findEntity(sim, Kind.CommandCenter, 0));
  const bc = spawnUnit(s, Kind.Battlecruiser, 0, base.x - fx(80), base.y);
  s.e.energy[slotOf(bc)] = 150;
  grant(sim, 0, Tech.YamatoCannon);
  spawnUnit(s, Kind.Ultralisk, 1, base.x + fx(60), base.y);

  const cmds = createBot(Terran)(s, 0);

  assert.ok(hasAbility(cmds, bc, Ability.YamatoGun));
});

test('bot launches nukes at high-value enemy clusters when a missile is ready', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 481 });
  const s = sim.fullState();
  const base = entityPos(sim, findEntity(sim, Kind.CommandCenter, 0));
  const ghost = spawnUnit(s, Kind.Ghost, 0, base.x, base.y);
  const silo = spawnUnit(s, Kind.NuclearSilo, 0, base.x, base.y);
  s.e.specialAmmo[slotOf(silo)] = 1;
  spawnUnit(s, Kind.CommandCenter, 1, base.x + fx(260), base.y);
  spawnUnit(s, Kind.SupplyDepot, 1, base.x + fx(280), base.y);

  const cmds = createBot(Terran)(s, 0);

  assert.ok(hasAbility(cmds, ghost, Ability.NuclearStrike));
});

test('bot does not launch nukes without ready missile ammo', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 482 });
  const s = sim.fullState();
  const base = entityPos(sim, findEntity(sim, Kind.CommandCenter, 0));
  const ghost = spawnUnit(s, Kind.Ghost, 0, base.x, base.y);
  spawnUnit(s, Kind.CommandCenter, 1, base.x + fx(260), base.y);
  spawnUnit(s, Kind.SupplyDepot, 1, base.x + fx(280), base.y);

  const cmds = createBot(Terran)(s, 0);

  assert.ok(!hasAbility(cmds, ghost, Ability.NuclearStrike));
});

test('bot casts Feedback on energy-heavy enemies', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 49 });
  const s = sim.fullState();
  spawnUnit(s, Kind.Nexus, 0, fx(400), fx(400));
  const archon = spawnUnit(s, Kind.DarkArchon, 0, fx(360), fx(400));
  const vessel = spawnUnit(s, Kind.ScienceVessel, 1, fx(430), fx(400));
  s.e.energy[slotOf(archon)] = 50;
  s.e.energy[slotOf(vessel)] = 100;

  const cmds = createBot(Protoss, { attackThreshold: 99 })(s, 0);

  assert.ok(hasAbility(cmds, archon, Ability.Feedback));
});

test('bot casts Mind Control on high-value enemies', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 57 });
  const s = sim.fullState();
  spawnUnit(s, Kind.Nexus, 0, fx(400), fx(400));
  const archon = spawnUnit(s, Kind.DarkArchon, 0, fx(360), fx(400));
  s.e.energy[slotOf(archon)] = 150;
  spawnUnit(s, Kind.Ultralisk, 1, fx(430), fx(400));
  grant(sim, 0, Tech.MindControl);

  const cmds = createBot(Protoss, { attackThreshold: 99 })(s, 0);
  assert.ok(hasAbility(cmds, archon, Ability.MindControl));
});

test('bot recalls distant friendly combat clusters into an Arbiter fight', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 58 });
  const s = sim.fullState();
  spawnUnit(s, Kind.Nexus, 0, fx(400), fx(400));
  const arbiter = spawnUnit(s, Kind.Arbiter, 0, fx(420), fx(400));
  s.e.energy[slotOf(arbiter)] = 150;
  spawnUnit(s, Kind.Zealot, 0, fx(100), fx(100));
  spawnUnit(s, Kind.Zealot, 0, fx(108), fx(100));
  spawnUnit(s, Kind.Zealot, 0, fx(116), fx(100));
  spawnUnit(s, Kind.Ultralisk, 1, fx(430), fx(400));
  grant(sim, 0, Tech.Recall);

  const cmds = createBot(Protoss, { attackThreshold: 99 })(s, 0);
  assert.ok(hasAbility(cmds, arbiter, Ability.Recall));
});

test('bot recharges damaged Protoss shields with Shield Batteries', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 581 });
  const s = sim.fullState();
  spawnUnit(s, Kind.Nexus, 0, fx(400), fx(400));
  const battery = spawnUnit(s, Kind.ShieldBattery, 0, fx(400), fx(400));
  const zealot = spawnUnit(s, Kind.Zealot, 0, fx(430), fx(400));
  s.e.energy[slotOf(battery)] = 50;
  s.e.shield[slotOf(zealot)] = 20;
  spawnUnit(s, Kind.Ultralisk, 1, fx(450), fx(400));

  const cmds = createBot(Protoss, { attackThreshold: 99 })(s, 0);

  assert.ok(hasAbility(cmds, battery, Ability.ShieldRecharge));
});

test('bot casts Protoss area control abilities on clusters', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 50 });
  const s = sim.fullState();
  spawnUnit(s, Kind.Nexus, 0, fx(400), fx(400));
  const archon = spawnUnit(s, Kind.DarkArchon, 0, fx(360), fx(400));
  const arbiter = spawnUnit(s, Kind.Arbiter, 0, fx(365), fx(410));
  const corsair = spawnUnit(s, Kind.Corsair, 0, fx(370), fx(390));
  s.e.energy[slotOf(archon)] = 100;
  s.e.energy[slotOf(arbiter)] = 100;
  s.e.energy[slotOf(corsair)] = 125;
  grant(sim, 0, Tech.Maelstrom);
  grant(sim, 0, Tech.StasisField);
  grant(sim, 0, Tech.DisruptionWeb);
  spawnUnit(s, Kind.Ultralisk, 1, fx(430), fx(400));
  spawnUnit(s, Kind.Ultralisk, 1, fx(438), fx(400));

  const cmds = createBot(Protoss, { attackThreshold: 99 })(s, 0);

  assert.ok(hasAbility(cmds, archon, Ability.Maelstrom));
  assert.ok(hasAbility(cmds, arbiter, Ability.StasisField));
  assert.ok(hasAbility(cmds, corsair, Ability.DisruptionWeb));
});

test('bot casts Queen abilities on legal targets and clusters', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 51 });
  const s = sim.fullState();
  spawnUnit(s, Kind.Hatchery, 0, fx(400), fx(400));
  const queenA = spawnUnit(s, Kind.Queen, 0, fx(360), fx(400));
  const queenB = spawnUnit(s, Kind.Queen, 0, fx(365), fx(410));
  s.e.energy[slotOf(queenA)] = 150;
  s.e.energy[slotOf(queenB)] = 75;
  grant(sim, 0, Tech.SpawnBroodling);
  grant(sim, 0, Tech.Ensnare);
  spawnUnit(s, Kind.Ultralisk, 1, fx(430), fx(400));
  spawnUnit(s, Kind.Mutalisk, 1, fx(440), fx(410));
  spawnUnit(s, Kind.Mutalisk, 1, fx(448), fx(410));

  const cmds = createBot(Zerg, { attackThreshold: 99 })(s, 0);

  assert.ok(hasAbility(cmds, queenA, Ability.SpawnBroodling));
  assert.ok(hasAbility(cmds, queenB, Ability.Ensnare));
});

test('bot parasites high-value visible enemies', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 59 });
  const s = sim.fullState();
  spawnUnit(s, Kind.Hatchery, 0, fx(400), fx(400));
  const queen = spawnUnit(s, Kind.Queen, 0, fx(360), fx(400));
  s.e.energy[slotOf(queen)] = 75;
  spawnUnit(s, Kind.ScienceVessel, 1, fx(430), fx(400));

  const cmds = createBot(Zerg, { attackThreshold: 99 })(s, 0);
  assert.ok(hasAbility(cmds, queen, Ability.Parasite));
});

test('bot infests badly damaged Terran command centers', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 61 });
  const s = sim.fullState();
  spawnUnit(s, Kind.Hatchery, 0, fx(400), fx(400));
  const queen = spawnUnit(s, Kind.Queen, 0, fx(420), fx(400));
  const cc = spawnUnit(s, Kind.CommandCenter, 1, fx(445), fx(400));
  s.e.hp[slotOf(cc)] = 500;

  const cmds = createBot(Zerg, { attackThreshold: 99 })(s, 0);
  assert.ok(hasAbility(cmds, queen, Ability.InfestCommandCenter));
});

test('bot casts Defiler plague, consume, and dark swarm when appropriate', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 52 });
  const s = sim.fullState();
  spawnUnit(s, Kind.Hatchery, 0, fx(100), fx(100));
  const plagueDefiler = spawnUnit(s, Kind.Defiler, 0, fx(500), fx(400));
  const consumeDefiler = spawnUnit(s, Kind.Defiler, 0, fx(540), fx(410));
  const swarmDefiler = spawnUnit(s, Kind.Defiler, 0, fx(650), fx(390));
  s.e.energy[slotOf(plagueDefiler)] = 150;
  s.e.energy[slotOf(consumeDefiler)] = 20;
  s.e.energy[slotOf(swarmDefiler)] = 100;
  grant(sim, 0, Tech.Plague);
  grant(sim, 0, Tech.Consume);
  spawnUnit(s, Kind.Broodling, 0, fx(540), fx(410));
  spawnUnit(s, Kind.Zergling, 0, fx(600), fx(400));
  spawnUnit(s, Kind.Ultralisk, 1, fx(610), fx(400));
  spawnUnit(s, Kind.Ultralisk, 1, fx(618), fx(400));
  spawnUnit(s, Kind.Marine, 1, fx(606), fx(408));
  spawnUnit(s, Kind.Marine, 1, fx(614), fx(408));
  spawnUnit(s, Kind.Marine, 1, fx(120), fx(100));

  const cmds = createBot(Zerg, { attackThreshold: 99 })(s, 0);

  assert.ok(hasAbility(cmds, plagueDefiler, Ability.Plague));
  assert.ok(hasAbility(cmds, consumeDefiler, Ability.Consume));
  assert.ok(hasAbility(cmds, swarmDefiler, Ability.DarkSwarm));
});

test('bot scans undetected cloaked enemies', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 53 });
  const s = sim.fullState();
  const base = entityPos(sim, findEntity(sim, Kind.CommandCenter, 0));
  const comsat = spawnUnit(s, Kind.ComsatStation, 0, base.x, base.y);
  s.e.energy[slotOf(comsat)] = 50;
  spawnUnit(s, Kind.DarkTemplar, 1, base.x + fx(40), base.y);

  const cmds = createBot(Terran)(s, 0);

  assert.ok(hasAbility(cmds, comsat, Ability.ScannerSweep));
});

test('bot cloaks wraiths when entering a fight', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 54 });
  const s = sim.fullState();
  const base = entityPos(sim, findEntity(sim, Kind.CommandCenter, 0));
  const wraith = spawnUnit(s, Kind.Wraith, 0, base.x + fx(20), base.y);
  s.e.energy[slotOf(wraith)] = 50;
  grant(sim, 0, Tech.CloakingField);
  spawnUnit(s, Kind.Marine, 1, base.x + fx(60), base.y);

  const cmds = createBot(Terran)(s, 0);

  assert.ok(hasAbility(cmds, wraith, Ability.CloakingField));
});

test('bot uses a same-team nydus network to shortcut attack waves', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 83 });
  const s = sim.fullState();
  const e = s.e;
  const home = entityPos(sim, findEntity(sim, Kind.CommandCenter, 0));
  const enemy = entityPos(sim, findEntity(sim, Kind.CommandCenter, 1));
  const entrance = slotOf(spawnUnit(s, Kind.NydusCanal, 0, home.x + fx(48), home.y));
  const exit = slotOf(spawnUnit(s, Kind.NydusCanal, 0, enemy.x - fx(48), enemy.y));
  const marine = spawnUnit(s, Kind.Marine, 0, home.x + fx(56), home.y);

  const cmds = createBot(Terran, { attackThreshold: 1 })(s, 0);

  assert.ok(cmds.some((c) => c.t === 'load' && c.transport === eid(e, entrance) && c.unit === marine));
  assert.ok(cmds.some((c) => c.t === 'unload' && c.transport === eid(e, entrance) && c.unit === marine));

  sim.step([{ player: 0, cmds }]);
  assert.equal(e.container[slotOf(marine)], NONE);
  assert.ok(Math.abs(e.x[slotOf(marine)]! - e.x[exit]!) <= fx(96));
});

test('bot commits scourge against nearby air threats', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 84 });
  const s = sim.fullState();
  const hatchery = spawnUnit(s, Kind.Hatchery, 0, fx(400), fx(400));
  const base = entityPos(sim, hatchery);
  const scourge = spawnUnit(s, Kind.Scourge, 0, base.x + fx(20), base.y);
  const wraith = spawnUnit(s, Kind.Wraith, 1, base.x + fx(24), base.y);

  const cmds = createBot(Zerg)(s, 0);

  assert.ok(cmds.some((c) => c.t === 'attack' && c.unit === scourge && c.target === wraith));
});
