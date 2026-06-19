import { type Command, type Faction, type State } from '@rts/sim';
import { castTacticalAbilities } from './ability-policies.ts';
import { type PointSpotFinder, type ResourceBudget } from './macro-build.ts';
import { issuePressureEngagement } from './macro-combat.ts';
import { maybeQueueNydusEndpoint } from './macro-nydus.ts';
import {
  markPressureCommitted,
  pressureCommitmentDecision,
  pressureFocus,
  type PressureCommitmentDecision,
  type PressureFocus,
} from './macro-pressure.ts';
import type { BotMemory } from './macro-memory.ts';
import { collectBotFacts, type BotFacts } from './macro.ts';

export type PressureScheduleOptions = {
  attackThreshold: number;
  force: number;
  strategicOnly: boolean;
  builderUsed: boolean;
};

export type PressureScheduleResult = {
  builderUsed: boolean;
  decision: PressureCommitmentDecision;
  focus: PressureFocus | null;
  issued: boolean;
};

export const schedulePressureOffense = (
  s: State,
  player: number,
  faction: Faction,
  cmds: Command[],
  facts: BotFacts,
  memory: BotMemory,
  depot: number,
  attackCandidates: readonly number[],
  casters: number[],
  budget: ResourceBudget,
  worker: number,
  findSpot: PointSpotFinder,
  options: PressureScheduleOptions,
): PressureScheduleResult => {
  let builderUsed = options.builderUsed;
  const decision = pressureCommitmentDecision(memory, s.tick, options.force, options.attackThreshold);
  if (decision.status !== 'commit') return { builderUsed, decision, focus: null, issued: false };

  const pressureFacts = facts.enemyProtectedRegions.length > 1 && facts.visibleEnemies.length > 0
    ? collectBotFacts(s, player, faction)
    : facts;
  const focus = pressureFocus(s, player, pressureFacts, depot, { strategicOnly: options.strategicOnly });
  if (!focus) return { builderUsed, decision, focus: null, issued: false };

  let issuedOffense = false;
  if (!builderUsed) {
    builderUsed = maybeQueueNydusEndpoint(s, player, cmds, budget, worker, focus.x, focus.y, findSpot);
  }
  if (!options.strategicOnly) castTacticalAbilities(s, player, cmds, casters, focus.x, focus.y);
  for (const unit of attackCandidates) {
    issuePressureEngagement(s, player, cmds, unit, focus);
    issuedOffense = true;
  }
  if (issuedOffense) markPressureCommitted(memory, s.tick);
  return { builderUsed, decision, focus, issued: issuedOffense };
};
