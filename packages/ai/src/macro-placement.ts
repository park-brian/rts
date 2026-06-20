import {
  Kind,
  NONE,
  ONE,
  Role,
  TILE,
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
  type BaseResourceDir,
  type Footprint,
  type ResourceFootprint,
  type StartLoc,
  type State,
} from '@rts/sim';

const px = (tile: number): number => tile * TILE * ONE + ((TILE * ONE) >> 1);
const SEARCH_MIN_RADIUS_TILES = 3;
const SEARCH_MAX_RADIUS_TILES = 14;
const BASE_RESOURCE_EDGE_LIMIT_TILES = 12;
const RESOURCE_RESERVATION_PENALTY = 80_000;
const HARVEST_CORRIDOR_PENALTY = 120_000;
const SMALL_DEFENSE_CORRIDOR_PENALTY = 7_500;
const ADDON_CLEARANCE_PENALTY = 95_000;

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

const placementContext = (s: State, player: number): PlacementContext => ({
  harvest: harvestPlacementContext(s),
  addonSlots: existingAddonSlots(s, player),
});

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
): { x: number; y: number } | null => {
  const context = placementContext(s, player);
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
): { x: number; y: number } | null => {
  return findBestSpot(s, player, worker, kind, [{ x: bx, y: by }]);
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
): { x: number; y: number } | null => {
  const e = s.e;
  if (!requiresPower(kind)) return findSpot(s, player, worker, kind, e.x[fallback]!, e.y[fallback]!);

  const anchors: BuildAnchor[] = [];
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.owner[i] !== player || e.built[i] !== 1 || e.kind[i] !== Kind.Pylon) continue;
    anchors.push({ x: e.x[i]!, y: e.y[i]! });
  }
  anchors.push({ x: e.x[fallback]!, y: e.y[fallback]! });

  return findBestSpot(s, player, worker, kind, anchors);
};
