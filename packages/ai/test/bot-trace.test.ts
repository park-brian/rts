import assert from 'node:assert/strict';
import test from 'node:test';
import { Kind, Sim, Tech, Terran, Protoss, Zerg, createMatchStats, eid, fx, setTechLevel, sliceMap, slotOf, spawnUnit, type Faction, type State } from '@rts/sim';
import {
  botTraceAlerts,
  botTraceCompetenceGates,
  botObjectiveReasons,
  botObjectiveTrends,
  botTraceExpertDiagnoses,
  botTracePhaseSummaries,
  botTraceFrame,
  botIntentExpectation,
  botIntentVictoryAxis,
  createBotPlanner,
  runBotMatchTrace,
  type BotMatchTrace,
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
  assert.equal(frame.queuedWorkerProduction, 0);
  assert.equal(frame.queuedArmyProduction, 0);
  assert.equal(frame.queuedArmyStrength, 0);
  assert.equal(frame.commandsIssued, plan.commands.length);
  assert.equal(frame.commandsByType.train! > 0 || frame.commandsByType.build! > 0, true);
  assert.equal(frame.intentsByKind['train-worker']! > 0 || frame.intentsByKind['add-production']! > 0, true);
  assert.equal(frame.outcomesByStatus.done! + frame.outcomesByStatus.waiting! + frame.outcomesByStatus.blocked! + frame.outcomesByStatus.failed!,
    plan.intentResults.length);
  assert.equal(frame.topIntents.length > 0, true);
  assert.equal(frame.topIntents.length <= 5, true);
  assert.equal(frame.topIntents[0]!.kind, plan.intentResults[0]!.intent.kind);
  assert.equal(frame.topIntents[0]!.axis.length > 0, true);
  assert.equal(frame.topIntents[0]!.status, plan.intentResults[0]!.result.status);
  assert.equal(frame.topIntents.every((intent) => intent.expectation.windowTicks > 0), true);
  assert.equal(frame.topIntents.every((intent) => intent.expectation.detail.length > 0), true);
  assert.equal(frame.topIntents.some((intent) => intent.scoreReasons.length > 0), true);
  assert.equal(plan.placementDiagnostics.length > 0, true);
  assert.equal(frame.placementDiagnostics.length > 0, true);
  assert.equal(frame.placementDiagnostics.length <= 5, true);
  assert.equal(frame.placementDiagnostics.some((diagnostic) => diagnostic.result === 'chosen'), true);
  assert.equal(frame.placementDiagnostics.some((diagnostic) => diagnostic.candidates > 0), true);
  assert.equal(frame.placementDiagnostics.some((diagnostic) => diagnostic.rejected > 0), true);
  assert.equal(frame.placementDiagnostics.some((diagnostic) => diagnostic.scoreReasons.length > 0), true);
  assert.equal(frame.placementDiagnostics.some((diagnostic) => diagnostic.role !== 'general'), true);
  assert.equal(frame.objective.workerSupply, Terran.startWorkers);
  assert.equal(frame.objective.resourceFloat, 500);
  assert.equal(frame.strategy.name, 'opening');
  assert.equal(frame.strategy.workerTarget, 8);
  assert.equal(frame.strategy.attackThreshold, 99);
  assert.equal(frame.strategy.techTarget, 'first-combat');
  assert.equal(frame.strategy.reasons.length > 0, true);
  assert.equal(frame.strategicPlan.phase, 'opening');
  assert.equal(frame.strategicPlan.primaryGoal, 'establish-combat');
  assert.equal(frame.strategicPlan.macroPriority, 'production');
  assert.equal(frame.strategicPlan.combatStance, 'rally');
  assert.equal(frame.strategicPlan.techTarget, 'first-combat');
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
  spawnUnit(s, Kind.Barracks, 0, e.x[ownBase]! + fx(160), e.y[ownBase]!);
  spawnUnit(s, Kind.Marine, 1, e.x[enemyBase]!, e.y[enemyBase]!);
  spawnUnit(s, Kind.Barracks, 1, e.x[enemyBase]! - fx(160), e.y[enemyBase]!);
  setTechLevel(s, 0, Tech.StimPack, 1);
  setTechLevel(s, 1, Tech.StimPack, 1);

  const plan = createBotPlanner(Terran, { workerTarget: 0, barracksTarget: 0, attackThreshold: 99 })(s, 0);
  const frame = botTraceFrame(s, 0, Terran, plan);

  assert.equal(frame.objective.workerSupply, Terran.startWorkers);
  assert.equal(frame.objective.armySupply, 1);
  assert.equal(frame.objective.armyStrength > 0, true);
  assert.equal(frame.objective.queuedWorkerProduction, 0);
  assert.equal(frame.objective.queuedArmyProduction, 0);
  assert.equal(frame.objective.queuedArmyStrength, 0);
  assert.equal(frame.objective.productionCapacity, 1);
  assert.equal(frame.objective.pendingProductionCapacity, 0);
  assert.equal(frame.objective.techUnlocks >= 2, true);
  assert.equal(frame.objective.supplyAvailable > 0, true);
  assert.equal(frame.objective.enemyWorkerSupply, Terran.startWorkers);
  assert.equal(frame.objective.enemyArmySupply, 1);
  assert.equal(frame.objective.enemyArmyStrength > 0, true);
  assert.equal(frame.objective.enemyProductionCapacity, 1);
  assert.equal(frame.objective.enemyPendingProductionCapacity, 0);
  assert.equal(frame.objective.enemyTechUnlocks >= 2, true);
});

test('bot trace objective snapshot separates completed and pending production capacity', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 8116, factions: [Terran, Terran] });
  const s = sim.fullState();
  const e = s.e;
  const ownBase = primaryBaseSlot(s, 0, Terran);
  const enemyBase = primaryBaseSlot(s, 1, Terran);
  const pendingOwn = slotOf(spawnUnit(s, Kind.Barracks, 0, e.x[ownBase]! + fx(160), e.y[ownBase]!));
  const pendingEnemy = slotOf(spawnUnit(s, Kind.Barracks, 1, e.x[enemyBase]! - fx(160), e.y[enemyBase]!));
  e.built[pendingOwn] = 0;
  e.built[pendingEnemy] = 0;

  const plan = createBotPlanner(Terran, { workerTarget: 0, barracksTarget: 0, attackThreshold: 99 })(s, 0);
  const frame = botTraceFrame(s, 0, Terran, plan);

  assert.equal(frame.objective.productionCapacity, 0);
  assert.equal(frame.objective.pendingProductionCapacity, 1);
  assert.equal(frame.objective.enemyProductionCapacity, 0);
  assert.equal(frame.objective.enemyPendingProductionCapacity, 1);
});

test('bot trace frame exposes active worker and army production queues', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 8118, factions: [Terran, Terran] });
  let s = sim.fullState();
  const base = primaryBaseSlot(s, 0, Terran);
  const barracks = slotOf(spawnUnit(s, Kind.Barracks, 0, s.e.x[base]! + fx(160), s.e.y[base]!));
  s.players.minerals[0] = 500;
  sim.step([{ player: 0, cmds: [
    { t: 'train', building: eid(s.e, base), kind: Kind.SCV },
    { t: 'train', building: eid(s.e, barracks), kind: Kind.Marine },
  ] }]);
  s = sim.fullState();
  const plan = createBotPlanner(Terran, { workerTarget: 0, barracksTarget: 0, attackThreshold: 99 })(s, 0);
  const frame = botTraceFrame(s, 0, Terran, plan);

  assert.equal(frame.queuedWorkerProduction, 1);
  assert.equal(frame.queuedArmyProduction, 1);
  assert.equal(frame.queuedArmyStrength > 0, true);
  assert.equal(frame.objective.queuedWorkerProduction, 1);
  assert.equal(frame.objective.queuedArmyProduction, 1);
  assert.equal(frame.objective.queuedArmyStrength, frame.queuedArmyStrength);
  const diagnoses = botTraceExpertDiagnoses([frame], createMatchStats(s), [], botObjectiveTrends([frame]));
  assert.equal(diagnoses.some((entry) =>
    entry.domain === 'economy' &&
    entry.status === 'healthy' &&
    entry.detail.includes('worker') &&
    entry.detail.includes('queued')), true);
  assert.equal(diagnoses.some((entry) =>
    entry.domain === 'production' &&
    entry.status === 'healthy' &&
    entry.detail.includes('combat unit') &&
    entry.detail.includes('future strength')), true);

  const zergSim = new Sim({ map: sliceMap(), players: 2, seed: 8119, factions: [Zerg, Terran] });
  s = zergSim.fullState();
  seedCombatProductionPath(s, Zerg, Kind.SpawningPool);
  s.players.minerals[0] = 500;
  const hatchery = primaryBaseSlot(s, 0, Zerg);
  const larva = slotOf(spawnUnit(s, Kind.Larva, 0, s.e.x[hatchery]!, s.e.y[hatchery]!));
  zergSim.step([{ player: 0, cmds: [{ t: 'train', building: eid(s.e, larva), kind: Kind.Zergling }] }]);
  s = zergSim.fullState();
  const zergPlan = createBotPlanner(Zerg, { workerTarget: 0, barracksTarget: 0, attackThreshold: 99 })(s, 0);
  const zergFrame = botTraceFrame(s, 0, Zerg, zergPlan);

  assert.equal(zergFrame.queuedArmyProduction, 2);
  assert.equal(zergFrame.objective.queuedArmyProduction, 2);
  assert.equal(zergFrame.queuedArmyStrength > frame.queuedArmyStrength, true);
  assert.equal(zergFrame.objective.queuedArmyStrength, zergFrame.queuedArmyStrength);
});

test('bot trace objective army strength uses researched combat upgrades', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 8115, factions: [Terran, Terran] });
  const s = sim.fullState();
  const base = primaryBaseSlot(s, 0, Terran);
  spawnUnit(s, Kind.Marine, 0, s.e.x[base]!, s.e.y[base]!);
  const planner = createBotPlanner(Terran, { workerTarget: 0, barracksTarget: 0, attackThreshold: 99 });
  const before = botTraceFrame(s, 0, Terran, planner(s, 0));

  setTechLevel(s, 0, Tech.InfantryWeapons, 1);
  const after = botTraceFrame(s, 0, Terran, planner(s, 0));

  assert.equal(after.objective.armyStrength > before.objective.armyStrength, true);
});

test('bot trace objective queued army strength uses researched combat upgrades', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 8121, factions: [Terran, Terran] });
  let s = sim.fullState();
  const base = primaryBaseSlot(s, 0, Terran);
  const barracks = slotOf(spawnUnit(s, Kind.Barracks, 0, s.e.x[base]! + fx(160), s.e.y[base]!));
  s.players.minerals[0] = 500;
  sim.step([{ player: 0, cmds: [{ t: 'train', building: eid(s.e, barracks), kind: Kind.Marine }] }]);
  s = sim.fullState();
  const planner = createBotPlanner(Terran, { workerTarget: 0, barracksTarget: 0, attackThreshold: 99 });
  const before = botTraceFrame(s, 0, Terran, planner(s, 0));

  setTechLevel(s, 0, Tech.InfantryWeapons, 2);
  const after = botTraceFrame(s, 0, Terran, planner(s, 0));

  assert.equal(before.objective.queuedArmyProduction, 1);
  assert.equal(after.objective.queuedArmyProduction, 1);
  assert.equal(after.objective.queuedArmyStrength > before.objective.queuedArmyStrength, true);
});

test('bot objective reasons explain growth, damage, and resource float', () => {
  const before: BotObjectiveSnapshot = {
    workerSupply: 8,
    armySupply: 2,
    armyStrength: 300,
    queuedWorkerProduction: 0,
    queuedArmyProduction: 0,
    queuedArmyStrength: 0,
    productionCapacity: 1,
    pendingProductionCapacity: 0,
    techUnlocks: 1,
  pendingTechUnlocks: 0,
    supplyAvailable: 4,
    enemyWorkerSupply: 8,
    enemyArmySupply: 3,
    enemyArmyStrength: 450,
    enemyProductionCapacity: 2,
    enemyPendingProductionCapacity: 0,
    enemyTechUnlocks: 2,
    resourceFloat: 200,
  };
  const after: BotObjectiveSnapshot = {
    workerSupply: 10,
    armySupply: 4,
    armyStrength: 700,
    queuedWorkerProduction: 1,
    queuedArmyProduction: 0,
    queuedArmyStrength: 480,
    productionCapacity: 2,
    pendingProductionCapacity: 1,
    techUnlocks: 3,
  pendingTechUnlocks: 0,
    supplyAvailable: 8,
    enemyWorkerSupply: 6,
    enemyArmySupply: 1,
    enemyArmyStrength: 150,
    enemyProductionCapacity: 1,
    enemyPendingProductionCapacity: 0,
    enemyTechUnlocks: 1,
    resourceFloat: 900,
  };

  const reasons = botObjectiveReasons(before, after);

  assert.equal(reasons.some((reason) => reason.kind === 'economy-growth'), true);
  assert.equal(reasons.some((reason) => reason.detail === 'queued worker production increased by 1'), true);
  assert.equal(reasons.some((reason) => reason.kind === 'army-growth'), true);
  assert.equal(reasons.some((reason) => reason.detail === 'queued army strength increased by 480'), true);
  assert.equal(reasons.some((reason) => reason.kind === 'production-throughput'), true);
  assert.equal(reasons.some((reason) => reason.kind === 'tech-unlock'), true);
  assert.equal(reasons.some((reason) => reason.kind === 'supply-availability'), true);
  assert.equal(reasons.some((reason) => reason.kind === 'enemy-economy-damage'), true);
  assert.equal(reasons.some((reason) => reason.kind === 'enemy-army-damage'), true);
  assert.equal(reasons.some((reason) => reason.kind === 'enemy-production-damage'), true);
  assert.equal(reasons.some((reason) => reason.kind === 'enemy-tech-damage'), true);
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
  assert.equal(frame.strategicPlan.primaryGoal, 'degrade-enemy');
  assert.equal(frame.strategicPlan.combatStance, 'pressure');
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

test('bot trace alerts classify missing army production intent', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 8112, factions: [Terran, Terran] });
  const s = sim.fullState();
  s.players.minerals[0] = 900;
  const plan = createBotPlanner(Terran, { workerTarget: 8, barracksTarget: 1, attackThreshold: 99 })(s, 0);
  const frame = botTraceFrame(s, 0, Terran, plan);
  const frames = [0, 60, 120].map((tick) => ({
    ...frame,
    tick,
    commandsByType: { ...frame.commandsByType, train: 0 },
    intentsByKind: { ...frame.intentsByKind, 'train-worker': 0, 'spend-larva': 0, 'train-counter': 0 },
    idleProducers: 1,
    idleLarvae: 0,
    objective: { ...frame.objective, resourceFloat: 900 },
    supplyUsed: 4,
    supplyMax: 20,
  }));

  const alerts = botTraceAlerts(frames);

  assert.equal(alerts.some((alert) =>
    alert.kind === 'no-army-production' &&
    alert.fromTick === 0 &&
    alert.toTick === 120 &&
    alert.detail.includes('no train intent')), true);
});

test('bot trace alerts classify queued army pipeline as production underuse, not no production', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 8120, factions: [Terran, Terran] });
  const s = sim.fullState();
  s.players.minerals[0] = 900;
  const plan = createBotPlanner(Terran, { workerTarget: 8, barracksTarget: 1, attackThreshold: 99 })(s, 0);
  const frame = botTraceFrame(s, 0, Terran, plan);
  const frames = [0, 60, 120].map((tick) => ({
    ...frame,
    tick,
    commandsByType: { ...frame.commandsByType, train: 0 },
    intentsByKind: { ...frame.intentsByKind, 'train-worker': 0, 'spend-larva': 0, 'train-counter': 0 },
    idleProducers: 1,
    idleLarvae: 0,
    queuedArmyProduction: 1,
    objective: { ...frame.objective, resourceFloat: 900 },
    supplyUsed: 4,
    supplyMax: 20,
  }));

  const alerts = botTraceAlerts(frames);

  assert.equal(alerts.some((alert) =>
    alert.kind === 'production-stall' &&
    alert.detail.includes('1 combat unit queued')), true);
  assert.equal(alerts.some((alert) => alert.kind === 'no-army-production'), false);
});

test('bot trace alerts classify pressure posture with idle army', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 8130, factions: [Terran, Terran] });
  const s = sim.fullState();
  const e = s.e;
  const base = primaryBaseSlot(s, 0, Terran);
  for (let n = 0; n < 4; n++) {
    spawnUnit(s, Kind.Marine, 0, e.x[base]! + n * 64, e.y[base]!);
  }
  const plan = createBotPlanner(Terran, { workerTarget: 0, barracksTarget: 0, attackThreshold: 1 })(s, 0);
  const frame = botTraceFrame(s, 0, Terran, plan);
  const frames = [0, 60, 120].map((tick) => ({
    ...frame,
    tick,
    commandsByType: { ...frame.commandsByType, attack: 0, amove: 0, ability: 0, mine: 0 },
    intentsByKind: { ...frame.intentsByKind, 'attack-wave': 0, harass: 0, contain: 0, counterattack: 0 },
    topIntents: [],
  }));
  const alerts = botTraceAlerts(frames);
  const diagnoses = botTraceExpertDiagnoses(frames, createMatchStats(s), alerts);
  const alert = alerts.find((candidate) => candidate.kind === 'pressure-idle-stall');

  assert.ok(alert);
  assert.equal(alert.detail.includes('pressure posture'), true);
  assert.equal(alert.detail.includes('retaskable army'), true);
  assert.equal(diagnoses.some((entry) =>
    entry.domain === 'combat' &&
    entry.status === 'failing' &&
    entry.detail.includes('pressure posture')), true);
});

test('bot trace alerts classify repeated expected progress stalls', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 8131, factions: [Terran, Terran] });
  const s = sim.fullState();
  const plan = createBotPlanner(Terran, { workerTarget: 12, barracksTarget: 1, attackThreshold: 99 })(s, 0);
  const frame = botTraceFrame(s, 0, Terran, plan);
  const frames = [0, 96, 192].map((tick) => ({
    ...frame,
    tick,
    commandsByType: { ...frame.commandsByType, train: 0 },
    objective: { ...frame.objective, queuedWorkerProduction: 0 },
    topIntents: [{
      kind: 'train-worker' as const,
      status: 'waiting' as const,
      urgency: 35,
      axis: botIntentVictoryAxis('train-worker'),
      reason: 'resource-starved' as const,
      scoreReasons: [],
      expectation: botIntentExpectation('train-worker'),
    }],
  }));

  const alerts = botTraceAlerts(frames);
  const diagnoses = botTraceExpertDiagnoses(frames, createMatchStats(s), alerts, botObjectiveTrends(frames));
  const alert = alerts.find((candidate) => candidate.kind === 'expected-progress-stall');

  assert.ok(alert);
  assert.equal(alert.fromTick, 0);
  assert.equal(alert.toTick, 192);
  assert.equal(alert.detail.includes('train-worker'), true);
  assert.equal(alert.detail.includes('worker-pipeline'), true);
  assert.equal(alert.detail.includes('worker production should enter the queue'), true);
  assert.equal(diagnoses.some((entry) =>
    entry.domain === 'macro' &&
    entry.status === 'failing' &&
    entry.detail.includes('expected worker-pipeline')), true);
});

test('bot trace expected progress ignores advanced metrics and issued commands', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 8132, factions: [Terran, Terran] });
  const s = sim.fullState();
  const plan = createBotPlanner(Terran, { workerTarget: 12, barracksTarget: 1, attackThreshold: 99 })(s, 0);
  const frame = botTraceFrame(s, 0, Terran, plan);
  const workerFrames = [0, 96, 192].map((tick, index) => ({
    ...frame,
    tick,
    objective: { ...frame.objective, queuedWorkerProduction: index === 2 ? 1 : 0 },
    topIntents: [{
      kind: 'train-worker' as const,
      status: 'waiting' as const,
      urgency: 35,
      axis: botIntentVictoryAxis('train-worker'),
      reason: 'resource-starved' as const,
      scoreReasons: [],
      expectation: botIntentExpectation('train-worker'),
    }],
  }));
  const combatFrames = [0, 144, 288].map((tick) => ({
    ...frame,
    tick,
    commandsByType: { ...frame.commandsByType, attack: 1, amove: 0, ability: 0, mine: 0 },
    topIntents: [{
      kind: 'attack-wave' as const,
      status: 'waiting' as const,
      urgency: 40,
      axis: botIntentVictoryAxis('attack-wave'),
      reason: 'insufficient-force' as const,
      scoreReasons: [],
      expectation: botIntentExpectation('attack-wave'),
    }],
  }));

  assert.equal(botTraceAlerts(workerFrames).some((alert) => alert.kind === 'expected-progress-stall'), false);
  assert.equal(botTraceAlerts(combatFrames).some((alert) => alert.kind === 'expected-progress-stall'), false);
});
test('bot trace alerts classify repeated blocked tech intent', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 8129, factions: [Terran, Terran] });
  const s = sim.fullState();
  const plan = createBotPlanner(Terran, { workerTarget: 8, barracksTarget: 1, attackThreshold: 99 })(s, 0);
  const frame = botTraceFrame(s, 0, Terran, plan);
  const frames = [0, 60, 120].map((tick) => ({
    ...frame,
    tick,
    commandsByType: { ...frame.commandsByType, addon: 0, build: 0, research: 0, transform: 0 },
    intentsByKind: { ...frame.intentsByKind, 'take-gas': 0, 'rebuild-tech': 0, 'research-upgrade': 1 },
    waitsByReason: { ...frame.waitsByReason, 'missing-prerequisite': 1 },
    blocksByReason: { ...frame.blocksByReason },
    topIntents: [{
      kind: 'research-upgrade' as const,
      status: 'waiting' as const,
      urgency: 25,
      axis: botIntentVictoryAxis('research-upgrade'),
      reason: 'missing-prerequisite' as const,
      scoreReasons: [],
      expectation: botIntentExpectation('research-upgrade'),
    }],
  }));

  const alerts = botTraceAlerts(frames);
  const diagnoses = botTraceExpertDiagnoses(frames, createMatchStats(s), alerts, botObjectiveTrends(frames));

  assert.equal(alerts.some((alert) =>
    alert.kind === 'tech-stall' &&
    alert.fromTick === 0 &&
    alert.toTick === 120 &&
    alert.detail.includes('missing-prerequisite')), true);
  assert.equal(diagnoses.some((entry) =>
    entry.domain === 'tech' &&
    entry.status === 'failing' &&
    entry.detail.includes('tech intent blocked')), true);
});

test('bot trace alerts ignore background blocked tech while another intent leads', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 8130, factions: [Terran, Terran] });
  const s = sim.fullState();
  const plan = createBotPlanner(Terran, { workerTarget: 8, barracksTarget: 1, attackThreshold: 99 })(s, 0);
  const frame = botTraceFrame(s, 0, Terran, plan);
  const frames = [0, 60, 120].map((tick) => ({
    ...frame,
    tick,
    commandsByType: { ...frame.commandsByType, addon: 0, build: 0, research: 0, transform: 0 },
    intentsByKind: { ...frame.intentsByKind, 'take-gas': 0, 'rebuild-tech': 0, 'research-upgrade': 1 },
    waitsByReason: { ...frame.waitsByReason, 'missing-prerequisite': 1 },
    blocksByReason: { ...frame.blocksByReason },
    topIntents: [{
      kind: 'train-worker' as const,
      status: 'waiting' as const,
      urgency: 35,
      axis: botIntentVictoryAxis('train-worker'),
      reason: 'resource-starved' as const,
      scoreReasons: [],
      expectation: botIntentExpectation('train-worker'),
    }, {
      kind: 'research-upgrade' as const,
      status: 'waiting' as const,
      urgency: 25,
      axis: botIntentVictoryAxis('research-upgrade'),
      reason: 'missing-prerequisite' as const,
      scoreReasons: [],
      expectation: botIntentExpectation('research-upgrade'),
    }],
  }));

  assert.equal(botTraceAlerts(frames).some((alert) => alert.kind === 'tech-stall'), false);
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
      role: 'production-block' as const,
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
    alert.detail.includes('production-block') &&
    alert.detail.includes('kind') &&
    alert.detail.includes('blocked-by-entity')), true);
});

test('bot competence gates expose macro-spending and placement failures', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 8132, factions: [Terran, Terran] });
  const s = sim.fullState();
  s.players.minerals[0] = 900;
  const plan = createBotPlanner(Terran, { workerTarget: 8, barracksTarget: 1, attackThreshold: 99 })(s, 0);
  const frame = botTraceFrame(s, 0, Terran, plan);
  const frames = [0, 60, 120].map((tick) => ({
    ...frame,
    tick,
    commandsByType: { ...frame.commandsByType, build: 0, train: 0, research: 0, addon: 0, transform: 0 },
    objective: { ...frame.objective, resourceFloat: 900 },
    placementDiagnostics: [{
      kind: Kind.Barracks,
      role: 'production-block' as const,
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
  const stats = createMatchStats(s);
  const objectiveTrends = botObjectiveTrends(frames);
  const phaseSummaries = botTracePhaseSummaries(frames, alerts);
  const trace: BotMatchTrace = {
    frames,
    stats,
    invalidCommands: 0,
    invalidCommandsByPlayer: [0, 0],
    commandResults: [],
    objectiveTrends,
    alerts,
    expertDiagnoses: botTraceExpertDiagnoses(frames, stats, alerts, objectiveTrends),
    phaseSummaries,
    phaseAssessments: [],
  };
  const gates = botTraceCompetenceGates(trace, 0);

  assert.equal(gates.some((gate) =>
    gate.domain === 'macro-spending' &&
    gate.status === 'failing' &&
    gate.detail.includes('floated 900 resources')), true);
  assert.equal(gates.some((gate) =>
    gate.domain === 'placement' &&
    gate.status === 'failing' &&
    gate.detail.includes('production-block')), true);
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

  assert.equal(diagnoses.some((entry) =>
    entry.domain === 'strategy' &&
    entry.detail.includes('posture') &&
    entry.detail.includes('plan establish-combat/production/rally')), true);
  assert.equal(diagnoses.some((entry) => entry.domain === 'objective' && entry.status === 'watch'), true);
  assert.equal(diagnoses.some((entry) => entry.domain === 'macro' && entry.status === 'failing'), true);
  assert.equal(diagnoses.some((entry) => entry.domain === 'tech' && entry.status === 'watch'), true);
  assert.equal(diagnoses.some((entry) => entry.domain === 'production' && entry.status === 'failing'), true);
  assert.equal(diagnoses.some((entry) => entry.domain === 'combat' && entry.status === 'watch'), true);
  assert.equal(diagnoses.some((entry) =>
    entry.domain === 'summary' &&
    entry.status === 'failing' &&
    entry.detail.includes('production') &&
    entry.detail.includes('plan establish-combat/production/rally')), true);
});

test('bot expert diagnoses expose objective progress from trace trends', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 8114, factions: [Terran, Terran] });
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
  const diagnoses = botTraceExpertDiagnoses([before, after], createMatchStats(s), [], trends);
  const objective = diagnoses.find((entry) => entry.domain === 'objective');

  assert.ok(objective);
  assert.equal(objective.status, 'healthy');
  assert.equal(objective.detail.includes('worker supply increased'), true);
  assert.equal(objective.detail.includes('field army strength increased'), true);
});

test('bot expert diagnoses expose tech progress from objective trends', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 8128, factions: [Terran, Terran] });
  const s = sim.fullState();
  const planner = createBotPlanner(Terran, { workerTarget: 0, barracksTarget: 0, attackThreshold: 99 });
  const before = botTraceFrame(s, 0, Terran, planner(s, 0));
  const after = {
    ...before,
    tick: before.tick + 120,
    objective: { ...before.objective, techUnlocks: before.objective.techUnlocks + 2 },
  };
  const diagnoses = botTraceExpertDiagnoses([before, after], createMatchStats(s), [], botObjectiveTrends([before, after]));
  const tech = diagnoses.find((entry) => entry.domain === 'tech');

  assert.ok(tech);
  assert.equal(tech.status, 'healthy');
  assert.equal(tech.detail.includes('tech unlock count increased by 2'), true);
});

test('bot expert diagnoses distinguish pending production from no production', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 8117, factions: [Terran, Terran] });
  const s = sim.fullState();
  const base = primaryBaseSlot(s, 0, Terran);
  const planner = createBotPlanner(Terran, { workerTarget: 0, barracksTarget: 0, attackThreshold: 99 });
  const before = botTraceFrame(s, 0, Terran, planner(s, 0));
  const pendingBarracks = slotOf(spawnUnit(s, Kind.Barracks, 0, s.e.x[base]! + fx(160), s.e.y[base]!));
  s.e.built[pendingBarracks] = 0;
  const after = botTraceFrame(s, 0, Terran, planner(s, 0));
  const diagnoses = botTraceExpertDiagnoses([before, after], createMatchStats(s), [], botObjectiveTrends([before, after]));
  const production = diagnoses.find((entry) => entry.domain === 'production');

  assert.ok(production);
  assert.equal(production.status, 'watch');
  assert.equal(production.detail.includes('entered construction'), true);
  assert.equal(production.detail.includes('no completed combat production'), false);
});

test('bot expert diagnoses flag missing army production intent as production failure', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 8113, factions: [Terran, Terran] });
  const s = sim.fullState();
  s.players.minerals[0] = 900;
  const plan = createBotPlanner(Terran, { workerTarget: 8, barracksTarget: 1, attackThreshold: 99 })(s, 0);
  const frame = botTraceFrame(s, 0, Terran, plan);
  const frames = [0, 60, 120].map((tick) => ({
    ...frame,
    tick,
    commandsByType: { ...frame.commandsByType, train: 0 },
    intentsByKind: { ...frame.intentsByKind, 'train-worker': 0, 'spend-larva': 0, 'train-counter': 0 },
    idleProducers: 1,
    objective: { ...frame.objective, resourceFloat: 900 },
    supplyUsed: 4,
    supplyMax: 20,
  }));
  const alerts = botTraceAlerts(frames);
  const diagnoses = botTraceExpertDiagnoses(frames, createMatchStats(s), alerts);

  assert.equal(diagnoses.some((entry) =>
    entry.domain === 'production' &&
    entry.status === 'failing' &&
    entry.detail.includes('no train intent')), true);
});

test('bot trace phase summaries aggregate contiguous strategy windows', () => {
  const sim = new Sim({ map: sliceMap(), players: 2, seed: 8131, factions: [Terran, Terran] });
  const s = sim.fullState();
  s.players.minerals[0] = 900;
  const plan = createBotPlanner(Terran, { workerTarget: 8, barracksTarget: 1, attackThreshold: 99 })(s, 0);
  const opening = botTraceFrame(s, 0, Terran, plan);
  const pressure = {
    ...opening,
    tick: 60,
    minerals: 500,
    workers: opening.workers + 1,
    commandsByType: { ...opening.commandsByType, attack: 1 },
    outcomesByStatus: { ...opening.outcomesByStatus, done: opening.outcomesByStatus.done! + 1 },
    strategy: {
      ...opening.strategy,
      name: 'pressure' as const,
    },
    strategicPlan: {
      ...opening.strategicPlan,
      phase: 'pressure' as const,
      primaryGoal: 'degrade-enemy' as const,
      macroPriority: 'tech' as const,
      combatStance: 'pressure' as const,
    },
  };
  const openingAgain = {
    ...opening,
    tick: 120,
    minerals: 450,
    queuedArmyProduction: 1,
  };
  const alerts = botTraceAlerts([opening, pressure, openingAgain]);
  const summaries = botTracePhaseSummaries([opening, pressure, openingAgain], alerts);

  assert.deepEqual(summaries.map((summary) => summary.phase), ['opening', 'pressure', 'opening']);
  assert.equal(summaries[0]!.fromTick, 0);
  assert.equal(summaries[0]!.toTick, 0);
  assert.equal(summaries[1]!.plan.combatStance, 'pressure');
  assert.equal(summaries[1]!.end.workers, opening.workers + 1);
  assert.equal(summaries[1]!.commandsByType.attack, 1);
  assert.equal(summaries[2]!.peaks.queuedArmyProduction, 1);
  assert.equal(summaries.every((summary) => summary.player === 0), true);
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
  assert.equal(trace.frames.every((frame) => frame.strategicPlan.phase === frame.strategy.name), true);
  assert.equal(trace.frames.every((frame) => frame.strategicPlan.reasons.length > 0), true);
  assert.equal(trace.frames.every((frame) => frame.topIntents.length > 0), true);
  assert.equal(trace.frames.some((frame) =>
    frame.topIntents.some((intent) => intent.score !== undefined && intent.scoreReasons.length > 0)), true);
  assert.equal(Array.isArray(trace.alerts), true);
  assert.equal(trace.expertDiagnoses.length >= 4, true);
  assert.equal(trace.objectiveTrends.length, 1);
  assert.equal(trace.objectiveTrends[0]!.player, 0);
  assert.equal(trace.phaseSummaries.length > 0, true);
  assert.equal(trace.phaseSummaries.every((summary) => summary.player === 0), true);
  assert.equal(trace.phaseSummaries[0]!.fromTick, trace.frames[0]!.tick);
  assert.equal(trace.phaseSummaries[trace.phaseSummaries.length - 1]!.toTick, trace.frames[trace.frames.length - 1]!.tick);
  assert.equal(trace.phaseSummaries.some((summary) =>
    (summary.commandsByType.train ?? 0) + (summary.commandsByType.build ?? 0) > 0), true);
  assert.equal(trace.phaseSummaries.some((summary) =>
    Object.values(summary.intentAxes).some((count) => count > 0)), true);
  assert.equal(trace.phaseAssessments.length >= trace.phaseSummaries.length, true);
  assert.equal(trace.phaseAssessments.some((entry) => entry.domain === 'summary' && entry.detail.includes('plan ')), true);
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
    const summaryDiagnosis = trace.expertDiagnoses.find((entry) => entry.player === 0 && entry.domain === 'summary');
    const gates = botTraceCompetenceGates(trace, 0);

    assert.equal(trace.invalidCommandsByPlayer[0], 0, `${name} planner should not emit invalid commands`);
    assert.equal(playerAlerts.length, 0, `${name} planner should not trigger competence alerts`);
    assert.equal(p0.peakWorkers > faction.startWorkers, true, `${name} should grow workers over the match`);
    assert.equal(p0.peakCombatUnits > 0, true, `${name} should complete combat units over the match`);
    assert.equal(combatUnits > 0, true, `${name} should complete its core combat unit over the match`);
    assert.equal((p0.commandsByType.train ?? 0) > 0, true, `${name} should issue training commands`);
    assert.equal((p0.commandsByType.build ?? 0) > 0, true, `${name} should issue build commands`);
    assert.equal((p0.commandsByType.attack ?? 0) + (p0.commandsByType.amove ?? 0) > 0, true, `${name} should commit combat commands`);
    assert.equal(productionDiagnosis?.status, 'healthy', `${name} trace should diagnose combat production as healthy`);
    assert.notEqual(summaryDiagnosis?.status, 'failing', `${name} trace should not have a failing expert verdict`);
    assert.equal(summaryDiagnosis?.detail.includes('plan '), true, `${name} expert verdict should name its plan`);
    assert.deepEqual(gates.filter((gate) => gate.status !== 'healthy'), [], `${name} competence gates should be healthy`);
    assert.equal(gates.some((gate) => gate.domain === 'economy' && gate.detail.includes('target 10')), true, `${name} gates should check the worker target`);
    assert.equal(gates.some((gate) => gate.domain === 'macro-spending' && gate.detail.includes('peak resource float')), true, `${name} gates should expose macro spending evidence`);
    assert.equal(gates.some((gate) => gate.domain === 'placement' && gate.detail.includes('placement deadlock')), true, `${name} gates should expose placement evidence`);
    assert.equal(gates.some((gate) => gate.domain === 'phase-evidence' && gate.detail.includes('economy')), true, `${name} gates should summarize victory-axis evidence`);
    assert.equal(gates.some((gate) => gate.domain === 'expert' && gate.detail.includes('expert verdict')), true, `${name} gates should include the expert verdict`);
  }
});
