import {
  Kind,
  NONE,
  ONE,
  Order,
  Role,
  TILE,
  Units,
  eid,
  isCloaked,
  isDetectorKind,
  validateCommand,
  withinRangeSq,
  type Command,
  type Faction,
  type State,
} from '@rts/sim';
import {
  queueStructureBuild,
  queueStructureAtPoint,
  type MacroSpotFinder,
  type PointSpotFinder,
  type ResourceBudget,
  type StructureBlock,
} from './macro-build.ts';
import { missingStructureKinds, type BotFacts, type ProtectedRegion } from './macro.ts';
import type { BotFailureReason } from './macro-intents.ts';

const STATIC_DEFENSE_COVERAGE_TILES = 8;

type StaticDefensePlan = {
  finalKind: number;
  seedKind: number;
};

export type StaticDefenseQueueResult = {
  queued: boolean;
  usedBuilder: boolean;
  block?: StructureBlock;
};

const STATIC_DEFENSES_BY_RACE: Record<string, readonly StaticDefensePlan[]> = {
  Terran: [
    { finalKind: Kind.MissileTurret, seedKind: Kind.MissileTurret },
  ],
  Protoss: [
    { finalKind: Kind.PhotonCannon, seedKind: Kind.PhotonCannon },
  ],
  Zerg: [
    { finalKind: Kind.SunkenColony, seedKind: Kind.CreepColony },
    { finalKind: Kind.SporeColony, seedKind: Kind.CreepColony },
  ],
};

const staticDefensePlans = (faction: Faction): readonly StaticDefensePlan[] =>
  STATIC_DEFENSES_BY_RACE[faction.name] ?? [];

export const isStaticDefenseMacroKind = (faction: Faction, kind: number): boolean =>
  staticDefensePlans(faction).some((plan) => plan.finalKind === kind || plan.seedKind === kind);

const transformFailureReason = (reason: string): BotFailureReason => {
  switch (reason) {
    case 'not-affordable': return 'resource-starved';
    case 'missing-requirement': return 'missing-prerequisite';
    case 'queue-full': return 'no-production-capacity';
    case 'missing-capability':
    case 'stale-entity':
    case 'wrong-owner':
      return 'no-producer';
    case 'supply-blocked': return 'supply-blocked';
    default:
      return 'missing-prerequisite';
  }
};

const defenseAnswersThreat = (s: State, finalKind: number, threat: number): boolean => {
  const defense = Units[finalKind];
  const target = Units[s.e.kind[threat]!];
  if (!defense || !target) return false;
  if (isCloaked(s, threat)) return isDetectorKind(finalKind);
  if ((target.roles & Role.Air) !== 0) return defense.airWeapon !== null;
  return defense.weapon !== null;
};

const coverageRange = (finalKind: number): number => {
  const def = Units[finalKind]!;
  const weaponRange = Math.max(def.weapon?.range ?? 0, def.airWeapon?.range ?? 0);
  return Math.max(STATIC_DEFENSE_COVERAGE_TILES * TILE * ONE, weaponRange);
};

const coversRegion = (s: State, slot: number, region: ProtectedRegion, finalKind: number): boolean =>
  withinRangeSq(s.e.x[slot]!, s.e.y[slot]!, region.x, region.y, coverageRange(finalKind));

const pendingBuildCoversRegion = (s: State, slot: number, region: ProtectedRegion, finalKind: number): boolean =>
  withinRangeSq(s.e.tx[slot]!, s.e.ty[slot]!, region.x, region.y, coverageRange(finalKind));

const hasStaticDefenseCoverage = (
  s: State,
  player: number,
  plan: StaticDefensePlan,
  region: ProtectedRegion,
): boolean => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.owner[i] !== player) continue;
    if (e.kind[i] === plan.finalKind && coversRegion(s, i, region, plan.finalKind)) return true;
    if (e.kind[i] === plan.seedKind && e.built[i] !== 1 && coversRegion(s, i, region, plan.finalKind)) return true;
    if (e.order[i] === Order.Build && e.buildKind[i] === plan.seedKind && pendingBuildCoversRegion(s, i, region, plan.finalKind)) {
      return true;
    }
  }
  return false;
};

const firstDefenseRequest = (
  s: State,
  player: number,
  faction: Faction,
  facts: BotFacts,
): { plan: StaticDefensePlan; region: ProtectedRegion } | null => {
  const plans = staticDefensePlans(faction);
  if (plans.length === 0) return null;

  const threats = facts.protectedRegionThreats
    .map((threat) => ({ ...threat, regionDef: facts.protectedRegions[threat.region]! }))
    .sort((a, b) => b.regionDef.value - a.regionDef.value || a.enemy - b.enemy);

  for (const threat of threats) {
    for (const plan of plans) {
      if (!defenseAnswersThreat(s, plan.finalKind, threat.enemy)) continue;
      if (hasStaticDefenseCoverage(s, player, plan, threat.regionDef)) continue;
      return { plan, region: threat.regionDef };
    }
  }
  return null;
};

const nearbyMorphSeed = (
  s: State,
  player: number,
  plan: StaticDefensePlan,
  region: ProtectedRegion,
): number => {
  if (plan.seedKind === plan.finalKind) return NONE;
  const e = s.e;
  let best = NONE;
  let bestD = coverageRange(plan.finalKind) ** 2 + 1;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.owner[i] !== player || e.kind[i] !== plan.seedKind || e.built[i] !== 1) continue;
    const dx = e.x[i]! - region.x;
    const dy = e.y[i]! - region.y;
    const d = dx * dx + dy * dy;
    if (d < bestD || (d === bestD && i < best)) {
      best = i;
      bestD = d;
    }
  }
  return best;
};

const queueStaticDefenseMorph = (
  s: State,
  player: number,
  cmds: Command[],
  budget: ResourceBudget,
  seed: number,
  finalKind: number,
): StructureBlock | null => {
  const def = Units[finalKind]!;
  if (budget.minerals < def.minerals || budget.gas < def.gas) return { kind: finalKind, reason: 'resource-starved' };
  const command: Command = { t: 'transform', unit: eid(s.e, seed), kind: finalKind };
  const validation = validateCommand(s, player, command);
  if (!validation.ok) return { kind: finalKind, reason: transformFailureReason(validation.reason) };
  cmds.push(command);
  budget.minerals -= def.minerals;
  budget.gas -= def.gas;
  return null;
};

export const queueStaticDefense = (
  s: State,
  player: number,
  faction: Faction,
  facts: BotFacts,
  cmds: Command[],
  budget: ResourceBudget,
  worker: number,
  anchor: number,
  findMacroSpot: MacroSpotFinder,
  findSpot: PointSpotFinder,
): StaticDefenseQueueResult => {
  const request = firstDefenseRequest(s, player, faction, facts);
  if (!request) return { queued: false, usedBuilder: false };

  const missing = missingStructureKinds(facts, Units[request.plan.finalKind]!.requires);
  if (missing.length > 0) {
    const result = queueStructureBuild(s, player, cmds, budget, worker, anchor, missing[0]!, findMacroSpot, { role: 'tech-interior' });
    return { queued: result.queued, usedBuilder: result.queued, ...(result.block ? { block: result.block } : {}) };
  }

  const seed = nearbyMorphSeed(s, player, request.plan, request.region);
  if (seed !== NONE) {
    const block = queueStaticDefenseMorph(s, player, cmds, budget, seed, request.plan.finalKind);
    return { queued: block === null, usedBuilder: false, ...(block ? { block } : {}) };
  }

  const result = queueStructureAtPoint(
    s,
    player,
    cmds,
    budget,
    worker,
    request.plan.seedKind,
    request.region.x,
    request.region.y,
    findSpot,
    { role: 'static-defense' },
  );
  return { queued: result.queued, usedBuilder: result.queued, ...(result.block ? { block: result.block } : {}) };
};
