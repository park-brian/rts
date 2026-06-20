import {
  Order,
  NONE,
  ONE,
  Role,
  TILE,
  Units,
  baseDepotFootprint,
  canPlaceStructure,
  eid,
  footprintsOverlap,
  isBaseDepotKind,
  isEnemy,
  isLiftedStructureFlags,
  pathRouteDistance,
  sameTeam,
  slotOf,
  structureFootprint,
  topDownEdgeDistanceSqBetween,
  validateCommand,
  weaponForTarget,
  type BaseSite,
  type Command,
  type Faction,
  type State,
} from '@rts/sim';
import { queueStructureAtPoint, type PointSpotFinder, type ResourceBudget } from './macro-build.ts';
import type { BotFailureReason, BotIntentRecord } from './macro-intents.ts';
import { locationBlockedByIntentMemory, type BotMemory } from './macro-memory.ts';
import type { BotFacts } from './macro.ts';

const EXPANSION_BANK = 1_000;
const EXPANSION_STALLED_BANK = 800;
const EXPANSION_STEP = 800;
const EXPANSION_MAX = 4;
const TILE_FX = TILE * ONE;

const siteRank: Record<BaseSite['kind'], number> = {
  natural: 0,
  third: 1,
  fortress: 2,
  center: 3,
  main: 4,
  island: 5,
};

const siteCenter = (site: BaseSite): { x: number; y: number } => ({
  x: site.x * TILE_FX + (TILE_FX >> 1),
  y: site.y * TILE_FX + (TILE_FX >> 1),
});

export type ExpansionAttempt = {
  queued: boolean;
  outcome?: BotIntentRecord;
};

export type ExpansionPressure = {
  macroFloatStalled?: boolean;
};

const siteDepotFootprint = (site: BaseSite): { x0: number; y0: number; x1: number; y1: number } =>
  site.depotFootprint ?? baseDepotFootprint(site);

const footprintTouchesSite = (kind: number, x: number, y: number, site: BaseSite): boolean =>
  footprintsOverlap(structureFootprint(kind, x, y), siteDepotFootprint(site));

const siteReservedByTeam = (s: State, player: number, site: BaseSite, plannedKind: number): boolean => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || !sameTeam(s, e.owner[i]!, player)) continue;
    const kind = e.kind[i]!;
    if (isBaseDepotKind(kind) && footprintTouchesSite(kind, e.x[i]!, e.y[i]!, site)) return true;
    if ((e.flags[i]! & Role.Worker) !== 0 && e.buildKind[i] === plannedKind) {
      if (footprintTouchesSite(plannedKind, e.tx[i]!, e.ty[i]!, site)) return true;
    }
  }
  return false;
};

const ownedOrPendingDepotCount = (s: State, player: number, plannedKind: number): number => {
  const e = s.e;
  let count = 0;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.owner[i] !== player) continue;
    if (isBaseDepotKind(e.kind[i]!)) {
      count++;
    } else if ((e.flags[i]! & Role.Worker) !== 0 && e.buildKind[i] === plannedKind) {
      count++;
    }
  }
  return count;
};

const expansionBank = (pressure: ExpansionPressure): number =>
  pressure.macroFloatStalled ? EXPANSION_STALLED_BANK : EXPANSION_BANK;

const desiredDepotCount = (minerals: number, bank: number): number =>
  Math.min(EXPANSION_MAX, 2 + Math.trunc((minerals - bank) / EXPANSION_STEP));

const expansionOutcome = (
  faction: Faction,
  point: { x: number; y: number },
  result: BotIntentRecord['result'],
): BotIntentRecord => ({
  intent: { kind: 'expand', urgency: 35, targetKind: faction.depot, x: point.x, y: point.y },
  result,
});

const expansionThreatened = (
  s: State,
  player: number,
  faction: Faction,
  facts: BotFacts,
  point: { x: number; y: number },
): boolean => {
  const depotDef = Units[faction.depot];
  if (!depotDef) return false;
  const e = s.e;
  for (const enemy of facts.visibleEnemies) {
    if (e.alive[enemy] !== 1 || !isEnemy(s, player, e.owner[enemy]!)) continue;
    const weapon = weaponForTarget(Units[e.kind[enemy]!]!, depotDef);
    if (!weapon) continue;
    const distanceSq = topDownEdgeDistanceSqBetween(
      e.kind[enemy]!,
      e.x[enemy]!,
      e.y[enemy]!,
      e.flags[enemy]!,
      faction.depot,
      point.x,
      point.y,
      depotDef.roles,
    );
    if (distanceSq <= weapon.range * weapon.range) return true;
  }
  return false;
};

const expansionRouteBlocked = (
  s: State,
  worker: number,
  point: { x: number; y: number },
): boolean => {
  const e = s.e;
  if (worker < 0 || worker >= e.hi || e.alive[worker] !== 1) return false;
  return pathRouteDistance(s, e.kind[worker]!, e.x[worker]!, e.y[worker]!, point.x, point.y) === null;
};

const locationFailure = (reason: BotFailureReason): boolean =>
  reason === 'unsafe-location' || reason === 'occupied-location' || reason === 'path-blocked';

const buildLocationFailure = (reason: string): BotFailureReason | null => {
  switch (reason) {
    case 'placement-blocked':
    case 'placement-off-map':
    case 'placement-requires-geyser':
      return 'occupied-location';
    default:
      return null;
  }
};

const foundationHasAssignedBuilder = (s: State, foundation: number): boolean => {
  const e = s.e;
  const workerId = e.target[foundation]!;
  if (workerId === NONE) return false;
  const worker = slotOf(workerId);
  return e.alive[worker] === 1 && e.order[worker] === Order.Build && e.target[worker] === eid(e, foundation);
};

const queueFoundationExpansion = (
  s: State,
  player: number,
  faction: Faction,
  facts: BotFacts,
  cmds: Command[],
  worker: number,
): ExpansionAttempt | undefined => {
  const e = s.e;
  const depotDef = Units[faction.depot];
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.owner[i] !== player || e.kind[i] !== faction.depot || e.built[i] === 1) continue;
    const point = { x: e.x[i]!, y: e.y[i]! };
    if (expansionThreatened(s, player, faction, facts, point)) {
      return { queued: false, outcome: expansionOutcome(faction, point, { status: 'blocked', reason: 'unsafe-location' }) };
    }
    if (depotDef?.buildMethod !== 'worker' || foundationHasAssignedBuilder(s, i)) continue;
    if (worker === NONE) {
      return { queued: false, outcome: expansionOutcome(faction, point, { status: 'waiting', reason: 'no-builder' }) };
    }

    const command: Command = { t: 'repair', unit: eid(e, worker), target: eid(e, i) };
    if (!validateCommand(s, player, command).ok) continue;
    cmds.push(command);
    return { queued: true, outcome: expansionOutcome(faction, point, { status: 'done' }) };
  }
  return undefined;
};

const pendingExpansionOutcome = (
  s: State,
  player: number,
  faction: Faction,
  facts: BotFacts,
): BotIntentRecord | undefined => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.owner[i] !== player || (e.flags[i]! & Role.Worker) === 0) continue;
    if (e.buildKind[i] !== faction.depot) continue;

    const point = { x: e.tx[i]!, y: e.ty[i]! };
    if (expansionThreatened(s, player, faction, facts, point)) {
      return expansionOutcome(faction, point, { status: 'blocked', reason: 'unsafe-location' });
    }
    if (expansionRouteBlocked(s, i, point)) {
      return expansionOutcome(faction, point, { status: 'blocked', reason: 'path-blocked' });
    }

    const placement = canPlaceStructure(s, player, i, faction.depot, point.x, point.y);
    if (!placement.ok) {
      const reason = buildLocationFailure(placement.reason);
      if (reason) return expansionOutcome(faction, point, { status: 'blocked', reason });
    }
  }
  return undefined;
};

const candidateSites = (
  s: State,
  player: number,
  home: number,
  plannedKind: number,
  options: { islands?: boolean; memory?: BotMemory } = {},
): BaseSite[] => {
  const e = s.e;
  const ownTeam = s.teams[player] ?? player;
  const hx = e.x[home]!;
  const hy = e.y[home]!;
  return [...(s.map.bases ?? [])]
    .filter((site) => options.islands === true ? site.kind === 'island' : site.kind !== 'island')
    .filter((site) => site.owner === undefined || site.owner === player)
    .filter((site) => site.team < 0 || site.team === ownTeam)
    .filter((site) => {
      if (!options.memory) return true;
      const point = siteCenter(site);
      return !locationBlockedByIntentMemory(options.memory, point.x, point.y);
    })
    .filter((site) => !siteReservedByTeam(s, player, site, plannedKind))
    .sort((a, b) => {
      const ar = siteRank[a.kind] - siteRank[b.kind];
      if (ar !== 0) return ar;
      const ap = siteCenter(a);
      const bp = siteCenter(b);
      const ad = (ap.x - hx) ** 2 + (ap.y - hy) ** 2;
      const bd = (bp.x - hx) ** 2 + (bp.y - hy) ** 2;
      return ad - bd || a.x - b.x || a.y - b.y;
    });
};

const queueLiftedIslandDepot = (
  s: State,
  player: number,
  faction: Faction,
  home: number,
  plannedKind: number,
  cmds: Command[],
  memory?: BotMemory,
): ExpansionAttempt => {
  const e = s.e;
  let outcome: BotIntentRecord | undefined;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.owner[i] !== player || e.kind[i] !== plannedKind) continue;
    if (e.order[i] !== Order.Idle || !isLiftedStructureFlags(e.flags[i]!)) continue;
    for (const site of candidateSites(s, player, home, plannedKind, { islands: true, memory })) {
      const point = siteCenter(site);
      const command: Command = { t: 'land', building: eid(e, i), x: point.x, y: point.y };
      if (!validateCommand(s, player, command).ok) continue;
      cmds.push(command);
      return { queued: true };
    }
    if (!outcome) {
      for (const site of candidateSites(s, player, home, plannedKind, { islands: true })) {
        const point = siteCenter(site);
        if (memory && locationBlockedByIntentMemory(memory, point.x, point.y)) continue;
        outcome = expansionOutcome(faction, point, { status: 'blocked', reason: 'occupied-location' });
        break;
      }
    }
  }
  return { queued: false, ...(outcome ? { outcome } : {}) };
};

export const queueExpansion = (
  s: State,
  player: number,
  faction: Faction,
  facts: BotFacts,
  cmds: Command[],
  budget: ResourceBudget,
  worker: number,
  findSpot: PointSpotFinder,
  memory?: BotMemory,
  pressure: ExpansionPressure = {},
): ExpansionAttempt => {
  if (facts.primaryBase === NONE) return { queued: false };
  const lifted = queueLiftedIslandDepot(s, player, faction, facts.primaryBase, faction.depot, cmds, memory);
  if (lifted.queued || lifted.outcome) return lifted;
  const foundation = queueFoundationExpansion(s, player, faction, facts, cmds, worker);
  if (foundation) return foundation;
  const pendingOutcome = pendingExpansionOutcome(s, player, faction, facts);
  if (pendingOutcome) return { queued: false, outcome: pendingOutcome };
  const bank = expansionBank(pressure);
  if (budget.minerals < bank) return { queued: false };
  if (ownedOrPendingDepotCount(s, player, faction.depot) >= desiredDepotCount(budget.minerals, bank)) return { queued: false };

  let outcome: BotIntentRecord | undefined;
  const sites = candidateSites(s, player, facts.primaryBase, faction.depot, { memory });
  if (worker === NONE) {
    const site = sites[0];
    return site
      ? {
        queued: false,
        outcome: expansionOutcome(faction, siteCenter(site), { status: 'waiting', reason: 'no-builder' }),
      }
      : { queued: false };
  }

  for (const site of sites) {
    const point = siteCenter(site);
    if (expansionThreatened(s, player, faction, facts, point)) {
      outcome ??= expansionOutcome(faction, point, { status: 'blocked', reason: 'unsafe-location' });
      continue;
    }
    if (expansionRouteBlocked(s, worker, point)) {
      outcome ??= expansionOutcome(faction, point, { status: 'blocked', reason: 'path-blocked' });
      continue;
    }

    const build = queueStructureAtPoint(s, player, cmds, budget, worker, faction.depot, point.x, point.y, findSpot, { role: 'resource-depot' });
    if (build.queued) {
      return { queued: true, ...(outcome ? { outcome } : {}) };
    }
    if (build.block) {
      const reason = build.block.reason === 'placement-unavailable' ? 'occupied-location' : build.block.reason;
      outcome ??= expansionOutcome(faction, point, locationFailure(reason)
        ? { status: 'blocked', reason }
        : { status: 'waiting', reason });
    }
  }
  return { queued: false, ...(outcome ? { outcome } : {}) };
};

export const maybeQueueExpansion = (
  s: State,
  player: number,
  faction: Faction,
  facts: BotFacts,
  cmds: Command[],
  budget: ResourceBudget,
  worker: number,
  findSpot: PointSpotFinder,
  memory?: BotMemory,
): boolean => queueExpansion(s, player, faction, facts, cmds, budget, worker, findSpot, memory).queued;
