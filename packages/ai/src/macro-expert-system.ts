import type { CountMap } from '@rts/sim';
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

export const botHasExpertObligationEvidence = (
  counts: CountMap<BotVictoryAxis>,
  axes: readonly BotVictoryAxis[] = BOT_EXPERT_REQUIRED_AXES,
): boolean =>
  axes.every((axis) => (counts[axis] ?? 0) > 0);

export const botExpertObligationDetail = (counts: CountMap<BotVictoryAxis>): string => {
  const parts = BOT_EXPERT_OBLIGATIONS.map((obligation) =>
    `${obligation.id} ${counts[obligation.axis] ?? 0}`);
  return `axes ${parts.join(', ')}`;
};