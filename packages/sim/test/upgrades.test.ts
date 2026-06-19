import test from 'node:test';
import assert from 'node:assert/strict';
import { Kind, Order, Tech, Units } from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import { slotOf } from '../src/entity/world.ts';
import { canDetect } from '../src/mechanics/detection.ts';
import { weaponUpgradeBonus } from '../src/mechanics/upgrades.ts';
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

test('range upgrades let units hit from upgraded distance', () => {
  const { sim, state: s, spawn, grant } = simScenario({ seed: 72 });
  const marine = spawn(Kind.Marine, 0, fx(400), fx(400));
  const target = spawn(Kind.Medic, 1, fx(544), fx(400));
  grant(0, Tech.U238Shells);

  sim.step([{ player: 0, cmds: [{ t: 'attack', unit: marine, target }] }]);

  assert.equal(s.e.hp[slotOf(target)], Units[Kind.Medic]!.hp - 5);
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
