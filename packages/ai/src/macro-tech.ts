import {
  Kind,
  type Command,
  type Faction,
  type State,
} from '@rts/sim';
import { missingStructureKinds, type BotFacts } from './macro.ts';
import {
  queueStructureBuild,
  type MacroSpotFinder,
  type ResourceBudget,
  type StructureBlock,
} from './macro-build.ts';
import type { BotStrategyPosture, BotTechTarget } from './macro-strategy.ts';

type TechStructurePlanEntry = {
  kind: number;
  scores?: Partial<Record<BotTechTarget, number>>;
};

const techEntry = (
  kind: number,
  scores: Partial<Record<BotTechTarget, number>> = {},
): TechStructurePlanEntry => ({ kind, scores });

const PROTOSS_TECH_STRUCTURE_PLAN = [
  techEntry(Kind.CyberneticsCore, { 'first-combat': 60, 'combat-production': 45, 'counter-tech': 35 }),
  techEntry(Kind.RoboticsFacility, { 'counter-tech': 45, 'combat-production': 20 }),
  techEntry(Kind.RoboticsSupportBay, { 'counter-tech': 25 }),
  techEntry(Kind.Observatory, { 'counter-tech': 50 }),
  techEntry(Kind.Stargate, { 'counter-tech': 42 }),
  techEntry(Kind.FleetBeacon, { 'counter-tech': 30 }),
  techEntry(Kind.CitadelOfAdun, { 'counter-tech': 28 }),
  techEntry(Kind.TemplarArchives, { 'counter-tech': 38 }),
  techEntry(Kind.ArbiterTribunal, { 'counter-tech': 40 }),
] as const;

const ZERG_TECH_STRUCTURE_PLAN = [
  techEntry(Kind.HydraliskDen, { 'first-combat': 60, 'combat-production': 45, 'counter-tech': 35 }),
  techEntry(Kind.EvolutionChamber, { 'economy-scale': 15, 'counter-tech': 10 }),
  techEntry(Kind.Spire, { 'counter-tech': 55, 'combat-production': 25 }),
  techEntry(Kind.QueensNest, { 'counter-tech': 30 }),
  techEntry(Kind.NydusCanal, { 'counter-tech': 28 }),
  techEntry(Kind.DefilerMound, { 'counter-tech': 50 }),
  techEntry(Kind.UltraliskCavern, { 'counter-tech': 45 }),
] as const;

export const PROTOSS_TECH_STRUCTURE_MACRO = PROTOSS_TECH_STRUCTURE_PLAN.map((entry) => entry.kind);
export const ZERG_TECH_STRUCTURE_MACRO = ZERG_TECH_STRUCTURE_PLAN.map((entry) => entry.kind);

const raceTechStructurePlan = (faction: Faction): readonly TechStructurePlanEntry[] => {
  if (faction.name === 'Protoss') return PROTOSS_TECH_STRUCTURE_PLAN;
  if (faction.name === 'Zerg') return ZERG_TECH_STRUCTURE_PLAN;
  return [];
};

export const rankRaceTechStructureKinds = (
  faction: Faction,
  strategy?: BotStrategyPosture,
): number[] =>
  raceTechStructurePlan(faction)
    .map((entry, order) => ({
      entry,
      order,
      score: strategy ? entry.scores?.[strategy.techTarget] ?? 0 : 0,
    }))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map(({ entry }) => entry.kind);

export type TechStructureQueueResult = {
  queued: boolean;
  block?: StructureBlock;
};

const hasCompletedStructure = (s: State, player: number, kind: number): boolean => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.owner[i] === player && e.kind[i] === kind && e.built[i] === 1) return true;
  }
  return false;
};

export const queueRaceTechStructure = (
  s: State,
  player: number,
  faction: Faction,
  facts: BotFacts,
  cmds: Command[],
  budget: ResourceBudget,
  worker: number,
  anchor: number,
  findMacroSpot: MacroSpotFinder,
  strategy?: BotStrategyPosture,
): TechStructureQueueResult => {
  const techStructures = rankRaceTechStructureKinds(faction, strategy);
  if (techStructures.length === 0) return { queued: false };
  if (faction.name === 'Zerg' && !hasCompletedStructure(s, player, Kind.SpawningPool)) return { queued: false };
  let firstBlock: StructureBlock | undefined;
  for (const kind of missingStructureKinds(facts, techStructures)) {
    const result = queueStructureBuild(s, player, cmds, budget, worker, anchor, kind, findMacroSpot);
    if (result.queued) return { queued: true };
    firstBlock ??= result.block;
  }
  return { queued: false, ...(firstBlock ? { block: firstBlock } : {}) };
};
