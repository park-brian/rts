import type { CommandRejectReason } from '../commands/types.ts';
import { Kind, ResourceType, Role, TILE, Units } from '../data/index.ts';
import type { State } from '../entity/world.ts';
import { nearest, NONE } from '../entity/world.ts';
import { fx } from '../fixed.ts';
import { footprintsOverlap, snapBuildAnchor, structureFootprint, type Footprint } from '../spatial/footprint.ts';
import { buildable, inBounds, resourceSpawnFootprint } from '../map/core.ts';
import { isContained } from './cargo.ts';
import { hasPendingBuild } from './build-cancel.ts';
import { hasCreepAt, requiresCreep } from './creep.ts';
import { hasPowerAt, requiresPower } from './power.ts';

export type PlacementResult =
  | { ok: true; x: number; y: number; geyser: number }
  | { ok: false; reason: CommandRejectReason };

const GEYSER_PLACEMENT_SNAP = fx(2 * TILE);
const rejectPlace = (reason: CommandRejectReason): PlacementResult => ({ ok: false, reason });
const playerExists = (s: State, player: number): boolean => player >= 0 && player < s.teams.length;

const placementBlockingKind = (s: State, slot: number): boolean => {
  const e = s.e;
  if (isContained(s, slot)) return false;
  const def = Units[e.kind[slot]!];
  if (!def) return false;
  if ((e.flags[slot]! & Role.Air) !== 0) return false;
  if ((e.flags[slot]! & (Role.Structure | Role.Resource)) !== 0) return true;
  return e.kind[slot] === Kind.Geyser;
};

const resourceBlocksDepotAt = (depotFp: Footprint, resourceFp: Footprint, gas: boolean): boolean => {
  const resourceSouthOfDepot = resourceFp.y0 + resourceFp.y1 >= depotFp.y0 + depotFp.y1;
  if (gas) {
    return resourceSouthOfDepot
      ? resourceFp.x0 > depotFp.x0 - 7 &&
        resourceFp.y0 > depotFp.y1 - 6 &&
        resourceFp.x0 < depotFp.x0 + 7 &&
        resourceFp.y0 < depotFp.y1 + 3
      : resourceFp.x0 > depotFp.x0 - 7 &&
        resourceFp.y0 > depotFp.y0 - 5 &&
        resourceFp.x0 < depotFp.x0 + 7 &&
        resourceFp.y0 < depotFp.y0 + 6;
  }
  return resourceSouthOfDepot
    ? resourceFp.x0 > depotFp.x0 - 5 &&
      resourceFp.y0 > depotFp.y1 - 6 &&
      resourceFp.x0 < depotFp.x0 + 7 &&
      resourceFp.y0 < depotFp.y1 + 4
    : resourceFp.x0 > depotFp.x0 - 5 &&
      resourceFp.y0 > depotFp.y0 - 4 &&
      resourceFp.x0 < depotFp.x0 + 7 &&
      resourceFp.y0 < depotFp.y0 + 6;
};

const slotResourceFootprint = (s: State, slot: number): Footprint => {
  const e = s.e;
  return structureFootprint(e.kind[slot]!, e.x[slot]!, e.y[slot]!);
};

const resourceBlocksDepot = (s: State, depotFp: Footprint, slot: number): boolean => {
  const e = s.e;
  const def = Units[e.kind[slot]!];
  if (!def) return false;
  if (e.kind[slot] === Kind.Mineral) return resourceBlocksDepotAt(depotFp, slotResourceFootprint(s, slot), false);
  if (e.kind[slot] === Kind.Geyser || def.resourceType === ResourceType.Gas) {
    return resourceBlocksDepotAt(depotFp, slotResourceFootprint(s, slot), true);
  }
  return false;
};

const depotTooCloseToResources = (s: State, fp: Footprint, ignorePendingSlot: number): boolean => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (i === ignorePendingSlot || e.alive[i] !== 1 || isContained(s, i)) continue;
    if (resourceBlocksDepot(s, fp, i)) return true;
  }
  if (e.hi > 0) return false;

  for (const r of s.map.resources) {
    if (resourceBlocksDepotAt(fp, resourceSpawnFootprint(r), r.gas)) return true;
  }
  return false;
};

export const placementForStructure = (
  s: State,
  kind: number,
  x: number,
  y: number,
  ignorePendingSlot = NONE,
  player = NONE,
): PlacementResult => {
  const def = Units[kind];
  if (!def || (def.roles & Role.Structure) === 0) return rejectPlace('missing-capability');
  const e = s.e;
  let geyser = NONE;

  if (def.requiresGeyser) {
    geyser = nearest(s, x, y, (sl) => e.kind[sl] === Kind.Geyser);
    if (geyser === NONE) return rejectPlace('placement-requires-geyser');
    const dx = e.x[geyser]! - x;
    const dy = e.y[geyser]! - y;
    if (dx * dx + dy * dy > GEYSER_PLACEMENT_SNAP * GEYSER_PLACEMENT_SNAP) return rejectPlace('placement-requires-geyser');
    x = e.x[geyser]!;
    y = e.y[geyser]!;
  } else {
    const snapped = snapBuildAnchor(x, y);
    x = snapped.x;
    y = snapped.y;
  }

  if (player !== NONE && requiresCreep(kind) && !hasCreepAt(s, player, x, y)) return rejectPlace('placement-blocked');
  if (player !== NONE && requiresPower(kind) && !hasPowerAt(s, player, x, y)) return rejectPlace('placement-blocked');

  const fp = structureFootprint(kind, x, y);
  for (let ty = fp.y0; ty <= fp.y1; ty++) {
    for (let tx = fp.x0; tx <= fp.x1; tx++) {
      if (!inBounds(s.map, tx, ty)) return rejectPlace('placement-off-map');
      if (!buildable(s.map, tx, ty)) return rejectPlace('placement-blocked');
    }
  }

  if ((def.roles & Role.ResourceDepot) !== 0 && depotTooCloseToResources(s, fp, ignorePendingSlot)) {
    return rejectPlace('placement-blocked');
  }

  for (let i = 0; i < e.hi; i++) {
    if (i === ignorePendingSlot) continue;
    if (e.alive[i] !== 1 || !placementBlockingKind(s, i)) continue;
    if (i === geyser) continue;
    const other = structureFootprint(e.kind[i]!, e.x[i]!, e.y[i]!);
    if (footprintsOverlap(fp, other)) return rejectPlace('placement-blocked');
  }

  for (let i = 0; i < e.hi; i++) {
    if (i === ignorePendingSlot || e.alive[i] !== 1 || !hasPendingBuild(e, i)) continue;
    const other = structureFootprint(e.buildKind[i]!, e.tx[i]!, e.ty[i]!);
    if (footprintsOverlap(fp, other)) return rejectPlace('placement-blocked');
  }

  return { ok: true, x, y, geyser };
};

export const canPlaceStructure = (
  s: State,
  player: number,
  workerSlot: number,
  kind: number,
  x: number,
  y: number,
): PlacementResult => {
  if (!playerExists(s, player)) return rejectPlace('wrong-owner');
  const e = s.e;
  if (workerSlot < 0 || workerSlot >= e.hi || e.alive[workerSlot] !== 1) return rejectPlace('stale-entity');
  if (e.owner[workerSlot] !== player) return rejectPlace('wrong-owner');
  if (e.illusion[workerSlot] === 1 || (e.flags[workerSlot]! & Role.Worker) === 0) return rejectPlace('missing-capability');
  return placementForStructure(s, kind, x, y, workerSlot, player);
};
