import {
  Kind,
  NONE,
  ONE,
  Order,
  Role,
  SUPPLY_CAP,
  TILE,
  Units,
  eid,
  isLarvaProductKind,
  supply,
  validateCommand,
  withinRangeSq,
  type Command,
  type Faction,
  type State,
  isqrt,
} from '@rts/sim';
import {
  maybeQueueStructureAtPoint,
  queueStructureAtPoint,
  queueStructureBuild,
  type MacroSpotFinder,
  type PointSpotFinder,
  type ResourceBudget,
  type StructureBlock,
} from './macro-build.ts';
import { maybeQueueTrain, trainFailureReason, type SupplyBudget } from './macro-production.ts';

const WORKERS_PER_PATCH = 2;

const withinTiles = (s: State, slot: number, x: number, y: number, tiles: number): boolean =>
  withinRangeSq(s.e.x[slot]!, s.e.y[slot]!, x, y, tiles * TILE * ONE);

export type EconomyRoster = {
  builtDepots: number[];
  idleDepots: number[];
  builtArmyStructures: number[];
  pendingArmyStructures: number;
  pendingSupply: number;
  builder: number;
};

export const summarizeEconomyRoster = (s: State, player: number, faction: Faction): EconomyRoster => {
  const e = s.e;
  const roster: EconomyRoster = {
    builtDepots: [],
    idleDepots: [],
    builtArmyStructures: [],
    pendingArmyStructures: 0,
    pendingSupply: 0,
    builder: NONE,
  };

  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.container[i] !== NONE || e.owner[i] !== player) continue;
    const kind = e.kind[i]!;
    const flags = e.flags[i]!;
    if (e.prodKind[i] === faction.supplyStructure) roster.pendingSupply++;
    if (kind === faction.worker) {
      if (roster.builder === NONE && e.order[i] === Order.Harvest) roster.builder = i;
      if ((flags & Role.Worker) !== 0 && e.buildKind[i] === faction.supplyStructure) roster.pendingSupply++;
      if ((flags & Role.Worker) !== 0 && e.buildKind[i] === faction.armyStructure) roster.pendingArmyStructures++;
    } else if (kind === faction.depot && e.built[i] === 1) {
      roster.builtDepots.push(i);
      if (e.prodKind[i] === Kind.None) roster.idleDepots.push(i);
    } else if (kind === faction.armyStructure) {
      if (e.built[i] === 1) roster.builtArmyStructures.push(i);
      else roster.pendingArmyStructures++;
    } else if (kind === faction.supplyStructure && e.built[i] !== 1) {
      roster.pendingSupply++;
    }
  }

  return roster;
};

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
  block?: StructureBlock;
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
  if (budget.minerals < def.minerals || budget.gas < def.gas) {
    return {
      queued: false,
      usedBuilder: false,
      block: { kind: faction.supplyStructure, reason: 'resource-starved' },
    };
  }

  if (isLarvaProductKind(faction.supplyStructure)) {
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
    return {
      queued,
      usedBuilder: false,
      ...(queued ? {} : {
        block: {
          kind: faction.supplyStructure,
          reason: trainFailureReason(
            s,
            player,
            idleLarvae,
            usedProducers,
            budget,
            supplyBudget,
            faction.supplyStructure,
          ) ?? 'no-production-capacity',
        },
      }),
    };
  }

  const result = queueStructureAtPoint(
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
  return { queued: result.queued, usedBuilder: result.queued, ...(result.block ? { block: result.block } : {}) };
};

export const queueArmyStructure = (
  s: State,
  player: number,
  faction: Faction,
  cmds: Command[],
  budget: ResourceBudget,
  worker: number,
  depot: number,
  built: number,
  pending: number,
  target: number,
  findMacroSpot: MacroSpotFinder,
): { queued: boolean; block?: StructureBlock } => {
  if (isLarvaProductKind(faction.armyStructure)) return { queued: false };
  const desired = isLarvaProductKind(faction.armyUnit) ? Math.min(target, 1) : target;
  if (built + pending >= desired) return { queued: false };
  return queueStructureBuild(s, player, cmds, budget, worker, depot, faction.armyStructure, findMacroSpot);
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
  const player = s.e.owner[depot]!;
  for (const structure of structures) {
    const command: Command = { t: 'rally', building: eid(s.e, structure), x, y };
    if (s.e.rallyX[structure]! < 0 && validateCommand(s, player, command).ok) cmds.push(command);
  }
};
