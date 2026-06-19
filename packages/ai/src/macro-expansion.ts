import {
  Order,
  Kind,
  NONE,
  ONE,
  Role,
  TILE,
  baseDepotFootprint,
  eid,
  footprintsOverlap,
  isLarvaSourceKind,
  isLiftedStructureFlags,
  sameTeam,
  structureFootprint,
  validateCommand,
  type BaseSite,
  type Command,
  type Faction,
  type State,
} from '@rts/sim';
import { maybeQueueStructureAtPoint, type PointSpotFinder, type ResourceBudget } from './macro-build.ts';
import type { BotIntentRecord } from './macro-intents.ts';
import { locationBlockedByIntentMemory, type BotMemory } from './macro-memory.ts';
import type { BotFacts } from './macro.ts';

const EXPANSION_BANK = 1_000;
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

const depotKind = (kind: number): boolean =>
  kind === Kind.CommandCenter || kind === Kind.Nexus || isLarvaSourceKind(kind);

const siteDepotFootprint = (site: BaseSite): { x0: number; y0: number; x1: number; y1: number } =>
  site.depotFootprint ?? baseDepotFootprint(site);

const footprintTouchesSite = (kind: number, x: number, y: number, site: BaseSite): boolean =>
  footprintsOverlap(structureFootprint(kind, x, y), siteDepotFootprint(site));

const siteReservedByTeam = (s: State, player: number, site: BaseSite, plannedKind: number): boolean => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || !sameTeam(s, e.owner[i]!, player)) continue;
    const kind = e.kind[i]!;
    if (depotKind(kind) && footprintTouchesSite(kind, e.x[i]!, e.y[i]!, site)) return true;
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
    if (depotKind(e.kind[i]!)) {
      count++;
    } else if ((e.flags[i]! & Role.Worker) !== 0 && e.buildKind[i] === plannedKind) {
      count++;
    }
  }
  return count;
};

const desiredDepotCount = (minerals: number): number =>
  Math.min(EXPANSION_MAX, 2 + Math.trunc((minerals - EXPANSION_BANK) / EXPANSION_STEP));

const expansionOutcome = (
  faction: Faction,
  point: { x: number; y: number },
  result: BotIntentRecord['result'],
): BotIntentRecord => ({
  intent: { kind: 'expand', urgency: 35, targetKind: faction.depot, x: point.x, y: point.y },
  result,
});

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
): ExpansionAttempt => {
  if (facts.primaryBase === NONE) return { queued: false };
  const lifted = queueLiftedIslandDepot(s, player, faction, facts.primaryBase, faction.depot, cmds, memory);
  if (lifted.queued || lifted.outcome) return lifted;
  if (budget.minerals < EXPANSION_BANK) return { queued: false };
  if (ownedOrPendingDepotCount(s, player, faction.depot) >= desiredDepotCount(budget.minerals)) return { queued: false };

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
    if (maybeQueueStructureAtPoint(s, player, cmds, budget, worker, faction.depot, point.x, point.y, findSpot)) {
      return { queued: true };
    }
    outcome ??= expansionOutcome(faction, point, { status: 'blocked', reason: 'occupied-location' });
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
