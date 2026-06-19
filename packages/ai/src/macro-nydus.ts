import {
  Kind,
  NONE,
  Role,
  UNLOAD_RANGE,
  Units,
  eid,
  sameTeam,
  validateCommand,
  withinRangeSq,
  type Command,
  type State,
} from '@rts/sim';
import type { PointSpotFinder, ResourceBudget } from './macro-build.ts';

export const maybeQueueNydusEndpoint = (
  s: State,
  player: number,
  cmds: Command[],
  budget: ResourceBudget,
  worker: number,
  focusX: number,
  focusY: number,
  findSpot: PointSpotFinder,
): boolean => {
  if (worker === NONE) return false;
  const def = Units[Kind.NydusCanal]!;
  if (budget.minerals < def.minerals || budget.gas < def.gas) return false;

  const e = s.e;
  let completedOwnEndpoints = 0;
  let hasEndpointNearFocus = false;
  let hasPendingEndpoint = false;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1) continue;
    if (e.kind[i] === Kind.NydusCanal) {
      if (!sameTeam(s, player, e.owner[i]!)) continue;
      if (e.built[i] === 1) {
        if (e.owner[i] === player) completedOwnEndpoints++;
        if (withinRangeSq(e.x[i]!, e.y[i]!, focusX, focusY, UNLOAD_RANGE)) hasEndpointNearFocus = true;
      } else if (e.owner[i] === player) {
        hasPendingEndpoint = true;
      }
      continue;
    }
    if (e.owner[i] === player && (e.flags[i]! & Role.Worker) !== 0 && e.buildKind[i] === Kind.NydusCanal) {
      hasPendingEndpoint = true;
    }
  }
  if (completedOwnEndpoints < 1 || hasEndpointNearFocus || hasPendingEndpoint) return false;

  const spot = findSpot(s, player, worker, Kind.NydusCanal, focusX, focusY);
  if (!spot) return false;
  const command: Command = { t: 'build', unit: eid(e, worker), kind: Kind.NydusCanal, x: spot.x, y: spot.y };
  if (!validateCommand(s, player, command).ok) return false;
  cmds.push(command);
  budget.minerals -= def.minerals;
  budget.gas -= def.gas;
  return true;
};
