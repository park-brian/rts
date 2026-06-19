import {
  Kind,
  NONE,
  ONE,
  Order,
  Role,
  TILE,
  Trait,
  Units,
  distanceSq,
  eid,
  hasAnyWeapon,
  isAlive,
  isEnemy,
  isLarvaSourceKind,
  slotOf,
  unitTraits,
  withinRangeSq,
  weaponForTarget,
  type Command,
  type Controller,
  type Faction,
  type State,
} from '@rts/sim';

export type BotFailureReason =
  | 'unsafe-location'
  | 'occupied-location'
  | 'missing-detection'
  | 'missing-prerequisite'
  | 'insufficient-force'
  | 'no-builder'
  | 'no-producer'
  | 'no-production-capacity'
  | 'supply-blocked'
  | 'resource-starved'
  | 'path-blocked';

export type BotIntentKind =
  | 'defend-base'
  | 'get-detection'
  | 'clear-site'
  | 'rebuild-tech'
  | 'add-production'
  | 'expand'
  | 'spend-larva'
  | 'train-counter'
  | 'research-upgrade'
  | 'attack-wave'
  | 'harass'
  | 'retreat';

export type BotIntent = {
  kind: BotIntentKind;
  urgency: number;
  expiresAt?: number;
  targetKind?: number;
  targetSlot?: number;
  x?: number;
  y?: number;
};

export type BotIntentResult =
  | { status: 'done' }
  | { status: 'waiting'; reason: BotFailureReason }
  | { status: 'blocked'; reason: BotFailureReason; followup?: BotIntent }
  | { status: 'failed'; reason: BotFailureReason };

export type TacticalIncidentKind =
  | 'base-intrusion'
  | 'mineral-line-harass'
  | 'invisible-damage'
  | 'transport-drop'
  | 'nydus-breach'
  | 'siege-containment'
  | 'static-threat-zone'
  | 'route-trap'
  | 'expansion-blocked'
  | 'army-under-kite';

export type TacticalIncident = {
  kind: TacticalIncidentKind;
  severity: number;
  x: number;
  y: number;
  base?: number;
  enemies?: number[];
  expiresAt?: number;
  lastSeenTick?: number;
  remembered?: boolean;
};

export type BotThreat = {
  base: number;
  enemy: number;
};

export type BotRiskMap = {
  w: number;
  h: number;
  values: Int16Array;
  visible: Uint8Array;
  vision: 'visible' | 'omniscient' | 'omitted';
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
};

export const createBotMemory = (): BotMemory => ({
  lastTick: -1,
  blockedSites: new Map(),
  suspectedInvisibleThreats: new Map(),
  tacticalIncidents: new Map(),
  tacticalCommitments: new Map(),
});

const BASE_THREAT_TILES = 18;
export const TACTICAL_INCIDENT_MEMORY_TICKS = 8 * 24;
export const TACTICAL_COMMITMENT_TICKS = 4 * 24;

export const canRetaskArmy = (s: State, slot: number): boolean => {
  const e = s.e;
  return e.order[slot] === Order.Idle ||
    (e.order[slot] === Order.AttackMove && e.intentTarget[slot] !== NONE && e.combatTarget[slot] === NONE);
};

const near = (s: State, slot: number, x: number, y: number, tiles: number): boolean =>
  withinRangeSq(s.e.x[slot]!, s.e.y[slot]!, x, y, tiles * TILE * ONE);

const tileCoord = (v: number, max: number): number =>
  Math.max(0, Math.min(max - 1, Math.trunc(v / (TILE * ONE))));

const tileCenter = (tile: number): number => (tile * TILE + (TILE >> 1)) * ONE;
const EMPTY_I16 = new Int16Array(0);
const EMPTY_U8 = new Uint8Array(0);

const tileVisible = (s: State, player: number, tx: number, ty: number): boolean => {
  if (!s.trackVision) return true;
  const vision = s.vision[player];
  return !vision || vision[ty * s.map.w + tx] === 2;
};

const enemyVisible = (s: State, player: number, slot: number): boolean =>
  tileVisible(s, player, tileCoord(s.e.x[slot]!, s.map.w), tileCoord(s.e.y[slot]!, s.map.h));

const weaponRisk = (kind: number): { range: number; score: number } => {
  const def = Units[kind];
  if (!def) return { range: 0, score: 0 };
  let range = 0;
  let score = 0;
  for (const weapon of [def.weapon, def.airWeapon]) {
    if (!weapon) continue;
    range = Math.max(range, weapon.range);
    score = Math.max(score, weapon.damage * (weapon.shots ?? 1));
  }
  return { range, score };
};

const incidentKindBonus = (kind: TacticalIncidentKind): number => {
  switch (kind) {
    case 'nydus-breach': return 200;
    case 'transport-drop': return 150;
    case 'siege-containment': return 125;
    case 'static-threat-zone': return 100;
    default: return 0;
  }
};

const incidentKey = (incident: TacticalIncident): string => {
  if (incident.base !== undefined) return `${incident.kind}:base:${incident.base}`;
  return `${incident.kind}:tile:${tileCoord(incident.x, 10_000)},${tileCoord(incident.y, 10_000)}`;
};

const incidentSort = (a: TacticalIncident, b: TacticalIncident): number =>
  b.severity - a.severity ||
  (a.base ?? NONE) - (b.base ?? NONE) ||
  a.kind.localeCompare(b.kind);

const detectorFit = (kind: TacticalIncidentKind, unitKind: number): number => {
  if (kind !== 'invisible-damage' && kind !== 'route-trap') return 0;
  return (unitTraits(unitKind) & Trait.Detector) !== 0 ? 250 : 0;
};

const roleFit = (kind: TacticalIncidentKind, unitKind: number): number => {
  const def = Units[unitKind]!;
  switch (kind) {
    case 'transport-drop':
      return def.airWeapon ? 90 : 0;
    case 'siege-containment':
    case 'static-threat-zone':
      return Math.max(def.weapon?.range ?? 0, def.airWeapon?.range ?? 0) >= 6 * TILE * ONE ? 70 : 0;
    case 'army-under-kite':
      return def.speed > 0 ? 60 : 0;
    default:
      return 0;
  }
};

export const tacticalResponseFit = (
  s: State,
  unit: number,
  incident: TacticalIncident,
  target: number,
): number => {
  const e = s.e;
  if (e.alive[unit] !== 1) return 0;
  const unitKind = e.kind[unit]!;
  const def = Units[unitKind]!;
  const targetAlive = target >= 0 && target < e.hi && e.alive[target] === 1;
  const targetDef = targetAlive ? Units[e.kind[target]!] : undefined;
  const targetFit = targetDef && weaponForTarget(def, targetDef) ? 200 : 0;
  const dx = Math.abs(e.x[unit]! - incident.x);
  const dy = Math.abs(e.y[unit]! - incident.y);
  const distanceTiles = Math.trunc((dx + dy) / (TILE * ONE));
  const proximityFit = Math.max(0, 80 - distanceTiles);

  return 10 +
    targetFit +
    detectorFit(incident.kind, unitKind) +
    roleFit(incident.kind, unitKind) +
    Math.min(60, Math.trunc(def.speed / 8)) +
    proximityFit;
};

const TACTICAL_RESPONSE_MAX = 10;

const baselineResponseBudget = (kind: TacticalIncidentKind): number => {
  switch (kind) {
    case 'nydus-breach': return 6;
    case 'siege-containment': return 5;
    case 'transport-drop': return 4;
    case 'static-threat-zone': return 4;
    case 'invisible-damage': return 3;
    case 'mineral-line-harass': return 3;
    case 'route-trap': return 3;
    case 'army-under-kite': return 3;
    case 'expansion-blocked': return 2;
    case 'base-intrusion': return 2;
  }
};

export const tacticalResponseBudget = (
  incident: TacticalIncident,
  candidates: number,
): number => {
  if (candidates <= 0) return 0;
  const severityExtra = Math.trunc(Math.max(0, incident.severity - 100) / 150);
  const budget = baselineResponseBudget(incident.kind) + severityExtra;
  return Math.max(1, Math.min(candidates, TACTICAL_RESPONSE_MAX, budget));
};

export const rankedTacticalResponders = (
  s: State,
  candidates: readonly number[],
  incident: TacticalIncident,
  target: number,
): number[] =>
  candidates
    .map((slot) => ({
      slot,
      fit: tacticalResponseFit(s, slot, incident, target),
      distance: distanceSq(s.e.x[slot]!, s.e.y[slot]!, incident.x, incident.y),
    }))
    .sort((a, b) => b.fit - a.fit || a.distance - b.distance || a.slot - b.slot)
    .map(({ slot }) => slot);

const pruneTacticalCommitments = (memory: BotMemory, tick: number): void => {
  for (const [key, commitment] of memory.tacticalCommitments) {
    if (commitment.expiresAt <= tick) memory.tacticalCommitments.delete(key);
  }
};

export const selectTacticalResponders = (
  s: State,
  candidates: readonly number[],
  incident: TacticalIncident,
  target: number,
): number[] => {
  const budget = tacticalResponseBudget(incident, candidates.length);
  if (budget === 0) return [];
  return rankedTacticalResponders(s, candidates, incident, target).slice(0, budget);
};

export const commitTacticalResponders = (
  s: State,
  memory: BotMemory,
  candidates: readonly number[],
  incident: TacticalIncident,
  target: number,
  tick: number,
): number[] => {
  const budget = tacticalResponseBudget(incident, candidates.length);
  if (budget === 0) return [];

  const key = incidentKey(incident);
  const existing = memory.tacticalCommitments.get(key);
  const candidateSet = new Set(candidates);
  const selected: number[] = [];
  if (existing && existing.expiresAt > tick) {
    for (const id of existing.unitIds) {
      if (!isAlive(s.e, id)) continue;
      const slot = slotOf(id);
      if (!candidateSet.has(slot)) continue;
      selected.push(slot);
      if (selected.length === budget) break;
    }
  }

  if (selected.length < budget) {
    const selectedSet = new Set(selected);
    for (const slot of rankedTacticalResponders(s, candidates, incident, target)) {
      if (selectedSet.has(slot)) continue;
      selected.push(slot);
      selectedSet.add(slot);
      if (selected.length === budget) break;
    }
  }

  memory.tacticalCommitments.set(key, {
    unitIds: selected.map((slot) => eid(s.e, slot)),
    expiresAt: tick + TACTICAL_COMMITMENT_TICKS,
  });
  return selected;
};

const enemyThreatKind = (s: State, enemies: readonly number[]): TacticalIncidentKind => {
  const e = s.e;
  let hasStaticThreat = false;
  let hasLongRangeThreat = false;
  for (const enemy of enemies) {
    const kind = e.kind[enemy]!;
    const def = Units[kind]!;
    if (kind === Kind.NydusCanal) return 'nydus-breach';
    if ((def.roles & Role.Air) !== 0 && def.cargoCapacity > 0) return 'transport-drop';

    const risk = weaponRisk(kind);
    if ((def.roles & Role.Structure) !== 0 && risk.score > 0) hasStaticThreat = true;
    if (risk.range >= 7 * TILE * ONE) hasLongRangeThreat = true;
  }
  if (hasStaticThreat) return 'static-threat-zone';
  if (hasLongRangeThreat) return 'siege-containment';
  return 'base-intrusion';
};

export const buildRiskMap = (s: State, player: number, enemies: readonly number[]): BotRiskMap => {
  const w = s.map.w;
  const h = s.map.h;
  const visible = new Uint8Array(w * h);
  if (!s.trackVision) {
    visible.fill(1);
  } else {
    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        visible[ty * w + tx] = tileVisible(s, player, tx, ty) ? 1 : 0;
      }
    }
  }

  const values = new Int16Array(w * h);
  const e = s.e;
  for (const enemy of enemies) {
    const risk = weaponRisk(e.kind[enemy]!);
    if (risk.range <= 0 || risk.score <= 0) continue;
    const cx = e.x[enemy]!;
    const cy = e.y[enemy]!;
    const radiusTiles = Math.ceil(risk.range / (TILE * ONE)) + 1;
    const tx0 = Math.max(0, tileCoord(cx, w) - radiusTiles);
    const tx1 = Math.min(w - 1, tileCoord(cx, w) + radiusTiles);
    const ty0 = Math.max(0, tileCoord(cy, h) - radiusTiles);
    const ty1 = Math.min(h - 1, tileCoord(cy, h) + radiusTiles);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const idx = ty * w + tx;
        if (visible[idx] !== 1) continue;
        if (!withinRangeSq(cx, cy, tileCenter(tx), tileCenter(ty), risk.range)) continue;
        values[idx] = Math.min(32_767, values[idx]! + risk.score);
      }
    }
  }

  return { w, h, values, visible, vision: s.trackVision ? 'visible' : 'omniscient' };
};

export const riskAt = (risk: BotRiskMap, x: number, y: number): number => {
  if (risk.values.length === 0) return 0;
  return risk.values[tileCoord(y, risk.h) * risk.w + tileCoord(x, risk.w)]!;
};

const omittedRiskMap = (s: State): BotRiskMap => ({
  w: s.map.w,
  h: s.map.h,
  values: EMPTY_I16,
  visible: EMPTY_U8,
  vision: 'omitted',
});

type BotFactsDraft = Omit<BotFacts, 'risk'>;

const recordOwnedStructure = (facts: BotFactsDraft, kind: number): void => {
  const def = Units[kind];
  if (def && (def.roles & Role.Structure) !== 0) facts.ownedOrPendingStructureKinds.add(kind);
};

export const collectBotFacts = (
  s: State,
  player: number,
  faction: Faction,
  options: BotFactsOptions = {},
): BotFacts => {
  const e = s.e;
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
    baseThreats: [],
    ownedOrPendingStructureKinds: new Set(),
  };

  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.container[i] !== NONE) continue;
    const kind = e.kind[i]!;
    const owner = e.owner[i]!;
    if (owner !== player) {
      if (isEnemy(s, player, owner) && enemyVisible(s, player, i)) facts.visibleEnemies.push(i);
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
    for (const enemy of facts.visibleEnemies) {
      if (near(s, enemy, e.x[base]!, e.y[base]!, BASE_THREAT_TILES)) facts.baseThreats.push({ base, enemy });
    }
  }
  const risk = options.risk === 'none'
    ? omittedRiskMap(s)
    : buildRiskMap(s, player, facts.visibleEnemies);
  return { ...facts, risk };
};

export const missingStructureKinds = (facts: BotFacts, kinds: readonly number[]): number[] =>
  kinds.filter((kind) => !facts.ownedOrPendingStructureKinds.has(kind));

export const deriveTacticalIncidents = (s: State, facts: BotFacts): TacticalIncident[] => {
  if (facts.baseThreats.length === 0) return [];

  const e = s.e;
  const byBase = new Map<number, number[]>();
  for (const threat of facts.baseThreats) {
    const enemies = byBase.get(threat.base);
    if (enemies) enemies.push(threat.enemy);
    else byBase.set(threat.base, [threat.enemy]);
  }

  const incidents: TacticalIncident[] = [];
  for (const [base, enemies] of byBase) {
    const x = e.x[base]!;
    const y = e.y[base]!;
    const kind = enemyThreatKind(s, enemies);
    incidents.push({
      kind,
      severity: 100 + enemies.length * 25 + incidentKindBonus(kind) + riskAt(facts.risk, x, y),
      x,
      y,
      base,
      enemies,
    });
  }
  incidents.sort(incidentSort);
  return incidents;
};

export const rememberTacticalIncidents = (
  memory: BotMemory,
  visibleIncidents: readonly TacticalIncident[],
  tick: number,
): TacticalIncident[] => {
  pruneTacticalCommitments(memory, tick);
  if (visibleIncidents.length === 0 && memory.tacticalIncidents.size === 0) return [];

  const visibleKeys = new Set<string>();
  for (const incident of visibleIncidents) {
    const key = incidentKey(incident);
    visibleKeys.add(key);
    memory.tacticalIncidents.set(key, {
      ...incident,
      expiresAt: tick + TACTICAL_INCIDENT_MEMORY_TICKS,
      lastSeenTick: tick,
      remembered: false,
    });
  }

  const incidents = [...visibleIncidents];
  for (const [key, incident] of memory.tacticalIncidents) {
    if ((incident.expiresAt ?? tick) <= tick) {
      memory.tacticalIncidents.delete(key);
      continue;
    }
    if (visibleKeys.has(key)) continue;
    const age = tick - (incident.lastSeenTick ?? tick);
    incidents.push({
      ...incident,
      enemies: [],
      remembered: true,
      severity: Math.max(1, incident.severity - Math.trunc(age / 24) * 10),
    });
  }

  incidents.sort(incidentSort);
  return incidents;
};

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
