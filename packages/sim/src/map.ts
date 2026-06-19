// Map definition (static data consumed by the sim). Terrain is tile-grid based,
// while resources keep both BW concepts explicit: integer initial build-tile
// footprint (`x`,`y`) for placement legality, plus optional integer pixel center
// (`px`,`py`) for exact dock-distance and harvest timing.
// See docs/specs/maps.md.

import { Kind, PATCH_AMOUNT, TILE, Units } from './data.ts';
import { fx, isqrt, ONE } from './fixed.ts';
import { topDownDockingPoint } from './spatial.ts';

export type ResourceSpawn = { x: number; y: number; amount: number; gas: boolean; px?: number; py?: number };
export type StartLoc = { x: number; y: number };
export type ResourceFootprint = { x0: number; y0: number; x1: number; y1: number };
export type BaseSiteKind = 'main' | 'natural' | 'third' | 'center' | 'island' | 'fortress';
export type BaseSite = {
  kind: BaseSiteKind;
  team: number;
  owner?: number;
  x: number;
  y: number;
  depotFootprint?: ResourceFootprint;
  reservation?: ResourceFootprint;
  resourceDir: -1 | 1;
  rampX?: number;
  rampY?: number;
  timingProfile?: string;
};

export type BaseCluster = {
  x: number;
  y: number;
  resourceDir: -1 | 1;
  depotFootprint: ResourceFootprint;
  resourceFootprints: ResourceFootprint[];
  reservation: ResourceFootprint;
  resources: ResourceSpawn[];
};

export type MapDef = {
  name: string;
  w: number; // width in build tiles
  h: number; // height in build tiles
  walk: Uint8Array; // 1 = walkable ground, 0 = blocked (cliff/obstacle)
  build: Uint8Array; // 1 = buildable
  elev: Uint8Array; // elevation level (0 low, 1 high, ...)
  starts: StartLoc[];
  resources: ResourceSpawn[];
  teams: number[]; // team id per start index
  bases?: BaseSite[];
};

export const tileIndex = (m: MapDef, tx: number, ty: number): number => ty * m.w + tx;
export const inBounds = (m: MapDef, tx: number, ty: number): boolean =>
  tx >= 0 && ty >= 0 && tx < m.w && ty < m.h;
export const walkable = (m: MapDef, tx: number, ty: number): boolean =>
  inBounds(m, tx, ty) && m.walk[ty * m.w + tx] === 1;
export const buildable = (m: MapDef, tx: number, ty: number): boolean =>
  inBounds(m, tx, ty) && m.build[ty * m.w + tx] === 1;

export const BASE_MINERAL_DOCK_DISTANCE_PX = 97;
export const BASE_GAS_DOCK_DISTANCE_PX = 89;
export const BASE_CLUSTER_RESERVATION_MARGIN_TILES = 1;

// Local base-space resource arc for vertical-facing bases. Mineral patches are
// 2x1 build footprints, so the useful invariant is the average depot-dock to
// patch-dock trip distance, not a perfect circle through footprint centers.
export const BASE_MINERAL_ARC_OFFSETS = [
  { dx: -7, dy: 2 },
  { dx: -7, dy: 3 },
  { dx: -6, dy: 4 },
  { dx: -5, dy: 5 },
  { dx: 0, dy: 6 },
  { dx: 2, dy: 5 },
  { dx: 6, dy: 4 },
  { dx: 7, dy: 3 },
] as const;
export const BASE_GAS_ARC_OFFSET = { dx: 6, dy: 5 } as const;

const tileCenterPx = (t: number): number => t * TILE + (TILE >> 1);
const CENTER_DY_REPAIRS = [0, 1, -1] as const;

type ResourceCandidate = {
  resource: ResourceSpawn;
  footprint: ResourceFootprint;
  distance: number;
  score: number;
};

export const resourceSpawnCenterPx = (r: ResourceSpawn): { x: number; y: number } => {
  if (r.px !== undefined && r.py !== undefined) return { x: r.px, y: r.py };
  return {
    x: (r.x + (r.gas ? 2 : 1)) * TILE,
    y: (r.y + (r.gas ? 1 : 0.5)) * TILE,
  };
};

export const resourceSpawnFootprint = (r: ResourceSpawn): ResourceFootprint => ({
  x0: r.x,
  y0: r.y,
  x1: r.x + (r.gas ? 4 : 2) - 1,
  y1: r.y + (r.gas ? 2 : 1) - 1,
});

const footprintFromTile = (tile: { x: number; y: number }, gas: boolean): ResourceFootprint => ({
  x0: tile.x,
  y0: tile.y,
  x1: tile.x + (gas ? 4 : 2) - 1,
  y1: tile.y + (gas ? 2 : 1) - 1,
});

export const resourceFootprintsOverlap = (a: ResourceFootprint, b: ResourceFootprint): boolean =>
  a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;

export const baseResourceDockDistance = (
  resourceKind: number,
  sx: number,
  sy: number,
  px: number,
  py: number,
  workerKind = Kind.SCV,
  depotKind = Kind.CommandCenter,
): number => {
  const depotCenter = { x: fx(tileCenterPx(sx)), y: fx(tileCenterPx(sy)) };
  const resourceCenter = { x: fx(px), y: fx(py) };
  const resourceDock = topDownDockingPoint(
    workerKind,
    resourceKind,
    resourceCenter.x,
    resourceCenter.y,
    Units[resourceKind]!.roles,
    depotCenter.x,
    depotCenter.y,
  );
  const depotDock = topDownDockingPoint(
    workerKind,
    depotKind,
    depotCenter.x,
    depotCenter.y,
    Units[depotKind]!.roles,
    resourceCenter.x,
    resourceCenter.y,
  );
  const dx = resourceDock.x - depotDock.x;
  const dy = resourceDock.y - depotDock.y;
  return isqrt(dx * dx + dy * dy);
};

export const baseDepotFootprint = (start: StartLoc): ResourceFootprint => ({
  x0: start.x - 2,
  y0: start.y - 1,
  x1: start.x + 1,
  y1: start.y + 1,
});

export const expandResourceFootprint = (fp: ResourceFootprint, margin: number): ResourceFootprint => ({
  x0: fp.x0 - margin,
  y0: fp.y0 - margin,
  x1: fp.x1 + margin,
  y1: fp.y1 + margin,
});

export const resourceFootprintBounds = (fps: ResourceFootprint[]): ResourceFootprint => {
  if (fps.length === 0) throw new Error('resourceFootprintBounds: empty footprint list');
  return {
    x0: Math.min(...fps.map((fp) => fp.x0)),
    y0: Math.min(...fps.map((fp) => fp.y0)),
    x1: Math.max(...fps.map((fp) => fp.x1)),
    y1: Math.max(...fps.map((fp) => fp.y1)),
  };
};

const legalStartResourceTile = (
  depot: ResourceFootprint,
  tile: { x: number; y: number },
  gas: boolean,
  frontDir: -1 | 1,
): boolean => {
  if (gas) {
    return frontDir < 0
      ? !(tile.x > depot.x0 - 7 && tile.y > depot.y0 - 5 && tile.x < depot.x0 + 7 && tile.y < depot.y0 + 6)
      : !(tile.x > depot.x0 - 7 && tile.y > depot.y1 - 6 && tile.x < depot.x0 + 7 && tile.y < depot.y1 + 3);
  }
  return frontDir < 0
    ? !(tile.x > depot.x0 - 5 && tile.y > depot.y0 - 4 && tile.x < depot.x0 + 7 && tile.y < depot.y0 + 6)
    : !(tile.x > depot.x0 - 5 && tile.y > depot.y1 - 6 && tile.x < depot.x0 + 7 && tile.y < depot.y1 + 4);
};

const resourceFromCenterTile = (centerX: number, centerY: number, amount: number, gas: boolean): ResourceSpawn => ({
  x: centerX - (gas ? 2 : 1),
  y: centerY - (gas ? 1 : 0),
  px: tileCenterPx(centerX),
  py: tileCenterPx(centerY),
  amount,
  gas,
});

const resourceCandidate = (
  depotFootprint: ResourceFootprint,
  start: StartLoc,
  frontDir: -1 | 1,
  centerX: number,
  centerDy: number,
  amount: number,
  gas: boolean,
  repairCost: number,
): ResourceCandidate | null => {
  const centerY = start.y + frontDir * centerDy;
  const resource = resourceFromCenterTile(centerX, centerY, amount, gas);
  if (!legalStartResourceTile(depotFootprint, { x: resource.x, y: resource.y }, gas, frontDir)) return null;
  const kind = gas ? Kind.Refinery : Kind.Mineral;
  const target = gas ? BASE_GAS_DOCK_DISTANCE_PX : BASE_MINERAL_DOCK_DISTANCE_PX;
  const distance = baseResourceDockDistance(kind, start.x, start.y, resource.px!, resource.py!);
  const error = Math.abs(distance - fx(target));
  return {
    resource,
    footprint: resourceSpawnFootprint(resource),
    distance,
    score: error + repairCost * ONE,
  };
};

const bestGasCandidate = (depotFootprint: ResourceFootprint, start: StartLoc, frontDir: -1 | 1): ResourceCandidate => {
  let best: ResourceCandidate | null = null;
  for (const dyRepair of CENTER_DY_REPAIRS) {
    const candidate = resourceCandidate(
      depotFootprint,
      start,
      frontDir,
      start.x + BASE_GAS_ARC_OFFSET.dx,
      BASE_GAS_ARC_OFFSET.dy + dyRepair,
      0,
      true,
      Math.abs(dyRepair),
    );
    if (candidate === null) continue;
    if (best === null || candidate.score < best.score || (candidate.score === best.score && candidate.distance < best.distance)) {
      best = candidate;
    }
  }
  if (best === null) throw new Error('solveBaseCluster: no legal gas arc position');
  return best;
};

const mineralCandidates = (
  depotFootprint: ResourceFootprint,
  start: StartLoc,
  frontDir: -1 | 1,
  gas: ResourceCandidate,
): ResourceCandidate[][] =>
  BASE_MINERAL_ARC_OFFSETS.map(({ dx, dy }) =>
    CENTER_DY_REPAIRS
      .map((dyRepair) =>
        resourceCandidate(depotFootprint, start, frontDir, start.x + dx, dy + dyRepair, PATCH_AMOUNT, false, Math.abs(dyRepair)),
      )
      .filter((candidate): candidate is ResourceCandidate =>
        candidate !== null && !resourceFootprintsOverlap(candidate.footprint, gas.footprint),
      )
      .sort((a, b) => a.score - b.score || a.distance - b.distance || a.resource.y - b.resource.y || a.resource.x - b.resource.x),
  );

const solveMineralArc = (sets: ResourceCandidate[][]): ResourceCandidate[] => {
  if (sets.some((set) => set.length === 0)) throw new Error('solveBaseCluster: no legal mineral arc position');
  const chosen: ResourceCandidate[] = new Array(sets.length);
  const used: ResourceFootprint[] = [];
  let best: ResourceCandidate[] | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  const search = (index: number, score: number, minDistance: number, maxDistance: number): void => {
    if (score >= bestScore) return;
    if (index === sets.length) {
      const spread = maxDistance - minDistance;
      const total = score + spread * 4;
      if (total < bestScore) {
        bestScore = total;
        best = [...chosen];
      }
      return;
    }
    for (const candidate of sets[index]!) {
      if (used.some((fp) => resourceFootprintsOverlap(fp, candidate.footprint))) continue;
      chosen[index] = candidate;
      used.push(candidate.footprint);
      search(index + 1, score + candidate.score, Math.min(minDistance, candidate.distance), Math.max(maxDistance, candidate.distance));
      used.pop();
    }
  };

  search(0, 0, Number.POSITIVE_INFINITY, 0);
  if (best === null) throw new Error('solveBaseCluster: no non-overlapping mineral arc position');
  return best;
};

const clusterReservation = (depot: ResourceFootprint, resources: ResourceSpawn[]): ResourceFootprint =>
  expandResourceFootprint(
    resourceFootprintBounds([depot, ...resources.map(resourceSpawnFootprint)]),
    BASE_CLUSTER_RESERVATION_MARGIN_TILES,
  );

export const solveBaseCluster = (start: StartLoc, frontDir: -1 | 1): BaseCluster => {
  const depotFootprint = baseDepotFootprint(start);
  const gas = bestGasCandidate(depotFootprint, start, frontDir);
  const minerals = solveMineralArc(mineralCandidates(depotFootprint, start, frontDir, gas));
  const resources = [
    ...minerals.map((candidate) => candidate.resource),
    gas.resource,
  ];
  for (const resource of resources) {
    if (!legalStartResourceTile(depotFootprint, { x: resource.x, y: resource.y }, resource.gas, frontDir)) {
      throw new Error('solveBaseCluster: hardcoded resource arc violates depot exclusion grid');
    }
  }
  return {
    x: start.x,
    y: start.y,
    resourceDir: frontDir,
    depotFootprint,
    resourceFootprints: resources.map(resourceSpawnFootprint),
    reservation: clusterReservation(depotFootprint, resources),
    resources,
  };
};

export const addBaseClusterResources = (out: ResourceSpawn[], start: StartLoc, frontDir: -1 | 1): BaseCluster => {
  const cluster = solveBaseCluster(start, frontDir);
  out.push(...cluster.resources);
  return cluster;
};

export const addStartingResources = (out: ResourceSpawn[], start: StartLoc, frontDir: -1 | 1): BaseCluster => {
  return addBaseClusterResources(out, start, frontDir);
};

/** A small, symmetric, open vertical-major 1v1 slice map (no obstacles). */
export const sliceMap = (): MapDef => {
  const w = 64;
  const h = 96;
  const n = w * h;
  const walk = new Uint8Array(n).fill(1);
  const build = new Uint8Array(n).fill(1);
  const elev = new Uint8Array(n);
  const starts: StartLoc[] = [
    { x: w >> 1, y: h - 12 }, // south (player 0)
    { x: w >> 1, y: 12 }, // north (player 1)
  ];
  const resources: ResourceSpawn[] = [];
  for (const s of starts) {
    const dir = s.y > h >> 1 ? -1 : 1;
    addStartingResources(resources, s, dir);
  }
  return { name: 'Slice (1v1, S vs N)', w, h, walk, build, elev, starts, resources, teams: [0, 1] };
};
