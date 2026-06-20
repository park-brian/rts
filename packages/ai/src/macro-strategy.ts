import { Units, type Faction } from '@rts/sim';
import { gasStructureKind } from './macro-gas.ts';
import type { BotFacts } from './macro.ts';

export type BotStrategyPostureName =
  | 'opening'
  | 'ramp'
  | 'expand'
  | 'defend'
  | 'pressure'
  | 'recover';

export type BotStrategyPriority = 'low' | 'normal' | 'high';
export type BotStrategyTolerance = 'low' | 'normal' | 'high';
export type BotGasTiming = 'defer' | 'soon' | 'now';
export type BotTechTarget =
  | 'first-combat'
  | 'combat-production'
  | 'economy-scale'
  | 'counter-tech'
  | 'none';

export type BotStrategyPosture = {
  name: BotStrategyPostureName;
  workerTarget: number;
  attackThreshold: number;
  expansionPriority: BotStrategyPriority;
  gasTiming: BotGasTiming;
  productionRatio: number;
  techTarget: BotTechTarget;
  staticDefenseTolerance: BotStrategyTolerance;
  retreatTolerance: BotStrategyTolerance;
  harassmentAppetite: BotStrategyPriority;
  reasons: string[];
};

export type BotStrategyOptions = {
  workerTarget: number;
  attackThreshold: number;
};

const posture = (
  name: BotStrategyPostureName,
  options: BotStrategyOptions,
  fields: Omit<BotStrategyPosture, 'name' | 'workerTarget' | 'attackThreshold'>,
): BotStrategyPosture => ({
  name,
  workerTarget: options.workerTarget,
  attackThreshold: options.attackThreshold,
  ...fields,
});

const gasTimingFor = (facts: BotFacts, faction: Faction): BotGasTiming => {
  if (facts.gas >= 100) return 'now';
  const gasStructure = gasStructureKind(faction);
  const hasGasAccess = facts.ownedOrPendingStructureKinds.has(gasStructure);
  const armyUnit = Units[faction.armyUnit];
  if (armyUnit && armyUnit.gas > 0 && facts.gas < armyUnit.gas) return 'soon';
  if (hasGasAccess) return 'soon';
  if (facts.army.length > 0 && facts.ownedOrPendingStructureKinds.has(faction.armyStructure)) return 'soon';
  return 'defer';
};

export const botStrategyPosture = (
  faction: Faction,
  facts: BotFacts,
  options: BotStrategyOptions,
): BotStrategyPosture => {
  const gasTiming = gasTimingFor(facts, faction);
  const resourceFloat = facts.minerals + facts.gas;
  const hasCombatPath = facts.ownedOrPendingStructureKinds.has(faction.armyStructure);
  const localThreats = facts.baseThreats.length + facts.protectedRegionThreats.length;

  if (facts.bases.length === 0) {
    return posture('recover', options, {
      expansionPriority: 'high',
      gasTiming,
      productionRatio: 0.25,
      techTarget: 'economy-scale',
      staticDefenseTolerance: 'low',
      retreatTolerance: 'high',
      harassmentAppetite: 'low',
      reasons: ['no completed base is available'],
    });
  }

  if (localThreats > 0) {
    return posture('defend', options, {
      expansionPriority: 'low',
      gasTiming,
      productionRatio: 0.75,
      techTarget: hasCombatPath ? 'combat-production' : 'first-combat',
      staticDefenseTolerance: 'high',
      retreatTolerance: 'high',
      harassmentAppetite: 'low',
      reasons: [`${localThreats} local protected-region threats`],
    });
  }

  if (facts.army.length >= options.attackThreshold) {
    return posture('pressure', options, {
      expansionPriority: resourceFloat >= 800 ? 'normal' : 'low',
      gasTiming,
      productionRatio: 1,
      techTarget: 'counter-tech',
      staticDefenseTolerance: 'normal',
      retreatTolerance: 'low',
      harassmentAppetite: 'high',
      reasons: [`army size ${facts.army.length} reached attack threshold ${options.attackThreshold}`],
    });
  }

  if (!hasCombatPath || facts.army.length === 0) {
    return posture('opening', options, {
      expansionPriority: 'low',
      gasTiming,
      productionRatio: 0.5,
      techTarget: 'first-combat',
      staticDefenseTolerance: 'normal',
      retreatTolerance: 'normal',
      harassmentAppetite: 'low',
      reasons: hasCombatPath ? ['first combat unit is not fielded yet'] : ['first combat production path is not available'],
    });
  }

  if (resourceFloat >= 800 && facts.workers.length >= options.workerTarget) {
    return posture('expand', options, {
      expansionPriority: 'high',
      gasTiming,
      productionRatio: 0.75,
      techTarget: 'economy-scale',
      staticDefenseTolerance: 'normal',
      retreatTolerance: 'normal',
      harassmentAppetite: 'normal',
      reasons: [`${resourceFloat} resources banked with worker target met`],
    });
  }

  return posture('ramp', options, {
    expansionPriority: 'normal',
    gasTiming,
    productionRatio: 1,
    techTarget: 'combat-production',
    staticDefenseTolerance: 'normal',
    retreatTolerance: 'normal',
    harassmentAppetite: 'normal',
    reasons: [`army size ${facts.army.length} is below attack threshold ${options.attackThreshold}`],
  });
};
