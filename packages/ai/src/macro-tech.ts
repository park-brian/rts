import {
  Kind,
  NONE,
  type Command,
  type Faction,
  type State,
} from '@rts/sim';
import { missingStructureKinds, type BotFacts } from './macro.ts';
import {
  maybeQueueStructureBuild,
  type MacroSpotFinder,
  type ResourceBudget,
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

export const maybeQueueRaceTechStructure = (
  s: State,
  player: number,
  faction: Faction,
  facts: BotFacts,
  cmds: Command[],
  budget: ResourceBudget,
  worker: number,
  anchor: number,
  findMacroSpot: MacroSpotFinder,
): boolean => {
  if (worker === NONE) return false;
  const techStructures = raceTechStructureKinds(faction);
  if (techStructures.length === 0) return false;
  for (const kind of missingStructureKinds(facts, techStructures)) {
    if (maybeQueueStructureBuild(s, player, cmds, budget, worker, anchor, kind, findMacroSpot)) return true;
  }
  return false;
};
