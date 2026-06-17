import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/sim.ts';
import { sliceMap } from '../src/map.ts';
import { spawnUnit } from '../src/factory.ts';
import { Ability, Kind, Tech, TechDefs } from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import { slotOf } from '../src/world.ts';
import { getTechLevel } from '../src/tech.ts';

const fund = (sim: Sim, player: number, minerals = 1000, gas = 1000): void => {
  const s = sim.fullState();
  s.players.minerals[player] = minerals;
  s.players.gas[player] = gas;
};

const finishResearch = (sim: Sim, building: number): void => {
  const e = sim.fullState().e;
  const slot = slotOf(building);
  let guard = 10_000;
  while (e.researchKind[slot] !== 0 && guard-- > 0) sim.step([]);
  assert.notEqual(guard, 0, 'research completed before guard expired');
};

test('research unlocks an ability through shared command validation', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 70 });
  const s = sim.fullState();
  const academy = spawnUnit(s, Kind.Academy, 0, fx(350), fx(350));
  const marine = spawnUnit(s, Kind.Marine, 0, fx(400), fx(400));
  fund(sim, 0);

  let results = sim.step([{ player: 0, cmds: [{ t: 'ability', unit: marine, ability: Ability.StimPack }] }]);
  assert.deepEqual(results, [{ player: 0, index: 0, t: 'ability', ok: false, reason: 'missing-requirement' }]);

  results = sim.step([{ player: 0, cmds: [{ t: 'research', building: academy, tech: Tech.StimPack }] }]);
  assert.deepEqual(results, [{ player: 0, index: 0, t: 'research', ok: true }]);
  assert.equal(s.players.minerals[0], 900);
  assert.equal(s.players.gas[0], 900);
  finishResearch(sim, academy);
  assert.equal(getTechLevel(s, 0, Tech.StimPack), 1);

  results = sim.step([{ player: 0, cmds: [{ t: 'ability', unit: marine, ability: Ability.StimPack }] }]);
  assert.deepEqual(results, [{ player: 0, index: 0, t: 'ability', ok: true }]);
});

test('research rejects duplicates while in progress and after max level', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 71 });
  const s = sim.fullState();
  const academy = spawnUnit(s, Kind.Academy, 0, fx(350), fx(350));
  fund(sim, 0);

  let results = sim.step([{ player: 0, cmds: [
    { t: 'research', building: academy, tech: Tech.StimPack },
    { t: 'research', building: academy, tech: Tech.StimPack },
  ] }]);
  assert.deepEqual(results, [
    { player: 0, index: 0, t: 'research', ok: true },
    { player: 0, index: 1, t: 'research', ok: false, reason: 'queue-full' },
  ]);

  finishResearch(sim, academy);
  results = sim.step([{ player: 0, cmds: [{ t: 'research', building: academy, tech: Tech.StimPack }] }]);
  assert.deepEqual(results, [{ player: 0, index: 0, t: 'research', ok: false, reason: 'target-not-allowed' }]);
});

test('multi-level upgrades advance one researched level at a time', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 72 });
  const s = sim.fullState();
  const bay = spawnUnit(s, Kind.EngineeringBay, 0, fx(350), fx(350));
  fund(sim, 0, 1000, 1000);

  let results = sim.step([{ player: 0, cmds: [{ t: 'research', building: bay, tech: Tech.InfantryWeapons }] }]);
  assert.deepEqual(results, [{ player: 0, index: 0, t: 'research', ok: true }]);
  finishResearch(sim, bay);
  assert.equal(getTechLevel(s, 0, Tech.InfantryWeapons), 1);

  results = sim.step([{ player: 0, cmds: [{ t: 'research', building: bay, tech: Tech.InfantryWeapons }] }]);
  assert.deepEqual(results, [{ player: 0, index: 0, t: 'research', ok: true }]);
  assert.equal(s.e.researchKind[slotOf(bay)], Tech.InfantryWeapons);
  assert.equal(s.e.researchTimer[slotOf(bay)], TechDefs[Tech.InfantryWeapons]!.time[1]! - 1);
  finishResearch(sim, bay);
  assert.equal(getTechLevel(s, 0, Tech.InfantryWeapons), 2);
});

test('byte serialization preserves completed and in-progress research', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 73 });
  const s = sim.fullState();
  const academy = spawnUnit(s, Kind.Academy, 0, fx(350), fx(350));
  const bay = spawnUnit(s, Kind.EngineeringBay, 0, fx(390), fx(350));
  fund(sim, 0);

  sim.step([{ player: 0, cmds: [{ t: 'research', building: academy, tech: Tech.StimPack }] }]);
  finishResearch(sim, academy);
  sim.step([{ player: 0, cmds: [{ t: 'research', building: bay, tech: Tech.InfantryArmor }] }]);
  sim.step([]);

  const restored = Sim.deserialize(sim.serialize());
  const rs = restored.fullState();
  assert.equal(getTechLevel(rs, 0, Tech.StimPack), 1);
  assert.equal(rs.e.researchKind[slotOf(bay)], Tech.InfantryArmor);
  assert.ok(rs.e.researchTimer[slotOf(bay)]! > 0);
});
