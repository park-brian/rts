import {
  Units,
  eid,
  validateCommand,
  type Command,
  type State,
} from '@rts/sim';

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

const maybeQueueStructureAtSpot = (
  s: State,
  player: number,
  cmds: Command[],
  budget: ResourceBudget,
  worker: number,
  kind: number,
  spot: { x: number; y: number } | null,
): boolean => {
  const def = Units[kind]!;
  if (budget.minerals < def.minerals || budget.gas < def.gas || !spot) return false;
  const command: Command = { t: 'build', unit: eid(s.e, worker), kind, x: spot.x, y: spot.y };
  if (!validateCommand(s, player, command).ok) return false;
  cmds.push(command);
  budget.minerals -= def.minerals;
  budget.gas -= def.gas;
  return true;
};

export const maybeQueueStructureBuild = (
  s: State,
  player: number,
  cmds: Command[],
  budget: ResourceBudget,
  worker: number,
  anchor: number,
  kind: number,
  findMacroSpot: MacroSpotFinder,
): boolean => {
  return maybeQueueStructureAtSpot(
    s,
    player,
    cmds,
    budget,
    worker,
    kind,
    findMacroSpot(s, player, worker, kind, anchor),
  );
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
