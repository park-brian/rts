import { Factions, type CountMap } from '@rts/sim';
import type { BotVictoryAxis } from './macro-intents.ts';
import type { BotStrategyPlan } from './macro-strategy.ts';

export type BotExpertObligationId =
  | 'economy'
  | 'production'
  | 'combat';

export type BotExpertObligation = {
  id: BotExpertObligationId;
  axis: BotVictoryAxis;
  detail: string;
};

export type BotExpertObligationAssessment = BotExpertObligation & {
  count: number;
  satisfied: boolean;
};

export type BotExpertObligationPressureContext = {
  workers: number;
  workerTarget: number;
  bases: number;
  attackThreshold: number;
  objective: BotCombatPipelineSnapshot & {
    queuedWorkerProduction: number;
  };
};

export type BotExpertObligationPressure = BotExpertObligation & {
  pressure: number;
  satisfied: boolean;
};

export type BotPlanEvidenceAssessment = {
  axes: readonly BotVictoryAxis[];
  count: number;
  satisfied: boolean;
  detail: string;
};

export type BotPlanObjectiveProgress = {
  workerGain: number;
  baseGain: number;
  armyGain: number;
  queuedWorkers: number;
  queuedArmy: number;
  macroCommands: number;
  combatCommands: number;
};

export type BotPlanObjectiveProgressAssessment = {
  count: number;
  satisfied: boolean;
  detail: string;
};

export type BotCombatPipelineSnapshot = {
  armyStrength: number;
  queuedArmyStrength: number;
  productionCapacity: number;
  pendingProductionCapacity: number;
};

export const BOT_TARGET_STRENGTH_PER_COMBAT_UNIT = 180;
export const BOT_STRENGTH_PER_PRODUCTION_CAPACITY = 720;

const firstCombatStructureKinds: ReadonlySet<number> = new Set(
  Object.values(Factions).map((faction) => faction.armyStructure),
);

export const BOT_EXPERT_OBLIGATIONS: readonly BotExpertObligation[] = [
  {
    id: 'economy',
    axis: 'economy-growth',
    detail: 'grow workers or bases so the bot can afford the next decision',
  },
  {
    id: 'production',
    axis: 'production-throughput',
    detail: 'turn resources into production capacity and queued units',
  },
  {
    id: 'combat',
    axis: 'combat-strength',
    detail: 'field army strength instead of only spending on infrastructure',
  },
] as const;

export const BOT_EXPERT_REQUIRED_AXES: readonly BotVictoryAxis[] =
  BOT_EXPERT_OBLIGATIONS.map((obligation) => obligation.axis);

export const botPlanEvidenceAxes = (plan: BotStrategyPlan): readonly BotVictoryAxis[] => {
  switch (plan.macroPriority) {
    case 'defense':
      return ['safety', 'combat-strength'];
    case 'production':
      return ['production-throughput', 'combat-strength'];
    case 'expansion':
      return ['economy-growth', 'map-control'];
    case 'tech':
      return plan.combatStance === 'pressure'
        ? ['tech-unlock', 'enemy-degradation']
        : ['tech-unlock'];
  }
};

export const botPlanEvidenceLabel = (axes: readonly BotVictoryAxis[]): string => axes.join('/');

export const botHasCombatPipeline = (snapshot: BotCombatPipelineSnapshot): boolean =>
  snapshot.armyStrength + snapshot.queuedArmyStrength > 0 ||
  snapshot.productionCapacity + snapshot.pendingProductionCapacity > 0;

export const botNeedsOpeningCombatPipeline = (
  plan: BotStrategyPlan | undefined,
  snapshot: BotCombatPipelineSnapshot,
): boolean =>
  plan?.primaryGoal === 'establish-combat' && !botHasCombatPipeline(snapshot);

export const botBuildsFirstCombatStructure = (kind: number | undefined): boolean =>
  kind !== undefined && firstCombatStructureKinds.has(kind);

export const botPlanEvidenceAssessment = (
  plan: BotStrategyPlan,
  counts: CountMap<BotVictoryAxis>,
): BotPlanEvidenceAssessment => {
  const axes = botPlanEvidenceAxes(plan);
  const count = axes.reduce((sum, axis) => sum + (counts[axis] ?? 0), 0);
  return {
    axes,
    count,
    satisfied: count > 0,
    detail: `${plan.primaryGoal}/${plan.macroPriority}/${plan.combatStance} ${count > 0 ? 'showed' : 'lacked'} ${botPlanEvidenceLabel(axes)}`,
  };
};

const botPlanObjectiveProgressCount = (
  plan: BotStrategyPlan,
  progress: BotPlanObjectiveProgress,
): number => {
  const economy = progress.workerGain + progress.baseGain + progress.queuedWorkers;
  const combat = progress.armyGain + progress.queuedArmy + progress.combatCommands;
  switch (plan.primaryGoal) {
    case 'recover-economy':
    case 'scale-economy':
      return economy + progress.macroCommands;
    case 'establish-combat':
    case 'build-timing':
    case 'secure-base':
      return combat + progress.macroCommands;
    case 'degrade-enemy':
      return combat;
  }
};

export const botPlanObjectiveProgressAssessment = (
  plan: BotStrategyPlan,
  progress: BotPlanObjectiveProgress,
): BotPlanObjectiveProgressAssessment => {
  const count = botPlanObjectiveProgressCount(plan, progress);

  const detail = [
    `workers +${progress.workerGain}`,
    `bases +${progress.baseGain}`,
    `army +${progress.armyGain}`,
    `queued workers ${progress.queuedWorkers}`,
    `queued army ${progress.queuedArmy}`,
    `macro cmds ${progress.macroCommands}`,
    `combat cmds ${progress.combatCommands}`,
  ].join(', ');
  return {
    count,
    satisfied: count > 0,
    detail: `${plan.primaryGoal}/${plan.macroPriority}/${plan.combatStance} ${count > 0 ? 'advanced' : 'stalled'} objective progress (${detail})`,
  };
};

export const botExpertObligationAssessments = (
  counts: CountMap<BotVictoryAxis>,
): BotExpertObligationAssessment[] =>
  BOT_EXPERT_OBLIGATIONS.map((obligation) => {
    const count = counts[obligation.axis] ?? 0;
    return {
      ...obligation,
      count,
      satisfied: count > 0,
    };
  });

const totalCombatPipelineStrength = (snapshot: BotCombatPipelineSnapshot): number =>
  snapshot.armyStrength + snapshot.queuedArmyStrength;

const totalProductionCapacity = (snapshot: BotCombatPipelineSnapshot): number =>
  snapshot.productionCapacity + snapshot.pendingProductionCapacity;

const desiredArmyStrength = (ctx: BotExpertObligationPressureContext): number =>
  ctx.attackThreshold * BOT_TARGET_STRENGTH_PER_COMBAT_UNIT;

const desiredProductionCapacity = (ctx: BotExpertObligationPressureContext): number =>
  Math.max(1, Math.ceil(
    Math.max(0, desiredArmyStrength(ctx) - totalCombatPipelineStrength(ctx.objective)) /
      BOT_STRENGTH_PER_PRODUCTION_CAPACITY,
  ));

const obligationPressure = (
  obligation: BotExpertObligation,
  pressure: number,
): BotExpertObligationPressure => ({
  ...obligation,
  pressure,
  satisfied: pressure <= 0,
});

type BotExpertObligationPressureFacts = {
  workerGap: number;
  armyStrengthGap: number;
  productionGap: number;
  bases: number;
};

const obligationPressureFacts = (
  ctx: BotExpertObligationPressureContext,
): BotExpertObligationPressureFacts => {
  const workerPipeline = ctx.workers + ctx.objective.queuedWorkerProduction;
  return {
    workerGap: Math.max(0, ctx.workerTarget - workerPipeline),
    armyStrengthGap: Math.max(0, desiredArmyStrength(ctx) - totalCombatPipelineStrength(ctx.objective)),
    productionGap: Math.max(0, desiredProductionCapacity(ctx) - totalProductionCapacity(ctx.objective)),
    bases: ctx.bases,
  };
};

const obligationPressureValue = (
  obligation: BotExpertObligation,
  facts: BotExpertObligationPressureFacts,
): number => {
  switch (obligation.id) {
    case 'economy':
      return Math.min(20, facts.workerGap * 2) + (facts.bases === 0 ? 20 : 0);
    case 'production':
      return Math.min(20, facts.productionGap * 6);
    case 'combat':
      return Math.min(20, Math.ceil(facts.armyStrengthGap / BOT_TARGET_STRENGTH_PER_COMBAT_UNIT) * 2);
  }
};

const botExpertObligationPressure = (
  obligation: BotExpertObligation,
  facts: BotExpertObligationPressureFacts,
): BotExpertObligationPressure =>
  obligationPressure(obligation, obligationPressureValue(obligation, facts));

export const botExpertObligationPressures = (
  ctx: BotExpertObligationPressureContext,
): BotExpertObligationPressure[] => {
  const facts = obligationPressureFacts(ctx);
  return BOT_EXPERT_OBLIGATIONS.map((obligation) => botExpertObligationPressure(obligation, facts));
};

export const botExpertAxisPressure = (
  ctx: BotExpertObligationPressureContext,
  axis: BotVictoryAxis,
): BotExpertObligationPressure | undefined => {
  const obligation = BOT_EXPERT_OBLIGATIONS.find((candidate) => candidate.axis === axis);
  return obligation ? botExpertObligationPressure(obligation, obligationPressureFacts(ctx)) : undefined;
};

export const botHasExpertObligationEvidence = (
  counts: CountMap<BotVictoryAxis>,
  axes: readonly BotVictoryAxis[] = BOT_EXPERT_REQUIRED_AXES,
): boolean =>
  axes.every((axis) => (counts[axis] ?? 0) > 0);

export const botExpertObligationDetail = (counts: CountMap<BotVictoryAxis>): string => {
  const parts = botExpertObligationAssessments(counts).map((obligation) =>
    `${obligation.id} ${obligation.count}`);
  return `axes ${parts.join(', ')}`;
};
