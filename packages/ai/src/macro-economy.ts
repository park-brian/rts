import {
  NONE,
  ONE,
  Role,
  SUPPLY_CAP,
  TILE,
  Units,
  eid,
  supply,
  withinRangeSq,
  type Command,
  type Faction,
  type State,
  isqrt,
} from '@rts/sim';
import { maybeQueueStructureAtPoint, type PointSpotFinder, type ResourceBudget } from './macro-build.ts';
import { maybeQueueTrain, type SupplyBudget } from './macro-production.ts';

const WORKERS_PER_PATCH = 2;

const withinTiles = (s: State, slot: number, x: number, y: number, tiles: number): boolean =>
  withinRangeSq(s.e.x[slot]!, s.e.y[slot]!, x, y, tiles * TILE * ONE);

export const desiredWorkerCount = (
  s: State,
  depot: number,
  configuredTarget: number | undefined,
): number => {
  if (configuredTarget !== undefined) return configuredTarget;
  let patches = 0;
  for (let i = 0; i < s.e.hi; i++) {
    if (
      s.e.alive[i] === 1 &&
      (s.e.flags[i]! & Role.Resource) !== 0 &&
      withinTiles(s, i, s.e.x[depot]!, s.e.y[depot]!, 14)
    ) {
      patches++;
    }
  }
  return Math.max(8, Math.min(24, patches * WORKERS_PER_PATCH + 2));
};

export const maybeQueueWorkers = (
  s: State,
  player: number,
  cmds: Command[],
  budget: ResourceBudget,
  supplyBudget: SupplyBudget,
  producers: readonly number[],
  usedProducers: Set<number>,
  workerKind: number,
  currentWorkers: number,
  workerTarget: number,
): number => {
  let workers = currentWorkers;
  for (const producer of producers) {
    if (producer === NONE || workers >= workerTarget) continue;
    workers += maybeQueueTrain(s, player, cmds, budget, supplyBudget, [producer], usedProducers, workerKind);
  }
  return workers - currentWorkers;
};

export type SupplyQueueResult = {
  queued: boolean;
  usedBuilder: boolean;
};

export const maybeQueueSupply = (
  s: State,
  player: number,
  faction: Faction,
  cmds: Command[],
  budget: ResourceBudget,
  supplyBudget: SupplyBudget,
  idleLarvae: readonly number[],
  usedProducers: Set<number>,
  worker: number,
  depot: number,
  pendingSupply: number,
  findSpot: PointSpotFinder,
): SupplyQueueResult => {
  if (supplyBudget.max >= SUPPLY_CAP || supplyBudget.max - supplyBudget.used > supply(2) || pendingSupply !== 0) {
    return { queued: false, usedBuilder: false };
  }

  const def = Units[faction.supplyStructure]!;
  if (budget.minerals < def.minerals || budget.gas < def.gas) return { queued: false, usedBuilder: false };

  if (def.buildMethod === 'larva') {
    const queued = maybeQueueTrain(
      s,
      player,
      cmds,
      budget,
      supplyBudget,
      idleLarvae,
      usedProducers,
      faction.supplyStructure,
    ) > 0;
    return { queued, usedBuilder: false };
  }

  const queued = worker !== NONE &&
    maybeQueueStructureAtPoint(
      s,
      player,
      cmds,
      budget,
      worker,
      faction.supplyStructure,
      s.e.x[depot]!,
      s.e.y[depot]!,
      findSpot,
    );
  return { queued, usedBuilder: queued };
};

export const maybeSetArmyStructureRallies = (
  s: State,
  cmds: Command[],
  depot: number,
  structures: readonly number[],
): void => {
  if (!structures.length) return;
  const cx = Math.trunc((s.map.w * TILE * ONE) / 2);
  const cy = Math.trunc((s.map.h * TILE * ONE) / 2);
  const dx = cx - s.e.x[depot]!;
  const dy = cy - s.e.y[depot]!;
  const d = isqrt(dx * dx + dy * dy) || 1;
  const stage = 5 * TILE * ONE;
  const x = s.e.x[depot]! + Math.trunc((dx * stage) / d);
  const y = s.e.y[depot]! + Math.trunc((dy * stage) / d);
  for (const structure of structures) {
    if (s.e.rallyX[structure]! < 0) cmds.push({ t: 'rally', building: eid(s.e, structure), x, y });
  }
};
