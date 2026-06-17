import { Kind, MINERAL_MINE_TICKS, TILE, Units } from './data.ts';
import { fx, isqrt } from './fixed.ts';
import {
  resourceSpawnCenterPx,
  type BaseSiteKind,
  type MapDef,
  type ResourceSpawn,
  type StartLoc,
} from './map.ts';
import { bwApproxEdgeDistanceBetween, topDownDockingPoint, type InteractionPoint } from './spatial.ts';

const MAIN_BASE_MINERAL_COUNT = 8;
const BASE_RESOURCE_EDGE_LIMIT_PX = 192;
const DEFAULT_ROUTE_TOLERANCE_FRAMES = 1;

export const BW_MINERAL_TRIP_FRAMES_TENTHS: Partial<Record<number, number>> = {
  [Kind.SCV]: 1767,
  [Kind.Drone]: 1712,
  [Kind.Probe]: 1687,
};

export type HarvestTimingProfile = {
  name: string;
  workerKind: number;
  depotKind: number;
  targetTripFramesTenths: number;
  mineFrames: number;
  toleranceFrames: number;
};

export type HarvestCalibrationBase = {
  kind: BaseSiteKind | 'start';
  team: number;
  owner?: number;
  x: number;
  y: number;
  resourceDir: -1 | 1;
};

export type MineralRouteCalibration = {
  baseIndex: number;
  baseKind: BaseSiteKind | 'start';
  resourceIndex: number;
  resourceOrder: number;
  workerKind: number;
  depotKind: number;
  targetTripFramesTenths: number;
  mineFrames: number;
  targetRouteFrames: number;
  actualRouteFrames: number;
  waitFrames: number;
  toleranceFrames: number;
  valid: boolean;
  routeDistanceFx: number;
  depotCenter: InteractionPoint;
  resourceCenter: InteractionPoint;
  depotDock: InteractionPoint;
  mineralDock: InteractionPoint;
};

type IndexedMineral = {
  index: number;
  resource: ResourceSpawn;
  center: InteractionPoint;
  edgeDistance: number;
};

const tileCenterPx = (t: number): number => t * TILE + (TILE >> 1);
const tileCenterFx = (t: number): number => fx(tileCenterPx(t));
const ceilDiv = (n: number, d: number): number => Math.trunc((n + d - 1) / d);

export const mineralTimingProfile = (
  workerKind: number,
  depotKind: number,
  toleranceFrames = DEFAULT_ROUTE_TOLERANCE_FRAMES,
): HarvestTimingProfile => {
  const targetTripFramesTenths = BW_MINERAL_TRIP_FRAMES_TENTHS[workerKind];
  if (targetTripFramesTenths === undefined) throw new Error(`No BW mineral timing target for worker kind ${workerKind}`);
  return {
    name: `${Units[workerKind]?.name ?? workerKind}->${Units[depotKind]?.name ?? depotKind}`,
    workerKind,
    depotKind,
    targetTripFramesTenths,
    mineFrames: MINERAL_MINE_TICKS,
    toleranceFrames,
  };
};

const targetRouteFrames = (profile: HarvestTimingProfile): number => {
  const routeTenths = Math.max(0, profile.targetTripFramesTenths - profile.mineFrames * 10);
  return ceilDiv(routeTenths, 10);
};

const resourceDirection = (m: MapDef, start: StartLoc): -1 | 1 =>
  start.y > (m.h >> 1) ? -1 : 1;

const fallbackBase = (m: MapDef, start: StartLoc, index: number): HarvestCalibrationBase => ({
  kind: 'start',
  team: m.teams[index] ?? index,
  owner: index,
  x: start.x,
  y: start.y,
  resourceDir: resourceDirection(m, start),
});

const mainBases = (m: MapDef): HarvestCalibrationBase[] => {
  const bases = (m.bases ?? []).filter((base) => base.kind === 'main');
  if (bases.length > 0) return bases.map((base) => base);
  return m.starts.map((start, index) => fallbackBase(m, start, index));
};

const nearbyMinerals = (
  m: MapDef,
  base: HarvestCalibrationBase,
  profile: HarvestTimingProfile,
): IndexedMineral[] => {
  const depotX = tileCenterPx(base.x);
  const depotY = tileCenterPx(base.y);
  return m.resources
    .map((resource, index): IndexedMineral | null => {
      if (resource.gas) return null;
      const center = resourceSpawnCenterPx(resource);
      if ((center.y - depotY) * base.resourceDir <= 0) return null;
      const edgeDistance = bwApproxEdgeDistanceBetween(
        profile.depotKind,
        fx(depotX),
        fx(depotY),
        Kind.Mineral,
        fx(center.x),
        fx(center.y),
      );
      if (edgeDistance > fx(BASE_RESOURCE_EDGE_LIMIT_PX)) return null;
      return { index, resource, center, edgeDistance };
    })
    .filter((entry): entry is IndexedMineral => entry !== null)
    .sort((a, b) =>
      a.edgeDistance - b.edgeDistance ||
      a.center.x - b.center.x ||
      a.center.y - b.center.y ||
      a.index - b.index,
    )
    .slice(0, MAIN_BASE_MINERAL_COUNT)
    .sort((a, b) => a.center.x - b.center.x || a.center.y - b.center.y || a.index - b.index);
};

export const calibrateMineralRoute = (
  base: HarvestCalibrationBase,
  resource: ResourceSpawn,
  resourceIndex: number,
  resourceOrder: number,
  profile: HarvestTimingProfile,
  baseIndex = 0,
): MineralRouteCalibration => {
  if (resource.gas) throw new Error('calibrateMineralRoute requires a mineral resource');
  const depotCenter = { x: tileCenterFx(base.x), y: tileCenterFx(base.y) };
  const center = resourceSpawnCenterPx(resource);
  const resourceCenter = { x: fx(center.x), y: fx(center.y) };
  const mineralDock = topDownDockingPoint(
    profile.workerKind,
    Kind.Mineral,
    resourceCenter.x,
    resourceCenter.y,
    Units[Kind.Mineral]!.roles,
    depotCenter.x,
    depotCenter.y,
  );
  const depotDock = topDownDockingPoint(
    profile.workerKind,
    profile.depotKind,
    depotCenter.x,
    depotCenter.y,
    Units[profile.depotKind]!.roles,
    resourceCenter.x,
    resourceCenter.y,
  );
  const dx = mineralDock.x - depotDock.x;
  const dy = mineralDock.y - depotDock.y;
  const routeDistanceFx = isqrt(dx * dx + dy * dy);
  const actualRouteFrames = ceilDiv(2 * routeDistanceFx, Units[profile.workerKind]!.speed);
  const target = targetRouteFrames(profile);
  const waitFrames = Math.max(0, target - actualRouteFrames);
  const valid = actualRouteFrames <= target + profile.toleranceFrames;

  return {
    baseIndex,
    baseKind: base.kind,
    resourceIndex,
    resourceOrder,
    workerKind: profile.workerKind,
    depotKind: profile.depotKind,
    targetTripFramesTenths: profile.targetTripFramesTenths,
    mineFrames: profile.mineFrames,
    targetRouteFrames: target,
    actualRouteFrames,
    waitFrames,
    toleranceFrames: profile.toleranceFrames,
    valid,
    routeDistanceFx,
    depotCenter,
    resourceCenter,
    depotDock,
    mineralDock,
  };
};

export const mainBaseMineralRouteCalibrations = (
  m: MapDef,
  profile: HarvestTimingProfile = mineralTimingProfile(Kind.SCV, Kind.CommandCenter),
): MineralRouteCalibration[] => {
  const out: MineralRouteCalibration[] = [];
  for (const [baseIndex, base] of mainBases(m).entries()) {
    const minerals = nearbyMinerals(m, base, profile);
    for (const [resourceOrder, mineral] of minerals.entries()) {
      out.push(calibrateMineralRoute(base, mineral.resource, mineral.index, resourceOrder, profile, baseIndex));
    }
  }
  return out;
};

export const findMainBaseMineralRouteCalibration = (
  m: MapDef,
  profile: HarvestTimingProfile,
  depotX: number,
  depotY: number,
  resourceX: number,
  resourceY: number,
): MineralRouteCalibration | null => {
  for (const entry of mainBaseMineralRouteCalibrations(m, profile)) {
    if (
      entry.depotCenter.x === depotX &&
      entry.depotCenter.y === depotY &&
      entry.resourceCenter.x === resourceX &&
      entry.resourceCenter.y === resourceY
    ) {
      return entry;
    }
  }
  return null;
};
