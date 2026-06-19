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

const candidateSites = (
  s: State,
  player: number,
  home: number,
  plannedKind: number,
  options: { islands?: boolean } = {},
): BaseSite[] => {
  const e = s.e;
  const ownTeam = s.teams[player] ?? player;
  const hx = e.x[home]!;
  const hy = e.y[home]!;
  return [...(s.map.bases ?? [])]
    .filter((site) => options.islands === true ? site.kind === 'island' : site.kind !== 'island')
    .filter((site) => site.owner === undefined || site.owner === player)
    .filter((site) => site.team < 0 || site.team === ownTeam)
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

const maybeLandLiftedIslandDepot = (
  s: State,
  player: number,
  home: number,
  plannedKind: number,
  cmds: Command[],
): boolean => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.owner[i] !== player || e.kind[i] !== plannedKind) continue;
    if (e.order[i] !== Order.Idle || !isLiftedStructureFlags(e.flags[i]!)) continue;
    for (const site of candidateSites(s, player, home, plannedKind, { islands: true })) {
      const point = siteCenter(site);
      const command: Command = { t: 'land', building: eid(e, i), x: point.x, y: point.y };
      if (!validateCommand(s, player, command).ok) continue;
      cmds.push(command);
      return true;
    }
  }
  return false;
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
): boolean => {
  if (facts.primaryBase === NONE) return false;
  if (maybeLandLiftedIslandDepot(s, player, facts.primaryBase, faction.depot, cmds)) return true;
  if (worker === NONE) return false;
  if (budget.minerals < EXPANSION_BANK) return false;
  if (ownedOrPendingDepotCount(s, player, faction.depot) >= desiredDepotCount(budget.minerals)) return false;

  for (const site of candidateSites(s, player, facts.primaryBase, faction.depot)) {
    const point = siteCenter(site);
    if (maybeQueueStructureAtPoint(s, player, cmds, budget, worker, faction.depot, point.x, point.y, findSpot)) {
      return true;
    }
  }
  return false;
};
