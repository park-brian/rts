import { type Command, type Faction, type State } from '@rts/sim';
import { castTacticalAbilities } from './ability-policies.ts';
import { type PointSpotFinder, type ResourceBudget } from './macro-build.ts';
import { issuePressureEngagement } from './macro-combat.ts';
import type { BotIntent } from './macro-intents.ts';
import type { BotMemory } from './macro-memory.ts';
import { maybeQueueNydusEndpoint } from './macro-nydus.ts';
import {
  markPressureCommitted,
  pressureCommitmentDecision,
  pressureFocus,
  type PressureCommitmentDecision,
  type PressureFocus,
} from './macro-pressure.ts';
import type { CombatReserve } from './macro-reserve.ts';
import { collectBotFacts, type BotFacts } from './macro.ts';

export type PressureScheduleOptions = {
  attackThreshold: number;
  strategicOnly: boolean;
  builderUsed: boolean;
};

export type PressureProposalOptions = {
  attackThreshold: number;
  strategicOnly: boolean;
};

export type PressureScheduleResult = {
  builderUsed: boolean;
  decision: PressureCommitmentDecision;
  focus: PressureFocus | null;
  intent: BotIntent | null;
  issued: boolean;
};

export type PressureIntentProposal = {
  decision: PressureCommitmentDecision;
  focus: PressureFocus | null;
  intent: BotIntent | null;
  reserve: CombatReserve;
};

const pressureIntentKind = (
  reserve: CombatReserve,
  decision: PressureCommitmentDecision,
): BotIntent['kind'] => {
  if (reserve.defenseActive) return 'counterattack';
  return decision.forced ? 'harass' : 'attack-wave';
};

const pressureIntent = (
  reserve: CombatReserve,
  decision: PressureCommitmentDecision,
  focus: PressureFocus | null,
): BotIntent => ({
  kind: pressureIntentKind(reserve, decision),
  urgency: decision.forced ? 55 : 40,
  ...(focus ? { targetSlot: focus.target, x: focus.x, y: focus.y } : {}),
});

export const proposePressureIntent = (
  s: State,
  player: number,
  faction: Faction,
  facts: BotFacts,
  memory: BotMemory,
  depot: number,
  reserve: CombatReserve,
  options: PressureProposalOptions,
): PressureIntentProposal => {
  const decision = pressureCommitmentDecision(memory, s.tick, reserve.commitmentForce, options.attackThreshold);
  if (decision.status === 'idle') return { decision, focus: null, intent: null, reserve };
  if (decision.status === 'waiting') return { decision, focus: null, intent: pressureIntent(reserve, decision, null), reserve };

  const pressureFacts = facts.enemyProtectedRegions.length > 1 && facts.visibleEnemies.length > 0
    ? collectBotFacts(s, player, faction)
    : facts;
  const focus = pressureFocus(s, player, pressureFacts, depot, { strategicOnly: options.strategicOnly });
  if (!focus) return { decision, focus: null, intent: null, reserve };

  return { decision, focus, intent: pressureIntent(reserve, decision, focus), reserve };
};

export const executePressureIntent = (
  s: State,
  player: number,
  cmds: Command[],
  memory: BotMemory,
  proposal: PressureIntentProposal,
  casters: number[],
  budget: ResourceBudget,
  worker: number,
  findSpot: PointSpotFinder,
  options: Pick<PressureScheduleOptions, 'builderUsed' | 'strategicOnly'>,
): PressureScheduleResult => {
  const { decision, focus, reserve } = proposal;
  let builderUsed = options.builderUsed;
  if (!focus || !proposal.intent) return { builderUsed, decision, focus, intent: null, issued: false };
  let issuedOffense = false;
  if (!builderUsed) {
    builderUsed = maybeQueueNydusEndpoint(s, player, cmds, budget, worker, focus.x, focus.y, findSpot);
  }
  if (!options.strategicOnly) castTacticalAbilities(s, player, cmds, casters, focus.x, focus.y);
  for (const unit of reserve.units) {
    issuePressureEngagement(s, player, cmds, unit, focus);
    issuedOffense = true;
  }
  if (issuedOffense) markPressureCommitted(memory, s.tick);
  return {
    builderUsed,
    decision,
    focus,
    intent: issuedOffense ? proposal.intent : null,
    issued: issuedOffense,
  };
};

export const schedulePressureOffense = (
  s: State,
  player: number,
  faction: Faction,
  cmds: Command[],
  facts: BotFacts,
  memory: BotMemory,
  depot: number,
  reserve: CombatReserve,
  casters: number[],
  budget: ResourceBudget,
  worker: number,
  findSpot: PointSpotFinder,
  options: PressureScheduleOptions,
): PressureScheduleResult => {
  const proposal = proposePressureIntent(s, player, faction, facts, memory, depot, reserve, options);
  return executePressureIntent(s, player, cmds, memory, proposal, casters, budget, worker, findSpot, options);
};
