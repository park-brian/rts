// Map definition (static data consumed by the sim). Terrain is tile-grid based,
// while resources keep both BW concepts explicit: integer initial build-tile
// footprint (`x`,`y`) for placement legality, plus optional integer pixel center
// (`px`,`py`) for exact dock-distance and harvest timing.
// See docs/specs/maps.md.

import { Kind, PATCH_AMOUNT, TILE, Units } from './data.ts';
import { fx, isqrt } from './fixed.ts';
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
export const BASE_GAS_DOCK_DISTANCE_PX = 83;
export const BASE_CLUSTER_RESERVATION_MARGIN_TILES = 1;

export const BASE_MINERAL_ARC_OFFSETS = [
  { dx: -7, dy: 3 },
  { dx: -6, dy: 5 },
  { dx: -4, dy: 5 },
  { dx: -2, dy: 5 },
  { dx: 0, dy: 5 },
  { dx: 2, dy: 5 },
  { dx: 6, dy: 3 },
  { dx: 6, dy: 2 },
] as const;
export const BASE_GAS_ARC_OFFSET = { dx: 6, dy: 5 } as const;

const tileCenterPx = (t: number): number => t * TILE + (TILE >> 1);

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

const clusterReservation = (depot: ResourceFootprint, resources: ResourceSpawn[]): ResourceFootprint =>
  expandResourceFootprint(
    resourceFootprintBounds([depot, ...resources.map(resourceSpawnFootprint)]),
    BASE_CLUSTER_RESERVATION_MARGIN_TILES,
  );

export const solveBaseCluster = (start: StartLoc, frontDir: -1 | 1): BaseCluster => {
  const depotFootprint = baseDepotFootprint(start);
  const resources = [
    ...BASE_MINERAL_ARC_OFFSETS.map(({ dx, dy }) =>
      resourceFromCenterTile(start.x + dx, start.y + frontDir * dy, PATCH_AMOUNT, false),
    ),
    resourceFromCenterTile(start.x + BASE_GAS_ARC_OFFSET.dx, start.y + frontDir * BASE_GAS_ARC_OFFSET.dy, 0, true),
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
