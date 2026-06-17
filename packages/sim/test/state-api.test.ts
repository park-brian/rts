import test from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/sim.ts';
import { sliceMap } from '../src/map.ts';
import { eid, kill, slotOf, spawnEffect } from '../src/world.ts';
import { spawnUnit } from '../src/factory.ts';
import { Ability, EffectKind, Kind, Tech, TILE } from '../src/data.ts';
import { fx } from '../src/fixed.ts';
import { setTechLevel } from '../src/tech.ts';

const tileCenter = (w: number, idx: number): { x: number; y: number } => {
  const tx = idx % w;
  const ty = Math.floor(idx / w);
  return { x: fx((tx + 0.5) * TILE), y: fx((ty + 0.5) * TILE) };
};

test('observe requires vision tracking and returns a defensive vision copy', () => {
  const noVision = new Sim({ map: sliceMap(), players: 1, seed: 201 });
  assert.throws(() => noVision.observe(0), /vision tracking is disabled/);

  const sim = new Sim({ map: sliceMap(), players: 1, seed: 202, vision: true });
  const obs = sim.observe(0);
  assert.ok(obs.vision.some((v) => v === 2), 'initial vision is computed before the first tick');
  obs.vision.fill(0);
  assert.ok(sim.observe(0).vision.some((v) => v === 2), 'mutating observation does not mutate sim fog');
});

test('observe returns a defensive own-player tech vector', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 208, vision: true });
  const s = sim.fullState();
  setTechLevel(s, 0, Tech.StimPack, 1);
  setTechLevel(s, 1, Tech.YamatoCannon, 1);

  const obs = sim.observe(0);
  assert.equal(obs.tech[Tech.StimPack], 1);
  assert.equal(obs.tech[Tech.YamatoCannon], 0);

  obs.tech[Tech.StimPack] = 0;
  assert.equal(sim.observe(0).tech[Tech.StimPack], 1, 'mutating observation does not mutate player tech');
});

test('observe returns active own queues without leaking enemy queues', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 209, vision: true });
  const s = sim.fullState();
  const e = s.e;
  const own = slotOf(spawnUnit(s, Kind.Barracks, 0, fx(500), fx(500)));
  const enemy = slotOf(spawnUnit(s, Kind.Barracks, 1, fx(520), fx(500)));
  e.prodKind[own] = Kind.Marine;
  e.prodTimer[own] = 12;
  e.prodQueued[own] = 1;
  e.researchKind[own] = Tech.StimPack;
  e.researchTimer[own] = 34;
  e.prodKind[enemy] = Kind.Firebat;
  e.prodTimer[enemy] = 56;

  const obs = sim.observe(0);
  assert.deepEqual(obs.queues, [{
    id: eid(e, own),
    prodKind: Kind.Marine,
    prodTimer: 12,
    prodQueued: 1,
    researchKind: Tech.StimPack,
    researchTimer: 34,
  }]);

  const queue: { prodKind: number } = obs.queues[0]!;
  const differentKind: number = Kind.Ghost;
  queue.prodKind = differentKind;
  assert.equal(sim.observe(0).queues[0]!.prodKind, Kind.Marine, 'mutating observation queue does not mutate sim queue');
});

test('observe returns usable own cargo without leaking enemy cargo', () => {
  const sim = new Sim({ map: sliceMap(), players: 3, seed: 210, vision: true });
  const s = sim.fullState();
  s.teams[1] = s.teams[0]!;
  const e = s.e;
  const bunker = slotOf(spawnUnit(s, Kind.Bunker, 0, fx(700), fx(700)));
  const marine = slotOf(spawnUnit(s, Kind.Marine, 0, fx(710), fx(700)));
  const allyNydus = slotOf(spawnUnit(s, Kind.NydusCanal, 1, fx(740), fx(700)));
  const drone = slotOf(spawnUnit(s, Kind.Drone, 0, fx(750), fx(700)));
  const enemyBunker = slotOf(spawnUnit(s, Kind.Bunker, 2, fx(780), fx(700)));
  const enemyMarine = slotOf(spawnUnit(s, Kind.Marine, 2, fx(790), fx(700)));
  e.container[marine] = eid(e, bunker);
  e.container[drone] = eid(e, allyNydus);
  e.container[enemyMarine] = eid(e, enemyBunker);

  const obs = sim.observe(0);
  assert.deepEqual(obs.cargo, [
    { container: eid(e, bunker), units: [eid(e, marine)] },
    { container: eid(e, allyNydus), units: [eid(e, drone)] },
  ]);

  const cargoUnits: number[] = obs.cargo[0]!.units;
  cargoUnits.push(eid(e, enemyMarine));
  assert.deepEqual(
    sim.observe(0).cargo,
    [
      { container: eid(e, bunker), units: [eid(e, marine)] },
      { container: eid(e, allyNydus), units: [eid(e, drone)] },
    ],
    'mutating observation cargo does not mutate sim cargo'
  );
});

test('observe returns sparse own energy and status records without leaking enemy status', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 211, vision: true });
  const s = sim.fullState();
  const e = s.e;
  const medic = slotOf(spawnUnit(s, Kind.Medic, 0, fx(700), fx(700)));
  const marine = slotOf(spawnUnit(s, Kind.Marine, 0, fx(730), fx(700)));
  const enemyQueen = slotOf(spawnUnit(s, Kind.Queen, 1, fx(760), fx(700)));
  e.energy[medic] = 77;
  e.energyMax[medic] = 250;
  e.stimTimer[marine] = 9;
  e.matrixHp[marine] = 120;
  e.matrixTimer[marine] = 20;
  e.ensnareTimer[marine] = 30;
  e.acidSporeCount[marine] = 2;
  e.acidSporeTimer[marine] = 40;
  e.parasiteOwner[marine] = 1;
  e.burrowed[marine] = 1;
  e.energy[enemyQueen] = 88;
  e.energyMax[enemyQueen] = 200;
  e.plagueTimer[enemyQueen] = 99;

  const obs = sim.observe(0);
  assert.equal(obs.statuses.some((v) => v.id === eid(e, enemyQueen)), false);

  const medicStatus = obs.statuses.find((v) => v.id === eid(e, medic));
  assert.ok(medicStatus);
  assert.equal(medicStatus.energy, 77);
  assert.equal(medicStatus.energyMax, 250);

  const marineStatus = obs.statuses.find((v) => v.id === eid(e, marine));
  assert.ok(marineStatus);
  assert.equal(marineStatus.stimTimer, 9);
  assert.equal(marineStatus.matrixHp, 120);
  assert.equal(marineStatus.matrixTimer, 20);
  assert.equal(marineStatus.ensnareTimer, 30);
  assert.equal(marineStatus.acidSporeCount, 2);
  assert.equal(marineStatus.acidSporeTimer, 40);
  assert.equal(marineStatus.parasiteOwner, 1);
  assert.equal(marineStatus.burrowed, 1);

  const mutableStatus: { energy: number } = medicStatus;
  mutableStatus.energy = 0;
  assert.equal(
    sim.observe(0).statuses.find((v) => v.id === eid(e, medic))!.energy,
    77,
    'mutating observation status does not mutate sim status'
  );
});

test('observe returns fair-play active effects without leaking hidden enemy effects', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 212, vision: true });
  const s = sim.fullState();
  const vision = s.vision[0]!;
  const visibleIdx = vision.findIndex((v) => v === 2);
  const hiddenIdx = vision.findIndex((v) => v === 0);
  assert.notEqual(visibleIdx, -1);
  assert.notEqual(hiddenIdx, -1);
  const exploredIdx = hiddenIdx;
  vision[exploredIdx] = 1;
  const visible = tileCenter(s.map.w, visibleIdx);
  const explored = tileCenter(s.map.w, exploredIdx);
  const hidden = tileCenter(s.map.w, vision.findIndex((v) => v === 0));

  const ownStorm = spawnEffect(s, EffectKind.PsionicStorm, 0, hidden.x, hidden.y, fx(48), 10, 2, 14);
  const visibleSwarm = spawnEffect(s, EffectKind.DarkSwarm, 1, visible.x, visible.y, fx(32), 20, 0, 0);
  const hiddenWeb = spawnEffect(s, EffectKind.DisruptionWeb, 1, hidden.x, hidden.y, fx(32), 30, 0, 0);
  const exploredScan = spawnEffect(s, EffectKind.ScannerSweep, 1, explored.x, explored.y, fx(64), 40, 0, 0);
  const exploredNuke = spawnEffect(s, EffectKind.NuclearStrike, 1, explored.x, explored.y, fx(96), 50, 0, 500);

  const obs = sim.observe(0);
  const effectIds = new Set(obs.effects.map((v) => v.id));
  assert.equal(effectIds.has(ownStorm), true, 'own effects are known even off-screen');
  assert.equal(effectIds.has(visibleSwarm), true, 'visible enemy spatial effects are observable');
  assert.equal(effectIds.has(exploredNuke), true, 'nuke warnings remain observable on explored ground');
  assert.equal(effectIds.has(hiddenWeb), false, 'hidden enemy spatial effects are not leaked');
  assert.equal(effectIds.has(exploredScan), false, 'enemy scanner sweep requires current visibility');

  const nuke = obs.effects.find((v) => v.id === exploredNuke)!;
  assert.equal(nuke.kind, EffectKind.NuclearStrike);
  assert.equal(nuke.owner, 1);
  assert.equal(nuke.timer, 50);
  assert.equal(nuke.damage, 500);

  nuke.timer = 0;
  assert.equal(
    sim.observe(0).effects.find((v) => v.id === exploredNuke)!.timer,
    50,
    'mutating observation effect does not mutate sim effect'
  );
});

test('byte serialization preserves vision tracking and fog memory', () => {
  const sim = new Sim({ map: sliceMap(), players: 1, seed: 203, vision: true });
  for (let t = 0; t < 10; t++) sim.step([]);
  const before = sim.observe(0).vision;

  const restored = Sim.deserialize(sim.serialize());
  assert.equal(restored.fullState().trackVision, true);
  assert.deepEqual(restored.observe(0).vision, before);
});

test('observations hide undetected cloaked enemies even on visible tiles', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 206, vision: true });
  const s = sim.fullState();
  const e = s.e;
  const own = slotOf(spawnUnit(s, Kind.Marine, 0, fx(500), fx(500)));
  const dt = spawnUnit(s, Kind.DarkTemplar, 1, e.x[own]! + fx(24), e.y[own]!);
  sim.step([]);

  assert.equal(sim.observe(0).entities.some((v) => v.id === dt), false);
});

test('scanner sweep reveals fogged cloaked enemies to observation', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 207, vision: true });
  const s = sim.fullState();
  const e = s.e;
  const comsat = slotOf(spawnUnit(s, Kind.ComsatStation, 0, fx(500), fx(500)));
  const dt = spawnUnit(s, Kind.DarkTemplar, 1, fx(1_300), fx(1_300));
  e.energy[comsat] = 50;

  sim.step([{ player: 0, cmds: [{ t: 'ability', unit: eid(e, comsat), ability: Ability.ScannerSweep, x: fx(1_300), y: fx(1_300) }] }]);

  assert.equal(sim.observe(0).entities.some((v) => v.id === dt), true);
});

test('state hash includes dead-slot allocation history', () => {
  const a = new Sim({ map: sliceMap(), players: 1, seed: 204 });
  const b = new Sim({ map: sliceMap(), players: 1, seed: 204 });
  const extra = slotOf(spawnUnit(b.fullState(), Kind.Marine, 0, fx(500), fx(500)));
  kill(b.fullState(), extra);

  assert.notEqual(a.hash(), b.hash(), 'same live entities but different allocation history must not hash equal');
});

test('recorded replay stops growing after game over', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 205, record: true });
  const s = sim.fullState();
  for (let i = 0; i < s.e.hi; i++) {
    if (s.e.alive[i] === 1 && s.e.kind[i] === Kind.CommandCenter && s.e.owner[i] === 1) kill(s, i);
  }
  sim.step([]);
  assert.equal(s.result.over, true);
  const terminalLength = sim.frames!.length;

  for (let i = 0; i < 5; i++) sim.step([]);
  assert.equal(sim.frames!.length, terminalLength);
});
