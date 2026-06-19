import {
  Kind,
  Role,
  isLarvaSourceKind,
  type Command,
  type Faction,
  type State,
} from '@rts/sim';
import {
  queueStructureBuild,
  type MacroSpotFinder,
  type ResourceBudget,
  type StructureBlock,
} from './macro-build.ts';

const ZERG_MACRO_HATCHERY_BANK = 800;
const ZERG_MACRO_HATCHERY_STEP = 600;
const ZERG_MACRO_HATCHERY_MAX = 6;
const CORE_PRODUCTION_BANK = 700;
const CORE_PRODUCTION_STEP = 500;
const CORE_PRODUCTION_MAX = 8;

const larvaCapacityCount = (s: State, player: number): number => {
  const e = s.e;
  let count = 0;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.owner[i] !== player) continue;
    if (isLarvaSourceKind(e.kind[i]!)) {
      count++;
      continue;
    }
    if ((e.flags[i]! & Role.Worker) !== 0 && e.buildKind[i] === Kind.Hatchery) count++;
  }
  return count;
};

const remainingIdleLarvae = (idleLarvae: readonly number[], usedProducers: Set<number>): number => {
  let count = 0;
  for (const larva of idleLarvae) {
    if (!usedProducers.has(larva)) count++;
  }
  return count;
};

const ownedOrPendingStructureCount = (s: State, player: number, kind: number): number => {
  const e = s.e;
  let count = 0;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.owner[i] !== player) continue;
    if (e.kind[i] === kind) {
      count++;
      continue;
    }
    if ((e.flags[i]! & Role.Worker) !== 0 && e.buildKind[i] === kind) count++;
  }
  return count;
};

export type CapacityQueueResult = {
  queued: boolean;
  block?: StructureBlock;
};

export const queueCoreProductionCapacity = (
  s: State,
  player: number,
  faction: Faction,
  cmds: Command[],
  budget: ResourceBudget,
  worker: number,
  anchor: number,
  baseTarget: number,
  findMacroSpot: MacroSpotFinder,
): CapacityQueueResult => {
  if (faction.name === 'Zerg' || baseTarget <= 0) return { queued: false };
  if (budget.minerals < CORE_PRODUCTION_BANK) return { queued: false };

  const desired = Math.min(
    CORE_PRODUCTION_MAX,
    baseTarget + 1 + Math.trunc((budget.minerals - CORE_PRODUCTION_BANK) / CORE_PRODUCTION_STEP),
  );
  if (ownedOrPendingStructureCount(s, player, faction.armyStructure) >= desired) return { queued: false };
  return queueStructureBuild(s, player, cmds, budget, worker, anchor, faction.armyStructure, findMacroSpot);
};

export const queueZergMacroHatchery = (
  s: State,
  player: number,
  faction: Faction,
  cmds: Command[],
  budget: ResourceBudget,
  worker: number,
  anchor: number,
  idleLarvae: readonly number[],
  usedProducers: Set<number>,
  findMacroSpot: MacroSpotFinder,
): CapacityQueueResult => {
  if (faction.name !== 'Zerg') return { queued: false };
  if (remainingIdleLarvae(idleLarvae, usedProducers) > 0) return { queued: false };
  if (budget.minerals < ZERG_MACRO_HATCHERY_BANK) return { queued: false };

  const desired = Math.min(
    ZERG_MACRO_HATCHERY_MAX,
    2 + Math.trunc((budget.minerals - ZERG_MACRO_HATCHERY_BANK) / ZERG_MACRO_HATCHERY_STEP),
  );
  if (larvaCapacityCount(s, player) >= desired) return { queued: false };
  return queueStructureBuild(s, player, cmds, budget, worker, anchor, Kind.Hatchery, findMacroSpot);
};
