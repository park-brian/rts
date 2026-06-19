import test from 'node:test';
import assert from 'node:assert/strict';
import { Abilities, Ability, EffectKind, Kind, Order, Role, SplashPx, Tech, Trait, Units, sec } from '../src/data/index.ts';
import { fx } from '../src/fixed.ts';
import { eid, isAlive, slotOf } from '../src/entity/world.ts';
import { canDetect } from '../src/mechanics/detection.ts';
import { applyIndependentDamage } from '../src/mechanics/damage.ts';
import { consumeReadyNuke, hasReadyNuke, readyNukeSilo } from '../src/mechanics/nuke.ts';
import { validateCommand } from '../src/commands/validate.ts';
import { bodyBounds } from '../src/spatial/geometry.ts';
import { simScenario, type SimScenario } from '../test-support/scenario.ts';

type ScenarioState = SimScenario['state'];

const linkAddon = (s: ScenarioState, parent: number, addon: number): void => {
  const e = s.e;
  e.target[slotOf(parent)] = addon;
  e.target[slotOf(addon)] = parent;
};

const loadedSilo = (s: ScenarioState, spawn: SimScenario['spawn'], player: number, x = fx(400), y = fx(400)): number => {
  const parent = spawn(Kind.CommandCenter, player, x - fx(80), y);
  const silo = spawn(Kind.NuclearSilo, player, x, y);
  linkAddon(s, parent, silo);
  s.e.specialAmmo[slotOf(silo)] = 1;
  return silo;
};

test('stim costs hit points and speeds the next attack cooldown', () => {
  const { sim, state: s, spawn, grant } = simScenario({ seed: 20 });
  const marine = spawn(Kind.Marine, 0, fx(400), fx(400));
  const target = spawn(Kind.SupplyDepot, 1, fx(430), fx(400));
  const m = slotOf(marine);
  grant(0, Tech.StimPack);

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

test('simple utility abilities are descriptor-backed', () => {
  for (const [id, ability] of Object.entries(Abilities)) {
    assert.ok(ability.execution, `ability ${id} (${ability.name}) must declare execution`);
  }
  assert.equal(Units[Kind.Marine]!.abilities.includes(Ability.StimPack), true);
  assert.equal(Units[Kind.Ghost]!.abilities.includes(Ability.Lockdown), true);
  assert.equal(Units[Kind.ScienceVessel]!.abilities.includes(Ability.Irradiate), true);
  assert.equal(Units[Kind.Medic]!.abilities.includes(Ability.OpticalFlare), true);
  assert.equal(Units[Kind.Queen]!.abilities.includes(Ability.Parasite), true);
  assert.equal(Units[Kind.Medic]!.abilities.includes(Ability.Heal), true);
  assert.equal(Units[Kind.ShieldBattery]!.abilities.includes(Ability.ShieldRecharge), true);
  assert.deepEqual(Abilities[Ability.StimPack]!.execution, { mode: 'caster-status', timer: 'stim' });
  assert.deepEqual(Abilities[Ability.EMPShockwave]!.execution, { mode: 'point-area-drain' });
  assert.deepEqual(Abilities[Ability.PsionicStorm]!.execution, { mode: 'persistent-effect', effect: EffectKind.PsionicStorm });
  assert.deepEqual(Abilities[Ability.DefensiveMatrix]!.execution, { mode: 'target-buffer', buffer: 'matrix' });
  assert.deepEqual(Abilities[Ability.Lockdown]!.execution, { mode: 'target-status', timer: 'lockdown' });
  assert.deepEqual(Abilities[Ability.Irradiate]!.execution, { mode: 'target-status', timer: 'irradiate' });
  assert.deepEqual(Abilities[Ability.StasisField]!.execution, { mode: 'point-area-status', timer: 'stasis', team: 'any', rolesAny: Role.Mobile, traitsAny: 0 });
  assert.deepEqual(Abilities[Ability.Maelstrom]!.execution, { mode: 'point-area-status', timer: 'maelstrom', team: 'enemy', rolesAny: 0, traitsAny: Trait.Biological });
  assert.deepEqual(Abilities[Ability.Ensnare]!.execution, { mode: 'point-area-status', timer: 'ensnare', team: 'enemy', rolesAny: Role.Mobile, traitsAny: 0 });
  assert.deepEqual(Abilities[Ability.Plague]!.execution, { mode: 'point-area-status', timer: 'plague', team: 'enemy', rolesAny: Role.Mobile | Role.Structure, traitsAny: 0 });
  assert.deepEqual(Abilities[Ability.SpawnBroodling]!.execution, { mode: 'target-spawn', kind: Kind.Broodling, count: 2, spread: fx(6), life: sec(75.2), killTarget: true });
  assert.deepEqual(Abilities[Ability.YamatoGun]!.execution, { mode: 'target-channel-damage' });
  assert.deepEqual(Abilities[Ability.Feedback]!.execution, { mode: 'target-energy-feedback' });
  assert.deepEqual(Abilities[Ability.Consume]!.execution, { mode: 'target-sacrifice-energy' });
  assert.deepEqual(Abilities[Ability.PersonnelCloaking]!.execution, { mode: 'self-toggle', flag: 'cloakActive' });
  assert.deepEqual(Abilities[Ability.CloakingField]!.execution, { mode: 'self-toggle', flag: 'cloakActive' });
  assert.deepEqual(Abilities[Ability.OpticalFlare]!.execution, { mode: 'target-marker', marker: 'opticalFlare' });
  assert.deepEqual(Abilities[Ability.Parasite]!.execution, { mode: 'target-marker', marker: 'parasiteOwner' });
  assert.deepEqual(Abilities[Ability.Recall]!.execution, { mode: 'point-recall' });
  assert.deepEqual(Abilities[Ability.Heal]!.execution, { mode: 'target-restore', pool: 'hp' });
  assert.deepEqual(Abilities[Ability.Restoration]!.execution, { mode: 'target-cleanse' });
  assert.deepEqual(Abilities[Ability.MindControl]!.execution, { mode: 'target-convert', drainCasterShield: true });
  assert.deepEqual(Abilities[Ability.Hallucination]!.execution, { mode: 'target-spawn', kind: 'target', count: 2, spread: fx(12), life: sec(56.7), illusion: true });
  assert.deepEqual(Abilities[Ability.InfestCommandCenter]!.execution, { mode: 'target-transform', kind: Kind.InfestedCommandCenter, transferOwner: true, resetProduction: true });
  assert.deepEqual(Abilities[Ability.ShieldRecharge]!.execution, { mode: 'target-restore', pool: 'shield' });
  assert.deepEqual(Abilities[Ability.DisruptionWeb]!.execution, { mode: 'persistent-effect', effect: EffectKind.DisruptionWeb });
  assert.deepEqual(Abilities[Ability.DarkSwarm]!.execution, { mode: 'persistent-effect', effect: EffectKind.DarkSwarm });
  assert.deepEqual(Abilities[Ability.ScannerSweep]!.execution, { mode: 'persistent-effect', effect: EffectKind.ScannerSweep });
  assert.deepEqual(Abilities[Ability.NuclearStrike]!.execution, { mode: 'point-channel-effect', effect: EffectKind.NuclearStrike, consumes: 'nuke' });
});

test('ability validation rejects unaffordable energy casts', () => {
  const { sim, state: s, spawn, grant } = simScenario({ seed: 21 });
  const vessel = spawn(Kind.ScienceVessel, 0, fx(400), fx(400));
  const v = slotOf(vessel);
  s.e.energy[v] = 99;
  grant(0, Tech.EMPShockwave);

  const results = sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: vessel, ability: Ability.EMPShockwave, x: fx(430), y: fx(400) },
  ] }]);

  assert.deepEqual(results, [{ player: 0, index: 0, t: 'ability', ok: false, reason: 'not-enough-energy' }]);
});

test('EMP removes shields and energy in an area', () => {
  const { sim, state: s, spawn, grant } = simScenario({ seed: 22 });
  const vessel = spawn(Kind.ScienceVessel, 0, fx(400), fx(400));
  const zealot = spawn(Kind.Zealot, 1, fx(430), fx(400));
  const templar = spawn(Kind.HighTemplar, 1, fx(435), fx(400));
  const mineral = spawn(Kind.Mineral, -1, fx(430), fx(405));
  s.e.energy[slotOf(vessel)] = 100;
  s.e.energy[slotOf(templar)] = 75;
  s.e.energy[slotOf(mineral)] = 10;
  grant(0, Tech.EMPShockwave);

  sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: vessel, ability: Ability.EMPShockwave, x: fx(430), y: fx(400) },
  ] }]);

  assert.equal(s.e.energy[slotOf(vessel)], 0);
  assert.equal(s.e.shield[slotOf(zealot)], 0);
  assert.equal(s.e.shield[slotOf(templar)], 0);
  assert.equal(s.e.energy[slotOf(templar)], 0);
  assert.equal(s.e.energy[slotOf(mineral)], 10);
});

test('psionic storm creates persistent area damage for units but not structures', () => {
  const { sim, state: s, spawn, grant } = simScenario({ seed: 23 });
  const templar = spawn(Kind.HighTemplar, 0, fx(400), fx(400));
  const enemy = spawn(Kind.Medic, 1, fx(430), fx(400));
  const friendly = spawn(Kind.Medic, 0, fx(435), fx(400));
  const depot = spawn(Kind.SupplyDepot, 1, fx(430), fx(430));
  s.e.energy[slotOf(templar)] = 75;
  grant(0, Tech.PsionicStorm);
  const depotHp = s.e.hp[slotOf(depot)]!;

  sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: templar, ability: Ability.PsionicStorm, x: fx(430), y: fx(400) },
  ] }]);

  const storm = Abilities[Ability.PsionicStorm]!;
  assert.equal(s.effects.hi, 1);
  assert.equal(s.effects.alive[0], 1);
  assert.equal(s.effects.kind[0], EffectKind.PsionicStorm);
  assert.equal(s.effects.owner[0], 0);
  assert.equal(s.effects.x[0], fx(430));
  assert.equal(s.effects.y[0], fx(400));
  assert.equal(s.effects.radius[0], storm.radius);
  assert.equal(s.effects.timer[0], storm.duration - 1);
  assert.equal(s.effects.period[0], storm.period);
  assert.equal(s.effects.nextTick[0], storm.period - 1);
  assert.equal(s.effects.damage[0], storm.damage);
  assert.equal(s.e.hp[slotOf(enemy)], Units[Kind.Medic]!.hp - 14);
  assert.equal(s.e.hp[slotOf(friendly)], Units[Kind.Medic]!.hp - 14);
  assert.equal(s.e.hp[slotOf(depot)], depotHp);

  for (let t = 0; t < 64; t++) sim.step([]);
  assert.equal(s.e.alive[slotOf(enemy)], 0);
  assert.equal(s.e.alive[slotOf(friendly)], 0);
});

test('persistent area effects use top-down body overlap', () => {
  const { sim, state: s, spawn, grant } = simScenario({ seed: 231 });
  const templar = spawn(Kind.HighTemplar, 0, fx(400), fx(400));
  const storm = Abilities[Ability.PsionicStorm]!;
  const stormX = fx(500);
  const edgeMarine = spawn(Kind.Marine, 1, stormX + storm.radius + fx(6), fx(400));
  const outsideMarine = spawn(Kind.Marine, 1, stormX + storm.radius + fx(12), fx(480));
  s.e.energy[slotOf(templar)] = storm.energyCost;
  grant(0, Tech.PsionicStorm);

  sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: templar, ability: Ability.PsionicStorm, x: stormX, y: fx(400) },
  ] }]);

  assert.equal(s.e.hp[slotOf(edgeMarine)], Units[Kind.Marine]!.hp - storm.damage);
  assert.equal(s.e.hp[slotOf(outsideMarine)], Units[Kind.Marine]!.hp);
});

test('defensive matrix absorbs incoming weapon damage before shields and hp', () => {
  const { sim, state: s, spawn, grant } = simScenario({ seed: 24 });
  const vessel = spawn(Kind.ScienceVessel, 0, fx(400), fx(400));
  const zealot = spawn(Kind.Zealot, 0, fx(430), fx(400));
  s.e.energy[slotOf(vessel)] = 100;

  sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: vessel, ability: Ability.DefensiveMatrix, target: zealot },
  ] }]);
  const z = slotOf(zealot);
  assert.equal(s.e.matrixHp[z], 250);
  assert.equal(s.e.matrixTimer[z], Abilities[Ability.DefensiveMatrix]!.duration - 1);

  const enemy = spawn(Kind.Marine, 1, fx(450), fx(400));
  sim.step([{ player: 1, cmds: [{ t: 'attack', unit: enemy, target: zealot }] }]);

  assert.equal(s.e.matrixHp[z], 244);
  assert.equal(s.e.shield[z], Units[Kind.Zealot]!.shields);
  assert.equal(s.e.hp[z], Units[Kind.Zealot]!.hp);
});

test('irradiate uses the sourced damage window through descriptor execution', () => {
  const { sim, state: s, spawn, grant } = simScenario({ seed: 241 });
  const vessel = spawn(Kind.ScienceVessel, 0, fx(400), fx(400));
  const medic = spawn(Kind.Medic, 1, fx(430), fx(400));
  const nearby = spawn(Kind.Medic, 1, fx(450), fx(400));
  const outside = spawn(Kind.Medic, 1, fx(500), fx(400));
  const irradiate = Abilities[Ability.Irradiate]!;
  const startHp = 400;
  s.e.hp[slotOf(medic)] = startHp;
  s.e.hp[slotOf(nearby)] = startHp;
  s.e.hp[slotOf(outside)] = startHp;
  s.e.energy[slotOf(vessel)] = 75;
  grant(0, Tech.Irradiate);
  assert.equal(irradiate.duration, sec(25.2));
  assert.equal(irradiate.period, sec(1));
  assert.equal(irradiate.damage, 10);

  const results = sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: vessel, ability: Ability.Irradiate, target: medic },
  ] }]);

  assert.deepEqual(results, [{ player: 0, index: 0, t: 'ability', ok: true }]);
  assert.equal(s.e.irradiateTimer[slotOf(medic)], irradiate.duration - 1);

  for (let t = 0; t < irradiate.duration - 1; t++) sim.step([]);
  assert.equal(s.e.irradiateTimer[slotOf(medic)], 0);
  assert.equal(s.e.hp[slotOf(medic)], startHp - 250);
  assert.equal(s.e.hp[slotOf(nearby)], startHp - 250);
  assert.equal(s.e.hp[slotOf(outside)], startHp);
});

test('lockdown prevents a mechanical unit from moving or attacking', () => {
  const { sim, state: s, spawn, grant } = simScenario({ seed: 25 });
  const ghost = spawn(Kind.Ghost, 0, fx(400), fx(400));
  const goliath = spawn(Kind.Goliath, 1, fx(430), fx(400));
  const marine = spawn(Kind.Marine, 0, fx(450), fx(400));
  s.e.energy[slotOf(ghost)] = 100;
  grant(0, Tech.Lockdown);

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
  const { sim, state: s, spawn, grant } = simScenario({ seed: 26 });
  const archon = spawn(Kind.DarkArchon, 0, fx(400), fx(400));
  const vessel = spawn(Kind.ScienceVessel, 1, fx(430), fx(400));
  const matrixHp = 25;
  s.e.energy[slotOf(archon)] = 50;
  s.e.energy[slotOf(vessel)] = 80;
  s.e.matrixHp[slotOf(vessel)] = matrixHp;
  s.e.matrixTimer[slotOf(vessel)] = sec(10);

  sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: archon, ability: Ability.Feedback, target: vessel },
  ] }]);

  assert.equal(s.e.energy[slotOf(vessel)], 0);
  assert.equal(s.e.matrixHp[slotOf(vessel)], 0);
  assert.equal(s.e.matrixTimer[slotOf(vessel)], 0);
  assert.equal(s.e.hp[slotOf(vessel)], Units[Kind.ScienceVessel]!.hp - (80 - matrixHp));
});

test('yamato gun resolves descriptor-backed target channel damage', () => {
  const { sim, state: s, spawn, grant } = simScenario({ seed: 261 });
  const battlecruiser = spawn(Kind.Battlecruiser, 0, fx(400), fx(400));
  const target = spawn(Kind.ScienceVessel, 1, fx(650), fx(400));
  s.e.energy[slotOf(battlecruiser)] = 150;
  s.e.wcd[slotOf(battlecruiser)] = 999;
  s.e.shield[slotOf(target)] = 40;
  s.e.matrixHp[slotOf(target)] = 50;
  s.e.matrixTimer[slotOf(target)] = sec(10);
  grant(0, Tech.YamatoCannon);

  const results = sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: battlecruiser, ability: Ability.YamatoGun, target },
  ] }]);

  assert.deepEqual(results, [{ player: 0, index: 0, t: 'ability', ok: true }]);
  assert.equal(s.e.energy[slotOf(battlecruiser)], 0);
  assert.equal(s.e.matrixHp[slotOf(target)], 0);
  assert.equal(s.e.matrixTimer[slotOf(target)], 0);
  assert.equal(s.e.shield[slotOf(target)], 0);
  assert.equal(s.e.hp[slotOf(target)], Units[Kind.ScienceVessel]!.hp - (Abilities[Ability.YamatoGun]!.damage - 50 - 40));
});

test('target channel damage waits for its caster channel and can be interrupted', () => {
  const ability = Abilities[Ability.YamatoGun]!;
  const oldDuration = ability.duration;
  ability.duration = 3;
  try {
    const { sim, state: s, spawn, grant } = simScenario({ seed: 2612 });
    const battlecruiser = spawn(Kind.Battlecruiser, 0, fx(400), fx(400));
    const target = spawn(Kind.ScienceVessel, 1, fx(650), fx(400));
    const bc = slotOf(battlecruiser);
    const tv = slotOf(target);
    s.e.energy[bc] = 150;
    s.e.wcd[bc] = 999;
    const hpBefore = s.e.hp[tv]!;
    grant(0, Tech.YamatoCannon);

    assert.deepEqual(sim.step([{ player: 0, cmds: [
      { t: 'ability', unit: battlecruiser, ability: Ability.YamatoGun, target },
    ] }]), [{ player: 0, index: 0, t: 'ability', ok: true }]);
    assert.equal(s.e.order[bc], Order.Cast);
    assert.equal(s.e.castAbility[bc], Ability.YamatoGun);
    assert.equal(s.e.timer[bc], 2);
    assert.equal(s.e.hp[tv], hpBefore);

    assert.deepEqual(sim.step([{ player: 0, cmds: [
      { t: 'stop', unit: battlecruiser },
    ] }]), [{ player: 0, index: 0, t: 'stop', ok: true }]);
    assert.equal(s.e.order[bc], Order.Idle);
    assert.equal(s.e.castAbility[bc], 0);
    assert.equal(s.e.timer[bc], 0);
    assert.equal(s.e.hp[tv], hpBefore);
  } finally {
    ability.duration = oldDuration;
  }
});

test('target channel damage applies when the channel completes', () => {
  const ability = Abilities[Ability.YamatoGun]!;
  const oldDuration = ability.duration;
  ability.duration = 2;
  try {
    const { sim, state: s, spawn, grant } = simScenario({ seed: 2613 });
    const battlecruiser = spawn(Kind.Battlecruiser, 0, fx(400), fx(400));
    const target = spawn(Kind.ScienceVessel, 1, fx(650), fx(400));
    const bc = slotOf(battlecruiser);
    const tv = slotOf(target);
    s.e.energy[bc] = 150;
    s.e.wcd[bc] = 999;
    s.e.shield[tv] = 40;
    s.e.matrixHp[tv] = 50;
    s.e.matrixTimer[tv] = sec(10);
    const hpBefore = s.e.hp[tv]!;
    grant(0, Tech.YamatoCannon);

    sim.step([{ player: 0, cmds: [
      { t: 'ability', unit: battlecruiser, ability: Ability.YamatoGun, target },
    ] }]);
    assert.equal(s.e.order[bc], Order.Cast);
    assert.equal(s.e.castAbility[bc], Ability.YamatoGun);
    assert.equal(s.e.timer[bc], 1);
    assert.equal(s.e.hp[tv], hpBefore);

    sim.step([]);
    assert.equal(s.e.order[bc], Order.Idle);
    assert.equal(s.e.castAbility[bc], 0);
    assert.equal(s.e.hp[tv], hpBefore - (ability.damage - 50 - 40));
  } finally {
    ability.duration = oldDuration;
  }
});

test('entity-target ability range uses top-down interaction edges', () => {
  const { sim, state: s, spawn, grant } = simScenario({ seed: 2611 });
  const battlecruiser = spawn(Kind.Battlecruiser, 0, fx(400), fx(400));
  const target = spawn(Kind.CommandCenter, 1, fx(830), fx(400));
  s.e.energy[slotOf(battlecruiser)] = 150;
  grant(0, Tech.YamatoCannon);
  const hpBefore = s.e.hp[slotOf(target)]!;

  assert.ok(fx(430) > Abilities[Ability.YamatoGun]!.range, 'center distance is outside Yamato range');

  const results = sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: battlecruiser, ability: Ability.YamatoGun, target },
  ] }]);

  assert.deepEqual(results, [{ player: 0, index: 0, t: 'ability', ok: true }]);
  assert.ok(s.e.hp[slotOf(target)]! < hpBefore);
});

test('point area statuses apply through descriptor execution filters', () => {
  const { sim, state: s, spawn, grant } = simScenario({ seed: 262 });
  const arbiter = spawn(Kind.Arbiter, 0, fx(400), fx(400));
  const archon = spawn(Kind.DarkArchon, 0, fx(620), fx(400));
  const queen = spawn(Kind.Queen, 0, fx(840), fx(400));
  const defiler = spawn(Kind.Defiler, 0, fx(1060), fx(400));
  s.e.energy[slotOf(arbiter)] = 100;
  s.e.energy[slotOf(archon)] = 100;
  s.e.energy[slotOf(queen)] = 75;
  s.e.energy[slotOf(defiler)] = 150;
  grant(0, Tech.StasisField);
  grant(0, Tech.Maelstrom);
  grant(0, Tech.Ensnare);
  grant(0, Tech.Plague);

  const stasisEnemy = spawn(Kind.Marine, 1, fx(430), fx(400));
  const stasisFriendly = spawn(Kind.Marine, 0, fx(435), fx(400));
  const stasisStructure = spawn(Kind.SupplyDepot, 1, fx(430), fx(430));
  const maelstromBio = spawn(Kind.Marine, 1, fx(650), fx(400));
  const maelstromMech = spawn(Kind.Goliath, 1, fx(655), fx(400));
  const maelstromFriendly = spawn(Kind.Marine, 0, fx(660), fx(400));
  const ensnareMobile = spawn(Kind.Marine, 1, fx(870), fx(400));
  const ensnareStructure = spawn(Kind.SupplyDepot, 1, fx(875), fx(400));
  const ensnareFriendly = spawn(Kind.Marine, 0, fx(880), fx(400));
  const plagueMobile = spawn(Kind.Marine, 1, fx(1090), fx(400));
  const plagueStructure = spawn(Kind.SupplyDepot, 1, fx(1095), fx(400));
  const plagueFriendly = spawn(Kind.Marine, 0, fx(1100), fx(400));

  const results = sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: arbiter, ability: Ability.StasisField, x: fx(430), y: fx(400) },
    { t: 'ability', unit: archon, ability: Ability.Maelstrom, x: fx(650), y: fx(400) },
    { t: 'ability', unit: queen, ability: Ability.Ensnare, x: fx(870), y: fx(400) },
    { t: 'ability', unit: defiler, ability: Ability.Plague, x: fx(1090), y: fx(400) },
  ] }]);

  assert.deepEqual(results, [
    { player: 0, index: 0, t: 'ability', ok: true },
    { player: 0, index: 1, t: 'ability', ok: true },
    { player: 0, index: 2, t: 'ability', ok: true },
    { player: 0, index: 3, t: 'ability', ok: true },
  ]);
  assert.equal(s.e.stasisTimer[slotOf(stasisEnemy)], Abilities[Ability.StasisField]!.duration - 1);
  assert.equal(s.e.stasisTimer[slotOf(stasisFriendly)], Abilities[Ability.StasisField]!.duration - 1);
  assert.equal(s.e.stasisTimer[slotOf(stasisStructure)], 0);
  assert.equal(s.e.maelstromTimer[slotOf(maelstromBio)], Abilities[Ability.Maelstrom]!.duration - 1);
  assert.equal(s.e.maelstromTimer[slotOf(maelstromMech)], 0);
  assert.equal(s.e.maelstromTimer[slotOf(maelstromFriendly)], 0);
  assert.equal(s.e.ensnareTimer[slotOf(ensnareMobile)], Abilities[Ability.Ensnare]!.duration - 1);
  assert.equal(s.e.ensnareTimer[slotOf(ensnareStructure)], 0);
  assert.equal(s.e.ensnareTimer[slotOf(ensnareFriendly)], 0);
  assert.equal(s.e.plagueTimer[slotOf(plagueMobile)], Abilities[Ability.Plague]!.duration - 1);
  assert.equal(s.e.plagueTimer[slotOf(plagueStructure)], Abilities[Ability.Plague]!.duration - 1);
  assert.equal(s.e.plagueTimer[slotOf(plagueFriendly)], 0);
});

test('point area statuses use top-down body overlap', () => {
  const { sim, state: s, spawn, grant } = simScenario({ seed: 2621 });
  const arbiter = spawn(Kind.Arbiter, 0, fx(400), fx(400));
  const stasis = Abilities[Ability.StasisField]!;
  const stasisX = fx(500);
  const edgeMarine = spawn(Kind.Marine, 1, stasisX + stasis.radius + fx(6), fx(400));
  const outsideMarine = spawn(Kind.Marine, 1, stasisX + stasis.radius + fx(12), fx(480));
  s.e.energy[slotOf(arbiter)] = stasis.energyCost;
  grant(0, Tech.StasisField);

  sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: arbiter, ability: Ability.StasisField, x: stasisX, y: fx(400) },
  ] }]);

  assert.equal(s.e.stasisTimer[slotOf(edgeMarine)], stasis.duration - 1);
  assert.equal(s.e.stasisTimer[slotOf(outsideMarine)], 0);
});

test('stasis field uses the sourced duration and expires through shared disabled gates', () => {
  const { sim, state: s, spawn, grant } = simScenario({ seed: 263 });
  const arbiter = spawn(Kind.Arbiter, 0, fx(150), fx(400));
  const stasisMarine = spawn(Kind.Marine, 1, fx(430), fx(400));
  const target = spawn(Kind.Zealot, 0, fx(500), fx(400));
  const stasis = Abilities[Ability.StasisField]!;
  assert.equal(stasis.duration, sec(43.8));
  s.e.energy[slotOf(arbiter)] = stasis.energyCost;
  grant(0, Tech.StasisField);

  sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: arbiter, ability: Ability.StasisField, x: fx(430), y: fx(400) },
  ] }]);

  const stasisSlot = slotOf(stasisMarine);
  const targetSlot = slotOf(target);
  const stasisHp = s.e.hp[stasisSlot]!;
  const targetShield = s.e.shield[targetSlot]!;
  assert.equal(s.e.stasisTimer[stasisSlot], stasis.duration - 1);

  const blocked = sim.step([{ player: 1, cmds: [{ t: 'attack', unit: stasisMarine, target }] }]);
  assert.deepEqual(blocked, [{ player: 1, index: 0, t: 'attack', ok: false, reason: 'missing-capability' }]);
  assert.equal(s.e.wcd[stasisSlot], 0);
  assert.equal(s.e.shield[targetSlot], targetShield);
  applyIndependentDamage(s, stasisSlot, 20);
  assert.equal(s.e.hp[stasisSlot], stasisHp);
  s.e.order[stasisSlot] = Order.Move;
  s.e.tx[stasisSlot] = fx(100);
  s.e.ty[stasisSlot] = s.e.y[stasisSlot]!;

  for (let t = 0; t < stasis.duration - 2; t++) sim.step([]);
  assert.equal(s.e.stasisTimer[stasisSlot], 0);
  const resumed = sim.step([{ player: 1, cmds: [{ t: 'attack', unit: stasisMarine, target }] }]);
  assert.deepEqual(resumed, [{ player: 1, index: 0, t: 'attack', ok: true }]);
  assert.equal(s.e.wcd[stasisSlot], Units[Kind.Marine]!.weapon!.cooldown);
  assert.equal(s.e.shield[targetSlot], targetShield - Units[Kind.Marine]!.weapon!.damage);
});

test('plague damages but cannot kill', () => {
  const { sim, state: s, spawn, grant } = simScenario({ seed: 27 });
  const defiler = spawn(Kind.Defiler, 0, fx(400), fx(400));
  const marine = spawn(Kind.Marine, 1, fx(430), fx(400));
  s.e.energy[slotOf(defiler)] = 150;
  s.e.hp[slotOf(marine)] = 5;
  grant(0, Tech.Plague);

  sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: defiler, ability: Ability.Plague, x: fx(430), y: fx(400) },
  ] }]);
  for (let t = 0; t < sec(26); t++) sim.step([]);

  assert.equal(s.e.alive[slotOf(marine)], 1);
  assert.equal(s.e.hp[slotOf(marine)], 1);
});

test('spawn broodling kills a legal biological ground target and creates broodlings', () => {
  const { sim, state: s, spawn, grant } = simScenario({ seed: 28 });
  const queen = spawn(Kind.Queen, 0, fx(400), fx(400));
  const zealot = spawn(Kind.Zealot, 1, fx(430), fx(400));
  s.e.energy[slotOf(queen)] = 150;
  grant(0, Tech.SpawnBroodling);

  sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: queen, ability: Ability.SpawnBroodling, target: zealot },
  ] }]);

  assert.equal(isAlive(s.e, zealot), false);
  let broodlings = 0;
  for (let i = 0; i < s.e.hi; i++) if (s.e.alive[i] === 1 && s.e.kind[i] === Kind.Broodling && s.e.owner[i] === 0) broodlings++;
  assert.equal(broodlings, 2);
});

test('dark swarm blocks ranged ground damage while disruption web prevents ground attacks', () => {
  const { sim, state: s, spawn, grant } = simScenario({ seed: 29 });
  const defiler = spawn(Kind.Defiler, 0, fx(400), fx(400));
  const corsair = spawn(Kind.Corsair, 0, fx(405), fx(400));
  const marine = spawn(Kind.Marine, 1, fx(430), fx(400));
  const zealot = spawn(Kind.Zealot, 0, fx(450), fx(400));
  s.e.energy[slotOf(defiler)] = 225;
  s.e.energy[slotOf(corsair)] = 125;
  grant(0, Tech.DisruptionWeb);

  sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: defiler, ability: Ability.DarkSwarm, x: fx(450), y: fx(400) },
    { t: 'ability', unit: corsair, ability: Ability.DisruptionWeb, x: fx(430), y: fx(400) },
  ] }]);
  const zealotShield = s.e.shield[slotOf(zealot)]!;
  sim.step([{ player: 1, cmds: [{ t: 'attack', unit: marine, target: zealot }] }]);

  assert.equal(s.e.shield[slotOf(zealot)], zealotShield);
  assert.equal(s.e.wcd[slotOf(marine)], 0);
});

test('disruption web uses the sourced duration and releases ground attacks on expiry', () => {
  const { sim, state: s, spawn, grant } = simScenario({ seed: 292 });
  const corsair = spawn(Kind.Corsair, 0, fx(405), fx(400));
  const marine = spawn(Kind.Marine, 1, fx(430), fx(400));
  const zealot = spawn(Kind.Zealot, 0, fx(450), fx(400));
  const web = Abilities[Ability.DisruptionWeb]!;
  assert.equal(web.duration, sec(15.12));
  s.e.energy[slotOf(corsair)] = web.energyCost;
  grant(0, Tech.DisruptionWeb);

  sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: corsair, ability: Ability.DisruptionWeb, x: fx(430), y: fx(400) },
  ] }]);

  const marineSlot = slotOf(marine);
  const zealotSlot = slotOf(zealot);
  assert.equal(s.effects.alive[0], 1);
  assert.equal(s.effects.kind[0], EffectKind.DisruptionWeb);
  assert.equal(s.effects.timer[0], web.duration - 1);

  const blockedShield = s.e.shield[zealotSlot]!;
  sim.step([{ player: 1, cmds: [{ t: 'attack', unit: marine, target: zealot }] }]);
  assert.equal(s.e.shield[zealotSlot], blockedShield);
  assert.equal(s.e.wcd[marineSlot], 0);

  for (let t = 0; t < web.duration - 2; t++) sim.step([]);
  assert.equal(s.effects.alive[0], 0);
  assert.equal(s.e.wcd[marineSlot], Units[Kind.Marine]!.weapon!.cooldown);
  assert.equal(s.e.shield[zealotSlot], blockedShield - Units[Kind.Marine]!.weapon!.damage);
});

test('persistent point effects spawn through descriptor execution', () => {
  const { sim, state: s, spawn, grant } = simScenario({ seed: 291 });
  const defiler = spawn(Kind.Defiler, 0, fx(400), fx(400));
  const corsair = spawn(Kind.Corsair, 0, fx(405), fx(400));
  const commandCenter = spawn(Kind.CommandCenter, 0, fx(220), fx(300));
  const comsat = spawn(Kind.ComsatStation, 0, fx(300), fx(300));
  linkAddon(s, commandCenter, comsat);
  s.e.energy[slotOf(defiler)] = 100;
  s.e.energy[slotOf(corsair)] = 125;
  s.e.energy[slotOf(comsat)] = 50;
  grant(0, Tech.DisruptionWeb);

  const commands = [
    { t: 'ability' as const, unit: defiler, ability: Ability.DarkSwarm, x: fx(450), y: fx(400) },
    { t: 'ability' as const, unit: corsair, ability: Ability.DisruptionWeb, x: fx(430), y: fx(400) },
    { t: 'ability' as const, unit: comsat, ability: Ability.ScannerSweep, x: fx(700), y: fx(400) },
  ];
  const results = sim.step([{ player: 0, cmds: commands }]);

  assert.deepEqual(results, [
    { player: 0, index: 0, t: 'ability', ok: true },
    { player: 0, index: 1, t: 'ability', ok: true },
    { player: 0, index: 2, t: 'ability', ok: true },
  ]);

  for (const command of commands) {
    const ability = Abilities[command.ability]!;
    const execution = ability.execution;
    assert.equal(execution?.mode, 'persistent-effect');
    const effect = execution && execution.mode === 'persistent-effect' ? execution.effect : 0;
    let found = false;
    for (let i = 0; i < s.effects.hi; i++) {
      if (s.effects.alive[i] !== 1 || s.effects.kind[i] !== effect || s.effects.x[i] !== command.x || s.effects.y[i] !== command.y) continue;
      assert.equal(s.effects.owner[i], 0);
      assert.equal(s.effects.radius[i], ability.radius);
      assert.equal(s.effects.timer[i], ability.duration - 1);
      found = true;
    }
    assert.equal(found, true);
  }
});

test('permanently cloaked units require a nearby detector to be attacked', () => {
  const { sim, state: s, spawn, grant } = simScenario({ seed: 30 });
  const marine = spawn(Kind.Marine, 0, fx(400), fx(400));
  const dt = spawn(Kind.DarkTemplar, 1, fx(700), fx(400));

  let results = sim.step([{ player: 0, cmds: [
    { t: 'attack', unit: marine, target: dt },
  ] }]);
  assert.deepEqual(results, [{ player: 0, index: 0, t: 'attack', ok: false, reason: 'target-not-allowed' }]);

  spawn(Kind.ScienceVessel, 0, fx(690), fx(400));
  results = sim.step([{ player: 0, cmds: [
    { t: 'attack', unit: marine, target: dt },
  ] }]);
  assert.deepEqual(results, [{ player: 0, index: 0, t: 'attack', ok: true }]);
});

test('active cloak toggles on, drains energy, and blocks attacks until revealed', () => {
  const { sim, state: s, spawn, grant } = simScenario({ seed: 31 });
  const wraith = spawn(Kind.Wraith, 1, fx(700), fx(400));
  const marine = spawn(Kind.Marine, 0, fx(670), fx(400));
  s.e.energy[slotOf(wraith)] = 26;
  grant(1, Tech.CloakingField);

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

test('active cloak toggles off through descriptor execution without spending energy', () => {
  const { sim, state: s, spawn, grant } = simScenario({ seed: 311 });
  const wraith = spawn(Kind.Wraith, 0, fx(400), fx(400));
  const w = slotOf(wraith);
  s.e.energy[w] = 26;
  grant(0, Tech.CloakingField);

  assert.deepEqual(sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: wraith, ability: Ability.CloakingField },
  ] }]), [{ player: 0, index: 0, t: 'ability', ok: true }]);
  assert.equal(s.e.cloakActive[w], 1);
  assert.equal(s.e.energy[w], 1);
  s.e.energy[w] = 0;

  assert.deepEqual(sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: wraith, ability: Ability.CloakingField },
  ] }]), [{ player: 0, index: 0, t: 'ability', ok: true }]);
  assert.equal(s.e.cloakActive[w], 0);
  assert.equal(s.e.cloakTimer[w], 0);
  assert.equal(s.e.energy[w], 0);
});

test('scanner sweep reveals cloaked targets without a detector unit', () => {
  const { sim, state: s, spawn, grant } = simScenario({ seed: 32 });
  const commandCenter = spawn(Kind.CommandCenter, 0, fx(220), fx(300));
  const comsat = spawn(Kind.ComsatStation, 0, fx(300), fx(300));
  const marine = spawn(Kind.Marine, 0, fx(400), fx(400));
  const dt = spawn(Kind.DarkTemplar, 1, fx(700), fx(400));
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
  const { sim, state: s, spawn, grant } = simScenario({ seed: 321 });
  const medic = spawn(Kind.Medic, 0, fx(400), fx(400));
  const dt = spawn(Kind.DarkTemplar, 1, fx(430), fx(400));
  s.e.energy[slotOf(medic)] = 50;
  grant(0, Tech.Restoration);

  const results = sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: medic, ability: Ability.Restoration, target: dt },
  ] }]);

  assert.deepEqual(results, [{ player: 0, index: 0, t: 'ability', ok: false, reason: 'target-not-allowed' }]);
});

test('arbiter aura cloaks nearby friendly units but not the arbiter itself', () => {
  const { sim, state: s, spawn, grant } = simScenario({ seed: 33 });
  const arbiter = spawn(Kind.Arbiter, 1, fx(700), fx(400));
  const zealot = spawn(Kind.Zealot, 1, fx(730), fx(400));
  const marine = spawn(Kind.Marine, 0, fx(670), fx(400));

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
  const { sim, state: s, spawn, grant } = simScenario({ seed: 34 });
  const medic = spawn(Kind.Medic, 0, fx(400), fx(400));
  const marine = spawn(Kind.Marine, 0, fx(420), fx(400));
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
  const { sim, state: s, spawn, grant } = simScenario({ seed: 35 });
  const medic = spawn(Kind.Medic, 0, fx(400), fx(400));
  const marine = spawn(Kind.Marine, 0, fx(430), fx(400));
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
  grant(0, Tech.Restoration);

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
  const { sim, state: s, spawn, grant } = simScenario({ seed: 36 });
  const medic = spawn(Kind.Medic, 0, fx(400), fx(400));
  const dt = spawn(Kind.DarkTemplar, 0, fx(430), fx(400));
  const vessel = spawn(Kind.ScienceVessel, 1, fx(450), fx(400));
  s.e.energy[slotOf(medic)] = 75;
  grant(0, Tech.OpticalFlare);
  assert.equal(canDetect(s, 1, slotOf(dt)), true);

  sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: medic, ability: Ability.OpticalFlare, target: vessel },
  ] }]);

  assert.equal(s.e.opticalFlare[slotOf(vessel)], 1);
  assert.equal(canDetect(s, 1, slotOf(dt)), false);
});

test('parasite grants vision from the target and detector coverage if the target detects', () => {
  const { sim, state: s, spawn, grant } = simScenario({ seed: 37, vision: true });
  const queen = spawn(Kind.Queen, 0, fx(400), fx(400));
  const observer = spawn(Kind.ScienceVessel, 1, fx(500), fx(400));
  const dt = spawn(Kind.DarkTemplar, 1, fx(520), fx(400));
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
  const { sim, state: s, spawn, grant } = simScenario({ seed: 38 });
  const arbiter = spawn(Kind.Arbiter, 0, fx(400), fx(400));
  const zealot = spawn(Kind.Zealot, 0, fx(700), fx(400));
  const enemy = spawn(Kind.Zealot, 1, fx(705), fx(400));
  s.e.energy[slotOf(arbiter)] = 150;
  grant(0, Tech.Recall);

  sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: arbiter, ability: Ability.Recall, x: fx(700), y: fx(400) },
  ] }]);

  assert.ok(Math.abs(s.e.x[slotOf(zealot)]! - s.e.x[slotOf(arbiter)]!) <= fx(24));
  assert.equal(s.e.owner[slotOf(enemy)], 1);
  assert.equal(s.e.x[slotOf(enemy)], fx(705));
});

test('mind control transfers ownership and empties the caster shields', () => {
  const { sim, state: s, spawn, grant } = simScenario({ seed: 39 });
  const archon = spawn(Kind.DarkArchon, 0, fx(400), fx(400));
  const goliath = spawn(Kind.Goliath, 1, fx(430), fx(400));
  s.e.energy[slotOf(archon)] = 150;
  grant(0, Tech.MindControl);

  const results = sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: archon, ability: Ability.MindControl, target: goliath },
  ] }]);

  assert.deepEqual(results, [{ player: 0, index: 0, t: 'ability', ok: true }]);
  assert.equal(s.e.owner[slotOf(goliath)], 0);
  assert.equal(s.e.shield[slotOf(archon)], 0);
});

test('hallucination creates timed harmless copies', () => {
  const { sim, state: s, spawn, grant } = simScenario({ seed: 391 });
  const templar = spawn(Kind.HighTemplar, 0, fx(400), fx(400));
  const marine = spawn(Kind.Marine, 0, fx(430), fx(400));
  const depot = spawn(Kind.SupplyDepot, 1, fx(470), fx(400));
  s.e.energy[slotOf(templar)] = 100;
  grant(0, Tech.Hallucination);

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

  const enemy = spawn(Kind.Marine, 1, fx(450), fx(400));
  sim.step([{ player: 1, cmds: [{ t: 'attack', unit: enemy, target: eid(s.e, illusions[0]!) }] }]);
  assert.equal(s.e.hp[illusions[0]!], Units[Kind.Marine]!.hp - 12);
});

test('hallucinations cannot perform real utility commands or cast spells', () => {
  const { sim, state: s, spawn, grant } = simScenario({ seed: 3921 });
  s.players.minerals[0] = 500;
  s.players.gas[0] = 500;

  const scv = spawn(Kind.SCV, 0, fx(400), fx(400));
  const mineral = spawn(Kind.Mineral, -1, fx(430), fx(400));
  const depot = spawn(Kind.SupplyDepot, 0, fx(460), fx(400));
  const templar = spawn(Kind.HighTemplar, 0, fx(520), fx(400));
  const marine = spawn(Kind.Marine, 0, fx(550), fx(400));
  const dropship = spawn(Kind.Dropship, 0, fx(580), fx(400));
  const reaver = spawn(Kind.Reaver, 0, fx(620), fx(400));
  const carrier = spawn(Kind.Carrier, 0, fx(660), fx(400));
  const larva = spawn(Kind.Larva, 0, fx(700), fx(400));

  s.e.illusion[slotOf(scv)] = 1;
  s.e.illusion[slotOf(templar)] = 1;
  s.e.illusion[slotOf(dropship)] = 1;
  s.e.illusion[slotOf(reaver)] = 1;
  s.e.illusion[slotOf(carrier)] = 1;
  s.e.illusion[slotOf(larva)] = 1;
  s.e.hp[slotOf(depot)] = Units[Kind.SupplyDepot]!.hp - 50;
  s.e.energy[slotOf(templar)] = 100;
  grant(0, Tech.Hallucination);

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
  const { sim, state: s, spawn, grant } = simScenario({ seed: 392 });
  const queen = spawn(Kind.Queen, 0, fx(400), fx(400));
  const zealot = spawn(Kind.Zealot, 1, fx(430), fx(400));
  s.e.energy[slotOf(queen)] = 150;
  grant(0, Tech.SpawnBroodling);

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
  const { sim, state: s, spawn, grant } = simScenario({ seed: 393 });
  const queen = spawn(Kind.Queen, 0, fx(400), fx(400));
  spawn(Kind.Overlord, 0, fx(380), fx(400));
  const cc = spawn(Kind.CommandCenter, 1, fx(430), fx(400));
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

test('ready nuke lookup and consumption are internal-product backed', () => {
  const { state: s, spawn } = simScenario({ players: 1, seed: 3931 });
  const parent = spawn(Kind.CommandCenter, 0, fx(320), fx(400));
  const silo = spawn(Kind.NuclearSilo, 0, fx(400), fx(400));
  const slot = slotOf(silo);

  s.e.specialAmmo[slot] = 1;
  assert.equal(hasReadyNuke(s, 0), false, 'orphaned silo missile is not launch-ready');

  linkAddon(s, parent, silo);
  assert.equal(readyNukeSilo(s, 0), slot);
  assert.equal(hasReadyNuke(s, 0), true);
  assert.equal(consumeReadyNuke(s, 0), true);
  assert.equal(s.e.specialAmmo[slot], 0);
  assert.equal(hasReadyNuke(s, 0), false);
});

test('nuclear strike consumes a missile and deals damage after the sourced channel window', () => {
  const { sim, state: s, spawn, grant } = simScenario({ seed: 394 });
  const targetX = 720;
  const targetY = 400;
  const ghost = spawn(Kind.Ghost, 0, fx(400), fx(400));
  const silo = loadedSilo(s, spawn, 0);
  const marine = spawn(Kind.Marine, 1, fx(targetX), fx(targetY));
  const center = spawn(Kind.CommandCenter, 1, fx(targetX), fx(targetY));
  const carrierUp = bodyBounds(Kind.Carrier).up;
  const battlecruiserLeft = bodyBounds(Kind.Battlecruiser).left;
  const shielded = spawn(Kind.Carrier, 1, fx(targetX), fx(targetY + SplashPx.NuclearStrike.inner - 12) + carrierUp);
  const medium = spawn(Kind.Battlecruiser, 1, fx(targetX + SplashPx.NuclearStrike.inner + 32) + battlecruiserLeft, fx(targetY));
  const outer = spawn(Kind.Battlecruiser, 1, fx(targetX + SplashPx.NuclearStrike.medium + 32) + battlecruiserLeft, fx(targetY));
  const far = spawn(Kind.Battlecruiser, 1, fx(targetX + SplashPx.NuclearStrike.outer + 1) + battlecruiserLeft, fx(targetY));
  const nuke = Abilities[Ability.NuclearStrike]!;
  const durableHp = 1_500;
  s.e.hp[slotOf(shielded)] = 1_000;
  s.e.hp[slotOf(medium)] = durableHp;
  s.e.hp[slotOf(outer)] = durableHp;
  s.e.hp[slotOf(far)] = durableHp;

  assert.equal(nuke.duration, sec(14.5));
  assert.equal(nuke.radius, fx(SplashPx.NuclearStrike.outer));

  const results = sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: ghost, ability: Ability.NuclearStrike, x: fx(targetX), y: fx(targetY) },
  ] }]);

  assert.deepEqual(results, [{ player: 0, index: 0, t: 'ability', ok: true }]);
  assert.equal(s.e.specialAmmo[slotOf(silo)], 0);
  assert.equal(s.e.alive[slotOf(marine)], 1);
  for (let t = 0; t < sec(8.5); t++) sim.step([]);
  assert.equal(s.e.alive[slotOf(marine)], 1, 'old 8.4s delay must not resolve the strike early');
  assert.equal(s.e.hp[slotOf(center)], Units[Kind.CommandCenter]!.hp);
  assert.equal(s.e.shield[slotOf(shielded)], Units[Kind.Carrier]!.shields);
  assert.equal(s.e.hp[slotOf(medium)], durableHp);
  assert.equal(s.e.hp[slotOf(outer)], durableHp);

  for (let t = sec(8.5); t < nuke.duration - 1; t++) sim.step([]);
  assert.equal(s.e.alive[slotOf(marine)], 0);
  assert.equal(s.e.hp[slotOf(center)], Units[Kind.CommandCenter]!.hp - 1000);
  assert.equal(s.e.shield[slotOf(shielded)], 0);
  assert.equal(s.e.hp[slotOf(shielded)], 1_000 - (500 - Units[Kind.Carrier]!.shields));
  assert.equal(s.e.hp[slotOf(medium)], durableHp - 250);
  assert.equal(s.e.hp[slotOf(outer)], durableHp - 125);
  assert.equal(s.e.hp[slotOf(far)], durableHp);
});

test('nuclear strike requires a ready missile and cancels if the ghost moves', () => {
  const { sim, state: s, spawn, grant } = simScenario({ seed: 395 });
  const ghost = spawn(Kind.Ghost, 0, fx(400), fx(400));
  const target = spawn(Kind.CommandCenter, 1, fx(720), fx(400));

  assert.deepEqual(sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: ghost, ability: Ability.NuclearStrike, x: fx(500), y: fx(400) },
  ] }]), [{ player: 0, index: 0, t: 'ability', ok: false, reason: 'missing-requirement' }]);

  loadedSilo(s, spawn, 0);
  const silo = readyNukeSilo(s, 0);
  assert.deepEqual(sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: ghost, ability: Ability.NuclearStrike, x: fx(720), y: fx(400) },
  ] }]), [{ player: 0, index: 0, t: 'ability', ok: true }]);
  assert.equal(s.e.specialAmmo[silo], 0, 'accepted launch spends the ready missile immediately');
  sim.step([{ player: 0, cmds: [{ t: 'move', unit: ghost, x: fx(200), y: fx(400) }] }]);
  for (let t = 0; t < Abilities[Ability.NuclearStrike]!.duration; t++) sim.step([]);
  assert.equal(s.e.hp[slotOf(target)], Units[Kind.CommandCenter]!.hp);
  assert.equal(s.e.specialAmmo[silo], 0, 'interrupted channel does not refund the launched missile');
});

test('nuclear silos build one internal missile ammo', () => {
  const { sim, state: s, spawn, grant } = simScenario({ players: 1, seed: 397 });
  const commandCenter = spawn(Kind.CommandCenter, 0, fx(320), fx(400));
  const silo = spawn(Kind.NuclearSilo, 0, fx(400), fx(400));
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
  const { sim, state: s, spawn, grant } = simScenario({ seed: 396 });
  spawn(Kind.Pylon, 0, fx(360), fx(400));
  const battery = spawn(Kind.ShieldBattery, 0, fx(400), fx(400));
  const zealot = spawn(Kind.Zealot, 0, fx(430), fx(400));
  s.e.energy[slotOf(battery)] = 10;
  s.e.shield[slotOf(zealot)] = 20;

  const results = sim.step([{ player: 0, cmds: [
    { t: 'ability', unit: battery, ability: Ability.ShieldRecharge, target: zealot },
  ] }]);

  assert.deepEqual(results, [{ player: 0, index: 0, t: 'ability', ok: true }]);
  assert.equal(s.e.energy[slotOf(battery)], 9);
  assert.equal(s.e.shield[slotOf(zealot)], 22);
});
