import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/sim.ts';
import { sliceMap } from '../src/map.ts';
import { spawnUnit } from '../src/factory.ts';
import { Kind, Order, Tech, Units } from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import { slotOf } from '../src/world.ts';
import { setTechLevel } from '../src/tech.ts';
import { canDetect } from '../src/detection.ts';
import { weaponUpgradeBonus } from '../src/derived.ts';

const grant = (sim: Sim, player: number, tech: number, level = 1): void => setTechLevel(sim.fullState(), player, tech, level);

test('weapon and shield armor upgrades affect weapon hits', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 70 });
  const s = sim.fullState();
  const marine = spawnUnit(s, Kind.Marine, 0, fx(400), fx(400));
  const zealot = spawnUnit(s, Kind.Zealot, 1, fx(430), fx(400));
  grant(sim, 0, Tech.InfantryWeapons);
  grant(sim, 1, Tech.PlasmaShields);

  sim.step([{ player: 0, cmds: [{ t: 'attack', unit: marine, target: zealot }] }]);

  assert.equal(s.e.shield[slotOf(zealot)], Units[Kind.Zealot]!.shields - 6);
});

test('armor upgrades reduce hit point damage after shields are gone', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 71 });
  const s = sim.fullState();
  const marine = spawnUnit(s, Kind.Marine, 0, fx(400), fx(400));
  const zealot = spawnUnit(s, Kind.Zealot, 1, fx(430), fx(400));
  const z = slotOf(zealot);
  s.e.shield[z] = 0;
  grant(sim, 0, Tech.InfantryWeapons);
  grant(sim, 1, Tech.GroundArmor);

  sim.step([{ player: 0, cmds: [{ t: 'attack', unit: marine, target: zealot }] }]);

  assert.equal(s.e.hp[z], Units[Kind.Zealot]!.hp - 5);
});

test('shield armor does not inflate overflow damage after shields break', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 711 });
  const s = sim.fullState();
  const marine = spawnUnit(s, Kind.Marine, 0, fx(400), fx(400));
  const zealot = spawnUnit(s, Kind.Zealot, 1, fx(430), fx(400));
  const z = slotOf(zealot);
  s.e.shield[z] = 1;
  grant(sim, 1, Tech.PlasmaShields);

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
    const sim = new Sim({ map: sliceMap(), players: 2, seed: 770 + c.kind });
    const s = sim.fullState();
    const unit = spawnUnit(s, c.kind, 0, fx(400), fx(400));
    const weapon = Units[c.kind]!.weapon ?? Units[c.kind]!.airWeapon!;
    grant(sim, 0, c.tech, 2);

    assert.equal(weaponUpgradeBonus(s, slotOf(unit), weapon), c.step * 2, Units[c.kind]!.name);
  }
});

test('range upgrades let units hit from upgraded distance', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 72 });
  const s = sim.fullState();
  const marine = spawnUnit(s, Kind.Marine, 0, fx(400), fx(400));
  const target = spawnUnit(s, Kind.Medic, 1, fx(544), fx(400));
  grant(sim, 0, Tech.U238Shells);

  sim.step([{ player: 0, cmds: [{ t: 'attack', unit: marine, target }] }]);

  assert.equal(s.e.hp[slotOf(target)], Units[Kind.Medic]!.hp - 5);
});

test('speed upgrades feed movement through the shared speed helper', () => {
  const fast = new Sim({ map: sliceMap(), players: 2, seed: 73 });
  const slow = new Sim({ map: sliceMap(), players: 2, seed: 74 });
  const vf = spawnUnit(fast.fullState(), Kind.Vulture, 0, fx(400), fx(400));
  const vs = spawnUnit(slow.fullState(), Kind.Vulture, 0, fx(400), fx(400));
  grant(fast, 0, Tech.IonThrusters);

  fast.step([{ player: 0, cmds: [{ t: 'move', unit: vf, x: fx(800), y: fx(400) }] }]);
  slow.step([{ player: 0, cmds: [{ t: 'move', unit: vs, x: fx(800), y: fx(400) }] }]);

  assert.ok(fast.fullState().e.x[slotOf(vf)]! > slow.fullState().e.x[slotOf(vs)]!);
});

test('adrenal glands applies exact zergling attack cooldown', () => {
  const normal = new Sim({ map: sliceMap(), players: 2, seed: 731 });
  const upgraded = new Sim({ map: sliceMap(), players: 2, seed: 732 });
  const normalLing = spawnUnit(normal.fullState(), Kind.Zergling, 0, fx(400), fx(400));
  const normalTarget = spawnUnit(normal.fullState(), Kind.SupplyDepot, 1, fx(430), fx(400));
  const upgradedLing = spawnUnit(upgraded.fullState(), Kind.Zergling, 0, fx(400), fx(400));
  const upgradedTarget = spawnUnit(upgraded.fullState(), Kind.SupplyDepot, 1, fx(430), fx(400));
  grant(upgraded, 0, Tech.AdrenalGlands);

  normal.step([{ player: 0, cmds: [{ t: 'attack', unit: normalLing, target: normalTarget }] }]);
  upgraded.step([{ player: 0, cmds: [{ t: 'attack', unit: upgradedLing, target: upgradedTarget }] }]);

  assert.equal(normal.fullState().e.wcd[slotOf(normalLing)], 8);
  assert.equal(upgraded.fullState().e.wcd[slotOf(upgradedLing)], 6);
});

test('sight upgrades affect detector coverage', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 75 });
  const s = sim.fullState();
  const observer = spawnUnit(s, Kind.Observer, 0, fx(400), fx(400));
  const dt = spawnUnit(s, Kind.DarkTemplar, 1, fx(735), fx(400));

  assert.equal(canDetect(s, 0, slotOf(dt)), false);
  grant(sim, 0, Tech.SensorArray);
  assert.equal(canDetect(s, 0, slotOf(dt)), true);
  assert.equal(s.e.order[slotOf(observer)], Order.Idle);
});

test('energy upgrades raise existing and future caster caps', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 76 });
  const s = sim.fullState();
  const academy = spawnUnit(s, Kind.Academy, 0, fx(400), fx(400));
  const medic = spawnUnit(s, Kind.Medic, 0, fx(430), fx(400));
  s.e.researchKind[slotOf(academy)] = Tech.CaduceusReactor;
  s.e.researchTimer[slotOf(academy)] = 1;

  sim.step([]);
  const laterMedic = spawnUnit(s, Kind.Medic, 0, fx(460), fx(400));

  assert.equal(s.e.energyMax[slotOf(medic)], 250);
  assert.equal(s.e.energyMax[slotOf(laterMedic)], 250);
});
