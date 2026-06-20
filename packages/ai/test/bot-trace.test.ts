import assert from 'node:assert/strict';
import test from 'node:test';
import { Kind, Sim, Terran, Protoss, Zerg, createMatchStats, fx, sliceMap, spawnUnit, type Faction, type State } from '@rts/sim';
import {
  botTraceAlerts,
  botObjectiveReasons,
  botObjectiveTrends,
  botTraceExpertDiagnoses,
  botTraceFrame,
  createBotPlanner,
  runBotMatchTrace,
  type BotObjectiveSnapshot,
} from '../src/index.ts';
import { createAggressiveMarineBot } from '../test-support/aggressive-bot.ts';

const countAlive = (s: State, player: number, kind: number): number => {
  let count = 0;
  for (let i = 0; i < s.e.hi; i++) {
    if (s.e.alive[i] === 1 && s.e.owner[i] === player && s.e.kind[i] === kind) count++;
  }
  return count;
};

const primaryBaseSlot = (s: State, player: number, faction: Faction): number => {
  for (let i = 0; i < s.e.hi; i++) {
    if (s.e.alive[i] === 1 && s.e.owner[i] === player && s.e.kind[i] === faction.depot) return i;
  }
  throw new Error(`missing depot for player ${player}`);
};

const seedCombatProductionPath = (
  s: State,
  faction: Faction,
  producerKind: number,
): void => {
  const base = primaryBaseSlot(s, 0, faction);
  if (faction.name === 'Protoss') {
    spawnUnit(s, Kind.Pylon, 0, s.e.x[base]! + fx(96), s.e.y[base]!);
  }
  spawnUnit(s, producerKind, 0, s.e.x[base]! + fx(160), s.e.y[base]!);
  s.players.minerals[0] = 300;
  s.players.gas[0] = 0;
};

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
  assert.equal(frame.topIntents.length > 0, true);
  assert.equal(frame.topIntents.length <= 5, true);
  assert.equal(frame.topIntents[0]!.kind, plan.intentResults[0]!.intent.kind);
  assert.equal(frame.topIntents[0]!.status, plan.intentResults[0]!.result.status);
  assert.equal(frame.topIntents.some((intent) => intent.scoreReasons.length > 0), true);
  assert.equal(plan.placementDiagnostics.length > 0, true);
  assert.equal(frame.placementDiagnostics.length > 0, true);
  assert.equal(frame.placementDiagnostics.length <= 5, true);
  assert.equal(frame.placementDiagnostics.some((diagnostic) => diagnostic.result === 'chosen'), true);
  assert.equal(frame.placementDiagnostics.some((diagnostic) => diagnostic.candidates > 0), true);
  assert.equal(frame.placementDiagnostics.some((diagnostic) => diagnostic.rejected > 0), true);
  assert.equal(frame.placementDiagnostics.some((diagnostic) => diagnostic.scoreReasons.length > 0), true);
  assert.equal(frame.objective.workerSupply, Terran.startWorkers);
  assert.equal(frame.objective.resourceFloat, 500);
  assert.equal(frame.strategy.name, 'opening');
  assert.equal(frame.strategy.workerTarget, 8);
  assert.equal(frame.strategy.attackThreshold, 99);
  assert.equal(frame.strategy.techTarget, 'first-combat');
  assert.equal(frame.strategy.reasons.length > 0, true);
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

test('bot objective trends summarize per-player sampled frame deltas', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 8107, factions: [Terran, Terran] });
  const s = sim.fullState();
  const e = s.e;
  let base = 0;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.owner[i] === 0 && e.kind[i] === Kind.CommandCenter) base = i;
  }
  const planner = createBotPlanner(Terran, { workerTarget: 0, barracksTarget: 0, attackThreshold: 99 });
  const before = botTraceFrame(s, 0, Terran, planner(s, 0));

  spawnUnit(s, Kind.Marine, 0, e.x[base]!, e.y[base]!);
  spawnUnit(s, Kind.SCV, 0, e.x[base]!, e.y[base]!);
  const after = botTraceFrame(s, 0, Terran, planner(s, 0));
  const trends = botObjectiveTrends([before, after]);

  assert.equal(trends.length, 1);
  assert.equal(trends[0]!.player, 0);
  assert.equal(trends[0]!.fromTick, before.tick);
  assert.equal(trends[0]!.toTick, after.tick);
  assert.equal(trends[0]!.reasons.some((reason) => reason.kind === 'economy-growth'), true);
  assert.equal(trends[0]!.reasons.some((reason) => reason.kind === 'army-growth'), true);
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
  assert.equal(frame.strategy.name, 'pressure');
  assert.equal(frame.strategy.harassmentAppetite, 'high');
  assert.equal((frame.commandsByType.attack ?? 0) + (frame.commandsByType.amove ?? 0) > 0, true);
  assert.equal(frame.intentsByKind['attack-wave']! + frame.intentsByKind.harass! + frame.intentsByKind.counterattack! > 0, true);
});

test('bot trace alerts classify macro deadlocks and invalid commands', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 8108, factions: [Terran, Terran] });
  const s = sim.fullState();
  s.players.minerals[0] = 900;
  const plan = createBotPlanner(Terran, { workerTarget: 8, barracksTarget: 1, attackThreshold: 99 })(s, 0);
  const frame = botTraceFrame(s, 0, Terran, plan);
  const stalledCommands = {
    ...frame.commandsByType,
    addon: 0,
    build: 0,
    research: 0,
    train: 0,
    transform: 0,
  };
  const frames = [0, 60, 120].map((tick) => ({
    ...frame,
    tick,
    commandsByType: stalledCommands,
    idleProducers: 1,
    idleLarvae: 0,
    objective: { ...frame.objective, resourceFloat: 900 },
    supplyUsed: 4,
    supplyMax: 20,
  }));

  const alerts = botTraceAlerts(frames, [{ player: 0, index: 0, t: 'train', ok: false, reason: 'not-affordable' }]);

  assert.equal(alerts.some((alert) => alert.kind === 'invalid-commands' && alert.player === 0), true);
  assert.equal(alerts.some((alert) => alert.kind === 'resource-float-stall' && alert.fromTick === 0 && alert.toTick === 120), true);
  assert.equal(alerts.some((alert) => alert.kind === 'production-stall' && alert.fromTick === 0 && alert.toTick === 120), true);
});

test('bot trace alerts classify repeated placement deadlocks', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 8111, factions: [Terran, Terran] });
  const s = sim.fullState();
  s.players.minerals[0] = 500;
  const plan = createBotPlanner(Terran, { workerTarget: 8, barracksTarget: 1, attackThreshold: 99 })(s, 0);
  const frame = botTraceFrame(s, 0, Terran, plan);
  const frames = [0, 60, 120].map((tick) => ({
    ...frame,
    tick,
    placementDiagnostics: [{
      kind: Kind.Barracks,
      result: 'unavailable' as const,
      anchorX: fx(10),
      anchorY: fx(12),
      candidates: 0,
      rejected: 120,
      rejectedByReason: { 'blocked-by-entity': 120 },
      scoreReasons: [],
    }],
  }));

  const alerts = botTraceAlerts(frames);

  assert.equal(alerts.some((alert) =>
    alert.kind === 'placement-stall' &&
    alert.fromTick === 0 &&
    alert.toTick === 120 &&
    alert.detail.includes('kind') &&
    alert.detail.includes('blocked-by-entity')), true);
});

test('bot expert diagnoses summarize trace health by strategic domain', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 8109, factions: [Terran, Terran] });
  const s = sim.fullState();
  s.players.minerals[0] = 900;
  const plan = createBotPlanner(Terran, { workerTarget: 8, barracksTarget: 1, attackThreshold: 99 })(s, 0);
  const frame = botTraceFrame(s, 0, Terran, plan);
  const frames = [0, 60, 120].map((tick) => ({
    ...frame,
    tick,
    commandsByType: { ...frame.commandsByType, build: 0, train: 0, research: 0, addon: 0, transform: 0 },
    idleProducers: 1,
    objective: { ...frame.objective, resourceFloat: 900 },
    supplyUsed: 4,
    supplyMax: 20,
  }));
  const alerts = botTraceAlerts(frames);
  const diagnoses = botTraceExpertDiagnoses(frames, createMatchStats(s), alerts);

  assert.equal(diagnoses.some((entry) => entry.domain === 'strategy' && entry.detail.includes('posture')), true);
  assert.equal(diagnoses.some((entry) => entry.domain === 'macro' && entry.status === 'failing'), true);
  assert.equal(diagnoses.some((entry) => entry.domain === 'production' && entry.status === 'failing'), true);
  assert.equal(diagnoses.some((entry) => entry.domain === 'combat' && entry.status === 'watch'), true);
});

test('race macro planners convert ready production paths into combat units', () => {
  const cases: Array<{
    faction: Faction;
    name: string;
    producerKind: number;
    unitKind: number;
    minimumProduced: number;
  }> = [
    { faction: Terran, name: 'Terran', producerKind: Kind.Barracks, unitKind: Kind.Marine, minimumProduced: 1 },
    { faction: Protoss, name: 'Protoss', producerKind: Kind.Gateway, unitKind: Kind.Zealot, minimumProduced: 1 },
    { faction: Zerg, name: 'Zerg', producerKind: Kind.SpawningPool, unitKind: Kind.Zergling, minimumProduced: 2 },
  ];

  for (const { faction, name, producerKind, unitKind, minimumProduced } of cases) {
    const sim = new Sim({ map: sliceMap(), players: 2, seed: 8110, factions: [faction, Terran] });
    const s = sim.fullState();
    seedCombatProductionPath(s, faction, producerKind);
    const before = countAlive(s, 0, unitKind);
    const planner = createBotPlanner(faction, {
      workerTarget: faction.startWorkers,
      barracksTarget: 1,
      attackThreshold: 99,
    });
    const plan = planner(s, 0);
    const frame = botTraceFrame(s, 0, faction, plan);
    const results = sim.step([{ player: 0, cmds: plan.commands }, { player: 1, cmds: [] }]);
    for (let tick = 0; tick < 1_200; tick++) sim.step([]);
    const produced = countAlive(sim.fullState(), 0, unitKind) - before;

    assert.deepEqual(results.filter((result) => !result.ok), [], `${name} should not emit invalid macro commands`);
    assert.equal(plan.commands.some((command) => command.t === 'train' && command.kind === unitKind), true, `${name} should issue target train commands`);
    assert.equal(frame.topIntents.some((intent) =>
      (intent.kind === 'train-counter' || intent.kind === 'spend-larva') &&
      intent.status === 'done' &&
      intent.targetKind === unitKind), true, `${name} trace should explain the train intent`);
    assert.equal(produced >= minimumProduced, true, `${name} should produce combat units`);
  }
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
  assert.equal(trace.invalidCommandsByPlayer[0], 0);
  assert.equal(trace.frames.length >= 4, true);
  assert.equal(trace.frames[trace.frames.length - 1]!.tick, trace.stats.tick);
  assert.equal(trace.frames.every((frame) => frame.strategy.workerTarget === 8), true);
  assert.equal(trace.frames.some((frame) => frame.strategy.name === 'opening' || frame.strategy.name === 'ramp'), true);
  assert.equal(trace.frames.every((frame) => frame.topIntents.length > 0), true);
  assert.equal(trace.frames.some((frame) =>
    frame.topIntents.some((intent) => intent.score !== undefined && intent.scoreReasons.length > 0)), true);
  assert.equal(Array.isArray(trace.alerts), true);
  assert.equal(trace.expertDiagnoses.length >= 4, true);
  assert.equal(trace.objectiveTrends.length, 1);
  assert.equal(trace.objectiveTrends[0]!.player, 0);
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
  assert.equal(trace.invalidCommandsByPlayer[0], 0);
  assert.equal(trace.frames[trace.frames.length - 1]!.tick, trace.stats.tick);
  assert.equal(workerPeak >= Terran.startWorkers, true);
  assert.equal(issuedPeak > 0, true);
  assert.equal(p0.commandsIssued > 0, true);
  assert.equal(p0.commandsAccepted > 0, true);
  assert.equal(p0.peakSupplyUsed >= p0.supplyUsed, true);
});

test('whole-match race competence gates grow, make combat units, and commit', () => {
  const cases: Array<{
    faction: Faction;
    name: string;
    unitKind: number;
    maxTicks: number;
  }> = [
    { faction: Terran, name: 'Terran', unitKind: Kind.Marine, maxTicks: 3_600 },
    { faction: Protoss, name: 'Protoss', unitKind: Kind.Zealot, maxTicks: 4_200 },
    { faction: Zerg, name: 'Zerg', unitKind: Kind.Zergling, maxTicks: 4_800 },
  ];

  for (const [index, { faction, name, unitKind, maxTicks }] of cases.entries()) {
    const sim = new Sim({ map: sliceMap(), players: 2, seed: 8122 + index, factions: [faction, Terran] });
    const trace = runBotMatchTrace(sim, [
      { faction, planner: createBotPlanner(faction, { workerTarget: 10, barracksTarget: 2, attackThreshold: 6 }) },
      { faction: Terran, controller: createAggressiveMarineBot() },
    ], { maxTicks, sampleEvery: 1_200 });
    const p0 = trace.stats.players[0]!;
    const combatUnits = countAlive(sim.fullState(), 0, unitKind);
    const playerAlerts = trace.alerts.filter((alert) => alert.player === 0);
    const productionDiagnosis = trace.expertDiagnoses.find((entry) => entry.player === 0 && entry.domain === 'production');

    assert.equal(trace.invalidCommandsByPlayer[0], 0, `${name} planner should not emit invalid commands`);
    assert.equal(playerAlerts.length, 0, `${name} planner should not trigger competence alerts`);
    assert.equal(p0.peakWorkers > faction.startWorkers, true, `${name} should grow workers over the match`);
    assert.equal(p0.peakCombatUnits > 0, true, `${name} should complete combat units over the match`);
    assert.equal(combatUnits > 0, true, `${name} should complete its core combat unit over the match`);
    assert.equal((p0.commandsByType.train ?? 0) > 0, true, `${name} should issue training commands`);
    assert.equal((p0.commandsByType.build ?? 0) > 0, true, `${name} should issue build commands`);
    assert.equal((p0.commandsByType.attack ?? 0) + (p0.commandsByType.amove ?? 0) > 0, true, `${name} should commit combat commands`);
    assert.equal(productionDiagnosis?.status, 'healthy', `${name} trace should diagnose combat production as healthy`);
  }
});
