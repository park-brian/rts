import {
  Kind,
  NONE,
  Role,
  Units,
  eid,
  isLarvaSourceKind,
  validateCommand,
  type Command,
  type Faction,
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

const maybeQueueStructureBuild = (
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

export const maybeQueueCoreProductionCapacity = (
  s: State,
  player: number,
  faction: Faction,
  cmds: Command[],
  budget: ResourceBudget,
  worker: number,
  anchor: number,
  baseTarget: number,
  findMacroSpot: MacroSpotFinder,
): boolean => {
  if (faction.name === 'Zerg' || baseTarget <= 0 || worker === NONE) return false;
  if (budget.minerals < CORE_PRODUCTION_BANK) return false;

  const desired = Math.min(
    CORE_PRODUCTION_MAX,
    baseTarget + 1 + Math.trunc((budget.minerals - CORE_PRODUCTION_BANK) / CORE_PRODUCTION_STEP),
  );
  if (ownedOrPendingStructureCount(s, player, faction.armyStructure) >= desired) return false;

  return maybeQueueStructureBuild(s, player, cmds, budget, worker, anchor, faction.armyStructure, findMacroSpot);
};

export const maybeQueueZergMacroHatchery = (
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
): boolean => {
  if (faction.name !== 'Zerg') return false;
  if (worker === NONE || remainingIdleLarvae(idleLarvae, usedProducers) > 0) return false;
  if (budget.minerals < ZERG_MACRO_HATCHERY_BANK) return false;

  const desired = Math.min(
    ZERG_MACRO_HATCHERY_MAX,
    2 + Math.trunc((budget.minerals - ZERG_MACRO_HATCHERY_BANK) / ZERG_MACRO_HATCHERY_STEP),
  );
  if (larvaCapacityCount(s, player) >= desired) return false;

  return maybeQueueStructureBuild(s, player, cmds, budget, worker, anchor, Kind.Hatchery, findMacroSpot);
};
