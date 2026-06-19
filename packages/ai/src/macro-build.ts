import {
  Units,
  eid,
  validateCommand,
  type Command,
  type State,
} from '@rts/sim';
import type { BotFailureReason } from './macro-intents.ts';

export type ResourceBudget = { minerals: number; gas: number };

export type MacroSpotFinder = (
  s: State,
  player: number,
  worker: number,
  kind: number,
  fallback: number,
) => { x: number; y: number } | null;

export type PointSpotFinder = (
  s: State,
  player: number,
  worker: number,
  kind: number,
  x: number,
  y: number,
) => { x: number; y: number } | null;

export type StructureBlock = {
  kind: number;
  reason: BotFailureReason;
  x?: number;
  y?: number;
};

export type StructureQueueResult = {
  queued: boolean;
  block?: StructureBlock;
};

const buildFailureReason = (reason: string): BotFailureReason => {
  switch (reason) {
    case 'not-affordable': return 'resource-starved';
    case 'missing-requirement': return 'missing-prerequisite';
    case 'placement-blocked':
    case 'placement-off-map':
    case 'placement-requires-geyser':
      return 'occupied-location';
    case 'capacity-full':
    case 'queue-full':
    case 'incomplete-producer':
      return 'no-production-capacity';
    case 'missing-capability':
    case 'stale-entity':
    case 'wrong-owner':
      return 'no-builder';
    default:
      return 'missing-prerequisite';
  }
};

export const queueStructureAtSpot = (
  s: State,
  player: number,
  cmds: Command[],
  budget: ResourceBudget,
  worker: number,
  kind: number,
  spot: { x: number; y: number } | null,
): StructureQueueResult => {
  const def = Units[kind]!;
  if (worker < 0) return { queued: false, block: { kind, reason: 'no-builder' } };
  if (budget.minerals < def.minerals || budget.gas < def.gas) {
    return { queued: false, block: { kind, reason: 'resource-starved' } };
  }
  if (!spot) return { queued: false, block: { kind, reason: 'placement-unavailable' } };
  const command: Command = { t: 'build', unit: eid(s.e, worker), kind, x: spot.x, y: spot.y };
  const validation = validateCommand(s, player, command);
  if (!validation.ok) {
    return {
      queued: false,
      block: { kind, reason: buildFailureReason(validation.reason), x: spot.x, y: spot.y },
    };
  }
  cmds.push(command);
  budget.minerals -= def.minerals;
  budget.gas -= def.gas;
  return { queued: true };
};

const maybeQueueStructureAtSpot = (
  s: State,
  player: number,
  cmds: Command[],
  budget: ResourceBudget,
  worker: number,
  kind: number,
  spot: { x: number; y: number } | null,
): boolean => {
  return queueStructureAtSpot(s, player, cmds, budget, worker, kind, spot).queued;
};

export const queueStructureBuild = (
  s: State,
  player: number,
  cmds: Command[],
  budget: ResourceBudget,
  worker: number,
  anchor: number,
  kind: number,
  findMacroSpot: MacroSpotFinder,
): StructureQueueResult => {
  if (worker < 0) return { queued: false, block: { kind, reason: 'no-builder' } };
  return queueStructureAtSpot(s, player, cmds, budget, worker, kind, findMacroSpot(s, player, worker, kind, anchor));
};

export const maybeQueueStructureAtPoint = (
  s: State,
  player: number,
  cmds: Command[],
  budget: ResourceBudget,
  worker: number,
  kind: number,
  x: number,
  y: number,
  findSpot: PointSpotFinder,
): boolean =>
  maybeQueueStructureAtSpot(s, player, cmds, budget, worker, kind, findSpot(s, player, worker, kind, x, y));

export const queueStructureAtPoint = (
  s: State,
  player: number,
  cmds: Command[],
  budget: ResourceBudget,
  worker: number,
  kind: number,
  x: number,
  y: number,
  findSpot: PointSpotFinder,
): StructureQueueResult => {
  if (worker < 0) return { queued: false, block: { kind, reason: 'no-builder' } };
  return queueStructureAtSpot(s, player, cmds, budget, worker, kind, findSpot(s, player, worker, kind, x, y));
};
