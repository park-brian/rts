import {
  Kind,
  NONE,
  ONE,
  Role,
  TILE,
  TechDefs,
  Units,
  addonKindsForParent,
  addonPosition,
  baseDepotFootprint,
  buildable,
  canPlaceStructure,
  expandResourceFootprint,
  footprintsOverlap,
  inBounds,
  isSmallStaticDefenseKind,
  requiresPower,
  resourceDirVector,
  resourceFootprintBounds,
  resourceSpawnCenterPx,
  resourceSpawnFootprint,
  structureFootprint,
  tileX,
  tileY,
  tiles,
  walkable,
  type BaseResourceDir,
  type Footprint,
  type ResourceFootprint,
  type StartLoc,
  type State,
} from '@rts/sim';
import { riskAtLayer, type BotRiskMap } from './macro-risk.ts';

const px = (tile: number): number => tile * TILE * ONE + ((TILE * ONE) >> 1);
const SEARCH_MIN_RADIUS_TILES = 3;
const SEARCH_MAX_RADIUS_TILES = 14;
const BASE_RESOURCE_EDGE_LIMIT_TILES = 12;
const RESOURCE_RESERVATION_PENALTY = 80_000;
const HARVEST_CORRIDOR_PENALTY = 120_000;
const SMALL_DEFENSE_CORRIDOR_PENALTY = 7_500;
const ADDON_CLEARANCE_PENALTY = 95_000;
const BUILDING_RING_PENALTY = 24_000;
const BUILDING_RING_BLOCKED_TILE_PENALTY = 3_000;
const ROUTE_RISK_PENALTY = 220;
const ROUTE_RISK_MAX_STEPS = 12;

type BuildAnchor = { x: number; y: number };
type BuildCandidate = { x: number; y: number; score: number; order: number };
type HarvestBase = {
  start: StartLoc;
  dir: BaseResourceDir;
  depot: ResourceFootprint;
  reservation: ResourceFootprint | null;
};
type HarvestPlacementContext = {
  corridors: ResourceFootprint[];
  reservation: ResourceFootprint | null;
};
type PlacementContext = {
  harvest: HarvestPlacementContext[];
  addonSlots: Footprint[];
  buildingRings: Footprint[];
  blockers: Footprint[];
  risk?: BotRiskMap;
  workerX: number;
  workerY: number;
};
export type PlacementOptions = {
  risk?: BotRiskMap;
};

const tileCenterPx = (tile: number): number => tile * TILE + (TILE >> 1);

const inferredResourceDir = (s: State, start: StartLoc): BaseResourceDir =>
  start.y > (s.map.h >> 1) ? -1 : 1;

const harvestBases = (s: State): HarvestBase[] => {
  const bases = s.map.bases;
  if (bases && bases.length > 0) {
    return bases.map((base) => {
      const start = { x: base.x, y: base.y };
      return {
        start,
        dir: base.resourceDir,
        depot: base.depotFootprint ?? baseDepotFootprint(start),
        reservation: base.reservation ?? null,
      };
    });
  }

  return s.map.starts.map((start) => ({
    start,
    dir: inferredResourceDir(s, start),
    depot: baseDepotFootprint(start),
    reservation: null,
  }));
};

const resourceInFrontOfBase = (base: HarvestBase, center: { x: number; y: number }): boolean => {
  const dir = resourceDirVector(base.dir);
  return (center.x - tileCenterPx(base.start.x)) * dir.x + (center.y - tileCenterPx(base.start.y)) * dir.y > 0;
};

const nearbyResourceFootprints = (s: State, base: HarvestBase): ResourceFootprint[] => {
  const bx = tileCenterPx(base.start.x);
  const by = tileCenterPx(base.start.y);
  const limit = BASE_RESOURCE_EDGE_LIMIT_TILES * TILE;
  const limitSq = limit * limit;

  return s.map.resources
    .filter((resource) => {
      const center = resourceSpawnCenterPx(resource);
      const dx = center.x - bx;
      const dy = center.y - by;
      return dx * dx + dy * dy <= limitSq && resourceInFrontOfBase(base, center);
    })
    .map(resourceSpawnFootprint);
};

const fallbackReservation = (base: HarvestBase, resources: ResourceFootprint[]): ResourceFootprint | null =>
  resources.length === 0 ? null : expandResourceFootprint(resourceFootprintBounds([base.depot, ...resources]), 1);

const corridorBetween = (a: ResourceFootprint, b: ResourceFootprint): ResourceFootprint => ({
  x0: Math.min(a.x0, b.x0),
  y0: Math.min(a.y0, b.y0),
  x1: Math.max(a.x1, b.x1),
  y1: Math.max(a.y1, b.y1),
});

const harvestPlacementContext = (s: State): HarvestPlacementContext[] =>
  harvestBases(s).map((base) => {
    const resources = nearbyResourceFootprints(s, base);
    return {
      corridors: resources.map((resource) => corridorBetween(base.depot, resource)),
      reservation: base.reservation ?? fallbackReservation(base, resources),
    };
  });

const TECH_PRODUCER_KINDS = new Set(
  Object.values(TechDefs).flatMap((def) => def.producers),
);

const expandedFootprint = (fp: Footprint, margin: number): Footprint => ({
  x0: fp.x0 - margin,
  y0: fp.y0 - margin,
  x1: fp.x1 + margin,
  y1: fp.y1 + margin,
});

const footprintContainsTile = (fp: Footprint, tx: number, ty: number): boolean =>
  tx >= fp.x0 && tx <= fp.x1 && ty >= fp.y0 && ty <= fp.y1;

const protectsBuildingRing = (kind: number): boolean => {
  const def = Units[kind];
  if (!def || (def.roles & Role.Structure) === 0) return false;
  if (def.requiresGeyser || def.buildMethod === 'addon' || isSmallStaticDefenseKind(kind)) return false;
  return (def.produces?.length ?? 0) > 0 || TECH_PRODUCER_KINDS.has(kind);
};

const addonFootprintAt = (parentKind: number, x: number, y: number, addonKind: number): Footprint => {
  const parentDef = Units[parentKind]!;
  const addonDef = Units[addonKind]!;
  return structureFootprint(
    addonKind,
    x + tiles((parentDef.footprintW + addonDef.footprintW) / 2),
    y + tiles((parentDef.footprintH - addonDef.footprintH) / 2),
  );
};

const addonSlotBlocked = (s: State, fp: Footprint): boolean => {
  for (let ty = fp.y0; ty <= fp.y1; ty++) {
    for (let tx = fp.x0; tx <= fp.x1; tx++) {
      if (!inBounds(s.map, tx, ty) || !buildable(s.map, tx, ty)) return true;
    }
  }

  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1) continue;
    if ((e.flags[i]! & (Role.Structure | Role.Resource)) === 0 && e.kind[i] !== Kind.Geyser) continue;
    if (footprintsOverlap(fp, structureFootprint(e.kind[i]!, e.x[i]!, e.y[i]!))) return true;
  }
  return false;
};

const blocksPlacementRing = (s: State, slot: number): boolean => {
  const e = s.e;
  if (e.alive[slot] !== 1) return false;
  if ((e.flags[slot]! & Role.Air) !== 0) return false;
  if ((e.flags[slot]! & (Role.Structure | Role.Resource)) !== 0) return true;
  return e.kind[slot] === Kind.Geyser;
};

const placementBlockers = (s: State): Footprint[] => {
  const e = s.e;
  const blockers: Footprint[] = [];
  for (let i = 0; i < e.hi; i++) {
    if (!blocksPlacementRing(s, i)) continue;
    blockers.push(structureFootprint(e.kind[i]!, e.x[i]!, e.y[i]!));
  }
  return blockers;
};

const existingBuildingRings = (s: State, player: number): Footprint[] => {
  const e = s.e;
  const rings: Footprint[] = [];
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.owner[i] !== player) continue;
    if (!protectsBuildingRing(e.kind[i]!)) continue;
    rings.push(expandedFootprint(structureFootprint(e.kind[i]!, e.x[i]!, e.y[i]!), 1));
  }
  return rings;
};

const existingAddonSlots = (s: State, player: number): Footprint[] => {
  const e = s.e;
  const slots: Footprint[] = [];
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.owner[i] !== player) continue;
    if (e.target[i] !== NONE) continue;
    const addons = addonKindsForParent(e.kind[i]!);
    if (addons.length === 0) continue;
    const pos = addonPosition(s, i, addons[0]!);
    slots.push(structureFootprint(addons[0]!, pos.x, pos.y));
  }
  return slots;
};

const placementContext = (s: State, player: number, worker: number, options: PlacementOptions = {}): PlacementContext => ({
  harvest: harvestPlacementContext(s),
  addonSlots: existingAddonSlots(s, player),
  buildingRings: existingBuildingRings(s, player),
  blockers: placementBlockers(s),
  risk: options.risk,
  workerX: s.e.x[worker]!,
  workerY: s.e.y[worker]!,
});

const blockedRingTiles = (s: State, context: PlacementContext, fp: Footprint): number => {
  let blocked = 0;
  const ring = expandedFootprint(fp, 1);
  for (let ty = ring.y0; ty <= ring.y1; ty++) {
    for (let tx = ring.x0; tx <= ring.x1; tx++) {
      if (footprintContainsTile(fp, tx, ty)) continue;
      if (!inBounds(s.map, tx, ty) || !walkable(s.map, tx, ty)) {
        blocked++;
        continue;
      }
      if (context.blockers.some((blocker) => footprintContainsTile(blocker, tx, ty))) {
        blocked++;
      }
    }
  }
  return blocked;
};

const routeRiskScore = (context: PlacementContext, x: number, y: number): number => {
  const risk = context.risk;
  if (!risk || risk.antiGround.length === 0) return 0;

  const dx = x - context.workerX;
  const dy = y - context.workerY;
  const tileDx = Math.abs(tileX(x) - tileX(context.workerX));
  const tileDy = Math.abs(tileY(y) - tileY(context.workerY));
  const steps = Math.max(1, Math.min(ROUTE_RISK_MAX_STEPS, Math.max(tileDx, tileDy)));
  let score = 0;
  for (let step = 0; step <= steps; step++) {
    const px = context.workerX + Math.trunc((dx * step) / steps);
    const py = context.workerY + Math.trunc((dy * step) / steps);
    score += riskAtLayer(risk, risk.antiGround, px, py);
  }
  return score * ROUTE_RISK_PENALTY;
};

const placementPreferenceScore = (s: State, context: PlacementContext, kind: number, x: number, y: number, fp: Footprint): number => {
  const smallDefense = isSmallStaticDefenseKind(kind);
  let score = 0;

  for (const { corridors, reservation } of context.harvest) {
    if (reservation && footprintsOverlap(fp, reservation)) {
      score += smallDefense ? SMALL_DEFENSE_CORRIDOR_PENALTY : RESOURCE_RESERVATION_PENALTY;
    }
    for (const corridor of corridors) {
      if (footprintsOverlap(fp, corridor)) {
        score += smallDefense ? SMALL_DEFENSE_CORRIDOR_PENALTY : HARVEST_CORRIDOR_PENALTY;
      }
    }
  }

  for (const addonSlot of context.addonSlots) {
    if (footprintsOverlap(fp, addonSlot)) score += ADDON_CLEARANCE_PENALTY;
  }

  for (const ring of context.buildingRings) {
    if (footprintsOverlap(fp, ring)) score += smallDefense ? SMALL_DEFENSE_CORRIDOR_PENALTY : BUILDING_RING_PENALTY;
  }

  if (protectsBuildingRing(kind)) {
    score += blockedRingTiles(s, context, fp) * BUILDING_RING_BLOCKED_TILE_PENALTY;
  }
  score += routeRiskScore(context, x, y);

  const ownAddons = addonKindsForParent(kind);
  if (ownAddons.length > 0 && addonSlotBlocked(s, addonFootprintAt(kind, x, y, ownAddons[0]!))) {
    score += ADDON_CLEARANCE_PENALTY;
  }

  return score;
};

const betterCandidate = (next: BuildCandidate, best: BuildCandidate | null): boolean =>
  best === null || next.score < best.score || (next.score === best.score && next.order < best.order);

const findBestSpot = (
  s: State,
  player: number,
  worker: number,
  kind: number,
  anchors: BuildAnchor[],
  options: PlacementOptions = {},
): { x: number; y: number } | null => {
  const context = placementContext(s, player, worker, options);
  let best: BuildCandidate | null = null;
  let order = 0;

  for (const anchor of anchors) {
    const btx = tileX(anchor.x);
    const bty = tileY(anchor.y);
    for (let r = SEARCH_MIN_RADIUS_TILES; r <= SEARCH_MAX_RADIUS_TILES; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const placement = canPlaceStructure(s, player, worker, kind, px(btx + dx), px(bty + dy));
          if (!placement.ok) {
            order++;
            continue;
          }

          const fp = structureFootprint(kind, placement.x, placement.y);
          const candidate = {
            x: placement.x,
            y: placement.y,
            score: placementPreferenceScore(s, context, kind, placement.x, placement.y, fp) + dx * dx + dy * dy,
            order,
          };
          if (betterCandidate(candidate, best)) best = candidate;
          order++;
        }
      }
    }
  }

  return best === null ? null : { x: best.x, y: best.y };
};

/** Find a buildable, reasonably clear tile near (bx, by) for a structure. */
export const findSpot = (
  s: State,
  player: number,
  worker: number,
  kind: number,
  bx: number,
  by: number,
  options: PlacementOptions = {},
): { x: number; y: number } | null => {
  return findBestSpot(s, player, worker, kind, [{ x: bx, y: by }], options);
};

export const findExactSpot = (
  s: State,
  player: number,
  worker: number,
  kind: number,
  x: number,
  y: number,
): { x: number; y: number } | null => {
  const placement = canPlaceStructure(s, player, worker, kind, x, y);
  return placement.ok ? { x: placement.x, y: placement.y } : null;
};

export const findMacroSpot = (
  s: State,
  player: number,
  worker: number,
  kind: number,
  fallback: number,
  options: PlacementOptions = {},
): { x: number; y: number } | null => {
  const e = s.e;
  if (!requiresPower(kind)) return findSpot(s, player, worker, kind, e.x[fallback]!, e.y[fallback]!, options);

  const anchors: BuildAnchor[] = [];
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.owner[i] !== player || e.built[i] !== 1 || e.kind[i] !== Kind.Pylon) continue;
    anchors.push({ x: e.x[i]!, y: e.y[i]! });
  }
  anchors.push({ x: e.x[fallback]!, y: e.y[fallback]! });

  return findBestSpot(s, player, worker, kind, anchors, options);
};
