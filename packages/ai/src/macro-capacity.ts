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
const ZERG_STALLED_MACRO_HATCHERY_BANK = 300;
const ZERG_MACRO_HATCHERY_STEP = 600;
const ZERG_MACRO_HATCHERY_MAX = 6;
const CORE_PRODUCTION_BANK = 700;
const CORE_STALLED_PRODUCTION_BANK = 300;
const CORE_PRODUCTION_STEP = 500;
const CORE_PRODUCTION_MAX = 8;
const CAPACITY_PRESSURE_STEP = 6;
const CAPACITY_PRESSURE_BANK_DISCOUNT = 100;

const capacityPressureLevel = (pressure: CapacityPressure): number =>
  Math.ceil(Math.max(0, pressure.productionThroughputPressure ?? 0) / CAPACITY_PRESSURE_STEP);

const capacityBank = (normal: number, stalled: number, pressure: CapacityPressure): number => {
  if (pressure.productionStalled) return stalled;
  return Math.max(stalled, normal - capacityPressureLevel(pressure) * CAPACITY_PRESSURE_BANK_DISCOUNT);
};

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

const pendingStructureCount = (s: State, player: number, kind: number): number => {
  const e = s.e;
  let count = 0;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.owner[i] !== player) continue;
    if (e.kind[i] === kind && e.built[i] !== 1) count++;
    if ((e.flags[i]! & Role.Worker) !== 0 && e.buildKind[i] === kind) count++;
  }
  return count;
};

export type CapacityQueueResult = {
  queued: boolean;
  block?: StructureBlock;
};

export type CapacityPressure = {
  productionStalled?: boolean;
  productionThroughputPressure?: number;
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
  pressure: CapacityPressure = {},
): CapacityQueueResult => {
  if (faction.name === 'Zerg' || baseTarget <= 0) return { queued: false };
  const bank = capacityBank(CORE_PRODUCTION_BANK, CORE_STALLED_PRODUCTION_BANK, pressure);
  if (budget.minerals < bank) return { queued: false };

  const desired = Math.min(
    CORE_PRODUCTION_MAX,
    baseTarget + 1 + capacityPressureLevel(pressure) + Math.trunc((budget.minerals - bank) / CORE_PRODUCTION_STEP),
  );
  if (ownedOrPendingStructureCount(s, player, faction.armyStructure) >= desired) return { queued: false };
  return queueStructureBuild(s, player, cmds, budget, worker, anchor, faction.armyStructure, findMacroSpot, { role: 'production-block' });
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
  pressure: CapacityPressure = {},
): CapacityQueueResult => {
  if (faction.name !== 'Zerg') return { queued: false };
  if (remainingIdleLarvae(idleLarvae, usedProducers) > 0) return { queued: false };
  if (pendingStructureCount(s, player, Kind.Hatchery) > 0) return { queued: false };
  const bank = capacityBank(ZERG_MACRO_HATCHERY_BANK, ZERG_STALLED_MACRO_HATCHERY_BANK, pressure);
  if (budget.minerals < bank) return { queued: false };

  const desired = Math.min(
    ZERG_MACRO_HATCHERY_MAX,
    2 + capacityPressureLevel(pressure) + Math.trunc((budget.minerals - bank) / ZERG_MACRO_HATCHERY_STEP),
  );
  if (larvaCapacityCount(s, player) >= desired) return { queued: false };
  return queueStructureBuild(s, player, cmds, budget, worker, anchor, Kind.Hatchery, findMacroSpot, { role: 'macro-hatchery' });
};
