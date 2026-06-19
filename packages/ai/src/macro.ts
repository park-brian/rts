import {
  Kind,
  NONE,
  ONE,
  Order,
  Role,
  TILE,
  Units,
  eid,
  isEnemy,
  isLarvaSourceKind,
  withinRangeSq,
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
  vision: 'visible' | 'omniscient';
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
  blockedSites: Map<string, { reason: BotFailureReason; tick: number }>;
  suspectedInvisibleThreats: Map<string, { x: number; y: number; tick: number }>;
};

export const createBotMemory = (): BotMemory => ({
  blockedSites: new Map(),
  suspectedInvisibleThreats: new Map(),
});

const BASE_THREAT_TILES = 18;

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

export const riskAt = (risk: BotRiskMap, x: number, y: number): number =>
  risk.values[tileCoord(y, risk.h) * risk.w + tileCoord(x, risk.w)]!;

type BotFactsDraft = Omit<BotFacts, 'risk'>;

const recordOwnedStructure = (facts: BotFactsDraft, kind: number): void => {
  const def = Units[kind];
  if (def && (def.roles & Role.Structure) !== 0) facts.ownedOrPendingStructureKinds.add(kind);
};

export const collectBotFacts = (s: State, player: number, faction: Faction): BotFacts => {
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
    if (kind !== faction.worker && (flags & Role.Mobile) !== 0 && canRetaskArmy(s, i)) {
      facts.retaskableArmy.push(i);
    }
  }

  for (const base of facts.bases) {
    for (const enemy of facts.visibleEnemies) {
      if (near(s, enemy, e.x[base]!, e.y[base]!, BASE_THREAT_TILES)) facts.baseThreats.push({ base, enemy });
    }
  }
  return { ...facts, risk: buildRiskMap(s, player, facts.visibleEnemies) };
};

export const missingStructureKinds = (facts: BotFacts, kinds: readonly number[]): number[] =>
  kinds.filter((kind) => !facts.ownedOrPendingStructureKinds.has(kind));

export const deriveTacticalIncidents = (s: State, facts: BotFacts): TacticalIncident[] => {
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
    incidents.push({
      kind: 'base-intrusion',
      severity: 100 + enemies.length * 25 + riskAt(facts.risk, x, y),
      x,
      y,
      base,
      enemies,
    });
  }
  incidents.sort((a, b) => b.severity - a.severity || (a.base ?? NONE) - (b.base ?? NONE));
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
