import { Kind, Units } from '../data/index.ts';
import { fx, toInt } from '../fixed.ts';
import {
  baseGasRouteCalibrations,
  mainBaseMineralRouteCalibrations,
  type GasRouteCalibration,
  type MineralRouteCalibration,
} from './harvest-calibration.ts';
import { resourceSpawnCenterPx, resourceSpawnFootprint, type MapDef, type ResourceFootprint } from './core.ts';
import { bodyBounds, type InteractionPoint } from '../spatial/geometry.ts';

export type DiagnosticRect = {
  id: string;
  kind: 'interaction-hull' | 'resource-footprint' | 'depot-footprint' | 'base-reservation';
  label: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  unitKind?: number;
  resourceIndex?: number;
  baseIndex?: number;
  valid?: boolean;
  units: 'px' | 'tile';
};

export type DiagnosticPoint = {
  id: string;
  kind: 'dock-point' | 'route-target';
  label: string;
  x: number;
  y: number;
  baseIndex?: number;
  resourceIndex?: number;
  valid?: boolean;
};

export type DiagnosticLine = {
  id: string;
  kind: 'route';
  label: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  baseIndex: number;
  resourceIndex: number;
  resourceType: 'mineral' | 'gas';
  actualRouteFrames: number;
  targetRouteFrames: number;
  toleranceFrames: number;
  valid: boolean;
};

export type DiagnosticMarker = {
  id: string;
  kind: 'route-timing';
  label: string;
  x: number;
  y: number;
  baseIndex: number;
  resourceIndex: number;
  resourceType: 'mineral' | 'gas';
  actualRouteFrames: number;
  targetRouteFrames: number;
  toleranceFrames: number;
  valid: boolean;
};

export type MapDiagnosticsOverlay = {
  mapName: string;
  rects: DiagnosticRect[];
  points: DiagnosticPoint[];
  lines: DiagnosticLine[];
  markers: DiagnosticMarker[];
};

const footprintRect = (
  id: string,
  kind: DiagnosticRect['kind'],
  label: string,
  fp: ResourceFootprint,
  extra: Omit<Partial<DiagnosticRect>, 'id' | 'kind' | 'label' | 'x0' | 'y0' | 'x1' | 'y1' | 'units'> = {},
): DiagnosticRect => ({
  id,
  kind,
  label,
  x0: fp.x0,
  y0: fp.y0,
  x1: fp.x1,
  y1: fp.y1,
  units: 'tile',
  ...extra,
});

const interactionHull = (
  id: string,
  label: string,
  unitKind: number,
  center: InteractionPoint,
  extra: Omit<Partial<DiagnosticRect>, 'id' | 'kind' | 'label' | 'x0' | 'y0' | 'x1' | 'y1' | 'units' | 'unitKind'> = {},
): DiagnosticRect => {
  const b = bodyBounds(unitKind);
  return {
    id,
    kind: 'interaction-hull',
    label,
    x0: toInt(center.x - b.left),
    y0: toInt(center.y - b.up),
    x1: toInt(center.x + b.right),
    y1: toInt(center.y + b.down),
    units: 'px',
    unitKind,
    ...extra,
  };
};

const point = (
  id: string,
  kind: DiagnosticPoint['kind'],
  label: string,
  p: InteractionPoint,
  extra: Omit<Partial<DiagnosticPoint>, 'id' | 'kind' | 'label' | 'x' | 'y'> = {},
): DiagnosticPoint => ({
  id,
  kind,
  label,
  x: toInt(p.x),
  y: toInt(p.y),
  ...extra,
});

const addUniqueRect = (out: DiagnosticRect[], seen: Set<string>, rect: DiagnosticRect): void => {
  if (seen.has(rect.id)) return;
  seen.add(rect.id);
  out.push(rect);
};

const routeLabel = (resourceType: 'mineral' | 'gas', entry: MineralRouteCalibration | GasRouteCalibration): string =>
  `${resourceType} route ${entry.actualRouteFrames}/${entry.targetRouteFrames}+${entry.toleranceFrames}`;

const addRoute = (
  overlay: MapDiagnosticsOverlay,
  rectIds: Set<string>,
  routeKind: 'mineral' | 'gas',
  entry: MineralRouteCalibration | GasRouteCalibration,
): void => {
  const resourceKind = routeKind === 'gas' ? (entry as GasRouteCalibration).gasKind : Kind.Mineral;
  const resourceDock = routeKind === 'gas' ? (entry as GasRouteCalibration).gasDock : (entry as MineralRouteCalibration).mineralDock;
  const routeId = `${routeKind}-${entry.baseIndex}-${entry.resourceIndex}`;
  const label = routeLabel(routeKind, entry);

  addUniqueRect(
    overlay.rects,
    rectIds,
    interactionHull(`${routeKind}-depot-hull-${entry.baseIndex}-${entry.depotKind}`, Units[entry.depotKind]?.name ?? 'Depot', entry.depotKind, entry.depotCenter, {
      baseIndex: entry.baseIndex,
    }),
  );
  addUniqueRect(
    overlay.rects,
    rectIds,
    interactionHull(`${routeKind}-hull-${entry.resourceIndex}`, Units[resourceKind]?.name ?? routeKind, resourceKind, entry.resourceCenter, {
      resourceIndex: entry.resourceIndex,
      valid: entry.valid,
    }),
  );

  overlay.points.push(
    point(`${routeId}-depot-dock`, 'dock-point', 'depot dock', entry.depotDock, {
      baseIndex: entry.baseIndex,
      resourceIndex: entry.resourceIndex,
      valid: entry.valid,
    }),
    point(`${routeId}-resource-dock`, 'dock-point', `${routeKind} dock`, resourceDock, {
      baseIndex: entry.baseIndex,
      resourceIndex: entry.resourceIndex,
      valid: entry.valid,
    }),
    point(`${routeId}-resource-center`, 'route-target', `${routeKind} center`, entry.resourceCenter, {
      baseIndex: entry.baseIndex,
      resourceIndex: entry.resourceIndex,
      valid: entry.valid,
    }),
  );
  overlay.lines.push({
    id: `${routeId}-line`,
    kind: 'route',
    label,
    x0: toInt(entry.depotDock.x),
    y0: toInt(entry.depotDock.y),
    x1: toInt(resourceDock.x),
    y1: toInt(resourceDock.y),
    baseIndex: entry.baseIndex,
    resourceIndex: entry.resourceIndex,
    resourceType: routeKind,
    actualRouteFrames: entry.actualRouteFrames,
    targetRouteFrames: entry.targetRouteFrames,
    toleranceFrames: entry.toleranceFrames,
    valid: entry.valid,
  });
  overlay.markers.push({
    id: `${routeId}-timing`,
    kind: 'route-timing',
    label,
    x: toInt(entry.resourceCenter.x),
    y: toInt(entry.resourceCenter.y),
    baseIndex: entry.baseIndex,
    resourceIndex: entry.resourceIndex,
    resourceType: routeKind,
    actualRouteFrames: entry.actualRouteFrames,
    targetRouteFrames: entry.targetRouteFrames,
    toleranceFrames: entry.toleranceFrames,
    valid: entry.valid,
  });
};

export const mapDiagnosticsOverlay = (m: MapDef): MapDiagnosticsOverlay => {
  const overlay: MapDiagnosticsOverlay = {
    mapName: m.name,
    rects: [],
    points: [],
    lines: [],
    markers: [],
  };
  const rectIds = new Set<string>();

  m.resources.forEach((resource, index) => {
    const type = resource.gas ? 'gas' : 'mineral';
    const center = resourceSpawnCenterPx(resource);
    addUniqueRect(
      overlay.rects,
      rectIds,
      footprintRect(`resource-footprint-${index}`, 'resource-footprint', `${type} footprint`, resourceSpawnFootprint(resource), {
        resourceIndex: index,
      }),
    );
    overlay.points.push(point(`resource-center-${index}`, 'route-target', `${type} center`, {
      x: fx(center.x),
      y: fx(center.y),
    }, { resourceIndex: index }));
  });

  (m.bases ?? []).forEach((base, index) => {
    if (base.depotFootprint) {
      addUniqueRect(
        overlay.rects,
        rectIds,
        footprintRect(`base-${index}-depot-footprint`, 'depot-footprint', `${base.kind} depot footprint`, base.depotFootprint, {
          baseIndex: index,
        }),
      );
    }
    if (base.reservation) {
      addUniqueRect(
        overlay.rects,
        rectIds,
        footprintRect(`base-${index}-reservation`, 'base-reservation', `${base.kind} reservation`, base.reservation, {
          baseIndex: index,
        }),
      );
    }
  });

  for (const entry of mainBaseMineralRouteCalibrations(m)) addRoute(overlay, rectIds, 'mineral', entry);
  for (const entry of baseGasRouteCalibrations(m)) addRoute(overlay, rectIds, 'gas', entry);

  return overlay;
};
