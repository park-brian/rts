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
  const def = Units[kind]!;
  if (budget.minerals < def.minerals || budget.gas < def.gas) return false;
  const spot = findMacroSpot(s, player, worker, kind, anchor);
  if (!spot) return false;
  const command: Command = { t: 'build', unit: eid(s.e, worker), kind, x: spot.x, y: spot.y };
  if (!validateCommand(s, player, command).ok) return false;
  cmds.push(command);
  budget.minerals -= def.minerals;
  budget.gas -= def.gas;
  return true;
};
