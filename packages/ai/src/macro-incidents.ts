import {
  Kind,
  NONE,
  ONE,
  Role,
  TILE,
  Units,
  distanceSq,
  eid,
  isDetectorKind,
  isAlive,
  slotOf,
  transportCapacity,
  weaponForTarget,
  type State,
} from '@rts/sim';
import {
  type BotFacts,
  type ProtectedRegion,
} from './macro.ts';
import { INTENT_OUTCOME_MEMORY_TICKS, type BotMemory } from './macro-memory.ts';
import type { BotFailureReason } from './macro-intents.ts';
import { riskAtLayer } from './macro-risk.ts';

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

export const TACTICAL_INCIDENT_MEMORY_TICKS = 8 * 24;
export const TACTICAL_COMMITMENT_TICKS = 4 * 24;

const incidentTileCoord = (v: number): number =>
  Math.trunc(v / (TILE * ONE));

const threatEnvelope = (kind: number): { range: number; score: number } => {
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

const blockedSiteIncidentKind = (reason: BotFailureReason): TacticalIncidentKind =>
  reason === 'path-blocked' ? 'route-trap' : 'expansion-blocked';

const blockedSiteSeverity = (reason: BotFailureReason): number => {
  switch (reason) {
    case 'unsafe-location': return 130;
    case 'occupied-location': return 110;
    case 'path-blocked': return 90;
    default: return 0;
  }
};

const incidentKey = (incident: TacticalIncident): string => {
  if (incident.base !== undefined) return `${incident.kind}:base:${incident.base}`;
  return `${incident.kind}:tile:${incidentTileCoord(incident.x)},${incidentTileCoord(incident.y)}`;
};

const incidentSort = (a: TacticalIncident, b: TacticalIncident): number =>
  b.severity - a.severity ||
  (a.base ?? NONE) - (b.base ?? NONE) ||
  a.kind.localeCompare(b.kind);

const detectorFit = (kind: TacticalIncidentKind, unitKind: number): number => {
  if (kind !== 'invisible-damage' && kind !== 'route-trap') return 0;
  return isDetectorKind(unitKind) ? 250 : 0;
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
    if ((def.roles & Role.Air) !== 0 && transportCapacity(s, enemy) > 0) return 'transport-drop';

    const risk = threatEnvelope(kind);
    if ((def.roles & Role.Structure) !== 0 && risk.score > 0) hasStaticThreat = true;
    if (risk.range >= 7 * TILE * ONE) hasLongRangeThreat = true;
  }
  if (hasStaticThreat) return 'static-threat-zone';
  if (hasLongRangeThreat) return 'siege-containment';
  return 'base-intrusion';
};

const regionThreatKind = (s: State, region: ProtectedRegion, enemies: readonly number[]): TacticalIncidentKind => {
  const kind = enemyThreatKind(s, enemies);
  return region.kind === 'mineral-line' && kind === 'base-intrusion' ? 'mineral-line-harass' : kind;
};

export const deriveTacticalIncidents = (s: State, facts: BotFacts): TacticalIncident[] => {
  if (facts.protectedRegionThreats.length === 0) return [];

  const byRegion = new Map<number, number[]>();
  for (const threat of facts.protectedRegionThreats) {
    const enemies = byRegion.get(threat.region);
    if (enemies) enemies.push(threat.enemy);
    else byRegion.set(threat.region, [threat.enemy]);
  }

  const incidents: TacticalIncident[] = [];
  for (const [regionIndex, enemies] of byRegion) {
    const region = facts.protectedRegions[regionIndex]!;
    const kind = regionThreatKind(s, region, enemies);
    incidents.push({
      kind,
      severity: region.value + enemies.length * 25 + incidentKindBonus(kind) + riskAtLayer(facts.risk, facts.risk.antiGround, region.x, region.y),
      x: region.x,
      y: region.y,
      base: region.anchor,
      enemies,
    });
  }
  incidents.sort(incidentSort);
  return incidents;
};

export const rememberedBlockedSiteIncidents = (memory: BotMemory, tick: number): TacticalIncident[] => {
  const incidents: TacticalIncident[] = [];
  for (const site of memory.blockedSites.values()) {
    if (tick - site.tick > INTENT_OUTCOME_MEMORY_TICKS) continue;
    incidents.push({
      kind: blockedSiteIncidentKind(site.reason),
      severity: blockedSiteSeverity(site.reason),
      x: site.x,
      y: site.y,
      expiresAt: site.tick + INTENT_OUTCOME_MEMORY_TICKS,
      remembered: true,
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
      expiresAt: incident.expiresAt ?? tick + TACTICAL_INCIDENT_MEMORY_TICKS,
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
