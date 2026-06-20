import {
  COMMAND_TYPES,
  createMatchStats,
  isEnemy,
  kindHasDirectWeapon,
  NEUTRAL,
  recordMatchStatsStep,
  Role,
  shownSupply,
  type CommandResult,
  type CommandType,
  type Controller,
  type CountMap,
  type Faction,
  type MatchStats,
  type PlayerCommands,
  type Sim,
  type State,
  Units,
} from '@rts/sim';
import { collectBotFacts } from './macro.ts';
import { BOT_INTENT_KINDS, type BotFailureReason, type BotIntentKind } from './macro-intents.ts';
import type { BotPlanner, BotTurnPlan } from './bot.ts';

export type BotTraceFrame = {
  tick: number;
  player: number;
  minerals: number;
  gas: number;
  supplyUsed: number;
  supplyMax: number;
  bases: number;
  workers: number;
  army: number;
  retaskableArmy: number;
  idleProducers: number;
  idleLarvae: number;
  visibleEnemies: number;
  commandsIssued: number;
  commandsByType: CountMap<CommandType>;
  intentsByKind: CountMap<BotIntentKind>;
  outcomesByStatus: CountMap<BotTraceOutcomeStatus>;
  waitsByReason: CountMap<BotFailureReason>;
  blocksByReason: CountMap<BotFailureReason>;
  objective: BotObjectiveSnapshot;
};

type BotTraceOutcomeStatus = 'done' | 'waiting' | 'blocked' | 'failed';

export type BotObjectiveSnapshot = {
  workerSupply: number;
  armySupply: number;
  armyStrength: number;
  enemyWorkerSupply: number;
  enemyArmySupply: number;
  enemyArmyStrength: number;
  resourceFloat: number;
};

export type BotObjectiveReasonKind =
  | 'economy-growth'
  | 'army-growth'
  | 'enemy-economy-damage'
  | 'enemy-army-damage'
  | 'resource-float';

export type BotObjectiveReason = {
  kind: BotObjectiveReasonKind;
  score: number;
  detail: string;
};

export type BotObjectiveTrend = {
  player: number;
  fromTick: number;
  toTick: number;
  before: BotObjectiveSnapshot;
  after: BotObjectiveSnapshot;
  reasons: BotObjectiveReason[];
};

export type BotTraceParticipant = {
  faction: Faction;
  planner?: BotPlanner;
  controller?: Controller;
};

export type BotMatchTraceOptions = {
  maxTicks: number;
  sampleEvery?: number;
};

export type BotMatchTrace = {
  frames: BotTraceFrame[];
  stats: MatchStats;
  invalidCommands: number;
  commandResults: CommandResult[];
  objectiveTrends: BotObjectiveTrend[];
};

const blankCounts = <K extends string>(keys: readonly K[]): CountMap<K> => {
  const counts = Object.create(null) as CountMap<K>;
  for (const key of keys) counts[key] = 0;
  return counts;
};

const inc = <K extends string>(counts: CountMap<K>, key: K): void => {
  counts[key] = (counts[key] ?? 0) + 1;
};

const blankObjective = (s: State, player: number): BotObjectiveSnapshot => ({
  workerSupply: 0,
  armySupply: 0,
  armyStrength: 0,
  enemyWorkerSupply: 0,
  enemyArmySupply: 0,
  enemyArmyStrength: 0,
  resourceFloat: s.players.minerals[player]! + s.players.gas[player]!,
});

const combatValue = (kind: number): number => {
  const def = Units[kind];
  if (!def) return 0;
  const supplyValue = shownSupply(def.supply) * 100;
  const costValue = def.minerals + def.gas * 1.5;
  const durabilityValue = (def.hp + def.shields) / 4;
  return Math.round(supplyValue + costValue + durabilityValue);
};

export const botObjectiveSnapshot = (s: State, player: number): BotObjectiveSnapshot => {
  const objective = blankObjective(s, player);
  const e = s.e;

  for (let slot = 0; slot < e.hi; slot++) {
    if (e.alive[slot] !== 1) continue;
    const owner = e.owner[slot]!;
    if (owner === NEUTRAL || owner >= s.teams.length) continue;
    const kind = e.kind[slot]!;
    const def = Units[kind];
    if (!def) continue;

    const workerSupply = (def.roles & Role.Worker) !== 0 ? shownSupply(def.supply) : 0;
    const armySupply = (def.roles & Role.Mobile) !== 0 &&
      (def.roles & Role.Worker) === 0 &&
      kindHasDirectWeapon(kind)
      ? shownSupply(def.supply)
      : 0;
    const armyStrength = armySupply > 0 ? combatValue(kind) : 0;

    if (owner === player) {
      objective.workerSupply += workerSupply;
      objective.armySupply += armySupply;
      objective.armyStrength += armyStrength;
    } else if (isEnemy(s, player, owner)) {
      objective.enemyWorkerSupply += workerSupply;
      objective.enemyArmySupply += armySupply;
      objective.enemyArmyStrength += armyStrength;
    }
  }

  return objective;
};

const objectiveReason = (
  kind: BotObjectiveReasonKind,
  score: number,
  detail: string,
): BotObjectiveReason => ({ kind, score, detail });

export const botObjectiveReasons = (
  before: BotObjectiveSnapshot,
  after: BotObjectiveSnapshot,
): BotObjectiveReason[] => {
  const reasons: BotObjectiveReason[] = [];
  const workerGain = after.workerSupply - before.workerSupply;
  const armyGain = after.armyStrength - before.armyStrength;
  const enemyWorkerLoss = before.enemyWorkerSupply - after.enemyWorkerSupply;
  const enemyArmyLoss = before.enemyArmyStrength - after.enemyArmyStrength;
  const floatGrowth = after.resourceFloat - before.resourceFloat;

  if (workerGain > 0) reasons.push(objectiveReason(
    'economy-growth',
    workerGain,
    `worker supply increased by ${workerGain}`,
  ));
  if (armyGain > 0) reasons.push(objectiveReason(
    'army-growth',
    armyGain,
    `field army strength increased by ${armyGain}`,
  ));
  if (enemyWorkerLoss > 0) reasons.push(objectiveReason(
    'enemy-economy-damage',
    enemyWorkerLoss,
    `enemy worker supply decreased by ${enemyWorkerLoss}`,
  ));
  if (enemyArmyLoss > 0) reasons.push(objectiveReason(
    'enemy-army-damage',
    enemyArmyLoss,
    `enemy field army strength decreased by ${enemyArmyLoss}`,
  ));
  if (floatGrowth > 500) reasons.push(objectiveReason(
    'resource-float',
    -floatGrowth,
    `unspent resources increased by ${floatGrowth}`,
  ));

  return reasons.sort((a, b) => b.score - a.score || a.kind.localeCompare(b.kind));
};

export const botObjectiveTrends = (frames: readonly BotTraceFrame[]): BotObjectiveTrend[] => {
  const byPlayer = new Map<number, { first: BotTraceFrame; last: BotTraceFrame }>();

  for (const frame of frames) {
    const bucket = byPlayer.get(frame.player);
    if (bucket) bucket.last = frame;
    else byPlayer.set(frame.player, { first: frame, last: frame });
  }

  return [...byPlayer.values()]
    .sort((a, b) => a.first.player - b.first.player)
    .map(({ first, last }) => ({
      player: first.player,
      fromTick: first.tick,
      toTick: last.tick,
      before: first.objective,
      after: last.objective,
      reasons: botObjectiveReasons(first.objective, last.objective),
    }));
};

export const botTraceFrame = (
  s: State,
  player: number,
  faction: Faction,
  plan: BotTurnPlan,
): BotTraceFrame => {
  const facts = collectBotFacts(s, player, faction, { risk: 'none' });
  const commandsByType = blankCounts<CommandType>(COMMAND_TYPES);
  const intentsByKind = blankCounts<BotIntentKind>(BOT_INTENT_KINDS);
  const outcomesByStatus = blankCounts<BotTraceOutcomeStatus>(['done', 'waiting', 'blocked', 'failed']);
  const waitsByReason = Object.create(null) as CountMap<BotFailureReason>;
  const blocksByReason = Object.create(null) as CountMap<BotFailureReason>;

  for (const command of plan.commands) inc(commandsByType, command.t);
  for (const intent of plan.intents) inc(intentsByKind, intent.kind);
  for (const record of plan.intentResults) {
    inc(outcomesByStatus, record.result.status);
    if (record.result.status === 'waiting') inc(waitsByReason, record.result.reason);
    if (record.result.status === 'blocked') inc(blocksByReason, record.result.reason);
  }

  return {
    tick: s.tick,
    player,
    minerals: facts.minerals,
    gas: facts.gas,
    supplyUsed: facts.supplyUsed,
    supplyMax: facts.supplyMax,
    bases: facts.bases.length,
    workers: facts.workers.length,
    army: facts.army.length,
    retaskableArmy: facts.retaskableArmy.length,
    idleProducers: facts.idleProducers.length,
    idleLarvae: facts.idleLarvae.length,
    visibleEnemies: facts.visibleEnemies.length,
    commandsIssued: plan.commands.length,
    commandsByType,
    intentsByKind,
    outcomesByStatus,
    waitsByReason,
    blocksByReason,
    objective: botObjectiveSnapshot(s, player),
  };
};

const participantCommands = (
  s: State,
  player: number,
  participant: BotTraceParticipant,
  sampled: boolean,
  frames: BotTraceFrame[],
): PlayerCommands => {
  if (participant.planner) {
    const plan = participant.planner(s, player);
    if (sampled) frames.push(botTraceFrame(s, player, participant.faction, plan));
    return { player, cmds: plan.commands };
  }
  return { player, cmds: participant.controller?.(s, player) ?? [] };
};

export const runBotMatchTrace = (
  sim: Sim,
  participants: readonly BotTraceParticipant[],
  options: BotMatchTraceOptions,
): BotMatchTrace => {
  const stats = createMatchStats(sim.fullState());
  const frames: BotTraceFrame[] = [];
  const commandResults: CommandResult[] = [];
  const sampleEvery = Math.max(1, options.sampleEvery ?? 240);
  let invalidCommands = 0;

  for (let tick = 0; tick < options.maxTicks && !sim.fullState().result.over; tick++) {
    const s = sim.fullState();
    const sampled = tick % sampleEvery === 0;
    const batch = participants.map((participant, player) =>
      participantCommands(s, player, participant, sampled, frames));
    const results = sim.step(batch);
    commandResults.push(...results);
    for (const result of results) {
      if (!result.ok) invalidCommands++;
    }
    recordMatchStatsStep(stats, sim.fullState(), batch, results);
  }

  return {
    frames,
    stats,
    invalidCommands,
    commandResults,
    objectiveTrends: botObjectiveTrends(frames),
  };
};
