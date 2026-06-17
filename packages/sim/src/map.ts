// Map definition (static data consumed by the sim). Terrain is tile-grid based,
// while resources keep both BW concepts explicit: integer initial build-tile
// footprint (`x`,`y`) for placement legality, plus optional integer pixel center
// (`px`,`py`) for exact body-distance and harvest timing.
// See docs/specs/maps.md.

import { Kind, PATCH_AMOUNT, TILE } from './data.ts';
import { fx, ONE } from './fixed.ts';
import { bodyBounds, bwApproxEdgeDistanceBetween } from './spatial.ts';

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

export const BASE_MINERAL_EDGE_PX = 115;
export const BASE_GAS_EDGE_PX = 112;
export const BASE_CLUSTER_RESERVATION_MARGIN_TILES = 1;

const MINERAL_ARC_X_OFFSETS = [-6, -5, -3, -1, 1, 3, 5, 6] as const;
const GAS_X_OFFSET = 7;
const START_RESOURCE_X_SEARCH_PX = 16;
const START_RESOURCE_Y_SEARCH_PX = 96;

const tileCenterPx = (t: number): number => t * TILE + (TILE >> 1);

type ResourceCandidate = {
  px: number;
  py: number;
  tile: { x: number; y: number };
  footprint: ResourceFootprint;
  score: number;
  distanceError: number;
  xDrift: number;
  yDrift: number;
};

type IndexedCandidates = {
  index: number;
  candidates: ResourceCandidate[];
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

const resourceInitialTile = (kind: number, px: number, py: number): { x: number; y: number } => {
  const b = bodyBounds(kind);
  return {
    x: Math.floor((fx(px) - b.left) / (TILE * ONE)),
    y: Math.floor((fx(py) - b.up) / (TILE * ONE)),
  };
};

const depotResourceDistance = (resourceKind: number, sx: number, sy: number, px: number, py: number): number =>
  bwApproxEdgeDistanceBetween(Kind.CommandCenter, fx(tileCenterPx(sx)), fx(tileCenterPx(sy)), resourceKind, fx(px), fx(py));

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

const legalStartResourceTile = (depot: ResourceFootprint, tile: { x: number; y: number }, gas: boolean): boolean => {
  if (gas) {
    return !(tile.x > depot.x0 - 7 && tile.y > depot.y0 - 5 && tile.x < depot.x0 + 7 && tile.y < depot.y0 + 6);
  }
  return !(tile.x > depot.x0 - 5 && tile.y > depot.y0 - 4 && tile.x < depot.x0 + 7 && tile.y < depot.y0 + 6);
};

const compareCandidates = (a: ResourceCandidate, b: ResourceCandidate): number =>
  a.distanceError - b.distanceError ||
  a.xDrift - b.xDrift ||
  a.yDrift - b.yDrift ||
  a.tile.y - b.tile.y ||
  a.tile.x - b.tile.x ||
  a.px - b.px ||
  a.py - b.py;

const candidateScore = (distanceError: number, xDrift: number, yDrift: number): number =>
  distanceError * 1_000_000 + xDrift * ONE + yDrift;

const resourceCandidateKey = (fp: ResourceFootprint): string => `${fp.x0},${fp.y0},${fp.x1},${fp.y1}`;

const solveResourceCandidates = (
  resourceKind: number,
  start: StartLoc,
  dxTiles: number,
  frontDir: number,
  minAbsTiles: number,
  targetEdgePx: number,
  gas: boolean,
  blocked: ResourceFootprint[],
): ResourceCandidate[] => {
  const nominalX = tileCenterPx(start.x) + dxTiles * TILE;
  const minDelta = minAbsTiles * TILE;
  const maxDelta = minDelta + START_RESOURCE_Y_SEARCH_PX;
  const depot = baseDepotFootprint(start);
  const targetEdge = fx(targetEdgePx);
  const candidates = new Map<string, ResourceCandidate>();

  for (let px = nominalX - START_RESOURCE_X_SEARCH_PX; px <= nominalX + START_RESOURCE_X_SEARCH_PX; px++) {
    for (let delta = minDelta; delta <= maxDelta; delta++) {
      const py = tileCenterPx(start.y) + frontDir * delta;
      const tile = resourceInitialTile(resourceKind, px, py);
      if (!legalStartResourceTile(depot, tile, gas)) continue;
      const fp = footprintFromTile(tile, gas);
      if (blocked.some((other) => resourceFootprintsOverlap(fp, other))) continue;
      const d = depotResourceDistance(resourceKind, start.x, start.y, px, py);
      const distanceError = Math.abs(d - targetEdge);
      const xDrift = Math.abs(px - nominalX);
      const yDrift = Math.abs(delta - minDelta);
      const candidate = {
        px,
        py,
        tile,
        footprint: fp,
        score: candidateScore(distanceError, xDrift, yDrift),
        distanceError,
        xDrift,
        yDrift,
      };
      const key = resourceCandidateKey(fp);
      const existing = candidates.get(key);
      if (existing === undefined || compareCandidates(candidate, existing) < 0) candidates.set(key, candidate);
    }
  }
  return [...candidates.values()].sort(compareCandidates);
};

const solveMineralArc = (
  candidateSets: ResourceCandidate[][],
  blocked: ResourceFootprint[],
): ResourceCandidate[] | null => {
  // Eight 2x1 mineral footprints cannot be chosen greedily on a tight depot-distance arc:
  // pick the whole non-overlapping set so every patch stays on the same BW edge-distance band.
  const ordered: IndexedCandidates[] = candidateSets
    .map((candidates, index) => ({ index, candidates }))
    .sort((a, b) => a.candidates.length - b.candidates.length || a.index - b.index);
  const chosen: ResourceCandidate[] = new Array(candidateSets.length);
  const bestByStep = ordered.map((set) => set.candidates[0]?.score ?? Number.POSITIVE_INFINITY);
  const suffixMin = new Array(ordered.length + 1).fill(0);
  for (let i = ordered.length - 1; i >= 0; i--) suffixMin[i] = suffixMin[i + 1]! + bestByStep[i]!;

  let bestScore = Number.POSITIVE_INFINITY;
  let best: ResourceCandidate[] | null = null;

  const search = (step: number, used: ResourceFootprint[], score: number): void => {
    if (score + suffixMin[step]! >= bestScore) return;
    if (step === ordered.length) {
      bestScore = score;
      best = [...chosen];
      return;
    }

    const { index, candidates } = ordered[step]!;
    for (const candidate of candidates) {
      if (used.some((other) => resourceFootprintsOverlap(candidate.footprint, other))) continue;
      chosen[index] = candidate;
      search(step + 1, [...used, candidate.footprint], score + candidate.score);
    }
  };

  search(0, blocked, 0);
  return best;
};

const toResourceSpawn = (candidate: ResourceCandidate, amount: number, gas: boolean): ResourceSpawn => ({
  x: candidate.tile.x,
  y: candidate.tile.y,
  px: candidate.px,
  py: candidate.py,
  amount,
  gas,
});

const clusterReservation = (depot: ResourceFootprint, resources: ResourceSpawn[]): ResourceFootprint =>
  expandResourceFootprint(
    resourceFootprintBounds([depot, ...resources.map(resourceSpawnFootprint)]),
    BASE_CLUSTER_RESERVATION_MARGIN_TILES,
  );

export const solveBaseCluster = (start: StartLoc, frontDir: -1 | 1): BaseCluster => {
  const gasDx = GAS_X_OFFSET * (frontDir < 0 ? 1 : -1);
  const gasCandidates = solveResourceCandidates(Kind.Geyser, start, gasDx, frontDir, 2, BASE_GAS_EDGE_PX, true, []);
  let bestScore = Number.POSITIVE_INFINITY;
  let bestMinerals: ResourceCandidate[] | null = null;
  let bestGas: ResourceCandidate | null = null;

  for (const gas of gasCandidates) {
    const mineralSets = MINERAL_ARC_X_OFFSETS.map((dx) =>
      solveResourceCandidates(Kind.Mineral, start, dx, frontDir, 4, BASE_MINERAL_EDGE_PX, false, [gas.footprint]),
    );
    if (mineralSets.some((candidates) => candidates.length === 0)) continue;

    const minerals = solveMineralArc(mineralSets, [gas.footprint]);
    if (minerals === null) continue;
    const score = gas.score + minerals.reduce((total, candidate) => total + candidate.score, 0);
    if (score < bestScore) {
      bestScore = score;
      bestMinerals = minerals;
      bestGas = gas;
    }
  }

  if (bestMinerals === null || bestGas === null) throw new Error('solveBaseCluster: no legal resource arc position');
  const resources = [
    ...bestMinerals.map((candidate) => toResourceSpawn(candidate, PATCH_AMOUNT, false)),
    toResourceSpawn(bestGas, 0, true),
  ];
  const depotFootprint = baseDepotFootprint(start);
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
