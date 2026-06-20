import assert from 'node:assert/strict';
import test from 'node:test';
import { Kind, Sim, Terran, sliceMap, spawnUnit } from '@rts/sim';
import {
  botObjectiveReasons,
  botTraceFrame,
  createBotPlanner,
  runBotMatchTrace,
  type BotObjectiveSnapshot,
} from '../src/index.ts';
import { createAggressiveMarineBot } from '../test-support/aggressive-bot.ts';

test('bot trace frame exposes facts, commands, intents, and outcomes', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 8101, factions: [Terran, Terran] });
  const s = sim.fullState();
  s.players.minerals[0] = 500;
  const plan = createBotPlanner(Terran, { workerTarget: 8, barracksTarget: 1, attackThreshold: 99 })(s, 0);
  const frame = botTraceFrame(s, 0, Terran, plan);

  assert.equal(frame.tick, s.tick);
  assert.equal(frame.player, 0);
  assert.equal(frame.workers, Terran.startWorkers);
  assert.equal(frame.bases, 1);
  assert.equal(frame.minerals, 500);
  assert.equal(frame.commandsIssued, plan.commands.length);
  assert.equal(frame.commandsByType.train! > 0 || frame.commandsByType.build! > 0, true);
  assert.equal(frame.intentsByKind['train-worker']! > 0 || frame.intentsByKind['add-production']! > 0, true);
  assert.equal(frame.outcomesByStatus.done! + frame.outcomesByStatus.waiting! + frame.outcomesByStatus.blocked! + frame.outcomesByStatus.failed!,
    plan.intentResults.length);
  assert.equal(frame.objective.workerSupply, Terran.startWorkers);
  assert.equal(frame.objective.resourceFloat, 500);
});

test('bot trace objective snapshot scores own and enemy economy and army', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 8106, factions: [Terran, Terran] });
  const s = sim.fullState();
  const e = s.e;
  let ownBase = 0;
  let enemyBase = 0;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.owner[i] === 0 && e.kind[i] === Kind.CommandCenter) ownBase = i;
    if (e.alive[i] === 1 && e.owner[i] === 1 && e.kind[i] === Kind.CommandCenter) enemyBase = i;
  }
  spawnUnit(s, Kind.Marine, 0, e.x[ownBase]!, e.y[ownBase]!);
  spawnUnit(s, Kind.Marine, 1, e.x[enemyBase]!, e.y[enemyBase]!);

  const plan = createBotPlanner(Terran, { workerTarget: 0, barracksTarget: 0, attackThreshold: 99 })(s, 0);
  const frame = botTraceFrame(s, 0, Terran, plan);

  assert.equal(frame.objective.workerSupply, Terran.startWorkers);
  assert.equal(frame.objective.armySupply, 1);
  assert.equal(frame.objective.armyStrength > 0, true);
  assert.equal(frame.objective.enemyWorkerSupply, Terran.startWorkers);
  assert.equal(frame.objective.enemyArmySupply, 1);
  assert.equal(frame.objective.enemyArmyStrength > 0, true);
});

test('bot objective reasons explain growth, damage, and resource float', () => {
  const before: BotObjectiveSnapshot = {
    workerSupply: 8,
    armySupply: 2,
    armyStrength: 300,
    enemyWorkerSupply: 8,
    enemyArmySupply: 3,
    enemyArmyStrength: 450,
    resourceFloat: 200,
  };
  const after: BotObjectiveSnapshot = {
    workerSupply: 10,
    armySupply: 4,
    armyStrength: 700,
    enemyWorkerSupply: 6,
    enemyArmySupply: 1,
    enemyArmyStrength: 150,
    resourceFloat: 900,
  };

  const reasons = botObjectiveReasons(before, after);

  assert.equal(reasons.some((reason) => reason.kind === 'economy-growth'), true);
  assert.equal(reasons.some((reason) => reason.kind === 'army-growth'), true);
  assert.equal(reasons.some((reason) => reason.kind === 'enemy-economy-damage'), true);
  assert.equal(reasons.some((reason) => reason.kind === 'enemy-army-damage'), true);
  assert.equal(reasons.some((reason) => reason.kind === 'resource-float'), true);
});

test('bot trace frame records waiting reasons when production is blocked', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 8102, factions: [Terran, Terran] });
  const s = sim.fullState();
  s.players.minerals[0] = 0;
  const plan = createBotPlanner(Terran, { workerTarget: 99, barracksTarget: 0, attackThreshold: 99 })(s, 0);
  const frame = botTraceFrame(s, 0, Terran, plan);

  assert.equal(frame.intentsByKind['train-worker']! > 0, true);
  assert.equal(frame.waitsByReason['resource-starved']! > 0, true);
  assert.equal(frame.commandsByType.train, 0);
  assert.equal(frame.commandsByType.build, 0);
});

test('bot trace frame reports combat commitment commands', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 8103, factions: [Terran, Terran] });
  const s = sim.fullState();
  const e = s.e;
  let base = 0;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.owner[i] === 0 && e.kind[i] === Kind.CommandCenter) base = i;
  }
  for (let n = 0; n < 4; n++) {
    spawnUnit(s, Kind.Marine, 0, e.x[base]! + n * 128, e.y[base]!);
  }
  const plan = createBotPlanner(Terran, { workerTarget: 0, barracksTarget: 0, attackThreshold: 1 })(s, 0);
  const frame = botTraceFrame(s, 0, Terran, plan);

  assert.equal(frame.army >= 4, true);
  assert.equal((frame.commandsByType.attack ?? 0) + (frame.commandsByType.amove ?? 0) > 0, true);
  assert.equal(frame.intentsByKind['attack-wave']! + frame.intentsByKind.harass! + frame.intentsByKind.counterattack! > 0, true);
});

test('whole-match bot trace samples planner decisions and match stats', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 8104, factions: [Terran, Terran] });
  const planner = createBotPlanner(Terran, { workerTarget: 8, barracksTarget: 1, attackThreshold: 6 });
  const trace = runBotMatchTrace(sim, [
    { faction: Terran, planner },
    { faction: Terran, controller: createAggressiveMarineBot() },
  ], { maxTicks: 240, sampleEvery: 60 });
  const p0 = trace.stats.players[0]!;
  const p1 = trace.stats.players[1]!;

  assert.equal(trace.invalidCommands, 0);
  assert.equal(trace.frames.length >= 4, true);
  assert.equal(trace.frames.every((frame) => frame.player === 0), true);
  assert.equal(trace.stats.tick, sim.fullState().tick);
  assert.equal(p0.commandsIssued > 0, true);
  assert.equal(p0.commandsAccepted > 0, true);
  assert.equal(p0.peakWorkers >= Terran.startWorkers, true);
  assert.equal((p0.commandsByType.train ?? 0) + (p0.commandsByType.build ?? 0) > 0, true);
  assert.equal(p1.commandsAccepted > 0, true);
});

test('whole-match bot trace records progression facts over time', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 8105, factions: [Terran, Terran] });
  const planner = createBotPlanner(Terran, { workerTarget: 10, barracksTarget: 1, attackThreshold: 99 });
  const trace = runBotMatchTrace(sim, [
    { faction: Terran, planner },
    { faction: Terran, controller: createAggressiveMarineBot() },
  ], { maxTicks: 360, sampleEvery: 90 });
  const workerPeak = Math.max(...trace.frames.map((frame) => frame.workers));
  const issuedPeak = Math.max(...trace.frames.map((frame) => frame.commandsIssued));
  const p0 = trace.stats.players[0]!;

  assert.equal(trace.invalidCommands, 0);
  assert.equal(workerPeak >= Terran.startWorkers, true);
  assert.equal(issuedPeak > 0, true);
  assert.equal(p0.commandsIssued > 0, true);
  assert.equal(p0.commandsAccepted > 0, true);
  assert.equal(p0.peakSupplyUsed >= p0.supplyUsed, true);
});
