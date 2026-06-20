import {
  isEnemy,
  kindHasDirectWeapon,
  Kind,
  NEUTRAL,
  Role,
  TECH_CAP,
  TechDefs,
  armorUpgradeBonus,
  shownSupply,
  type State,
  Units,
  upgradedCooldown,
  upgradedEnergyMax,
  upgradedRange,
  upgradedSpeed,
  weaponUpgradeBonus,
  type Weapon,
} from '@rts/sim';
import type {
  BotIntent,
  BotIntentRecord,
  BotIntentScore,
  BotIntentScoreReason,
} from './macro-intents.ts';
import type { BotFacts } from './macro.ts';
import type { BotStrategyPosture, BotStrategyPriority, BotStrategyTolerance } from './macro-strategy.ts';

export type BotObjectiveSnapshot = {
  workerSupply: number;
  armySupply: number;
  armyStrength: number;
  productionCapacity: number;
  techUnlocks: number;
  supplyAvailable: number;
  enemyWorkerSupply: number;
  enemyArmySupply: number;
  enemyArmyStrength: number;
  enemyProductionCapacity: number;
  enemyTechUnlocks: number;
  resourceFloat: number;
};

export type BotObjectiveReasonKind =
  | 'economy-growth'
  | 'army-growth'
  | 'production-throughput'
  | 'tech-unlock'
  | 'supply-availability'
  | 'enemy-economy-damage'
  | 'enemy-army-damage'
  | 'enemy-production-damage'
  | 'enemy-tech-damage'
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

export type BotExpertContext = {
  objective: BotObjectiveSnapshot;
  workers: number;
  workerTarget: number;
  army: number;
  retaskableArmy: number;
  idleProducers: number;
  idleLarvae: number;
  bases: number;
  attackThreshold: number;
  strategy?: BotStrategyPosture;
};

export type ObjectiveFrame = {
  tick: number;
  player: number;
  objective: BotObjectiveSnapshot;
};

const blankObjective = (s: State, player: number): BotObjectiveSnapshot => ({
  workerSupply: 0,
  armySupply: 0,
  armyStrength: 0,
  productionCapacity: 0,
  techUnlocks: 0,
  supplyAvailable: shownSupply(Math.max(0, s.players.supplyMax[player]! - s.players.supplyUsed[player]!)),
  enemyWorkerSupply: 0,
  enemyArmySupply: 0,
  enemyArmyStrength: 0,
  enemyProductionCapacity: 0,
  enemyTechUnlocks: 0,
  resourceFloat: s.players.minerals[player]! + s.players.gas[player]!,
});

const STRENGTH_DAMAGE_RATE_SCALE = 240;
const STRENGTH_RANGE_SCALE = 1024;
const STRENGTH_ARMOR_VALUE = 12;
const STRENGTH_SPEED_SCALE = 64;
const STRENGTH_ENERGY_SCALE = 20;

const weaponValue = (s: State, slot: number, weapon: Weapon | null): number => {
  if (!weapon) return 0;
  const damage = weapon.damage + weaponUpgradeBonus(s, slot, weapon);
  const shots = weapon.shots ?? 1;
  const cooldown = Math.max(1, upgradedCooldown(s, slot, weapon.cooldown));
  const rangeValue = Math.trunc(upgradedRange(s, slot, weapon) / STRENGTH_RANGE_SCALE);
  return Math.round((damage * shots * STRENGTH_DAMAGE_RATE_SCALE) / cooldown + rangeValue);
};

const combatValue = (s: State, slot: number): number => {
  const def = Units[s.e.kind[slot]!];
  if (!def) return 0;
  const supplyValue = shownSupply(def.supply) * 100;
  const costValue = def.minerals + def.gas * 1.5;
  const durabilityValue = (def.hp + def.shields) / 4 + armorUpgradeBonus(s, slot) * STRENGTH_ARMOR_VALUE;
  const mobilityValue = Math.trunc(upgradedSpeed(s, slot, def.speed) / STRENGTH_SPEED_SCALE);
  const energyValue = Math.trunc(upgradedEnergyMax(s, slot, def.energyMax) / STRENGTH_ENERGY_SCALE);
  return Math.round(
    supplyValue +
    costValue +
    durabilityValue +
    weaponValue(s, slot, def.weapon) +
    weaponValue(s, slot, def.airWeapon === def.weapon ? null : def.airWeapon) +
    mobilityValue +
    energyValue,
  );
};

const scoreReason = (
  kind: BotIntentScoreReason['kind'],
  value: number,
  detail: string,
): BotIntentScoreReason => ({ kind, value, detail });

const intentScore = (value: number, reasons: BotIntentScoreReason[]): BotIntentScore => ({
  value: Math.round(value),
  reasons,
});

const scoredIntent = (
  intent: BotIntent,
  value: number,
  reasons: BotIntentScoreReason[],
): BotIntent => ({ ...intent, score: intentScore(value, reasons) });

const techProducerKinds = new Set(Object.values(TechDefs).flatMap((def) => def.producers));

const isCombatProductKind = (kind: number): boolean => {
  const def = Units[kind];
  return !!def &&
    (def.roles & Role.Mobile) !== 0 &&
    (def.roles & Role.Worker) === 0 &&
    kindHasDirectWeapon(kind);
};

const productionCapacityValue = (kind: number): number => {
  const def = Units[kind];
  return def && def.produces.some(isCombatProductKind) ? 1 : 0;
};

const structureUnlocksCapabilities = (kind: number): boolean => {
  const def = Units[kind];
  return !!def &&
    (def.roles & Role.Structure) !== 0 &&
    (def.roles & (Role.Resource | Role.ResourceDepot)) === 0 &&
    def.provides === 0 &&
    (def.produces.length > 0 || def.abilities.length > 0 || def.requires.length > 0 || techProducerKinds.has(kind));
};

const completedTechLevels = (s: State, player: number): number => {
  let levels = 0;
  for (const tech of Object.keys(TechDefs)) levels += s.players.tech[player * TECH_CAP + Number(tech)] ?? 0;
  return levels;
};

export const botObjectiveSnapshot = (s: State, player: number): BotObjectiveSnapshot => {
  const objective = blankObjective(s, player);
  const e = s.e;
  const ownTechStructures = new Set<number>();
  const enemyTechStructures = new Set<number>();

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
    const armyStrength = armySupply > 0 ? combatValue(s, slot) : 0;
    const productionCapacity = e.built[slot] === 1 ? productionCapacityValue(kind) : 0;

    if (owner === player) {
      objective.workerSupply += workerSupply;
      objective.armySupply += armySupply;
      objective.armyStrength += armyStrength;
      objective.productionCapacity += productionCapacity;
      if (e.built[slot] === 1 && structureUnlocksCapabilities(kind)) ownTechStructures.add(kind);
    } else if (isEnemy(s, player, owner)) {
      objective.enemyWorkerSupply += workerSupply;
      objective.enemyArmySupply += armySupply;
      objective.enemyArmyStrength += armyStrength;
      objective.enemyProductionCapacity += productionCapacity;
      if (e.built[slot] === 1 && structureUnlocksCapabilities(kind)) enemyTechStructures.add(kind);
    }
  }

  objective.techUnlocks = ownTechStructures.size + completedTechLevels(s, player);
  for (let other = 0; other < s.teams.length; other++) {
    if (!isEnemy(s, player, other)) continue;
    objective.enemyTechUnlocks += completedTechLevels(s, other);
  }
  objective.enemyTechUnlocks += enemyTechStructures.size;

  return objective;
};

export const botExpertContext = (
  s: State,
  player: number,
  facts: BotFacts,
  workerTarget: number,
  attackThreshold: number,
  strategy?: BotStrategyPosture,
): BotExpertContext => ({
  objective: botObjectiveSnapshot(s, player),
  workers: facts.workers.length,
  workerTarget,
  army: facts.army.length,
  retaskableArmy: facts.retaskableArmy.length,
  idleProducers: facts.idleProducers.length,
  idleLarvae: facts.idleLarvae.length,
  bases: facts.bases.length,
  attackThreshold,
  ...(strategy ? { strategy } : {}),
});

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
  const productionGain = after.productionCapacity - before.productionCapacity;
  const techGain = after.techUnlocks - before.techUnlocks;
  const supplyGain = after.supplyAvailable - before.supplyAvailable;
  const enemyWorkerLoss = before.enemyWorkerSupply - after.enemyWorkerSupply;
  const enemyArmyLoss = before.enemyArmyStrength - after.enemyArmyStrength;
  const enemyProductionLoss = before.enemyProductionCapacity - after.enemyProductionCapacity;
  const enemyTechLoss = before.enemyTechUnlocks - after.enemyTechUnlocks;
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
  if (productionGain > 0) reasons.push(objectiveReason(
    'production-throughput',
    productionGain * 50,
    `combat production capacity increased by ${productionGain}`,
  ));
  if (techGain > 0) reasons.push(objectiveReason(
    'tech-unlock',
    techGain * 30,
    `tech unlock count increased by ${techGain}`,
  ));
  if (supplyGain > 0) reasons.push(objectiveReason(
    'supply-availability',
    supplyGain,
    `free supply increased by ${supplyGain}`,
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
  if (enemyProductionLoss > 0) reasons.push(objectiveReason(
    'enemy-production-damage',
    enemyProductionLoss * 50,
    `enemy combat production capacity decreased by ${enemyProductionLoss}`,
  ));
  if (enemyTechLoss > 0) reasons.push(objectiveReason(
    'enemy-tech-damage',
    enemyTechLoss * 30,
    `enemy tech unlock count decreased by ${enemyTechLoss}`,
  ));
  if (floatGrowth > 500) reasons.push(objectiveReason(
    'resource-float',
    -floatGrowth,
    `unspent resources increased by ${floatGrowth}`,
  ));

  return reasons.sort((a, b) => b.score - a.score || a.kind.localeCompare(b.kind));
};

export const botObjectiveTrends = (frames: readonly ObjectiveFrame[]): BotObjectiveTrend[] => {
  const byPlayer = new Map<number, { first: ObjectiveFrame; last: ObjectiveFrame }>();

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

const priorityBonus = (priority: BotStrategyPriority | undefined): number => {
  switch (priority) {
    case 'high': return 10;
    case 'low': return -8;
    default: return 0;
  }
};

const toleranceBonus = (tolerance: BotStrategyTolerance | undefined): number => {
  switch (tolerance) {
    case 'high': return 8;
    case 'low': return -6;
    default: return 0;
  }
};

const strategyReason = (
  value: number,
  detail: string,
): BotIntentScoreReason => scoreReason('strategy', value, detail);

const strategyReasons = (
  strategy: BotStrategyPosture | undefined,
  value: number,
  detail: (strategy: BotStrategyPosture) => string,
): BotIntentScoreReason[] => strategy ? [strategyReason(value, detail(strategy))] : [];

const strategyProductionBonus = (strategy: BotStrategyPosture | undefined): number => {
  if (!strategy) return 0;
  const ratioBonus = Math.round((strategy.productionRatio - 0.5) * 16);
  const techBonus = strategy.techTarget === 'combat-production' || strategy.techTarget === 'first-combat'
    ? 5
    : 0;
  return ratioBonus + techBonus;
};

const desiredProductionCapacity = (ctx: BotExpertContext): number =>
  Math.max(1, Math.ceil(ctx.attackThreshold / 4));

const productionCapacityGap = (ctx: BotExpertContext): number =>
  Math.max(0, desiredProductionCapacity(ctx) - ctx.objective.productionCapacity);

const supplyHeadroomPenalty = (ctx: BotExpertContext): number =>
  ctx.objective.supplyAvailable <= 2 ? -6 : 0;

export const scoreBotIntent = (intent: BotIntent, ctx: BotExpertContext): BotIntent => {
  const workerGap = Math.max(0, ctx.workerTarget - ctx.workers);
  const armyGap = Math.max(0, ctx.attackThreshold - ctx.army);
  const floatBonus = ctx.objective.resourceFloat > 400
    ? Math.min(8, Math.trunc((ctx.objective.resourceFloat - 400) / 150))
    : 0;

  switch (intent.kind) {
    case 'train-worker':
      return scoredIntent(intent, 35 + Math.min(20, workerGap * 2), [
        scoreReason('economy-growth', workerGap, `worker target gap is ${workerGap}`),
      ]);
    case 'spend-larva':
    case 'train-counter': {
      const firstArmy = ctx.objective.armyStrength === 0;
      return scoredIntent(intent, (firstArmy ? 46 : 30) + Math.min(12, armyGap * 2), [
        scoreReason('army-growth', armyGap, firstArmy ? 'first combat unit unlocks pressure' : `army target gap is ${armyGap}`),
      ]);
    }
    case 'add-production': {
      const zergMacroHatchery = intent.targetKind === Kind.Hatchery && ctx.idleLarvae === 0;
      const capacityGap = productionCapacityGap(ctx);
      const strategyBonus = strategyProductionBonus(ctx.strategy);
      const supplyPenalty = supplyHeadroomPenalty(ctx);
      return scoredIntent(intent, (zergMacroHatchery ? 42 : 34) + capacityGap * 5 + floatBonus + strategyBonus + supplyPenalty, [
        scoreReason('production-throughput', capacityGap, zergMacroHatchery
          ? 'more hatchery larva increases combat production throughput'
          : `completed combat production capacity is ${ctx.objective.productionCapacity}/${desiredProductionCapacity(ctx)}`),
        scoreReason('supply-availability', supplyPenalty, `free supply is ${ctx.objective.supplyAvailable}`),
        ...strategyReasons(
          ctx.strategy,
          strategyBonus,
          (strategy) => `${strategy.name} posture wants ${strategy.productionRatio} production ratio`,
        ),
      ]);
    }
    case 'expand': {
      const strategyBonus = priorityBonus(ctx.strategy?.expansionPriority);
      return scoredIntent(intent, 32 + Math.min(10, Math.max(0, ctx.workers - 10)) + floatBonus + strategyBonus, [
        scoreReason('economy-growth', ctx.bases, `owned base count is ${ctx.bases}`),
        ...strategyReasons(
          ctx.strategy,
          strategyBonus,
          (strategy) => `${strategy.name} posture expansion priority is ${strategy.expansionPriority}`,
        ),
      ]);
    }
    case 'take-gas': {
      const gasBonus = ctx.strategy?.gasTiming === 'now' ? 12 : ctx.strategy?.gasTiming === 'soon' ? 6 : 0;
      return scoredIntent(intent, 38 + gasBonus, [
        scoreReason('tech-unlock', gasBonus, `strategy gas timing is ${ctx.strategy?.gasTiming ?? 'unknown'}`),
      ]);
    }
    case 'rebuild-tech':
      return scoredIntent(intent, 44, [
        scoreReason('tech-unlock', 1, 'restores or unlocks a required capability'),
      ]);
    case 'research-upgrade': {
      const armyValueBonus = Math.min(10, Math.trunc(ctx.objective.armyStrength / 220));
      const unlockPenalty = Math.min(6, ctx.objective.techUnlocks);
      return scoredIntent(intent, 28 + armyValueBonus - unlockPenalty, [
        scoreReason('army-growth', ctx.objective.armyStrength, 'upgrade increases current and future combat value'),
        scoreReason('tech-unlock', -unlockPenalty, `completed tech unlock count is ${ctx.objective.techUnlocks}`),
      ]);
    }
    case 'add-static-defense': {
      const strategyBonus = toleranceBonus(ctx.strategy?.staticDefenseTolerance);
      return scoredIntent(intent, 42 + strategyBonus, [
        scoreReason('safety', 1, 'static defense protects base economy and production'),
        ...strategyReasons(
          ctx.strategy,
          strategyBonus,
          (strategy) => `${strategy.name} posture static defense tolerance is ${strategy.staticDefenseTolerance}`,
        ),
      ]);
    }
    case 'defend-base':
    case 'get-detection':
    case 'clear-site':
    case 'evacuate-workers':
      return scoredIntent(intent, Math.max(50, intent.urgency), [
        scoreReason('safety', intent.urgency, 'protects workers, bases, or blocked strategic space'),
      ]);
    case 'attack-wave':
    case 'harass':
    case 'contain':
    case 'counterattack': {
      const strategyBonus = priorityBonus(ctx.strategy?.harassmentAppetite);
      return scoredIntent(intent, intent.urgency + Math.min(10, Math.trunc(ctx.objective.armyStrength / 300)) + strategyBonus, [
        scoreReason('enemy-degradation', ctx.retaskableArmy, 'uses available army to lower enemy economy or army slope'),
        ...strategyReasons(
          ctx.strategy,
          strategyBonus,
          (strategy) => `${strategy.name} posture harassment appetite is ${strategy.harassmentAppetite}`,
        ),
      ]);
    }
    case 'retreat': {
      const strategyBonus = toleranceBonus(ctx.strategy?.retreatTolerance);
      return scoredIntent(intent, Math.max(55, intent.urgency) + strategyBonus, [
        scoreReason('safety', intent.urgency, 'preserves force for a better future fight'),
        ...strategyReasons(
          ctx.strategy,
          strategyBonus,
          (strategy) => `${strategy.name} posture retreat tolerance is ${strategy.retreatTolerance}`,
        ),
      ]);
    }
    case 'scout':
      return scoredIntent(intent, 24, [
        scoreReason('map-control', 1, 'improves future expansion, defense, and attack decisions'),
      ]);
  }
};

export const scoreBotIntentRecord = (
  record: BotIntentRecord,
  ctx: BotExpertContext,
): BotIntentRecord => ({
  ...record,
  intent: scoreBotIntent(record.intent, ctx),
});
