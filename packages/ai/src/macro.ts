import {
  Kind,
  NONE,
  ONE,
  Order,
  Role,
  TILE,
  Units,
  eid,
  hasAnyWeapon,
  isEnemy,
  isLarvaSourceKind,
  withinRangeSq,
  type Command,
  type Controller,
  type Faction,
  type State,
} from '@rts/sim';
import type { TacticalIncident } from './macro-incidents.ts';
import type { BotFailureReason } from './macro-intents.ts';
import { buildRiskMap, type BotRiskMap } from './macro-risk.ts';

export type BotThreat = {
  base: number;
  enemy: number;
};

export type ProtectedRegionKind = 'base' | 'mineral-line';

export type ProtectedRegion = {
  kind: ProtectedRegionKind;
  anchor: number;
  x: number;
  y: number;
  radiusTiles: number;
  value: number;
};

export type ProtectedRegionThreat = {
  region: number;
  enemy: number;
};

export type BotFactsOptions = {
  risk?: 'full' | 'none';
};

export type BotFacts = {
  tick: number;
  player: number;
  minerals: number;
  gas: number;
  supplyUsed: number;
  supplyMax: number;
  primaryBase: number;
  bases: number[];
  workers: number[];
  idleWorkers: number[];
  larvae: number[];
  idleLarvae: number[];
  idleProducers: number[];
  army: number[];
  retaskableArmy: number[];
  casters: number[];
  visibleEnemies: number[];
  protectedRegions: ProtectedRegion[];
  enemyProtectedRegions: ProtectedRegion[];
  protectedRegionThreats: ProtectedRegionThreat[];
  baseThreats: BotThreat[];
  risk: BotRiskMap;
  ownedOrPendingStructureKinds: Set<number>;
};

export type BotMemory = {
  lastTick: number;
  blockedSites: Map<string, { reason: BotFailureReason; tick: number }>;
  suspectedInvisibleThreats: Map<string, { x: number; y: number; tick: number }>;
  tacticalIncidents: Map<string, TacticalIncident>;
  tacticalCommitments: Map<string, { unitIds: number[]; expiresAt: number }>;
  offenseWaitSince: number;
};

export const createBotMemory = (): BotMemory => ({
  lastTick: -1,
  blockedSites: new Map(),
  suspectedInvisibleThreats: new Map(),
  tacticalIncidents: new Map(),
  tacticalCommitments: new Map(),
  offenseWaitSince: -1,
});

const BASE_THREAT_TILES = 18;
const MINERAL_LINE_TILES = 6;
const MINERAL_LINE_RESOURCE_TILES = 14;

export const canRetaskArmy = (s: State, slot: number): boolean => {
  const e = s.e;
  return e.order[slot] === Order.Idle ||
    (e.order[slot] === Order.AttackMove && e.intentTarget[slot] !== NONE && e.combatTarget[slot] === NONE);
};

const near = (s: State, slot: number, x: number, y: number, tiles: number): boolean =>
  withinRangeSq(s.e.x[slot]!, s.e.y[slot]!, x, y, tiles * TILE * ONE);

const isDepotKind = (kind: number): boolean =>
  kind === Kind.CommandCenter || kind === Kind.Nexus || isLarvaSourceKind(kind);

const tileCoord = (v: number, max: number): number =>
  Math.max(0, Math.min(max - 1, Math.trunc(v / (TILE * ONE))));

const EMPTY_I16 = new Int16Array(0);
const EMPTY_U8 = new Uint8Array(0);

const tileVisible = (s: State, player: number, tx: number, ty: number): boolean => {
  if (!s.trackVision) return true;
  const vision = s.vision[player];
  return !vision || vision[ty * s.map.w + tx] === 2;
};

const enemyVisible = (s: State, player: number, slot: number): boolean =>
  tileVisible(s, player, tileCoord(s.e.x[slot]!, s.map.w), tileCoord(s.e.y[slot]!, s.map.h));

const omittedRiskMap = (s: State): BotRiskMap => ({
  w: s.map.w,
  h: s.map.h,
  values: EMPTY_I16,
  antiGround: EMPTY_I16,
  antiAir: EMPTY_I16,
  detection: EMPTY_I16,
  visible: EMPTY_U8,
  vision: 'omitted',
});

type BotFactsDraft = Omit<BotFacts, 'risk'>;

const recordOwnedStructure = (facts: BotFactsDraft, kind: number): void => {
  const def = Units[kind];
  if (def && (def.roles & Role.Structure) !== 0) facts.ownedOrPendingStructureKinds.add(kind);
};

const addProtectedBaseRegions = (
  s: State,
  player: number,
  regions: ProtectedRegion[],
  base: number,
  resourcesRequireVision: boolean,
): void => {
  const e = s.e;
  regions.push({
    kind: 'base',
    anchor: base,
    x: e.x[base]!,
    y: e.y[base]!,
    radiusTiles: BASE_THREAT_TILES,
    value: 100,
  });

  let minerals = 0;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || (e.flags[i]! & Role.Resource) === 0) continue;
    if (resourcesRequireVision && !enemyVisible(s, player, i)) continue;
    if (!near(s, i, e.x[base]!, e.y[base]!, MINERAL_LINE_RESOURCE_TILES)) continue;
    sx += e.x[i]!;
    sy += e.y[i]!;
    minerals++;
  }
  if (minerals > 0) {
    regions.push({
      kind: 'mineral-line',
      anchor: base,
      x: Math.trunc(sx / minerals),
      y: Math.trunc(sy / minerals),
      radiusTiles: MINERAL_LINE_TILES,
      value: 150,
    });
  }
};

export const collectBotFacts = (
  s: State,
  player: number,
  faction: Faction,
  options: BotFactsOptions = {},
): BotFacts => {
  const e = s.e;
  const enemyBases: number[] = [];
  const facts: BotFactsDraft = {
    tick: s.tick,
    player,
    minerals: s.players.minerals[player]!,
    gas: s.players.gas[player]!,
    supplyUsed: s.players.supplyUsed[player]!,
    supplyMax: s.players.supplyMax[player]!,
    primaryBase: NONE,
    bases: [],
    workers: [],
    idleWorkers: [],
    larvae: [],
    idleLarvae: [],
    idleProducers: [],
    army: [],
    retaskableArmy: [],
    casters: [],
    visibleEnemies: [],
    protectedRegions: [],
    enemyProtectedRegions: [],
    protectedRegionThreats: [],
    baseThreats: [],
    ownedOrPendingStructureKinds: new Set(),
  };

  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.container[i] !== NONE) continue;
    const kind = e.kind[i]!;
    const owner = e.owner[i]!;
    if (owner !== player) {
      if (isEnemy(s, player, owner) && enemyVisible(s, player, i)) {
        facts.visibleEnemies.push(i);
        if (e.built[i] === 1 && isDepotKind(kind)) enemyBases.push(i);
      }
      continue;
    }

    const flags = e.flags[i]!;
    recordOwnedStructure(facts, kind);
    if ((flags & Role.Worker) !== 0 && e.buildKind[i] !== Kind.None) recordOwnedStructure(facts, e.buildKind[i]!);
    if (Units[kind]!.abilities.length > 0) facts.casters.push(i);
    if (kind === faction.worker) {
      facts.workers.push(i);
      if (e.order[i] === Order.Idle) facts.idleWorkers.push(i);
    }
    if (isLarvaSourceKind(kind) && e.built[i] === 1) {
      facts.bases.push(i);
      if (facts.primaryBase === NONE || kind === faction.depot) facts.primaryBase = i;
    } else if (kind === faction.depot && e.built[i] === 1) {
      facts.bases.push(i);
      if (facts.primaryBase === NONE) facts.primaryBase = i;
    }
    if (kind === Kind.Larva) {
      facts.larvae.push(i);
      if (e.built[i] === 1) facts.idleLarvae.push(i);
    }
    if ((flags & Role.Producer) !== 0 && e.built[i] === 1 && e.prodKind[i] === Kind.None) {
      facts.idleProducers.push(i);
    }
    if (kind === faction.armyUnit) facts.army.push(i);
    if (kind !== faction.worker && (flags & Role.Mobile) !== 0 && hasAnyWeapon(Units[kind]!) && canRetaskArmy(s, i)) {
      facts.retaskableArmy.push(i);
    }
  }

  for (const base of facts.bases) {
    addProtectedBaseRegions(s, player, facts.protectedRegions, base, false);
  }
  for (const base of enemyBases) {
    addProtectedBaseRegions(s, player, facts.enemyProtectedRegions, base, true);
  }

  for (const enemy of facts.visibleEnemies) {
    let bestRegion = NONE;
    let bestValue = -1;
    for (let region = 0; region < facts.protectedRegions.length; region++) {
      const protectedRegion = facts.protectedRegions[region]!;
      if (!near(s, enemy, protectedRegion.x, protectedRegion.y, protectedRegion.radiusTiles)) continue;
      if (protectedRegion.kind === 'base') facts.baseThreats.push({ base: protectedRegion.anchor, enemy });
      if (protectedRegion.value > bestValue) {
        bestRegion = region;
        bestValue = protectedRegion.value;
      }
    }
    if (bestRegion !== NONE) facts.protectedRegionThreats.push({ region: bestRegion, enemy });
  }
  const risk = options.risk === 'none'
    ? omittedRiskMap(s)
    : buildRiskMap(s, player, facts.visibleEnemies);
  return { ...facts, risk };
};

export const missingStructureKinds = (facts: BotFacts, kinds: readonly number[]): number[] =>
  kinds.filter((kind) => !facts.ownedOrPendingStructureKinds.has(kind));

/** Build a controller that trains workers for `faction` from idle producers. */
export const createMacroBot = (faction: Faction): Controller => {
  const worker = Units[faction.worker]!;
  return (s: State, player: number): Command[] => {
    const facts = collectBotFacts(s, player, faction);
    const cmds: Command[] = [];
    for (const producer of facts.idleProducers) {
      if (!Units[s.e.kind[producer]!]!.produces.includes(faction.worker)) continue;
      if (s.players.minerals[player]! < worker.minerals) continue;
      if (s.players.supplyUsed[player]! + worker.supply > s.players.supplyMax[player]!) continue;
      cmds.push({ t: 'train', building: eid(s.e, producer), kind: faction.worker });
    }
    return cmds;
  };
};
