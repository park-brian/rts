import { GAS_MINE_TICKS, Kind, MINERAL_MINE_TICKS, TILE, Units } from '../data/index.ts';
import { fx, isqrt } from '../fixed.ts';
import { pathRouteDistance } from '../spatial/pathing.ts';
import {
  BASE_GAS_DOCK_DISTANCE_PX,
  resourceDirVector,
  resourceSpawnCenterPx,
  type BaseResourceDir,
  type BaseSiteKind,
  type MapDef,
  type ResourceSpawn,
  type StartLoc,
} from './core.ts';
import { bwApproxEdgeDistanceBetween, topDownDockingPoint, type InteractionPoint } from '../spatial/geometry.ts';
import { makeState, type State } from '../entity/world.ts';

const MAIN_BASE_MINERAL_COUNT = 8;
const BASE_RESOURCE_EDGE_LIMIT_PX = 192;
const DEFAULT_ROUTE_TOLERANCE_FRAMES = 11;
const DEFAULT_BASE_ROUTE_SPREAD_FRAMES = 32;
const DEFAULT_ORDER_ROUTE_SPREAD_FRAMES = 4;
const DEFAULT_BASE_GAS_COUNT = 1;
const DEFAULT_GAS_ROUTE_TOLERANCE_FRAMES = 2;
const UNREACHABLE_ROUTE_DISTANCE_FX = 0x3fffffff;

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

export type GasTimingProfile = {
  name: string;
  workerKind: number;
  depotKind: number;
  gasKind: number;
  mineFrames: number;
  targetRouteFrames: number;
  toleranceFrames: number;
};

export type HarvestCalibrationBase = {
  kind: BaseSiteKind | 'start';
  team: number;
  owner?: number;
  x: number;
  y: number;
  resourceDir: BaseResourceDir;
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
  slackFrames: number;
  toleranceFrames: number;
  valid: boolean;
  routeDistanceFx: number;
  depotCenter: InteractionPoint;
  resourceCenter: InteractionPoint;
  depotDock: InteractionPoint;
  mineralDock: InteractionPoint;
};

export type GasRouteCalibration = {
  baseIndex: number;
  baseKind: BaseSiteKind | 'start';
  resourceIndex: number;
  workerKind: number;
  depotKind: number;
  gasKind: number;
  mineFrames: number;
  targetRouteFrames: number;
  actualRouteFrames: number;
  toleranceFrames: number;
  valid: boolean;
  routeDistanceFx: number;
  depotCenter: InteractionPoint;
  resourceCenter: InteractionPoint;
  depotDock: InteractionPoint;
  gasDock: InteractionPoint;
};

export type MineralRouteQualityIssue = {
  kind: 'missing-main-minerals' | 'invalid-route' | 'base-route-spread' | 'resource-order-route-spread';
  baseIndex?: number;
  resourceIndex?: number;
  resourceOrder?: number;
  expected?: number;
  actual?: number;
  spread?: number;
  limit?: number;
};

export type GasRouteQualityIssue = {
  kind: 'missing-base-gas' | 'invalid-gas-route' | 'base-gas-route-spread';
  baseIndex?: number;
  resourceIndex?: number;
  expected?: number;
  actual?: number;
  spread?: number;
  limit?: number;
};

export type MineralRouteQualityOptions = {
  profile?: HarvestTimingProfile;
  expectedMineralsPerBase?: number;
  maxBaseRouteSpreadFrames?: number;
  maxResourceOrderRouteSpreadFrames?: number;
};

export type GasRouteQualityOptions = {
  profile?: GasTimingProfile;
  expectedGasPerBase?: number;
  maxBaseGasRouteSpreadFrames?: number;
};

export type MineralRouteQuality = {
  ok: boolean;
  entries: MineralRouteCalibration[];
  issues: MineralRouteQualityIssue[];
};

export type GasRouteQuality = {
  ok: boolean;
  entries: GasRouteCalibration[];
  issues: GasRouteQualityIssue[];
};

type IndexedMineral = {
  index: number;
  resource: ResourceSpawn;
  center: InteractionPoint;
  edgeDistance: number;
};

type IndexedGas = IndexedMineral;

const tileCenterPx = (t: number): number => t * TILE + (TILE >> 1);
const tileCenterFx = (t: number): number => fx(tileCenterPx(t));
const ceilDiv = (n: number, d: number): number => Math.trunc((n + d - 1) / d);
const routeFrames = (routeDistanceFx: number, workerKind: number): number =>
  ceilDiv(2 * routeDistanceFx, Units[workerKind]!.speed);

const straightDistanceFx = (a: InteractionPoint, b: InteractionPoint): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return isqrt(dx * dx + dy * dy);
};

const routeDistanceFx = (
  routeState: State | undefined,
  workerKind: number,
  from: InteractionPoint,
  to: InteractionPoint,
): number =>
  routeState === undefined
    ? straightDistanceFx(from, to)
    : pathRouteDistance(routeState, workerKind, from.x, from.y, to.x, to.y) ?? UNREACHABLE_ROUTE_DISTANCE_FX;

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

export const gasTimingProfile = (
  workerKind: number,
  depotKind: number,
  gasKind = Kind.Refinery,
  toleranceFrames = DEFAULT_GAS_ROUTE_TOLERANCE_FRAMES,
): GasTimingProfile => ({
  name: `${Units[workerKind]?.name ?? workerKind}->${Units[gasKind]?.name ?? gasKind}`,
  workerKind,
  depotKind,
  gasKind,
  mineFrames: GAS_MINE_TICKS,
  targetRouteFrames: routeFrames(fx(BASE_GAS_DOCK_DISTANCE_PX), workerKind),
  toleranceFrames,
});

const targetRouteFrames = (profile: HarvestTimingProfile): number => {
  const routeTenths = Math.max(0, profile.targetTripFramesTenths - profile.mineFrames * 10);
  return ceilDiv(routeTenths, 10);
};

const resourceDirection = (m: MapDef, start: StartLoc): BaseResourceDir =>
  start.y > (m.h >> 1) ? -1 : 1;

const resourceInFront = (base: HarvestCalibrationBase, depotX: number, depotY: number, center: { x: number; y: number }): boolean => {
  const dir = resourceDirVector(base.resourceDir);
  return (center.x - depotX) * dir.x + (center.y - depotY) * dir.y > 0;
};

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

const economyBases = (m: MapDef): HarvestCalibrationBase[] => {
  if ((m.bases ?? []).length > 0) return m.bases!.map((base) => base);
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
      if (!resourceInFront(base, depotX, depotY, center)) return null;
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

const nearbyGas = (
  m: MapDef,
  base: HarvestCalibrationBase,
  profile: GasTimingProfile,
  expected: number,
): IndexedGas[] => {
  const depotX = tileCenterPx(base.x);
  const depotY = tileCenterPx(base.y);
  return m.resources
    .map((resource, index): IndexedGas | null => {
      if (!resource.gas) return null;
      const center = resourceSpawnCenterPx(resource);
      if (!resourceInFront(base, depotX, depotY, center)) return null;
      const edgeDistance = bwApproxEdgeDistanceBetween(
        profile.depotKind,
        fx(depotX),
        fx(depotY),
        profile.gasKind,
        fx(center.x),
        fx(center.y),
      );
      if (edgeDistance > fx(BASE_RESOURCE_EDGE_LIMIT_PX)) return null;
      return { index, resource, center, edgeDistance };
    })
    .filter((entry): entry is IndexedGas => entry !== null)
    .sort((a, b) =>
      a.edgeDistance - b.edgeDistance ||
      a.center.x - b.center.x ||
      a.center.y - b.center.y ||
      a.index - b.index,
    )
    .slice(0, expected);
};

export const calibrateMineralRoute = (
  base: HarvestCalibrationBase,
  resource: ResourceSpawn,
  resourceIndex: number,
  resourceOrder: number,
  profile: HarvestTimingProfile,
  baseIndex = 0,
  routeState?: State,
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
  const distance = routeDistanceFx(routeState, profile.workerKind, depotDock, mineralDock);
  const actualRouteFrames = routeFrames(distance, profile.workerKind);
  const target = targetRouteFrames(profile);
  const slackFrames = Math.max(0, target - actualRouteFrames);
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
    slackFrames,
    toleranceFrames: profile.toleranceFrames,
    valid,
    routeDistanceFx: distance,
    depotCenter,
    resourceCenter,
    depotDock,
    mineralDock,
  };
};

export const calibrateGasRoute = (
  base: HarvestCalibrationBase,
  resource: ResourceSpawn,
  resourceIndex: number,
  profile: GasTimingProfile,
  baseIndex = 0,
  routeState?: State,
): GasRouteCalibration => {
  if (!resource.gas) throw new Error('calibrateGasRoute requires a gas resource');
  const depotCenter = { x: tileCenterFx(base.x), y: tileCenterFx(base.y) };
  const center = resourceSpawnCenterPx(resource);
  const resourceCenter = { x: fx(center.x), y: fx(center.y) };
  const gasDock = topDownDockingPoint(
    profile.workerKind,
    profile.gasKind,
    resourceCenter.x,
    resourceCenter.y,
    Units[profile.gasKind]!.roles,
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
  const distance = routeDistanceFx(routeState, profile.workerKind, depotDock, gasDock);
  const actualRouteFrames = routeFrames(distance, profile.workerKind);
  const valid = Math.abs(actualRouteFrames - profile.targetRouteFrames) <= profile.toleranceFrames;

  return {
    baseIndex,
    baseKind: base.kind,
    resourceIndex,
    workerKind: profile.workerKind,
    depotKind: profile.depotKind,
    gasKind: profile.gasKind,
    mineFrames: profile.mineFrames,
    targetRouteFrames: profile.targetRouteFrames,
    actualRouteFrames,
    toleranceFrames: profile.toleranceFrames,
    valid,
    routeDistanceFx: distance,
    depotCenter,
    resourceCenter,
    depotDock,
    gasDock,
  };
};

export const mainBaseMineralRouteCalibrations = (
  m: MapDef,
  profile: HarvestTimingProfile = mineralTimingProfile(Kind.SCV, Kind.CommandCenter),
): MineralRouteCalibration[] => {
  const out: MineralRouteCalibration[] = [];
  const routeState = makeState(m, 1, 1);
  for (const [baseIndex, base] of mainBases(m).entries()) {
    const minerals = nearbyMinerals(m, base, profile);
    for (const [resourceOrder, mineral] of minerals.entries()) {
      out.push(calibrateMineralRoute(base, mineral.resource, mineral.index, resourceOrder, profile, baseIndex, routeState));
    }
  }
  return out;
};

export const baseGasRouteCalibrations = (
  m: MapDef,
  profile: GasTimingProfile = gasTimingProfile(Kind.SCV, Kind.CommandCenter),
  expectedGasPerBase = DEFAULT_BASE_GAS_COUNT,
): GasRouteCalibration[] => {
  const out: GasRouteCalibration[] = [];
  const routeState = makeState(m, 1, 1);
  for (const [baseIndex, base] of economyBases(m).entries()) {
    const gasNodes = nearbyGas(m, base, profile, expectedGasPerBase);
    for (const gas of gasNodes) {
      out.push(calibrateGasRoute(base, gas.resource, gas.index, profile, baseIndex, routeState));
    }
  }
  return out;
};

export const mainBaseMineralRouteQuality = (
  m: MapDef,
  options: MineralRouteQualityOptions = {},
): MineralRouteQuality => {
  const profile = options.profile ?? mineralTimingProfile(Kind.SCV, Kind.CommandCenter);
  const expected = options.expectedMineralsPerBase ?? MAIN_BASE_MINERAL_COUNT;
  const maxBaseSpread = options.maxBaseRouteSpreadFrames ?? DEFAULT_BASE_ROUTE_SPREAD_FRAMES;
  const maxOrderSpread = options.maxResourceOrderRouteSpreadFrames ?? DEFAULT_ORDER_ROUTE_SPREAD_FRAMES;
  const bases = mainBases(m);
  const entries = mainBaseMineralRouteCalibrations(m, profile);
  const issues: MineralRouteQualityIssue[] = [];

  for (let baseIndex = 0; baseIndex < bases.length; baseIndex++) {
    const rows = entries.filter((entry) => entry.baseIndex === baseIndex);
    if (rows.length !== expected) {
      issues.push({ kind: 'missing-main-minerals', baseIndex, expected, actual: rows.length });
    }
    for (const row of rows) {
      if (!row.valid) {
        issues.push({
          kind: 'invalid-route',
          baseIndex,
          resourceIndex: row.resourceIndex,
          resourceOrder: row.resourceOrder,
          actual: row.actualRouteFrames,
          limit: row.targetRouteFrames + row.toleranceFrames,
        });
      }
    }
    if (rows.length > 1) {
      const actuals = rows.map((row) => row.actualRouteFrames);
      const spread = Math.max(...actuals) - Math.min(...actuals);
      if (spread > maxBaseSpread) {
        issues.push({ kind: 'base-route-spread', baseIndex, spread, limit: maxBaseSpread });
      }
    }
  }

  for (let resourceOrder = 0; resourceOrder < expected; resourceOrder++) {
    const rows = entries.filter((entry) => entry.resourceOrder === resourceOrder);
    if (rows.length <= 1) continue;
    const actuals = rows.map((row) => row.actualRouteFrames);
    const spread = Math.max(...actuals) - Math.min(...actuals);
    if (spread > maxOrderSpread) {
      issues.push({ kind: 'resource-order-route-spread', resourceOrder, spread, limit: maxOrderSpread });
    }
  }

  return { ok: issues.length === 0, entries, issues };
};

export const baseGasRouteQuality = (
  m: MapDef,
  options: GasRouteQualityOptions = {},
): GasRouteQuality => {
  const profile = options.profile ?? gasTimingProfile(Kind.SCV, Kind.CommandCenter);
  const expected = options.expectedGasPerBase ?? DEFAULT_BASE_GAS_COUNT;
  const maxSpread = options.maxBaseGasRouteSpreadFrames ?? profile.toleranceFrames;
  const bases = economyBases(m);
  const entries = baseGasRouteCalibrations(m, profile, expected);
  const issues: GasRouteQualityIssue[] = [];

  for (let baseIndex = 0; baseIndex < bases.length; baseIndex++) {
    const rows = entries.filter((entry) => entry.baseIndex === baseIndex);
    if (rows.length !== expected) {
      issues.push({ kind: 'missing-base-gas', baseIndex, expected, actual: rows.length });
    }
    for (const row of rows) {
      if (!row.valid) {
        issues.push({
          kind: 'invalid-gas-route',
          baseIndex,
          resourceIndex: row.resourceIndex,
          actual: row.actualRouteFrames,
          limit: row.targetRouteFrames + row.toleranceFrames,
        });
      }
    }
    if (rows.length > 1) {
      const actuals = rows.map((row) => row.actualRouteFrames);
      const spread = Math.max(...actuals) - Math.min(...actuals);
      if (spread > maxSpread) issues.push({ kind: 'base-gas-route-spread', baseIndex, spread, limit: maxSpread });
    }
  }

  return { ok: issues.length === 0, entries, issues };
};

export const mainBaseMineralRoutesValid = (m: MapDef, options: MineralRouteQualityOptions = {}): boolean =>
  mainBaseMineralRouteQuality(m, options).ok;

export const baseGasRoutesValid = (m: MapDef, options: GasRouteQualityOptions = {}): boolean =>
  baseGasRouteQuality(m, options).ok;
