import type { Command } from './commands.ts';
import { ResourceType, Role, Units } from './data.ts';
import { canAcceptCargo, sameTeam } from './cargo.ts';
import { resolveUnitRallyEndpoint, resolveWorkerRallyEndpoint } from './rally.ts';
import { canPlayerGatherTarget } from './resource-targets.ts';
import type { TravelEndpoint, TravelIntent } from './travel-intent.ts';
import { validateCommand } from './validation.ts';
import { NONE, isAlive, isEnemy, slotOf, type State } from './world.ts';

export type SmartCommandScheme = 'mobile' | 'desktop';

export type SmartCommandTarget = {
  hit: number;
  x: number;
  y: number;
};

export type ProducedUnitRallyIntent =
  | { kind: 'none' }
  | { kind: 'gather-near'; x: number; y: number }
  | { kind: 'gather-target'; target: number }
  | { kind: 'load'; transport: number; endpoint: TravelEndpoint }
  | { kind: 'travel'; endpoint: TravelEndpoint; intent: TravelIntent };

const endpointFromRally = (x: number, y: number, target: number): TravelEndpoint =>
  target === NONE ? { x, y } : { x, y, target };

const valid = (s: State, player: number, command: Command): Command[] =>
  validateCommand(s, player, command).ok ? [command] : [];

const firstValid = (s: State, player: number, commands: readonly Command[]): Command[] => {
  for (const command of commands) {
    if (validateCommand(s, player, command).ok) return [command];
  }
  return [];
};

export const smartCommandCandidates = (
  s: State,
  player: number,
  actor: number,
  target: SmartCommandTarget,
  scheme: SmartCommandScheme,
): Command[] => {
  void scheme;
  const e = s.e;
  if (!isAlive(e, actor)) return [];
  const actorSlot = slotOf(actor);
  const targetSlot = target.hit >= 0 && isAlive(e, target.hit) ? slotOf(target.hit) : -1;
  const actorIsStructure = (e.flags[actorSlot]! & Role.Structure) !== 0;

  if (targetSlot >= 0) {
    const commands: Command[] = [];
    if (isEnemy(s, player, e.owner[targetSlot]!)) {
      commands.push({ t: 'attack', unit: actor, target: target.hit });
    }
    if (canPlayerGatherTarget(s, player, target.hit)) {
      commands.push({ t: 'harvest', unit: actor, patch: target.hit });
    }
    commands.push(
      { t: 'repair', unit: actor, target: target.hit },
      { t: 'load', transport: target.hit, unit: actor },
      { t: 'load', transport: actor, unit: target.hit },
    );

    if (actorIsStructure) {
      commands.push({ t: 'rally', building: actor, x: target.x, y: target.y, target: target.hit });
    } else {
      commands.push({ t: 'move', unit: actor, x: target.x, y: target.y, target: target.hit });
    }

    const candidate = firstValid(s, player, commands);
    if (candidate.length > 0) return candidate;
  }

  if (actorIsStructure) return valid(s, player, { t: 'rally', building: actor, x: target.x, y: target.y });
  return valid(s, player, { t: 'move', unit: actor, x: target.x, y: target.y });
};

export const attackModeCandidates = (
  s: State,
  player: number,
  actor: number,
  target: SmartCommandTarget,
): Command[] => {
  const e = s.e;
  if (!isAlive(e, actor)) return [];
  const targetSlot = target.hit >= 0 && isAlive(e, target.hit) ? slotOf(target.hit) : -1;
  if (targetSlot >= 0 && sameTeam(s, player, e.owner[targetSlot]!)) return [];
  return targetSlot >= 0 && isEnemy(s, player, e.owner[targetSlot]!)
    ? valid(s, player, { t: 'attack', unit: actor, target: target.hit })
    : valid(s, player, { t: 'amove', unit: actor, x: target.x, y: target.y });
};

export const producedUnitRallyIntent = (
  s: State,
  producer: number,
  unit: number,
): ProducedUnitRallyIntent => {
  const e = s.e;
  const isWorker = (e.flags[unit]! & Role.Worker) !== 0;
  const workerRally = isWorker ? resolveWorkerRallyEndpoint(s, producer, unit) : null;
  const unitRally = resolveUnitRallyEndpoint(s, producer, unit);

  if (workerRally) {
    const target = workerRally.target;
    if (target !== NONE && Units[e.kind[target]!]!.resourceType === ResourceType.Gas) {
      return { kind: 'gather-target', target };
    }
    return { kind: 'gather-near', x: workerRally.x, y: workerRally.y };
  }

  if (isWorker && !unitRally) {
    return { kind: 'gather-near', x: e.x[unit]!, y: e.y[unit]! };
  }

  if (!unitRally) return { kind: 'none' };
  const endpoint = endpointFromRally(unitRally.x, unitRally.y, unitRally.target);
  if (unitRally.target !== NONE && canAcceptCargo(s, unitRally.target, unit)) {
    return { kind: 'load', transport: unitRally.target, endpoint };
  }
  return { kind: 'travel', endpoint, intent: isWorker ? 'move' : 'smart' };
};
