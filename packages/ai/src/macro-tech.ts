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

export const PROTOSS_TECH_STRUCTURE_MACRO = [
  Kind.CyberneticsCore,
  Kind.RoboticsFacility,
  Kind.RoboticsSupportBay,
  Kind.Observatory,
  Kind.Stargate,
  Kind.FleetBeacon,
  Kind.CitadelOfAdun,
  Kind.TemplarArchives,
  Kind.ArbiterTribunal,
] as const;

export const ZERG_TECH_STRUCTURE_MACRO = [
  Kind.HydraliskDen,
  Kind.EvolutionChamber,
  Kind.Spire,
  Kind.QueensNest,
  Kind.NydusCanal,
  Kind.DefilerMound,
  Kind.UltraliskCavern,
] as const;

const raceTechStructureKinds = (faction: Faction): readonly number[] => {
  if (faction.name === 'Protoss') return PROTOSS_TECH_STRUCTURE_MACRO;
  if (faction.name === 'Zerg') return ZERG_TECH_STRUCTURE_MACRO;
  return [];
};

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
): TechStructureQueueResult => {
  const techStructures = raceTechStructureKinds(faction);
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
