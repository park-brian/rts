import test from 'node:test';
import assert from 'node:assert/strict';
import { Kind, Order, Tech, Units } from '../src/data/index.ts';
import { fx } from '../src/fixed.ts';
import { slotOf } from '../src/entity/world.ts';
import { canDetect } from '../src/mechanics/detection.ts';
import {
  armorUpgradeBonus, armorUpgradeBonusForKind, shieldArmorBonus, upgradedCooldown,
  upgradedCooldownForKind, upgradedEnergyMax, upgradedEnergyMaxForKind, upgradedRange,
  upgradedRangeForKind, upgradedSight, upgradedSightForKind, upgradedSpeed,
  upgradedSpeedForKind, weaponUpgradeBonus, weaponUpgradeBonusForKind,
} from '../src/mechanics/upgrades.ts';
import { simScenario } from '../test-support/scenario.ts';

test('weapon and shield armor upgrades affect weapon hits', () => {
  const { sim, state: s, spawn, grant } = simScenario({ seed: 70 });
  const marine = spawn(Kind.Marine, 0, fx(400), fx(400));
  const zealot = spawn(Kind.Zealot, 1, fx(430), fx(400));
  grant(0, Tech.InfantryWeapons);
  grant(1, Tech.PlasmaShields);

  sim.step([{ player: 0, cmds: [{ t: 'attack', unit: marine, target: zealot }] }]);

  assert.equal(s.e.shield[slotOf(zealot)], Units[Kind.Zealot]!.shields - 6);
});

test('armor upgrades reduce hit point damage after shields are gone', () => {
  const { sim, state: s, spawn, grant } = simScenario({ seed: 71 });
  const marine = spawn(Kind.Marine, 0, fx(400), fx(400));
  const zealot = spawn(Kind.Zealot, 1, fx(430), fx(400));
  const z = slotOf(zealot);
  s.e.shield[z] = 0;
  grant(0, Tech.InfantryWeapons);
  grant(1, Tech.GroundArmor);

  sim.step([{ player: 0, cmds: [{ t: 'attack', unit: marine, target: zealot }] }]);

  assert.equal(s.e.hp[z], Units[Kind.Zealot]!.hp - 5);
});

test('shield armor does not inflate overflow damage after shields break', () => {
  const { sim, state: s, spawn, grant } = simScenario({ seed: 711 });
  const marine = spawn(Kind.Marine, 0, fx(400), fx(400));
  const zealot = spawn(Kind.Zealot, 1, fx(430), fx(400));
  const z = slotOf(zealot);
  s.e.shield[z] = 1;
  grant(1, Tech.PlasmaShields);

  sim.step([{ player: 0, cmds: [{ t: 'attack', unit: marine, target: zealot }] }]);

  assert.equal(s.e.shield[z], 0);
  assert.equal(s.e.hp[z], Units[Kind.Zealot]!.hp - 4);
});

test('weapon upgrades use brood war per-unit damage increments', () => {
  const cases = [
    { kind: Kind.Marine, tech: Tech.InfantryWeapons, step: 1 },
    { kind: Kind.Vulture, tech: Tech.VehicleWeapons, step: 2 },
    { kind: Kind.SiegeTank, tech: Tech.VehicleWeapons, step: 3 },
    { kind: Kind.SiegeTankSieged, tech: Tech.VehicleWeapons, step: 5 },
    { kind: Kind.Goliath, tech: Tech.VehicleWeapons, step: 1 },
    { kind: Kind.Wraith, tech: Tech.ShipWeapons, step: 1 },
    { kind: Kind.Valkyrie, tech: Tech.ShipWeapons, step: 1 },
    { kind: Kind.Battlecruiser, tech: Tech.ShipWeapons, step: 3 },
    { kind: Kind.Zealot, tech: Tech.GroundWeapons, step: 1 },
    { kind: Kind.Dragoon, tech: Tech.GroundWeapons, step: 2 },
    { kind: Kind.DarkTemplar, tech: Tech.GroundWeapons, step: 3 },
    { kind: Kind.Archon, tech: Tech.GroundWeapons, step: 3 },
    { kind: Kind.Zergling, tech: Tech.MeleeAttacks, step: 1 },
    { kind: Kind.Ultralisk, tech: Tech.MeleeAttacks, step: 3 },
    { kind: Kind.Broodling, tech: Tech.MeleeAttacks, step: 1 },
    { kind: Kind.Hydralisk, tech: Tech.MissileAttacks, step: 1 },
    { kind: Kind.Lurker, tech: Tech.MissileAttacks, step: 2 },
    { kind: Kind.Mutalisk, tech: Tech.FlyerAttacks, step: 1 },
    { kind: Kind.Guardian, tech: Tech.FlyerAttacks, step: 2 },
    { kind: Kind.Devourer, tech: Tech.FlyerAttacks, step: 2 },
  ];

  for (const c of cases) {
    const { state: s, spawn, grant } = simScenario({ seed: 770 + c.kind });
    const unit = spawn(c.kind, 0, fx(400), fx(400));
    const weapon = Units[c.kind]!.weapon ?? Units[c.kind]!.airWeapon!;
    grant(0, c.tech, 2);

    assert.equal(weaponUpgradeBonus(s, slotOf(unit), weapon), c.step * 2, Units[c.kind]!.name);
  }
});

test('weapon upgrades can use weapon-specific increments for mixed-weapon units', () => {
  const cases = [
    { kind: Kind.Goliath, tech: Tech.VehicleWeapons, weapon: Units[Kind.Goliath]!.airWeapon!, step: 2 },
    { kind: Kind.Wraith, tech: Tech.ShipWeapons, weapon: Units[Kind.Wraith]!.airWeapon!, step: 2 },
  ];

  for (const c of cases) {
    const { state: s, spawn, grant } = simScenario({ seed: 775 + c.kind });
    const unit = spawn(c.kind, 0, fx(400), fx(400));
    grant(0, c.tech, 2);

    assert.equal(weaponUpgradeBonus(s, slotOf(unit), c.weapon), c.step * 2, Units[c.kind]!.name);
  }
});

test('weapon upgrade categories do not leak onto workers or static defenses', () => {
  const cases = [
    { kind: Kind.SCV, tech: Tech.InfantryWeapons, weapon: Units[Kind.SCV]!.weapon! },
    { kind: Kind.Probe, tech: Tech.GroundWeapons, weapon: Units[Kind.Probe]!.weapon! },
    { kind: Kind.Drone, tech: Tech.MeleeAttacks, weapon: Units[Kind.Drone]!.weapon! },
    { kind: Kind.Drone, tech: Tech.MissileAttacks, weapon: Units[Kind.Drone]!.weapon! },
    { kind: Kind.MissileTurret, tech: Tech.ShipWeapons, weapon: Units[Kind.MissileTurret]!.airWeapon! },
    { kind: Kind.MissileTurret, tech: Tech.VehicleWeapons, weapon: Units[Kind.MissileTurret]!.airWeapon! },
    { kind: Kind.PhotonCannon, tech: Tech.GroundWeapons, weapon: Units[Kind.PhotonCannon]!.weapon! },
    { kind: Kind.SunkenColony, tech: Tech.MissileAttacks, weapon: Units[Kind.SunkenColony]!.weapon! },
    { kind: Kind.SporeColony, tech: Tech.FlyerAttacks, weapon: Units[Kind.SporeColony]!.airWeapon! },
  ];

  for (const c of cases) {
    const { state: s, spawn, grant } = simScenario({ seed: 760 + c.kind + c.tech });
    const unit = spawn(c.kind, 0, fx(400), fx(400));
    grant(0, c.tech, 3);

    assert.equal(weaponUpgradeBonus(s, slotOf(unit), c.weapon), 0, `${Units[c.kind]!.name} ${c.tech}`);
  }
});

test('armor upgrade categories apply to units but not structures', () => {
  const upgradedUnits = [
    { kind: Kind.SCV, tech: Tech.InfantryArmor, bonus: 2 },
    { kind: Kind.Goliath, tech: Tech.VehiclePlating, bonus: 2 },
    { kind: Kind.Wraith, tech: Tech.ShipPlating, bonus: 2 },
    { kind: Kind.Probe, tech: Tech.GroundArmor, bonus: 2 },
    { kind: Kind.Observer, tech: Tech.AirArmor, bonus: 2 },
    { kind: Kind.Drone, tech: Tech.Carapace, bonus: 2 },
    { kind: Kind.Mutalisk, tech: Tech.FlyerCarapace, bonus: 2 },
    { kind: Kind.Ultralisk, tech: Tech.ChitinousPlating, bonus: 2, levels: 1 },
  ];
  for (const c of upgradedUnits) {
    const { state: s, spawn, grant } = simScenario({ seed: 765 + c.kind + c.tech });
    const unit = spawn(c.kind, 0, fx(400), fx(400));
    grant(0, c.tech, c.levels ?? 2);

    assert.equal(armorUpgradeBonus(s, slotOf(unit)), c.bonus, Units[c.kind]!.name);
  }

  const structures = [
    { kind: Kind.CommandCenter, tech: Tech.VehiclePlating },
    { kind: Kind.Nexus, tech: Tech.GroundArmor },
    { kind: Kind.Hatchery, tech: Tech.Carapace },
    { kind: Kind.MissileTurret, tech: Tech.ShipPlating },
    { kind: Kind.PhotonCannon, tech: Tech.GroundArmor },
    { kind: Kind.SunkenColony, tech: Tech.Carapace },
  ];
  for (const c of structures) {
    const { state: s, spawn, grant } = simScenario({ seed: 775 + c.kind + c.tech });
    const structure = spawn(c.kind, 0, fx(400), fx(400));
    grant(0, c.tech, 3);

    assert.equal(armorUpgradeBonus(s, slotOf(structure)), 0, Units[c.kind]!.name);
  }

  const { state: s, spawn, grant } = simScenario({ seed: 776 });
  const nexus = spawn(Kind.Nexus, 0, fx(400), fx(400));
  grant(0, Tech.PlasmaShields, 3);
  assert.equal(shieldArmorBonus(s, slotOf(nexus)), 3);
});

test('ultralisk armor stacks carapace with chitinous plating', () => {
  const { state: s, spawn, grant } = simScenario({ seed: 777 });
  const ultra = spawn(Kind.Ultralisk, 0, fx(400), fx(400));
  grant(0, Tech.Carapace, 3);
  grant(0, Tech.ChitinousPlating);

  assert.equal(armorUpgradeBonus(s, slotOf(ultra)), 5);
});

test('range upgrades let units hit from upgraded distance', () => {
  const { sim, state: s, spawn, grant } = simScenario({ seed: 72 });
  const marine = spawn(Kind.Marine, 0, fx(400), fx(400));
  const target = spawn(Kind.Medic, 1, fx(544), fx(400));
  grant(0, Tech.U238Shells);

  sim.step([{ player: 0, cmds: [{ t: 'attack', unit: marine, target }] }]);

  assert.equal(s.e.hp[slotOf(target)], Units[Kind.Medic]!.hp - 5);
});

test('range upgrade table applies only to the intended unit weapons', () => {
  const cases = [
    { kind: Kind.Marine, tech: Tech.U238Shells, weapon: Units[Kind.Marine]!.weapon!, bonus: fx(32) },
    { kind: Kind.Dragoon, tech: Tech.SingularityCharge, weapon: Units[Kind.Dragoon]!.weapon!, bonus: fx(64) },
    { kind: Kind.Hydralisk, tech: Tech.GroovedSpines, weapon: Units[Kind.Hydralisk]!.weapon!, bonus: fx(32) },
    { kind: Kind.Goliath, tech: Tech.CharonBoosters, weapon: Units[Kind.Goliath]!.airWeapon!, bonus: fx(96) },
  ];

  for (const c of cases) {
    const { state: s, spawn, grant } = simScenario({ seed: 780 + c.kind });
    const unit = spawn(c.kind, 0, fx(400), fx(400));
    grant(0, c.tech);

    assert.equal(upgradedRange(s, slotOf(unit), c.weapon), c.weapon.range + c.bonus, Units[c.kind]!.name);
  }

  const { state: s, spawn, grant } = simScenario({ seed: 781 });
  const goliath = spawn(Kind.Goliath, 0, fx(400), fx(400));
  const ground = Units[Kind.Goliath]!.weapon!;
  grant(0, Tech.CharonBoosters);
  assert.equal(upgradedRange(s, slotOf(goliath), ground), ground.range);
});

test('speed upgrades feed movement through the shared speed helper', () => {
  const fast = simScenario({ seed: 73 });
  const slow = simScenario({ seed: 74 });
  const vf = fast.spawn(Kind.Vulture, 0, fx(400), fx(400));
  const vs = slow.spawn(Kind.Vulture, 0, fx(400), fx(400));
  fast.grant(0, Tech.IonThrusters);

  fast.sim.step([{ player: 0, cmds: [{ t: 'move', unit: vf, x: fx(800), y: fx(400) }] }]);
  slow.sim.step([{ player: 0, cmds: [{ t: 'move', unit: vs, x: fx(800), y: fx(400) }] }]);

  assert.ok(fast.state.e.x[slotOf(vf)]! > slow.state.e.x[slotOf(vs)]!);
});

test('speed, cooldown, sight, and energy upgrades are data-driven by unit kind', () => {
  const speedCases = [
    { kind: Kind.Vulture, tech: Tech.IonThrusters, num: 3, den: 2 },
    { kind: Kind.Zealot, tech: Tech.LegEnhancements, num: 3, den: 2 },
    { kind: Kind.Shuttle, tech: Tech.GraviticDrive, num: 3, den: 2 },
    { kind: Kind.Observer, tech: Tech.GraviticBoosters, num: 3, den: 2 },
    { kind: Kind.Scout, tech: Tech.GraviticThrusters, num: 3, den: 2 },
    { kind: Kind.Zergling, tech: Tech.MetabolicBoost, num: 3, den: 2 },
    { kind: Kind.Hydralisk, tech: Tech.MuscularAugments, num: 5, den: 4 },
    { kind: Kind.Overlord, tech: Tech.PneumatizedCarapace, num: 2, den: 1 },
    { kind: Kind.Ultralisk, tech: Tech.AnabolicSynthesis, num: 4, den: 3 },
  ];
  for (const c of speedCases) {
    const { state: s, spawn, grant } = simScenario({ seed: 790 + c.kind });
    const unit = spawn(c.kind, 0, fx(400), fx(400));
    const base = Units[c.kind]!.speed;
    grant(0, c.tech);

    assert.equal(upgradedSpeed(s, slotOf(unit), base), Math.trunc((base * c.num) / c.den), Units[c.kind]!.name);
  }

  const { state: cooldownState, spawn: spawnCooldown, grant: grantCooldown } = simScenario({ seed: 791 });
  const zergling = spawnCooldown(Kind.Zergling, 0, fx(400), fx(400));
  grantCooldown(0, Tech.AdrenalGlands);
  assert.equal(upgradedCooldown(cooldownState, slotOf(zergling), Units[Kind.Zergling]!.weapon!.cooldown), 6);

  const sightCases = [
    { kind: Kind.Ghost, tech: Tech.OcularImplants },
    { kind: Kind.Overlord, tech: Tech.Antennae },
    { kind: Kind.Observer, tech: Tech.SensorArray },
    { kind: Kind.Scout, tech: Tech.ApialSensors },
  ];
  for (const c of sightCases) {
    const { state: s, spawn, grant } = simScenario({ seed: 800 + c.kind });
    const unit = spawn(c.kind, 0, fx(400), fx(400));
    grant(0, c.tech);

    assert.equal(upgradedSight(s, slotOf(unit), Units[c.kind]!.sight), Units[c.kind]!.sight + 2, Units[c.kind]!.name);
  }

  const energyCases = [
    { kind: Kind.Medic, tech: Tech.CaduceusReactor },
    { kind: Kind.Ghost, tech: Tech.MoebiusReactor },
    { kind: Kind.Wraith, tech: Tech.ApolloReactor },
    { kind: Kind.Battlecruiser, tech: Tech.ColossusReactor },
    { kind: Kind.ScienceVessel, tech: Tech.TitanReactor },
    { kind: Kind.HighTemplar, tech: Tech.KhaydarinAmulet },
    { kind: Kind.DarkArchon, tech: Tech.ArgusTalisman },
    { kind: Kind.Arbiter, tech: Tech.KhaydarinCore },
    { kind: Kind.Corsair, tech: Tech.ArgusJewel },
    { kind: Kind.Queen, tech: Tech.GameteMeiosis },
    { kind: Kind.Defiler, tech: Tech.MetasynapticNode },
  ];
  for (const c of energyCases) {
    const { state: s, spawn, grant } = simScenario({ seed: 810 + c.kind });
    const unit = spawn(c.kind, 0, fx(400), fx(400));
    grant(0, c.tech);

    assert.equal(upgradedEnergyMax(s, slotOf(unit), Units[c.kind]!.energyMax), 250, Units[c.kind]!.name);
  }
});

test('kind upgrade helpers match slot upgrade helpers for future units', () => {
  const { state: s, spawn, grant } = simScenario({ seed: 812 });
  const marine = spawn(Kind.Marine, 0, fx(400), fx(400));
  const zergling = spawn(Kind.Zergling, 0, fx(430), fx(400));
  const hydralisk = spawn(Kind.Hydralisk, 0, fx(460), fx(400));
  const medic = spawn(Kind.Medic, 0, fx(490), fx(400));
  grant(0, Tech.InfantryWeapons, 2);
  grant(0, Tech.InfantryArmor, 2);
  grant(0, Tech.U238Shells);
  grant(0, Tech.AdrenalGlands);
  grant(0, Tech.MuscularAugments);
  grant(0, Tech.GroovedSpines);
  grant(0, Tech.CaduceusReactor);

  const marineSlot = slotOf(marine);
  const lingSlot = slotOf(zergling);
  const hydraSlot = slotOf(hydralisk);
  const medicSlot = slotOf(medic);
  const marineWeapon = Units[Kind.Marine]!.weapon!;
  const hydraWeapon = Units[Kind.Hydralisk]!.weapon!;
  const owner = 0;

  assert.equal(
    weaponUpgradeBonusForKind(s, owner, Kind.Marine, marineWeapon),
    weaponUpgradeBonus(s, marineSlot, marineWeapon),
  );
  assert.equal(armorUpgradeBonusForKind(s, owner, Kind.Marine), armorUpgradeBonus(s, marineSlot));
  assert.equal(upgradedRangeForKind(s, owner, Kind.Marine, marineWeapon), upgradedRange(s, marineSlot, marineWeapon));
  assert.equal(
    upgradedSpeedForKind(s, owner, Kind.Hydralisk, Units[Kind.Hydralisk]!.speed),
    upgradedSpeed(s, hydraSlot, Units[Kind.Hydralisk]!.speed),
  );
  assert.equal(
    upgradedRangeForKind(s, owner, Kind.Hydralisk, hydraWeapon),
    upgradedRange(s, hydraSlot, hydraWeapon),
  );
  assert.equal(
    upgradedCooldownForKind(s, owner, Kind.Zergling, Units[Kind.Zergling]!.weapon!.cooldown),
    upgradedCooldown(s, lingSlot, Units[Kind.Zergling]!.weapon!.cooldown),
  );
  assert.equal(
    upgradedSightForKind(s, owner, Kind.Medic, Units[Kind.Medic]!.sight),
    upgradedSight(s, medicSlot, Units[Kind.Medic]!.sight),
  );
  assert.equal(
    upgradedEnergyMaxForKind(s, owner, Kind.Medic, Units[Kind.Medic]!.energyMax),
    upgradedEnergyMax(s, medicSlot, Units[Kind.Medic]!.energyMax),
  );
});

test('adrenal glands applies exact zergling attack cooldown', () => {
  const normal = simScenario({ seed: 731 });
  const upgraded = simScenario({ seed: 732 });
  const normalLing = normal.spawn(Kind.Zergling, 0, fx(400), fx(400));
  const normalTarget = normal.spawn(Kind.SupplyDepot, 1, fx(430), fx(400));
  const upgradedLing = upgraded.spawn(Kind.Zergling, 0, fx(400), fx(400));
  const upgradedTarget = upgraded.spawn(Kind.SupplyDepot, 1, fx(430), fx(400));
  upgraded.grant(0, Tech.AdrenalGlands);

  normal.sim.step([{ player: 0, cmds: [{ t: 'attack', unit: normalLing, target: normalTarget }] }]);
  upgraded.sim.step([{ player: 0, cmds: [{ t: 'attack', unit: upgradedLing, target: upgradedTarget }] }]);

  assert.equal(normal.state.e.wcd[slotOf(normalLing)], 8);
  assert.equal(upgraded.state.e.wcd[slotOf(upgradedLing)], 6);
});

test('sight upgrades affect detector coverage', () => {
  const { state: s, spawn, grant } = simScenario({ seed: 75 });
  const observer = spawn(Kind.Observer, 0, fx(400), fx(400));
  const dt = spawn(Kind.DarkTemplar, 1, fx(735), fx(400));

  assert.equal(canDetect(s, 0, slotOf(dt)), false);
  grant(0, Tech.SensorArray);
  assert.equal(canDetect(s, 0, slotOf(dt)), true);
  assert.equal(s.e.order[slotOf(observer)], Order.Idle);
});

test('energy upgrades raise existing and future caster caps', () => {
  const { sim, state: s, spawn } = simScenario({ seed: 76 });
  const academy = spawn(Kind.Academy, 0, fx(400), fx(400));
  const medic = spawn(Kind.Medic, 0, fx(430), fx(400));
  s.e.researchKind[slotOf(academy)] = Tech.CaduceusReactor;
  s.e.researchTimer[slotOf(academy)] = 1;

  sim.step([]);
  const laterMedic = spawn(Kind.Medic, 0, fx(460), fx(400));

  assert.equal(s.e.energyMax[slotOf(medic)], 250);
  assert.equal(s.e.energyMax[slotOf(laterMedic)], 250);
});
