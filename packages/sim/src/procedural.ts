// Deterministic procedural map generation.
//
// The default preset is intentionally simple: one shared north team plateau, one
// shared south team plateau, ramp exits into low-ground naturals, and an empty
// midfield. Optional midfield modules can add blockers/chokes later without
// changing the base/economy contract.

import type { BaseCluster, BaseSite, MapDef, ResourceFootprint, ResourceSpawn, StartLoc } from './map.ts';
import {
  baseDepotFootprint,
  resourceFootprintsOverlap,
  resourceSpawnFootprint,
  solveBaseCluster,
} from './map.ts';
import { makeRng, range, type Rng } from './rng.ts';
import { baseGasRoutesValid, mainBaseMineralRoutesValid } from './harvest-calibration.ts';

export type MidfieldModule = 'empty' | 'blocks' | 'dualChoke' | 'arena' | 'raisedCenter';
export type MapPreset = 'teamPlateaus';
export type GenerateMapOptions = {
  preset?: MapPreset;
  midfield?: MidfieldModule;
};

const LANE_W = 64;
const H = 96;
const EDGE_PAD = 4;
const PLATEAU_H = 20;
const RAMP_HALF_W = 3;
const NATURAL_OFFSET = 10;
const BASE_ANCHOR_RETRY_RADIUS_TILES = 4;

type Rect = { x0: number; y0: number; x1: number; y1: number };
export type BaseClusterSelectionOptions = {
  kind?: BaseSite['kind'];
  maxOffsetTiles?: number;
};

const fillRect = (g: Uint8Array, w: number, x0: number, y0: number, x1: number, y1: number, v: number): void => {
  for (let y = Math.max(0, y0); y <= y1; y++) {
    const row = y * w;
    if (row >= g.length) break;
    for (let x = Math.max(0, x0); x <= x1; x++) {
      if (x >= w) break;
      g[row + x] = v;
    }
  }
};

class MapBuilder {
  readonly map: MapDef;
  readonly perTeam: number;

  constructor(perTeam: number, seed: number) {
    this.perTeam = perTeam;
    const w = LANE_W * perTeam;
    const h = H;
    const n = w * h;
    this.map = {
      name: `Procedural ${perTeam}v${perTeam} (#${seed})`,
      w,
      h,
      walk: new Uint8Array(n).fill(1),
      build: new Uint8Array(n).fill(1),
      elev: new Uint8Array(n),
      starts: [],
      resources: [],
      teams: [],
      bases: [],
    };
  }

  fill(rect: Rect, walk: number, build: number, elev: number): void {
    fillRect(this.map.walk, this.map.w, rect.x0, rect.y0, rect.x1, rect.y1, walk);
    fillRect(this.map.build, this.map.w, rect.x0, rect.y0, rect.x1, rect.y1, build);
    fillRect(this.map.elev, this.map.w, rect.x0, rect.y0, rect.x1, rect.y1, elev);
  }

  stampCliffLine(y: number, gaps: readonly number[]): void {
    fillRect(this.map.walk, this.map.w, 0, y, this.map.w - 1, y, 0);
    fillRect(this.map.build, this.map.w, 0, y, this.map.w - 1, y, 0);
    fillRect(this.map.elev, this.map.w, 0, y, this.map.w - 1, y, 1);
    for (const cx of gaps) {
      fillRect(this.map.walk, this.map.w, cx - RAMP_HALF_W, y, cx + RAMP_HALF_W, y, 1);
      fillRect(this.map.build, this.map.w, cx - RAMP_HALF_W, y, cx + RAMP_HALF_W, y, 0);
    }
  }

  stampBlock(rect: Rect, elev = 1): void {
    this.fill(rect, 0, 0, elev);
  }

  reserveNoBuild(rect: Rect): void {
    fillRect(this.map.build, this.map.w, rect.x0, rect.y0, rect.x1, rect.y1, 0);
  }
}

const laneCenter = (i: number): number => i * LANE_W + (LANE_W >> 1);

const anchorCandidates = (anchor: StartLoc, maxOffsetTiles: number): StartLoc[] => {
  const candidates: Array<StartLoc & { score: number; absX: number; absY: number }> = [];
  for (let dy = -maxOffsetTiles; dy <= maxOffsetTiles; dy++) {
    for (let dx = -maxOffsetTiles; dx <= maxOffsetTiles; dx++) {
      candidates.push({
        x: anchor.x + dx,
        y: anchor.y + dy,
        score: dx * dx + dy * dy,
        absX: Math.abs(dx),
        absY: Math.abs(dy),
      });
    }
  }
  return candidates
    .sort((a, b) => a.score - b.score || a.absY - b.absY || a.absX - b.absX || a.y - b.y || a.x - b.x)
    .map(({ x, y }) => ({ x, y }));
};

const addBaseSite = (
  m: MapDef,
  kind: BaseSite['kind'],
  team: number,
  cluster: BaseCluster,
  owner?: number,
  rampX?: number,
  rampY?: number,
): void => {
  m.bases ??= [];
  m.bases.push({
    kind,
    team,
    x: cluster.x,
    y: cluster.y,
    depotFootprint: cluster.depotFootprint,
    reservation: cluster.reservation,
    resourceDir: cluster.resourceDir,
    ...(owner === undefined ? {} : { owner }),
    ...(rampX === undefined ? {} : { rampX }),
    ...(rampY === undefined ? {} : { rampY }),
    timingProfile: 'topdown-dock-route-v1',
  });
};

const footprintClear = (m: MapDef, fp: ResourceFootprint, tileOk: (x: number, y: number) => boolean): boolean => {
  if (fp.x0 < 0 || fp.y0 < 0 || fp.x1 >= m.w || fp.y1 >= m.h) return false;
  for (let y = fp.y0; y <= fp.y1; y++) {
    for (let x = fp.x0; x <= fp.x1; x++) {
      if (!tileOk(x, y)) return false;
    }
  }
  return true;
};

const footprintWalkable = (m: MapDef, fp: ResourceFootprint): boolean =>
  footprintClear(m, fp, (x, y) => m.walk[y * m.w + x] === 1);

const footprintBuildable = (m: MapDef, fp: ResourceFootprint): boolean =>
  footprintClear(m, fp, (x, y) => m.build[y * m.w + x] === 1);

const resourceFootprintClear = (m: MapDef, r: ResourceSpawn, margin: number): boolean => {
  const fp = resourceSpawnFootprint(r);
  return footprintWalkable(m, {
    x0: fp.x0 - margin,
    y0: fp.y0 - margin,
    x1: fp.x1 + margin,
    y1: fp.y1 + margin,
  });
};

const clusterResourcesClear = (m: MapDef, cluster: BaseCluster): boolean => {
  const existing = m.resources.map(resourceSpawnFootprint);
  for (const r of cluster.resources) {
    if (!resourceFootprintClear(m, r, 1)) return false;
    const fp = resourceSpawnFootprint(r);
    if (existing.some((other) => resourceFootprintsOverlap(fp, other))) return false;
  }
  return true;
};

const mainClusterRouteQualityValid = (m: MapDef, kind: BaseSite['kind'], cluster: BaseCluster): boolean => {
  if (kind !== 'main') return true;
  const probe: MapDef = {
    ...m,
    starts: [{ x: cluster.x, y: cluster.y }],
    teams: [0],
    resources: cluster.resources,
    bases: [{
      kind: 'main',
      team: 0,
      x: cluster.x,
      y: cluster.y,
      depotFootprint: cluster.depotFootprint,
      reservation: cluster.reservation,
      resourceDir: cluster.resourceDir,
    }],
  };
  return mainBaseMineralRoutesValid(probe);
};

const clusterGasRouteQualityValid = (m: MapDef, kind: BaseSite['kind'], cluster: BaseCluster): boolean => {
  const probe: MapDef = {
    ...m,
    starts: [{ x: cluster.x, y: cluster.y }],
    teams: [0],
    resources: cluster.resources,
    bases: [{
      kind,
      team: 0,
      x: cluster.x,
      y: cluster.y,
      depotFootprint: cluster.depotFootprint,
      reservation: cluster.reservation,
      resourceDir: cluster.resourceDir,
    }],
  };
  return baseGasRoutesValid(probe);
};

const clusterFits = (
  m: MapDef,
  cluster: BaseCluster,
  blockedReservations: readonly ResourceFootprint[],
  kind: BaseSite['kind'],
): boolean =>
  footprintBuildable(m, cluster.depotFootprint) &&
  footprintWalkable(m, cluster.reservation) &&
  blockedReservations.every((reservation) => !resourceFootprintsOverlap(cluster.reservation, reservation)) &&
  clusterResourcesClear(m, cluster) &&
  mainClusterRouteQualityValid(m, kind, cluster) &&
  clusterGasRouteQualityValid(m, kind, cluster);

export const selectBaseCluster = (
  m: MapDef,
  anchor: StartLoc,
  dir: -1 | 1,
  blockedReservations: readonly ResourceFootprint[] = [],
  options: BaseClusterSelectionOptions = {},
): BaseCluster | null => {
  const kind = options.kind ?? 'natural';
  const maxOffsetTiles = options.maxOffsetTiles ?? BASE_ANCHOR_RETRY_RADIUS_TILES;
  for (const candidate of anchorCandidates(anchor, maxOffsetTiles)) {
    let cluster: BaseCluster;
    try {
      cluster = solveBaseCluster(candidate, dir);
    } catch {
      continue;
    }
    if (clusterFits(m, cluster, blockedReservations, kind)) return cluster;
  }
  return null;
};

const stampBaseCluster = (
  m: MapDef,
  anchor: StartLoc,
  dir: -1 | 1,
  kind: BaseSite['kind'],
  blockedReservations: ResourceFootprint[],
): BaseCluster => {
  const cluster = selectBaseCluster(m, anchor, dir, blockedReservations, { kind });
  if (cluster === null) throw new Error(`generateMap: no legal ${kind} base cluster near ${anchor.x},${anchor.y}`);
  m.resources.push(...cluster.resources);
  blockedReservations.push(cluster.reservation);
  return cluster;
};

const stampTeamPlateaus = (b: MapBuilder): void => {
  const m = b.map;
  const blockedReservations: ResourceFootprint[] = [];
  const centers = Array.from({ length: b.perTeam }, (_, i) => laneCenter(i));
  const northPlateau: Rect = { x0: 0, x1: m.w - 1, y0: EDGE_PAD, y1: EDGE_PAD + PLATEAU_H - 1 };
  const southPlateau: Rect = { x0: 0, x1: m.w - 1, y0: m.h - EDGE_PAD - PLATEAU_H, y1: m.h - EDGE_PAD - 1 };

  b.fill(northPlateau, 1, 1, 1);
  b.fill(southPlateau, 1, 1, 1);
  b.stampCliffLine(northPlateau.y1 + 1, centers);
  b.stampCliffLine(southPlateau.y0 - 1, centers);

  for (let i = 0; i < b.perTeam; i++) {
    const x = centers[i]!;
    const south: StartLoc = { x, y: m.h - 14 };
    const north: StartLoc = { x, y: 14 };
    const southRampY = southPlateau.y0 - 1;
    const northRampY = northPlateau.y1 + 1;
    const southNatural: StartLoc = { x, y: southRampY - NATURAL_OFFSET };
    const northNatural: StartLoc = { x, y: northRampY + NATURAL_OFFSET };
    const southCluster = stampBaseCluster(m, south, -1, 'main', blockedReservations);
    const northCluster = stampBaseCluster(m, north, 1, 'main', blockedReservations);
    const southNaturalCluster = stampBaseCluster(m, southNatural, -1, 'natural', blockedReservations);
    const northNaturalCluster = stampBaseCluster(m, northNatural, 1, 'natural', blockedReservations);

    m.starts.push({ x: southCluster.x, y: southCluster.y });
    m.teams.push(0);
    m.starts.push({ x: northCluster.x, y: northCluster.y });
    m.teams.push(1);

    addBaseSite(m, 'main', 0, southCluster, i * 2, south.x, southRampY);
    addBaseSite(m, 'main', 1, northCluster, i * 2 + 1, north.x, northRampY);
    addBaseSite(m, 'natural', 0, southNaturalCluster, undefined, south.x, southRampY);
    addBaseSite(m, 'natural', 1, northNaturalCluster, undefined, north.x, northRampY);
  }
};

const mirrorY = (m: MapDef, rect: Rect): Rect => ({
  x0: rect.x0,
  x1: rect.x1,
  y0: m.h - 1 - rect.y1,
  y1: m.h - 1 - rect.y0,
});

const addBlocks = (b: MapBuilder, rng: Rng): void => {
  const m = b.map;
  const blobs = 2 + range(rng, 3);
  for (let i = 0; i < blobs; i++) {
    const bw = 3 + range(rng, 5);
    const bh = 3 + range(rng, 5);
    const x = 8 + range(rng, Math.max(1, m.w - 16 - bw));
    const y = 34 + range(rng, 9);
    const r = { x0: x, y0: y, x1: x + bw, y1: y + bh };
    b.stampBlock(r);
    b.stampBlock(mirrorY(m, r));
  }
};

const addDualChoke = (b: MapBuilder): void => {
  const m = b.map;
  const cx = m.w >> 1;
  b.stampBlock({ x0: cx - 7, x1: cx + 7, y0: 38, y1: 57 });
};

const addArena = (b: MapBuilder): void => {
  const m = b.map;
  b.stampBlock({ x0: 8, x1: 15, y0: 38, y1: 57 });
  b.stampBlock({ x0: m.w - 16, x1: m.w - 9, y0: 38, y1: 57 });
};

const addRaisedCenter = (b: MapBuilder): void => {
  const m = b.map;
  const cx = m.w >> 1;
  const r = { x0: cx - 12, x1: cx + 12, y0: 40, y1: 55 };
  b.fill(r, 1, 1, 1);
  b.reserveNoBuild({ x0: r.x0, x1: r.x1, y0: r.y0, y1: r.y0 });
  b.reserveNoBuild({ x0: r.x0, x1: r.x1, y0: r.y1, y1: r.y1 });
};

const applyMidfieldModule = (b: MapBuilder, module: MidfieldModule, rng: Rng): void => {
  switch (module) {
    case 'empty': return;
    case 'blocks': addBlocks(b, rng); return;
    case 'dualChoke': addDualChoke(b); return;
    case 'arena': addArena(b); return;
    case 'raisedCenter': addRaisedCenter(b); return;
  }
};

const reachableFrom = (m: MapDef, sx: number, sy: number): Uint8Array => {
  const w = m.w;
  const n = w * m.h;
  const seen = new Uint8Array(n);
  const q = [sy * w + sx];
  seen[sy * w + sx] = 1;
  for (let h = 0; h < q.length; h++) {
    const u = q[h]!;
    const ux = u % w;
    const uy = (u - ux) / w;
    for (let d = 0; d < 4; d++) {
      const nx = ux + (d === 0 ? 1 : d === 1 ? -1 : 0);
      const ny = uy + (d === 2 ? 1 : d === 3 ? -1 : 0);
      if (nx < 0 || ny < 0 || nx >= w || ny >= m.h) continue;
      const v = ny * w + nx;
      if (seen[v] === 0 && m.walk[v] === 1) {
        seen[v] = 1;
        q.push(v);
      }
    }
  }
  return seen;
};

export const mapResourcesValid = (m: MapDef): boolean => {
  const seen: ResourceFootprint[] = [];
  for (const r of m.resources) {
    if (!resourceFootprintClear(m, r, 1)) return false;
    const fp = resourceSpawnFootprint(r);
    if (seen.some((other) => resourceFootprintsOverlap(fp, other))) return false;
    seen.push(fp);
  }
  return true;
};

const sameFootprint = (a: ResourceFootprint, b: ResourceFootprint): boolean =>
  a.x0 === b.x0 && a.y0 === b.y0 && a.x1 === b.x1 && a.y1 === b.y1;

export const mapBaseReservationsValid = (m: MapDef): boolean => {
  const seen: ResourceFootprint[] = [];
  for (const base of m.bases ?? []) {
    const depotFootprint = base.depotFootprint;
    const reservation = base.reservation;
    if (depotFootprint === undefined || reservation === undefined) return false;
    if (!sameFootprint(depotFootprint, baseDepotFootprint(base))) return false;
    if (!footprintBuildable(m, depotFootprint)) return false;
    if (!footprintWalkable(m, reservation)) return false;
    if (seen.some((other) => resourceFootprintsOverlap(reservation, other))) return false;
    seen.push(reservation);
  }
  return true;
};

export const mapConnected = (m: MapDef): boolean => {
  const s0 = m.starts[0]!;
  const seen = reachableFrom(m, s0.x, s0.y);
  for (const st of m.starts) if (seen[st.y * m.w + st.x] !== 1) return false;
  for (const base of m.bases ?? []) if (seen[base.y * m.w + base.x] !== 1) return false;
  for (const r of m.resources) {
    const fp = resourceSpawnFootprint(r);
    if (seen[fp.y0 * m.w + fp.x0] !== 1) return false;
  }
  return true;
};

const buildMap = (perTeam: number, seed: number, preset: MapPreset, midfield: MidfieldModule): MapDef => {
  const builder = new MapBuilder(perTeam, seed);
  switch (preset) {
    case 'teamPlateaus': stampTeamPlateaus(builder); break;
  }
  applyMidfieldModule(builder, midfield, makeRng(seed));
  return builder.map;
};

const generatedMapValid = (m: MapDef): boolean =>
  mapConnected(m) && mapResourcesValid(m) && mapBaseReservationsValid(m) && mainBaseMineralRoutesValid(m) && baseGasRoutesValid(m);

/**
 * Generate a symmetric NvN map. `perTeam` players share each side's plateau
 * (1 = 1v1, 2 = 2v2, ...). The default midfield is empty by design so movement,
 * economy, and range tuning have a clean reference scenario.
 */
export const generateMap = (perTeam: number, seed: number, options: GenerateMapOptions = {}): MapDef => {
  const preset = options.preset ?? 'teamPlateaus';
  const midfield = options.midfield ?? 'empty';
  const m = buildMap(perTeam, seed, preset, midfield);
  if (generatedMapValid(m)) return m;
  if (midfield !== 'empty') {
    const fallback = buildMap(perTeam, seed, preset, 'empty');
    if (generatedMapValid(fallback)) return fallback;
  }
  throw new Error(`generateMap: invalid ${perTeam}v${perTeam} map for seed ${seed}`);
};
