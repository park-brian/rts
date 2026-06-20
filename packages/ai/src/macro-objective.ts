import {
  isEnemy,
  kindHasDirectWeapon,
  Kind,
  NEUTRAL,
  Role,
  TECH_CAP,
  TechDefs,
  armorUpgradeBonusForKind,
  productionCount,
  shownSupply,
  type State,
  Units,
  upgradedCooldownForKind,
  upgradedEnergyMaxForKind,
  upgradedRangeForKind,
  upgradedSpeedForKind,
  weaponUpgradeBonusForKind,
  type Weapon,
} from '@rts/sim';
import type {
  BotIntent,
  BotIntentRecord,
  BotIntentScore,
  BotIntentScoreReason,
} from './macro-intents.ts';
import type { BotFacts } from './macro.ts';
import {
  botStrategyPlan,
  type BotMacroPriority,
  type BotStrategyPlan,
  type BotStrategyPosture,
  type BotStrategyPriority,
  type BotStrategyTolerance,
} from './macro-strategy.ts';

export type BotObjectiveSnapshot = {
  workerSupply: number;
  armySupply: number;
  armyStrength: number;
  queuedWorkerProduction: number;
  queuedArmyProduction: number;
  queuedArmyStrength: number;
  productionCapacity: number;
  pendingProductionCapacity: number;
  techUnlocks: number;
  supplyAvailable: number;
  enemyWorkerSupply: number;
  enemyArmySupply: number;
  enemyArmyStrength: number;
  enemyProductionCapacity: number;
  enemyPendingProductionCapacity: number;
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
  strategicPlan?: BotStrategyPlan;
  productionStalled?: boolean;
  missingProductionIntent?: boolean;
  macroFloatStalled?: boolean;
  blockedExpansion?: boolean;
  techStalled?: boolean;
};

export type BotExpertSignals = Pick<
  BotExpertContext,
  'productionStalled' | 'missingProductionIntent' | 'macroFloatStalled' | 'blockedExpansion' | 'techStalled'
>;

export type ObjectiveFrame = {
  tick: number;
  player: number;
  objective: BotObjectiveSnapshot;
};

const blankObjective = (s: State, player: number): BotObjectiveSnapshot => ({
  workerSupply: 0,
  armySupply: 0,
  armyStrength: 0,
  queuedWorkerProduction: 0,
  queuedArmyProduction: 0,
  queuedArmyStrength: 0,
  productionCapacity: 0,
  pendingProductionCapacity: 0,
  techUnlocks: 0,
  supplyAvailable: shownSupply(Math.max(0, s.players.supplyMax[player]! - s.players.supplyUsed[player]!)),
  enemyWorkerSupply: 0,
  enemyArmySupply: 0,
  enemyArmyStrength: 0,
  enemyProductionCapacity: 0,
  enemyPendingProductionCapacity: 0,
  enemyTechUnlocks: 0,
  resourceFloat: s.players.minerals[player]! + s.players.gas[player]!,
});

const STRENGTH_DAMAGE_RATE_SCALE = 240;
const STRENGTH_RANGE_SCALE = 1024;
const STRENGTH_ARMOR_VALUE = 12;
const STRENGTH_SPEED_SCALE = 64;
const STRENGTH_ENERGY_SCALE = 20;
const TARGET_STRENGTH_PER_COMBAT_UNIT = 180;
const STRENGTH_PER_PRODUCTION_CAPACITY = 720;

const weaponValueForKind = (
  s: State,
  owner: number,
  kind: number,
  weapon: Weapon | null,
): number => {
  if (!weapon) return 0;
  const damage = weapon.damage + weaponUpgradeBonusForKind(s, owner, kind, weapon);
  const shots = weapon.shots ?? 1;
  const cooldown = Math.max(1, upgradedCooldownForKind(s, owner, kind, weapon.cooldown));
  const rangeValue = Math.trunc(upgradedRangeForKind(s, owner, kind, weapon) / STRENGTH_RANGE_SCALE);
  return Math.round((damage * shots * STRENGTH_DAMAGE_RATE_SCALE) / cooldown + rangeValue);
};

const combatValueForKind = (s: State, owner: number, kind: number): number => {
  const def = Units[kind];
  if (!def) return 0;
  const supplyValue = shownSupply(def.supply) * 100;
  const costValue = def.minerals + def.gas * 1.5;
  const durabilityValue = (def.hp + def.shields) / 4 + armorUpgradeBonusForKind(s, owner, kind) * STRENGTH_ARMOR_VALUE;
  const mobilityValue = Math.trunc(upgradedSpeedForKind(s, owner, kind, def.speed) / STRENGTH_SPEED_SCALE);
  const energyValue = Math.trunc(upgradedEnergyMaxForKind(s, owner, kind, def.energyMax) / STRENGTH_ENERGY_SCALE);
  return Math.round(
    supplyValue +
    costValue +
    durabilityValue +
    weaponValueForKind(s, owner, kind, def.weapon) +
    weaponValueForKind(s, owner, kind, def.airWeapon === def.weapon ? null : def.airWeapon) +
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

const pendingProductionCapacityValue = (s: State, slot: number, kind: number): number => {
  if (s.e.built[slot] !== 1) return productionCapacityValue(kind);
  const pendingKind = s.e.buildKind[slot]!;
  return pendingKind === Kind.None ? 0 : productionCapacityValue(pendingKind);
};

const queuedProductionCount = (s: State, slot: number): number => {
  const kind = s.e.prodKind[slot]!;
  return kind === Kind.None ? 0 : productionCount(kind) * (1 + s.e.prodQueued[slot]!);
};

const queuedWorkerProductionValue = (s: State, slot: number): number => {
  const kind = s.e.prodKind[slot]!;
  const def = Units[kind];
  return def && (def.roles & Role.Worker) !== 0 ? queuedProductionCount(s, slot) : 0;
};

const queuedArmyProductionValue = (s: State, slot: number): number => {
  const kind = s.e.prodKind[slot]!;
  const def = Units[kind];
  return def &&
    def.supply > 0 &&
    (def.roles & Role.Mobile) !== 0 &&
    (def.roles & Role.Worker) === 0 &&
    kindHasDirectWeapon(kind)
    ? queuedProductionCount(s, slot)
    : 0;
};

const queuedArmyStrengthValue = (s: State, slot: number, count: number): number => {
  const kind = s.e.prodKind[slot]!;
  return count * combatValueForKind(s, s.e.owner[slot]!, kind);
};

const totalProductionCapacity = (objective: BotObjectiveSnapshot): number =>
  objective.productionCapacity + objective.pendingProductionCapacity;

const totalEnemyProductionCapacity = (objective: BotObjectiveSnapshot): number =>
  objective.enemyProductionCapacity + objective.enemyPendingProductionCapacity;

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
    const armyStrength = armySupply > 0 ? combatValueForKind(s, owner, kind) : 0;
    const capacityValue = productionCapacityValue(kind);
    const productionCapacity = e.built[slot] === 1 ? capacityValue : 0;
    const pendingProductionCapacity = pendingProductionCapacityValue(s, slot, kind);
    const queuedWorkerProduction = queuedWorkerProductionValue(s, slot);
    const queuedArmyProduction = queuedArmyProductionValue(s, slot);
    const queuedArmyStrength = queuedArmyProduction > 0 ? queuedArmyStrengthValue(s, slot, queuedArmyProduction) : 0;

    if (owner === player) {
      objective.workerSupply += workerSupply;
      objective.armySupply += armySupply;
      objective.armyStrength += armyStrength;
      objective.queuedWorkerProduction += queuedWorkerProduction;
      objective.queuedArmyProduction += queuedArmyProduction;
      objective.queuedArmyStrength += queuedArmyStrength;
      objective.productionCapacity += productionCapacity;
      objective.pendingProductionCapacity += pendingProductionCapacity;
      if (e.built[slot] === 1 && structureUnlocksCapabilities(kind)) ownTechStructures.add(kind);
    } else if (isEnemy(s, player, owner)) {
      objective.enemyWorkerSupply += workerSupply;
      objective.enemyArmySupply += armySupply;
      objective.enemyArmyStrength += armyStrength;
      objective.enemyProductionCapacity += productionCapacity;
      objective.enemyPendingProductionCapacity += pendingProductionCapacity;
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
  signals: BotExpertSignals = {},
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
  ...(strategy ? { strategicPlan: botStrategyPlan(strategy) } : {}),
  ...(signals.productionStalled ? { productionStalled: true } : {}),
  ...(signals.missingProductionIntent ? { missingProductionIntent: true } : {}),
  ...(signals.macroFloatStalled ? { macroFloatStalled: true } : {}),
  ...(signals.blockedExpansion ? { blockedExpansion: true } : {}),
  ...(signals.techStalled ? { techStalled: true } : {}),
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
  const queuedWorkerGain = after.queuedWorkerProduction - before.queuedWorkerProduction;
  const queuedArmyGain = after.queuedArmyStrength - before.queuedArmyStrength;
  const productionGain = totalProductionCapacity(after) - totalProductionCapacity(before);
  const techGain = after.techUnlocks - before.techUnlocks;
  const supplyGain = after.supplyAvailable - before.supplyAvailable;
  const enemyWorkerLoss = before.enemyWorkerSupply - after.enemyWorkerSupply;
  const enemyArmyLoss = before.enemyArmyStrength - after.enemyArmyStrength;
  const enemyProductionLoss = totalEnemyProductionCapacity(before) - totalEnemyProductionCapacity(after);
  const enemyTechLoss = before.enemyTechUnlocks - after.enemyTechUnlocks;
  const floatGrowth = after.resourceFloat - before.resourceFloat;

  if (workerGain > 0) reasons.push(objectiveReason(
    'economy-growth',
    workerGain,
    `worker supply increased by ${workerGain}`,
  ));
  if (queuedWorkerGain > 0) reasons.push(objectiveReason(
    'economy-growth',
    queuedWorkerGain,
    `queued worker production increased by ${queuedWorkerGain}`,
  ));
  if (armyGain > 0) reasons.push(objectiveReason(
    'army-growth',
    armyGain,
    `field army strength increased by ${armyGain}`,
  ));
  if (queuedArmyGain > 0) reasons.push(objectiveReason(
    'army-growth',
    queuedArmyGain,
    `queued army strength increased by ${queuedArmyGain}`,
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

const strategicPlanBonus = (
  ctx: BotExpertContext,
  priority: BotMacroPriority,
): number => ctx.strategicPlan?.macroPriority === priority ? 8 : 0;

const strategicPlanReason = (
  ctx: BotExpertContext,
  priority: BotMacroPriority,
  value: number,
): BotIntentScoreReason[] => ctx.strategicPlan && value !== 0
  ? [strategyReason(value, `strategic plan prioritizes ${priority} for ${ctx.strategicPlan.primaryGoal}`)]
  : [];

const strategyProductionBonus = (strategy: BotStrategyPosture | undefined): number => {
  if (!strategy) return 0;
  const ratioBonus = Math.round((strategy.productionRatio - 0.5) * 16);
  const techBonus = strategy.techTarget === 'combat-production' || strategy.techTarget === 'first-combat'
    ? 5
    : 0;
  return ratioBonus + techBonus;
};

const armyStrengthPipeline = (objective: BotObjectiveSnapshot): number =>
  objective.armyStrength + objective.queuedArmyStrength;

const desiredArmyStrength = (ctx: BotExpertContext): number =>
  ctx.attackThreshold * TARGET_STRENGTH_PER_COMBAT_UNIT;

const armyStrengthGap = (ctx: BotExpertContext): number =>
  Math.max(0, desiredArmyStrength(ctx) - armyStrengthPipeline(ctx.objective));

const armyTrainingDemand = (ctx: BotExpertContext): number =>
  Math.ceil(armyStrengthGap(ctx) / TARGET_STRENGTH_PER_COMBAT_UNIT);

const desiredProductionCapacity = (ctx: BotExpertContext): number =>
  Math.max(1, Math.ceil(armyStrengthGap(ctx) / STRENGTH_PER_PRODUCTION_CAPACITY));

const productionCapacityGap = (ctx: BotExpertContext): number =>
  Math.max(0, desiredProductionCapacity(ctx) - totalProductionCapacity(ctx.objective));

const supplyHeadroomPenalty = (ctx: BotExpertContext): number =>
  ctx.objective.supplyAvailable <= 2 ? -6 : 0;

export const scoreBotIntent = (intent: BotIntent, ctx: BotExpertContext): BotIntent => {
  const workerPipeline = ctx.workers + ctx.objective.queuedWorkerProduction;
  const workerGap = Math.max(0, ctx.workerTarget - workerPipeline);
  const floatBonus = ctx.objective.resourceFloat > 400
    ? Math.min(8, Math.trunc((ctx.objective.resourceFloat - 400) / 150))
    : 0;

  switch (intent.kind) {
    case 'train-worker':
      return scoredIntent(intent, 35 + Math.min(20, workerGap * 2), [
        scoreReason('economy-growth', workerGap, `worker pipeline gap is ${workerGap}`),
      ]);
    case 'spend-larva':
    case 'train-counter': {
      const armyDemand = armyTrainingDemand(ctx);
      const strengthPipeline = armyStrengthPipeline(ctx.objective);
      const strengthTarget = desiredArmyStrength(ctx);
      const firstArmy = strengthPipeline === 0;
      const strategyBonus = strategyProductionBonus(ctx.strategy);
      return scoredIntent(intent, (firstArmy ? 46 : 30) + Math.min(12, armyDemand * 2) + strategyBonus, [
        scoreReason('army-growth', armyDemand, firstArmy
          ? 'first combat unit unlocks pressure'
          : `army strength gap is ${armyDemand}; pipeline is ${strengthPipeline}/${strengthTarget}`),
        ...strategyReasons(
          ctx.strategy,
          strategyBonus,
          (strategy) => `${strategy.name} posture trains toward ${strategy.techTarget}`,
        ),
      ]);
    }
    case 'add-production': {
      const zergMacroHatchery = intent.targetKind === Kind.Hatchery && ctx.idleLarvae === 0;
      const capacityGap = productionCapacityGap(ctx);
      const strengthPipeline = armyStrengthPipeline(ctx.objective);
      const strengthTarget = desiredArmyStrength(ctx);
      const strategyBonus = strategyProductionBonus(ctx.strategy);
      const supplyPenalty = supplyHeadroomPenalty(ctx);
      const liveStallBonus = (ctx.productionStalled ? 12 : 0) + (ctx.missingProductionIntent ? 10 : 0);
      const planBonus = strategicPlanBonus(ctx, 'production');
      return scoredIntent(intent, (zergMacroHatchery ? 42 : 34) + capacityGap * 5 + floatBonus + strategyBonus + supplyPenalty + liveStallBonus + planBonus, [
        scoreReason('production-throughput', capacityGap, zergMacroHatchery
          ? 'more hatchery larva increases combat production throughput'
          : `combat production capacity is ${ctx.objective.productionCapacity}+${ctx.objective.pendingProductionCapacity}/${desiredProductionCapacity(ctx)}; army strength pipeline is ${strengthPipeline}/${strengthTarget}`),
        scoreReason('supply-availability', supplyPenalty, `free supply is ${ctx.objective.supplyAvailable}`),
        ...(ctx.productionStalled ? [scoreReason('production-throughput', 12, 'combat production is repeatedly blocked')] : []),
        ...(ctx.missingProductionIntent ? [scoreReason('production-throughput', 10, 'ready production has no train intent')] : []),
        ...strategicPlanReason(ctx, 'production', planBonus),
        ...strategyReasons(
          ctx.strategy,
          strategyBonus,
          (strategy) => `${strategy.name} posture wants ${strategy.productionRatio} production ratio`,
        ),
      ]);
    }
    case 'expand': {
      const strategyBonus = priorityBonus(ctx.strategy?.expansionPriority);
      const liveStallBonus = (ctx.macroFloatStalled ? 12 : 0) + (ctx.blockedExpansion ? 8 : 0);
      const planBonus = strategicPlanBonus(ctx, 'expansion');
      return scoredIntent(intent, 32 + Math.min(10, Math.max(0, ctx.workers - 10)) + floatBonus + strategyBonus + liveStallBonus + planBonus, [
        scoreReason('economy-growth', ctx.bases, `owned base count is ${ctx.bases}`),
        ...(ctx.macroFloatStalled ? [scoreReason('economy-growth', 12, 'resources are floating while macro spending is stalled')] : []),
        ...(ctx.blockedExpansion ? [scoreReason('map-control', 8, 'previous expansion route or site was blocked')] : []),
        ...strategicPlanReason(ctx, 'expansion', planBonus),
        ...strategyReasons(
          ctx.strategy,
          strategyBonus,
          (strategy) => `${strategy.name} posture expansion priority is ${strategy.expansionPriority}`,
        ),
      ]);
    }
    case 'take-gas': {
      const gasBonus = ctx.strategy?.gasTiming === 'now' ? 12 : ctx.strategy?.gasTiming === 'soon' ? 6 : 0;
      const planBonus = strategicPlanBonus(ctx, 'tech');
      return scoredIntent(intent, 38 + gasBonus + planBonus, [
        scoreReason('tech-unlock', gasBonus, `strategy gas timing is ${ctx.strategy?.gasTiming ?? 'unknown'}`),
        ...strategicPlanReason(ctx, 'tech', planBonus),
      ]);
    }
    case 'rebuild-tech': {
      const planBonus = strategicPlanBonus(ctx, 'tech');
      return scoredIntent(intent, 44 + (ctx.techStalled ? 14 : 0) + planBonus, [
        scoreReason('tech-unlock', 1, 'restores or unlocks a required capability'),
        ...(ctx.techStalled ? [scoreReason('tech-unlock', 14, 'leading tech intent is repeatedly blocked')] : []),
        ...strategicPlanReason(ctx, 'tech', planBonus),
      ]);
    }
    case 'research-upgrade': {
      const armyValue = armyStrengthPipeline(ctx.objective);
      const armyValueBonus = Math.min(10, Math.trunc(armyValue / 220));
      const unlockPenalty = Math.min(6, ctx.objective.techUnlocks);
      const planBonus = strategicPlanBonus(ctx, 'tech');
      return scoredIntent(intent, 28 + armyValueBonus - unlockPenalty + planBonus, [
        scoreReason('army-growth', armyValue, 'upgrade increases fielded and queued combat value'),
        scoreReason('tech-unlock', -unlockPenalty, `completed tech unlock count is ${ctx.objective.techUnlocks}`),
        ...strategicPlanReason(ctx, 'tech', planBonus),
      ]);
    }
    case 'add-static-defense': {
      const strategyBonus = toleranceBonus(ctx.strategy?.staticDefenseTolerance);
      const planBonus = strategicPlanBonus(ctx, 'defense');
      return scoredIntent(intent, 42 + strategyBonus + planBonus, [
        scoreReason('safety', 1, 'static defense protects base economy and production'),
        ...strategicPlanReason(ctx, 'defense', planBonus),
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
