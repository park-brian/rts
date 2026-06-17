import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/sim.ts';
import { sliceMap } from '../src/map.ts';
import { spawnUnit } from '../src/factory.ts';
import { Ability, Kind, Tech, Units, sec } from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import { eid, isAlive, slotOf } from '../src/world.ts';
import { setTechLevel } from '../src/tech.ts';
import { canDetect } from '../src/detection.ts';
import { validateCommand } from '../src/validation.ts';

const grant = (sim: Sim, player: number, tech: number): void => setTechLevel(sim.fullState(), player, tech, 1);

const linkAddon = (s: ReturnType<Sim['fullState']>, parent: number, addon: number): void => {
  const e = s.e;
  e.target[slotOf(parent)] = addon;
  e.target[slotOf(addon)] = parent;
};

const loadedSilo = (s: ReturnType<Sim['fullState']>, player: number, x = fx(400), y = fx(400)): number => {
  const parent = spawnUnit(s, Kind.CommandCenter, player, x - fx(80), y);
  const silo = spawnUnit(s, Kind.NuclearSilo, player, x, y);
  linkAddon(s, parent, silo);
  s.e.specialAmmo[slotOf(silo)] = 1;
  return silo;
};

test('stim costs hit points and speeds the next attack cooldown', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 20 });
  const s = sim.fullState();
  const marine = spawnUnit(s, Kind.Marine, 0, fx(400), fx(400));
  const target = spawnUnit(s, Kind.SupplyDepot, 1, fx(430), fx(400));
  const m = slotOf(marine);
  grant(sim, 0, Tech.StimPack);

  const results = sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: marine, ability: Ability.StimPack },
    { t: 'attack', unit: marine, target },
  ] }]);

  assert.deepEqual(results, [
    { player: 0, index: 0, t: 'ability', ok: true },
    { player: 0, index: 1, t: 'attack', ok: true },
  ]);
  assert.equal(s.e.hp[m], Units[Kind.Marine]!.hp - 10);
  assert.ok(s.e.stimTimer[m]! > 0);
  assert.equal(s.e.wcd[m], 10);
});

test('ability validation rejects unaffordable energy casts', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 21 });
  const s = sim.fullState();
  const vessel = spawnUnit(s, Kind.ScienceVessel, 0, fx(400), fx(400));
  const v = slotOf(vessel);
  s.e.energy[v] = 99;
  grant(sim, 0, Tech.EMPShockwave);

  const results = sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: vessel, ability: Ability.EMPShockwave, x: fx(430), y: fx(400) },
  ] }]);

  assert.deepEqual(results, [{ player: 0, index: 0, t: 'ability', ok: false, reason: 'not-enough-energy' }]);
});

test('EMP removes shields and energy in an area', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 22 });
  const s = sim.fullState();
  const vessel = spawnUnit(s, Kind.ScienceVessel, 0, fx(400), fx(400));
  const zealot = spawnUnit(s, Kind.Zealot, 1, fx(430), fx(400));
  const templar = spawnUnit(s, Kind.HighTemplar, 1, fx(435), fx(400));
  s.e.energy[slotOf(vessel)] = 100;
  s.e.energy[slotOf(templar)] = 75;
  grant(sim, 0, Tech.EMPShockwave);

  sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: vessel, ability: Ability.EMPShockwave, x: fx(430), y: fx(400) },
  ] }]);

  assert.equal(s.e.energy[slotOf(vessel)], 0);
  assert.equal(s.e.shield[slotOf(zealot)], 0);
  assert.equal(s.e.shield[slotOf(templar)], 0);
  assert.equal(s.e.energy[slotOf(templar)], 0);
});

test('psionic storm creates persistent area damage for units but not structures', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 23 });
  const s = sim.fullState();
  const templar = spawnUnit(s, Kind.HighTemplar, 0, fx(400), fx(400));
  const enemy = spawnUnit(s, Kind.Medic, 1, fx(430), fx(400));
  const friendly = spawnUnit(s, Kind.Medic, 0, fx(435), fx(400));
  const depot = spawnUnit(s, Kind.SupplyDepot, 1, fx(430), fx(430));
  s.e.energy[slotOf(templar)] = 75;
  grant(sim, 0, Tech.PsionicStorm);
  const depotHp = s.e.hp[slotOf(depot)]!;

  sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: templar, ability: Ability.PsionicStorm, x: fx(430), y: fx(400) },
  ] }]);

  assert.equal(s.e.hp[slotOf(enemy)], Units[Kind.Medic]!.hp - 14);
  assert.equal(s.e.hp[slotOf(friendly)], Units[Kind.Medic]!.hp - 14);
  assert.equal(s.e.hp[slotOf(depot)], depotHp);

  for (let t = 0; t < 64; t++) sim.step([]);
  assert.equal(s.e.alive[slotOf(enemy)], 0);
  assert.equal(s.e.alive[slotOf(friendly)], 0);
});

test('defensive matrix absorbs incoming weapon damage before shields and hp', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 24 });
  const s = sim.fullState();
  const vessel = spawnUnit(s, Kind.ScienceVessel, 0, fx(400), fx(400));
  const zealot = spawnUnit(s, Kind.Zealot, 0, fx(430), fx(400));
  s.e.energy[slotOf(vessel)] = 100;

  sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: vessel, ability: Ability.DefensiveMatrix, target: zealot },
  ] }]);
  const z = slotOf(zealot);
  assert.equal(s.e.matrixHp[z], 250);

  const enemy = spawnUnit(s, Kind.Marine, 1, fx(450), fx(400));
  sim.step([{ player: 1, cmds: [{ t: 'attack', unit: enemy, target: zealot }] }]);

  assert.equal(s.e.matrixHp[z], 244);
  assert.equal(s.e.shield[z], Units[Kind.Zealot]!.shields);
  assert.equal(s.e.hp[z], Units[Kind.Zealot]!.hp);
});

test('lockdown prevents a mechanical unit from moving or attacking', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 25 });
  const s = sim.fullState();
  const ghost = spawnUnit(s, Kind.Ghost, 0, fx(400), fx(400));
  const goliath = spawnUnit(s, Kind.Goliath, 1, fx(430), fx(400));
  const marine = spawnUnit(s, Kind.Marine, 0, fx(450), fx(400));
  s.e.energy[slotOf(ghost)] = 100;
  grant(sim, 0, Tech.Lockdown);

  sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: ghost, ability: Ability.Lockdown, target: goliath },
  ] }]);
  const gs = slotOf(goliath);
  assert.ok(s.e.lockdownTimer[gs]! > 0);

  const beforeX = s.e.x[gs]!;
  sim.step([{ player: 1, cmds: [
    { t: 'move', unit: goliath, x: fx(500), y: fx(400) },
    { t: 'attack', unit: goliath, target: marine },
  ] }]);

  assert.equal(s.e.x[gs], beforeX);
  assert.equal(s.e.wcd[gs], 0);
});

test('feedback drains energy and deals matching damage', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 26 });
  const s = sim.fullState();
  const archon = spawnUnit(s, Kind.DarkArchon, 0, fx(400), fx(400));
  const vessel = spawnUnit(s, Kind.ScienceVessel, 1, fx(430), fx(400));
  s.e.energy[slotOf(archon)] = 50;
  s.e.energy[slotOf(vessel)] = 80;

  sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: archon, ability: Ability.Feedback, target: vessel },
  ] }]);

  assert.equal(s.e.energy[slotOf(vessel)], 0);
  assert.equal(s.e.hp[slotOf(vessel)], Units[Kind.ScienceVessel]!.hp - 80);
});

test('plague damages but cannot kill', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 27 });
  const s = sim.fullState();
  const defiler = spawnUnit(s, Kind.Defiler, 0, fx(400), fx(400));
  const marine = spawnUnit(s, Kind.Marine, 1, fx(430), fx(400));
  s.e.energy[slotOf(defiler)] = 150;
  s.e.hp[slotOf(marine)] = 5;
  grant(sim, 0, Tech.Plague);

  sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: defiler, ability: Ability.Plague, x: fx(430), y: fx(400) },
  ] }]);
  for (let t = 0; t < sec(26); t++) sim.step([]);

  assert.equal(s.e.alive[slotOf(marine)], 1);
  assert.equal(s.e.hp[slotOf(marine)], 1);
});

test('spawn broodling kills a legal biological ground target and creates broodlings', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 28 });
  const s = sim.fullState();
  const queen = spawnUnit(s, Kind.Queen, 0, fx(400), fx(400));
  const zealot = spawnUnit(s, Kind.Zealot, 1, fx(430), fx(400));
  s.e.energy[slotOf(queen)] = 150;
  grant(sim, 0, Tech.SpawnBroodling);

  sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: queen, ability: Ability.SpawnBroodling, target: zealot },
  ] }]);

  assert.equal(isAlive(s.e, zealot), false);
  let broodlings = 0;
  for (let i = 0; i < s.e.hi; i++) if (s.e.alive[i] === 1 && s.e.kind[i] === Kind.Broodling && s.e.owner[i] === 0) broodlings++;
  assert.equal(broodlings, 2);
});

test('dark swarm blocks ranged ground damage while disruption web prevents ground attacks', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 29 });
  const s = sim.fullState();
  const defiler = spawnUnit(s, Kind.Defiler, 0, fx(400), fx(400));
  const corsair = spawnUnit(s, Kind.Corsair, 0, fx(405), fx(400));
  const marine = spawnUnit(s, Kind.Marine, 1, fx(430), fx(400));
  const zealot = spawnUnit(s, Kind.Zealot, 0, fx(450), fx(400));
  s.e.energy[slotOf(defiler)] = 225;
  s.e.energy[slotOf(corsair)] = 125;
  grant(sim, 0, Tech.DisruptionWeb);

  sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: defiler, ability: Ability.DarkSwarm, x: fx(450), y: fx(400) },
    { t: 'ability', unit: corsair, ability: Ability.DisruptionWeb, x: fx(430), y: fx(400) },
  ] }]);
  const zealotShield = s.e.shield[slotOf(zealot)]!;
  sim.step([{ player: 1, cmds: [{ t: 'attack', unit: marine, target: zealot }] }]);

  assert.equal(s.e.shield[slotOf(zealot)], zealotShield);
  assert.equal(s.e.wcd[slotOf(marine)], 0);
});

test('permanently cloaked units require a nearby detector to be attacked', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 30 });
  const s = sim.fullState();
  const marine = spawnUnit(s, Kind.Marine, 0, fx(400), fx(400));
  const dt = spawnUnit(s, Kind.DarkTemplar, 1, fx(700), fx(400));

  let results = sim.step([{ player: 0, cmds: [
    { t: 'attack', unit: marine, target: dt },
  ] }]);
  assert.deepEqual(results, [{ player: 0, index: 0, t: 'attack', ok: false, reason: 'target-not-allowed' }]);

  spawnUnit(s, Kind.ScienceVessel, 0, fx(690), fx(400));
  results = sim.step([{ player: 0, cmds: [
    { t: 'attack', unit: marine, target: dt },
  ] }]);
  assert.deepEqual(results, [{ player: 0, index: 0, t: 'attack', ok: true }]);
});

test('active cloak toggles on, drains energy, and blocks attacks until revealed', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 31 });
  const s = sim.fullState();
  const wraith = spawnUnit(s, Kind.Wraith, 1, fx(700), fx(400));
  const marine = spawnUnit(s, Kind.Marine, 0, fx(670), fx(400));
  s.e.energy[slotOf(wraith)] = 26;
  grant(sim, 1, Tech.CloakingField);

  let results = sim.step([{ player: 1, cmds: [
    { t: 'ability', unit: wraith, ability: Ability.CloakingField },
  ] }]);
  assert.deepEqual(results, [{ player: 1, index: 0, t: 'ability', ok: true }]);
  assert.equal(s.e.cloakActive[slotOf(wraith)], 1);
  assert.equal(s.e.energy[slotOf(wraith)], 1);

  results = sim.step([{ player: 0, cmds: [
    { t: 'attack', unit: marine, target: wraith },
  ] }]);
  assert.deepEqual(results, [{ player: 0, index: 0, t: 'attack', ok: false, reason: 'target-not-allowed' }]);

  for (let t = 0; t < sec(6); t++) sim.step([]);
  assert.equal(s.e.cloakActive[slotOf(wraith)], 0);
});

test('scanner sweep reveals cloaked targets without a detector unit', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 32 });
  const s = sim.fullState();
  const commandCenter = spawnUnit(s, Kind.CommandCenter, 0, fx(220), fx(300));
  const comsat = spawnUnit(s, Kind.ComsatStation, 0, fx(300), fx(300));
  const marine = spawnUnit(s, Kind.Marine, 0, fx(400), fx(400));
  const dt = spawnUnit(s, Kind.DarkTemplar, 1, fx(700), fx(400));
  linkAddon(s, commandCenter, comsat);
  s.e.energy[slotOf(comsat)] = 50;

  sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: comsat, ability: Ability.ScannerSweep, x: fx(700), y: fx(400) },
  ] }]);
  const results = sim.step([{ player: 0, cmds: [
    { t: 'attack', unit: marine, target: dt },
  ] }]);

  assert.deepEqual(results, [{ player: 0, index: 0, t: 'attack', ok: true }]);
});

test('entity abilities with any target team still require cloaked enemies to be detected', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 321 });
  const s = sim.fullState();
  const medic = spawnUnit(s, Kind.Medic, 0, fx(400), fx(400));
  const dt = spawnUnit(s, Kind.DarkTemplar, 1, fx(430), fx(400));
  s.e.energy[slotOf(medic)] = 50;
  grant(sim, 0, Tech.Restoration);

  const results = sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: medic, ability: Ability.Restoration, target: dt },
  ] }]);

  assert.deepEqual(results, [{ player: 0, index: 0, t: 'ability', ok: false, reason: 'target-not-allowed' }]);
});

test('arbiter aura cloaks nearby friendly units but not the arbiter itself', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 33 });
  const s = sim.fullState();
  const arbiter = spawnUnit(s, Kind.Arbiter, 1, fx(700), fx(400));
  const zealot = spawnUnit(s, Kind.Zealot, 1, fx(730), fx(400));
  const marine = spawnUnit(s, Kind.Marine, 0, fx(670), fx(400));

  let results = sim.step([{ player: 0, cmds: [
    { t: 'attack', unit: marine, target: zealot },
  ] }]);
  assert.deepEqual(results, [{ player: 0, index: 0, t: 'attack', ok: false, reason: 'target-not-allowed' }]);

  results = sim.step([{ player: 0, cmds: [
    { t: 'attack', unit: marine, target: arbiter },
  ] }]);
  assert.deepEqual(results, [{ player: 0, index: 0, t: 'attack', ok: true }]);
});

test('medic heal restores biological hit points by spending energy', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 34 });
  const s = sim.fullState();
  const medic = spawnUnit(s, Kind.Medic, 0, fx(400), fx(400));
  const marine = spawnUnit(s, Kind.Marine, 0, fx(420), fx(400));
  s.e.energy[slotOf(medic)] = 5;
  s.e.hp[slotOf(marine)] = 30;

  const results = sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: medic, ability: Ability.Heal, target: marine },
  ] }]);

  assert.deepEqual(results, [{ player: 0, index: 0, t: 'ability', ok: true }]);
  assert.equal(s.e.energy[slotOf(medic)], 4);
  assert.equal(s.e.hp[slotOf(marine)], 32);
});

test('restoration clears removable statuses but not stasis', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 35 });
  const s = sim.fullState();
  const medic = spawnUnit(s, Kind.Medic, 0, fx(400), fx(400));
  const marine = spawnUnit(s, Kind.Marine, 0, fx(430), fx(400));
  const m = slotOf(marine);
  s.e.energy[slotOf(medic)] = 50;
  s.e.irradiateTimer[m] = 10;
  s.e.plagueTimer[m] = 10;
  s.e.ensnareTimer[m] = 10;
  s.e.lockdownTimer[m] = 10;
  s.e.maelstromTimer[m] = 10;
  s.e.stasisTimer[m] = 10;
  s.e.acidSporeCount[m] = 3;
  s.e.acidSporeTimer[m] = 10;
  s.e.opticalFlare[m] = 1;
  s.e.parasiteOwner[m] = 1;
  grant(sim, 0, Tech.Restoration);

  sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: medic, ability: Ability.Restoration, target: marine },
  ] }]);

  assert.equal(s.e.irradiateTimer[m], 0);
  assert.equal(s.e.plagueTimer[m], 0);
  assert.equal(s.e.ensnareTimer[m], 0);
  assert.equal(s.e.lockdownTimer[m], 0);
  assert.equal(s.e.maelstromTimer[m], 0);
  assert.equal(s.e.acidSporeCount[m], 0);
  assert.equal(s.e.acidSporeTimer[m], 0);
  assert.equal(s.e.opticalFlare[m], 0);
  assert.equal(s.e.parasiteOwner[m], 255);
  assert.equal(s.e.stasisTimer[m], 9);
});

test('optical flare removes detector coverage until restored', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 36 });
  const s = sim.fullState();
  const medic = spawnUnit(s, Kind.Medic, 0, fx(400), fx(400));
  const dt = spawnUnit(s, Kind.DarkTemplar, 0, fx(430), fx(400));
  const vessel = spawnUnit(s, Kind.ScienceVessel, 1, fx(450), fx(400));
  s.e.energy[slotOf(medic)] = 75;
  grant(sim, 0, Tech.OpticalFlare);
  assert.equal(canDetect(s, 1, slotOf(dt)), true);

  sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: medic, ability: Ability.OpticalFlare, target: vessel },
  ] }]);

  assert.equal(s.e.opticalFlare[slotOf(vessel)], 1);
  assert.equal(canDetect(s, 1, slotOf(dt)), false);
});

test('parasite grants vision from the target and detector coverage if the target detects', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 37, vision: true });
  const s = sim.fullState();
  const queen = spawnUnit(s, Kind.Queen, 0, fx(400), fx(400));
  const observer = spawnUnit(s, Kind.ScienceVessel, 1, fx(500), fx(400));
  const dt = spawnUnit(s, Kind.DarkTemplar, 1, fx(520), fx(400));
  s.e.energy[slotOf(queen)] = 75;

  sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: queen, ability: Ability.Parasite, target: observer },
  ] }]);

  assert.equal(s.e.parasiteOwner[slotOf(observer)], 0);
  assert.equal(canDetect(s, 0, slotOf(dt)), true);
  const tile = Math.floor(s.e.y[slotOf(observer)]! / fx(32)) * s.map.w + Math.floor(s.e.x[slotOf(observer)]! / fx(32));
  assert.equal(s.vision[0]![tile], 2);
});

test('recall teleports friendly mobile units near the arbiter', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 38 });
  const s = sim.fullState();
  const arbiter = spawnUnit(s, Kind.Arbiter, 0, fx(400), fx(400));
  const zealot = spawnUnit(s, Kind.Zealot, 0, fx(700), fx(400));
  const enemy = spawnUnit(s, Kind.Zealot, 1, fx(705), fx(400));
  s.e.energy[slotOf(arbiter)] = 150;
  grant(sim, 0, Tech.Recall);

  sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: arbiter, ability: Ability.Recall, x: fx(700), y: fx(400) },
  ] }]);

  assert.ok(Math.abs(s.e.x[slotOf(zealot)]! - s.e.x[slotOf(arbiter)]!) <= fx(24));
  assert.equal(s.e.owner[slotOf(enemy)], 1);
  assert.equal(s.e.x[slotOf(enemy)], fx(705));
});

test('mind control transfers ownership and empties the caster shields', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 39 });
  const s = sim.fullState();
  const archon = spawnUnit(s, Kind.DarkArchon, 0, fx(400), fx(400));
  const goliath = spawnUnit(s, Kind.Goliath, 1, fx(430), fx(400));
  s.e.energy[slotOf(archon)] = 150;
  grant(sim, 0, Tech.MindControl);

  const results = sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: archon, ability: Ability.MindControl, target: goliath },
  ] }]);

  assert.deepEqual(results, [{ player: 0, index: 0, t: 'ability', ok: true }]);
  assert.equal(s.e.owner[slotOf(goliath)], 0);
  assert.equal(s.e.shield[slotOf(archon)], 0);
});

test('hallucination creates timed harmless copies', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 391 });
  const s = sim.fullState();
  const templar = spawnUnit(s, Kind.HighTemplar, 0, fx(400), fx(400));
  const marine = spawnUnit(s, Kind.Marine, 0, fx(430), fx(400));
  const depot = spawnUnit(s, Kind.SupplyDepot, 1, fx(470), fx(400));
  s.e.energy[slotOf(templar)] = 100;
  grant(sim, 0, Tech.Hallucination);

  sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: templar, ability: Ability.Hallucination, target: marine },
  ] }]);

  const illusions: number[] = [];
  for (let i = 0; i < s.e.hi; i++) {
    if (s.e.alive[i] === 1 && s.e.kind[i] === Kind.Marine && s.e.illusion[i] === 1) illusions.push(i);
  }
  assert.equal(illusions.length, 2);
  assert.ok(s.e.lifeTimer[illusions[0]!]! > 0);

  const hp = s.e.hp[slotOf(depot)]!;
  sim.step([{ player: 0, cmds: [{ t: 'attack', unit: eid(s.e, illusions[0]!), target: depot }] }]);
  assert.equal(s.e.hp[slotOf(depot)], hp);

  const enemy = spawnUnit(s, Kind.Marine, 1, fx(450), fx(400));
  sim.step([{ player: 1, cmds: [{ t: 'attack', unit: enemy, target: eid(s.e, illusions[0]!) }] }]);
  assert.equal(s.e.hp[illusions[0]!], Units[Kind.Marine]!.hp - 12);
});

test('hallucinations cannot perform real utility commands or cast spells', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 3921 });
  const s = sim.fullState();
  s.players.minerals[0] = 500;
  s.players.gas[0] = 500;

  const scv = spawnUnit(s, Kind.SCV, 0, fx(400), fx(400));
  const mineral = spawnUnit(s, Kind.Mineral, -1, fx(430), fx(400));
  const depot = spawnUnit(s, Kind.SupplyDepot, 0, fx(460), fx(400));
  const templar = spawnUnit(s, Kind.HighTemplar, 0, fx(520), fx(400));
  const marine = spawnUnit(s, Kind.Marine, 0, fx(550), fx(400));
  const dropship = spawnUnit(s, Kind.Dropship, 0, fx(580), fx(400));
  const reaver = spawnUnit(s, Kind.Reaver, 0, fx(620), fx(400));
  const carrier = spawnUnit(s, Kind.Carrier, 0, fx(660), fx(400));
  const larva = spawnUnit(s, Kind.Larva, 0, fx(700), fx(400));

  s.e.illusion[slotOf(scv)] = 1;
  s.e.illusion[slotOf(templar)] = 1;
  s.e.illusion[slotOf(dropship)] = 1;
  s.e.illusion[slotOf(reaver)] = 1;
  s.e.illusion[slotOf(carrier)] = 1;
  s.e.illusion[slotOf(larva)] = 1;
  s.e.hp[slotOf(depot)] = Units[Kind.SupplyDepot]!.hp - 50;
  s.e.energy[slotOf(templar)] = 100;
  grant(sim, 0, Tech.Hallucination);

  assert.deepEqual(validateCommand(s, 0, { t: 'build', unit: scv, kind: Kind.SupplyDepot, x: fx(400), y: fx(480) }), {
    ok: false,
    reason: 'missing-capability',
  });
  assert.deepEqual(validateCommand(s, 0, { t: 'harvest', unit: scv, patch: mineral }), {
    ok: false,
    reason: 'missing-capability',
  });
  assert.deepEqual(validateCommand(s, 0, { t: 'repair', unit: scv, target: depot }), {
    ok: false,
    reason: 'missing-capability',
  });
  assert.deepEqual(validateCommand(s, 0, { t: 'ability', unit: templar, ability: Ability.Hallucination, target: marine }), {
    ok: false,
    reason: 'missing-capability',
  });
  assert.deepEqual(validateCommand(s, 0, { t: 'load', transport: dropship, unit: marine }), {
    ok: false,
    reason: 'missing-capability',
  });
  assert.deepEqual(validateCommand(s, 0, { t: 'train', building: reaver, kind: Kind.Scarab }), {
    ok: false,
    reason: 'missing-capability',
  });
  assert.deepEqual(validateCommand(s, 0, { t: 'train', building: carrier, kind: Kind.Interceptor }), {
    ok: false,
    reason: 'missing-capability',
  });
  assert.deepEqual(validateCommand(s, 0, { t: 'train', building: larva, kind: Kind.Drone }), {
    ok: false,
    reason: 'missing-capability',
  });
});

test('broodlings from spawn broodling expire after their timed life', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 392 });
  const s = sim.fullState();
  const queen = spawnUnit(s, Kind.Queen, 0, fx(400), fx(400));
  const zealot = spawnUnit(s, Kind.Zealot, 1, fx(430), fx(400));
  s.e.energy[slotOf(queen)] = 150;
  grant(sim, 0, Tech.SpawnBroodling);

  sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: queen, ability: Ability.SpawnBroodling, target: zealot },
  ] }]);

  let broodlings = 0;
  for (let i = 0; i < s.e.hi; i++) if (s.e.alive[i] === 1 && s.e.kind[i] === Kind.Broodling) broodlings++;
  assert.equal(broodlings, 2);

  for (let t = 0; t < sec(76); t++) sim.step([]);
  broodlings = 0;
  for (let i = 0; i < s.e.hi; i++) if (s.e.alive[i] === 1 && s.e.kind[i] === Kind.Broodling) broodlings++;
  assert.equal(broodlings, 0);
});

test('queen can infest a damaged Terran command center', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 393 });
  const s = sim.fullState();
  const queen = spawnUnit(s, Kind.Queen, 0, fx(400), fx(400));
  spawnUnit(s, Kind.Overlord, 0, fx(380), fx(400));
  const cc = spawnUnit(s, Kind.CommandCenter, 1, fx(430), fx(400));
  s.e.hp[slotOf(cc)] = Math.floor(Units[Kind.CommandCenter]!.hp / 2);
  s.players.minerals[0] = 200;
  s.players.gas[0] = 100;

  const results = sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: queen, ability: Ability.InfestCommandCenter, target: cc },
  ] }]);

  assert.deepEqual(results, [{ player: 0, index: 0, t: 'ability', ok: true }]);
  assert.equal(s.e.kind[slotOf(cc)], Kind.InfestedCommandCenter);
  assert.equal(s.e.owner[slotOf(cc)], 0);
  assert.deepEqual(sim.step([{ player: 0, cmds: [{ t: 'train', building: cc, kind: Kind.InfestedTerran }] }]), [
    { player: 0, index: 0, t: 'train', ok: true },
  ]);
});

test('nuclear strike consumes a missile and deals delayed area damage', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 394 });
  const s = sim.fullState();
  const ghost = spawnUnit(s, Kind.Ghost, 0, fx(400), fx(400));
  const silo = loadedSilo(s, 0);
  const marine = spawnUnit(s, Kind.Marine, 1, fx(720), fx(400));
  const cc = spawnUnit(s, Kind.CommandCenter, 1, fx(740), fx(400));
  const far = spawnUnit(s, Kind.CommandCenter, 1, fx(1200), fx(400));

  const results = sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: ghost, ability: Ability.NuclearStrike, x: fx(720), y: fx(400) },
  ] }]);

  assert.deepEqual(results, [{ player: 0, index: 0, t: 'ability', ok: true }]);
  assert.equal(s.e.specialAmmo[slotOf(silo)], 0);
  assert.equal(s.e.alive[slotOf(marine)], 1);
  for (let t = 0; t < sec(8.5); t++) sim.step([]);
  assert.equal(s.e.alive[slotOf(marine)], 0);
  assert.equal(s.e.hp[slotOf(cc)], Units[Kind.CommandCenter]!.hp - 500);
  assert.equal(s.e.hp[slotOf(far)], Units[Kind.CommandCenter]!.hp);
});

test('nuclear strike requires a ready missile and cancels if the ghost moves', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 395 });
  const s = sim.fullState();
  const ghost = spawnUnit(s, Kind.Ghost, 0, fx(400), fx(400));
  const target = spawnUnit(s, Kind.CommandCenter, 1, fx(720), fx(400));

  assert.deepEqual(sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: ghost, ability: Ability.NuclearStrike, x: fx(500), y: fx(400) },
  ] }]), [{ player: 0, index: 0, t: 'ability', ok: false, reason: 'missing-requirement' }]);

  loadedSilo(s, 0);
  assert.deepEqual(sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: ghost, ability: Ability.NuclearStrike, x: fx(720), y: fx(400) },
  ] }]), [{ player: 0, index: 0, t: 'ability', ok: true }]);
  sim.step([{ player: 0, cmds: [{ t: 'move', unit: ghost, x: fx(200), y: fx(400) }] }]);
  for (let t = 0; t < sec(9); t++) sim.step([]);
  assert.equal(s.e.hp[slotOf(target)], Units[Kind.CommandCenter]!.hp);
});

test('nuclear silos build one internal missile ammo', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 397 });
  const s = sim.fullState();
  const commandCenter = spawnUnit(s, Kind.CommandCenter, 0, fx(320), fx(400));
  const silo = spawnUnit(s, Kind.NuclearSilo, 0, fx(400), fx(400));
  const slot = slotOf(silo);
  linkAddon(s, commandCenter, silo);
  s.players.minerals[0] = 1_000;
  s.players.gas[0] = 1_000;

  assert.deepEqual(sim.step([{ player: 0, cmds: [{ t: 'train', building: silo, kind: Kind.NuclearMissile }] }]), [
    { player: 0, index: 0, t: 'train', ok: true },
  ]);
  assert.equal(s.e.prodKind[slot], Kind.NuclearMissile);

  for (let t = 0; t < Units[Kind.NuclearMissile]!.buildTime; t++) sim.step([]);

  assert.equal(s.e.specialAmmo[slot], 1);
  assert.equal(s.e.prodKind[slot], Kind.None);
  assert.equal(isAlive(s.e, silo), true);
  assert.equal([...s.e.kind.slice(0, s.e.hi)].filter((k) => k === Kind.NuclearMissile).length, 0);
  assert.deepEqual(sim.step([{ player: 0, cmds: [{ t: 'train', building: silo, kind: Kind.NuclearMissile }] }]), [
    { player: 0, index: 0, t: 'train', ok: false, reason: 'queue-full' },
  ]);
});

test('shield battery spends energy to restore nearby protoss shields', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 396 });
  const s = sim.fullState();
  spawnUnit(s, Kind.Pylon, 0, fx(360), fx(400));
  const battery = spawnUnit(s, Kind.ShieldBattery, 0, fx(400), fx(400));
  const zealot = spawnUnit(s, Kind.Zealot, 0, fx(430), fx(400));
  s.e.energy[slotOf(battery)] = 10;
  s.e.shield[slotOf(zealot)] = 20;

  const results = sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: battery, ability: Ability.ShieldRecharge, target: zealot },
  ] }]);

  assert.deepEqual(results, [{ player: 0, index: 0, t: 'ability', ok: true }]);
  assert.equal(s.e.energy[slotOf(battery)], 9);
  assert.equal(s.e.shield[slotOf(zealot)], 22);
});
