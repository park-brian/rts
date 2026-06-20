import assert from 'node:assert/strict';
import test from 'node:test';
import {
  Kind,
  Role,
  Sim,
  Terran,
  Units,
  Zerg,
  createMatchStats,
  eid,
  fx,
  kill,
  recordMatchStatsStep,
  sliceMap,
  slotOf,
  spawnUnit,
  type Command,
} from '../src/index.ts';

test('match stats seed from initial state without counting starting units as created', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 7001, factions: [Terran, Terran] });
  const stats = createMatchStats(sim.fullState());
  const p0 = stats.players[0]!;

  assert.equal(p0.workers, Terran.startWorkers);
  assert.equal(p0.bases, 1);
  assert.equal(p0.unitsCreated, 0);
  assert.equal(p0.workersCreated, 0);
  assert.equal(p0.combatUnitsCreated, 0);
  assert.equal(p0.structuresCreated, 0);
  assert.equal(p0.peakWorkers, Terran.startWorkers);
});

test('match stats record command receipts and rejection reasons', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 7002, factions: [Terran, Terran] });
  const s = sim.fullState();
  const stats = createMatchStats(s);
  const e = s.e;
  let commandCenter = -1;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.owner[i] === 0 && e.kind[i] === Kind.CommandCenter) commandCenter = i;
  }

  const batch = [{
    player: 0,
    cmds: [
      { t: 'train', building: eid(e, commandCenter), kind: Kind.SCV },
      { t: 'train', building: eid(e, commandCenter), kind: Kind.Battlecruiser },
    ] satisfies Command[],
  }];
  const results = sim.step(batch);
  recordMatchStatsStep(stats, s, batch, results);

  const p0 = stats.players[0]!;
  assert.equal(p0.commandsIssued, 2);
  assert.equal(p0.commandsAccepted, 1);
  assert.equal(p0.commandsRejected, 1);
  assert.equal(p0.commandsByType.train, 2);
  assert.equal(p0.rejectsByReason['target-not-allowed'], 1);
});

test('match stats record created and lost value from entity lifecycle transitions', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 7003, factions: [Terran, Terran] });
  const s = sim.fullState();
  const stats = createMatchStats(s);

  const marine = spawnUnit(s, Kind.Marine, 0, fx(1200), fx(1200));
  recordMatchStatsStep(stats, s, [], []);
  const p0 = stats.players[0]!;
  assert.equal(p0.unitsCreated, 1);
  assert.equal(p0.combatUnitsCreated, 1);
  assert.equal(p0.workersCreated, 0);
  assert.equal(p0.mineralValueCreated, Units[Kind.Marine]!.minerals);
  assert.equal(p0.gasValueCreated, Units[Kind.Marine]!.gas);
  assert.equal(p0.combatUnits >= 1, true);

  kill(s, slotOf(marine));
  recordMatchStatsStep(stats, s, [], []);
  assert.equal(p0.unitsLost, 1);
  assert.equal(p0.mineralValueLost, Units[Kind.Marine]!.minerals);
});

test('match stats count created and lost structures separately from units', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 7004, factions: [Terran, Terran] });
  const s = sim.fullState();
  const stats = createMatchStats(s);
  const depot = spawnUnit(s, Kind.SupplyDepot, 0, fx(1500), fx(1500));
  s.e.flags[slotOf(depot)] = Units[Kind.SupplyDepot]!.roles | Role.Structure;

  recordMatchStatsStep(stats, s, [], []);
  kill(s, slotOf(depot));
  recordMatchStatsStep(stats, s, [], []);

  const p0 = stats.players[0]!;
  assert.equal(p0.structuresCreated, 1);
  assert.equal(p0.combatUnitsCreated, 0);
  assert.equal(p0.structuresLost, 1);
});

test('match stats classify created workers separately from combat units', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 7005, factions: [Terran, Terran] });
  const s = sim.fullState();
  const stats = createMatchStats(s);

  spawnUnit(s, Kind.SCV, 0, fx(1400), fx(1400));
  recordMatchStatsStep(stats, s, [], []);

  const p0 = stats.players[0]!;
  assert.equal(p0.unitsCreated, 1);
  assert.equal(p0.workersCreated, 1);
  assert.equal(p0.combatUnitsCreated, 0);
});

test('match stats count zerg egg completion as the produced unit', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 7006, factions: [Zerg, Terran] });
  const s = sim.fullState();
  const e = s.e;
  const stats = createMatchStats(s);
  let larva = -1;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.owner[i] === 0 && e.kind[i] === Kind.Larva) {
      larva = i;
      break;
    }
  }
  assert.notEqual(larva, -1);

  e.kind[larva] = Kind.Egg;
  recordMatchStatsStep(stats, s, [], []);
  assert.equal(stats.players[0]!.workersCreated, 0);
  assert.equal(stats.players[0]!.unitsCreated, 0);

  e.kind[larva] = Kind.Drone;
  recordMatchStatsStep(stats, s, [], []);

  const p0 = stats.players[0]!;
  assert.equal(p0.unitsCreated, 1);
  assert.equal(p0.workersCreated, 1);
  assert.equal(p0.combatUnitsCreated, 0);
  assert.equal(p0.mineralValueCreated, Units[Kind.Drone]!.minerals);
});
