// Gameplay spatial helpers. BW source data is intentionally kept separate from
// top-down interaction geometry: BW body bounds and approximate distance are an
// isometric/source compatibility layer, while the `topDown*` helpers are the
// final reach/contact metric used by our orthographic game.

import { Kind, Role, TILE, Units } from './data.ts';
import { fx, isqrt } from './fixed.ts';
import { structureFootprint } from './footprint.ts';
import type { State } from './world.ts';

export type BodyBounds = {
  left: number;
  up: number;
  right: number;
  down: number;
};

const bounds = (left: number, up: number, right: number, down: number): BodyBounds => ({
  left: fx(left),
  up: fx(up),
  right: fx(right),
  down: fx(down),
});

export const BW_BODY_BOUNDS: Partial<Record<number, BodyBounds>> = {
  [Kind.Mineral]: bounds(32, 16, 31, 15),
  [Kind.Geyser]: bounds(64, 32, 63, 31),

  [Kind.SCV]: bounds(11, 11, 11, 11),
  [Kind.Marine]: bounds(8, 9, 8, 10),
  [Kind.Firebat]: bounds(11, 7, 11, 14),
  [Kind.Medic]: bounds(8, 9, 8, 10),
  [Kind.Ghost]: bounds(7, 10, 7, 11),
  [Kind.Vulture]: bounds(16, 16, 15, 15),
  [Kind.SiegeTank]: bounds(16, 16, 15, 15),
  [Kind.SiegeTankSieged]: bounds(16, 16, 15, 15),
  [Kind.Goliath]: bounds(16, 16, 15, 15),
  [Kind.Wraith]: bounds(19, 15, 18, 14),
  [Kind.Dropship]: bounds(24, 16, 24, 20),
  [Kind.ScienceVessel]: bounds(32, 33, 32, 16),
  [Kind.Valkyrie]: bounds(24, 16, 24, 20),
  [Kind.Battlecruiser]: bounds(37, 29, 37, 29),
  [Kind.SpiderMine]: bounds(7, 7, 7, 7),
  [Kind.NuclearMissile]: bounds(7, 14, 7, 14),

  [Kind.CommandCenter]: bounds(58, 41, 58, 41),
  [Kind.SupplyDepot]: bounds(38, 22, 38, 26),
  [Kind.Barracks]: bounds(48, 40, 56, 32),
  [Kind.Refinery]: bounds(56, 32, 56, 31),
  [Kind.EngineeringBay]: bounds(48, 32, 48, 28),
  [Kind.Bunker]: bounds(32, 24, 32, 16),
  [Kind.Academy]: bounds(40, 32, 44, 24),
  [Kind.MissileTurret]: bounds(16, 32, 16, 16),
  [Kind.Factory]: bounds(56, 40, 56, 40),
  [Kind.MachineShop]: bounds(39, 24, 31, 24),
  [Kind.Starport]: bounds(48, 40, 48, 38),
  [Kind.ControlTower]: bounds(47, 24, 28, 22),
  [Kind.Armory]: bounds(48, 32, 47, 22),
  [Kind.ScienceFacility]: bounds(48, 38, 48, 38),
  [Kind.PhysicsLab]: bounds(47, 24, 28, 22),
  [Kind.CovertOps]: bounds(47, 24, 28, 22),
  [Kind.ComsatStation]: bounds(37, 16, 31, 25),
  [Kind.NuclearSilo]: bounds(37, 16, 31, 25),

  [Kind.Probe]: bounds(11, 11, 11, 11),
  [Kind.Zealot]: bounds(11, 5, 11, 13),
  [Kind.Dragoon]: bounds(15, 15, 16, 16),
  [Kind.HighTemplar]: bounds(12, 10, 11, 13),
  [Kind.DarkTemplar]: bounds(12, 6, 11, 19),
  [Kind.Archon]: bounds(16, 16, 15, 15),
  [Kind.DarkArchon]: bounds(16, 16, 15, 15),
  [Kind.Reaver]: bounds(16, 16, 15, 15),
  [Kind.Scarab]: bounds(2, 2, 2, 2),
  [Kind.Observer]: bounds(16, 16, 15, 15),
  [Kind.Shuttle]: bounds(20, 16, 19, 15),
  [Kind.Scout]: bounds(18, 16, 17, 15),
  [Kind.Carrier]: bounds(32, 32, 31, 31),
  [Kind.Interceptor]: bounds(8, 8, 7, 7),
  [Kind.Arbiter]: bounds(22, 22, 21, 21),
  [Kind.Corsair]: bounds(18, 16, 17, 15),

  [Kind.Nexus]: bounds(56, 39, 56, 39),
  [Kind.Pylon]: bounds(16, 12, 16, 20),
  [Kind.Assimilator]: bounds(48, 32, 48, 24),
  [Kind.Gateway]: bounds(48, 32, 48, 40),
  [Kind.Forge]: bounds(36, 24, 36, 20),
  [Kind.PhotonCannon]: bounds(20, 16, 20, 16),
  [Kind.CyberneticsCore]: bounds(40, 24, 40, 24),
  [Kind.ShieldBattery]: bounds(32, 16, 32, 16),
  [Kind.RoboticsFacility]: bounds(36, 16, 40, 20),
  [Kind.Stargate]: bounds(48, 40, 48, 32),
  [Kind.CitadelOfAdun]: bounds(24, 24, 40, 24),
  [Kind.TemplarArchives]: bounds(32, 24, 32, 24),
  [Kind.RoboticsSupportBay]: bounds(32, 32, 32, 20),
  [Kind.Observatory]: bounds(44, 16, 44, 28),
  [Kind.FleetBeacon]: bounds(40, 32, 47, 24),
  [Kind.ArbiterTribunal]: bounds(44, 28, 44, 28),

  [Kind.Larva]: bounds(8, 8, 7, 7),
  [Kind.Egg]: bounds(16, 16, 15, 15),
  [Kind.Drone]: bounds(11, 11, 11, 11),
  [Kind.Overlord]: bounds(25, 25, 24, 24),
  [Kind.Zergling]: bounds(8, 4, 7, 11),
  [Kind.Hydralisk]: bounds(10, 10, 10, 12),
  [Kind.Lurker]: bounds(15, 15, 16, 16),
  [Kind.Mutalisk]: bounds(22, 22, 21, 21),
  [Kind.Scourge]: bounds(12, 12, 11, 11),
  [Kind.Guardian]: bounds(22, 22, 21, 21),
  [Kind.Devourer]: bounds(22, 22, 21, 21),
  [Kind.Queen]: bounds(24, 24, 23, 23),
  [Kind.Defiler]: bounds(13, 12, 13, 12),
  [Kind.Ultralisk]: bounds(19, 16, 18, 15),
  [Kind.InfestedTerran]: bounds(8, 9, 8, 10),
  [Kind.Broodling]: bounds(9, 9, 9, 9),

  [Kind.Hatchery]: bounds(49, 32, 49, 32),
  [Kind.Lair]: bounds(49, 32, 49, 32),
  [Kind.Hive]: bounds(49, 32, 49, 32),
  [Kind.CreepColony]: bounds(24, 24, 23, 23),
  [Kind.SunkenColony]: bounds(24, 24, 23, 23),
  [Kind.SporeColony]: bounds(24, 24, 23, 23),
  [Kind.SpawningPool]: bounds(36, 28, 40, 18),
  [Kind.EvolutionChamber]: bounds(44, 32, 32, 20),
  [Kind.HydraliskDen]: bounds(40, 32, 40, 24),
  [Kind.Extractor]: bounds(64, 32, 63, 31),
  [Kind.Spire]: bounds(28, 32, 28, 24),
  [Kind.GreaterSpire]: bounds(28, 32, 28, 24),
  [Kind.QueensNest]: bounds(38, 28, 32, 28),
  [Kind.NydusCanal]: bounds(32, 32, 31, 31),
  [Kind.UltraliskCavern]: bounds(40, 32, 32, 31),
  [Kind.DefilerMound]: bounds(48, 32, 48, 4),
  [Kind.InfestedCommandCenter]: bounds(58, 41, 58, 41),
};

export const MAX_BODY_REACH = fx(80);

export const bodyBounds = (kind: number): BodyBounds => {
  const exact = BW_BODY_BOUNDS[kind];
  if (exact) return exact;
  const radius = Units[kind]?.radius ?? fx(8);
  return { left: radius, up: radius, right: radius, down: radius };
};

export const bwApproxDistance = (dx: number, dy: number): number => {
  let max = Math.abs(dx);
  let min = Math.abs(dy);
  if (max < min) {
    const t = max;
    max = min;
    min = t;
  }
  if (min <= (max >> 2)) return max;
  const minCalc = (3 * min) >> 3;
  return (minCalc >> 5) + minCalc + max - (max >> 4) - (max >> 6);
};

const axisGap = (source0: number, source1: number, target0: number, target1: number): number => {
  const left = target0 - fx(1);
  const right = target1 + fx(1);
  let d = source0 - right;
  if (d < 0) {
    d = left - source1;
    if (d < 0) return 0;
  }
  return d;
};

export const bwApproxEdgeDistanceBetween = (
  sourceKind: number,
  sourceX: number,
  sourceY: number,
  targetKind: number,
  targetX: number,
  targetY: number,
): number => {
  const ab = bodyBounds(sourceKind);
  const bb = bodyBounds(targetKind);
  const dx = axisGap(sourceX - ab.left, sourceX + ab.right, targetX - bb.left, targetX + bb.right);
  const dy = axisGap(sourceY - ab.up, sourceY + ab.down, targetY - bb.up, targetY + bb.down);
  return bwApproxDistance(dx, dy);
};

export const bwApproxEdgeDistance = (s: State, a: number, b: number): number => {
  const e = s.e;
  return bwApproxEdgeDistanceBetween(e.kind[a]!, e.x[a]!, e.y[a]!, e.kind[b]!, e.x[b]!, e.y[b]!);
};

const exactAxisGap = (a0: number, a1: number, b0: number, b1: number): number => {
  if (a1 < b0) return b0 - a1;
  if (b1 < a0) return a0 - b1;
  return 0;
};

export type InteractionRect = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

export type InteractionPoint = {
  x: number;
  y: number;
};

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

const bodyRect = (kind: number, x: number, y: number): InteractionRect => {
  const b = bodyBounds(kind);
  return { x0: x - b.left, y0: y - b.up, x1: x + b.right, y1: y + b.down };
};

const footprintRect = (kind: number, x: number, y: number): InteractionRect => {
  const fp = structureFootprint(kind, x, y);
  return {
    x0: fx(fp.x0 * TILE),
    y0: fx(fp.y0 * TILE),
    x1: fx((fp.x1 + 1) * TILE),
    y1: fx((fp.y1 + 1) * TILE),
  };
};

export const topDownInteractionRect = (kind: number, x: number, y: number, flags = Units[kind]?.roles ?? 0): InteractionRect => {
  if ((flags & Role.Structure) !== 0 && (flags & Role.Resource) === 0) return footprintRect(kind, x, y);
  return bodyRect(kind, x, y);
};

export const topDownDockingPoint = (
  moverKind: number,
  targetKind: number,
  targetX: number,
  targetY: number,
  targetFlags: number,
  approachX: number,
  approachY: number,
): InteractionPoint => {
  const mover = bodyBounds(moverKind);
  const target = topDownInteractionRect(targetKind, targetX, targetY, targetFlags);
  return {
    x: clamp(approachX, target.x0 - mover.right, target.x1 + mover.left),
    y: clamp(approachY, target.y0 - mover.down, target.y1 + mover.up),
  };
};

export const topDownEdgeDistanceSqBetween = (
  sourceKind: number,
  sourceX: number,
  sourceY: number,
  sourceFlags: number,
  targetKind: number,
  targetX: number,
  targetY: number,
  targetFlags: number,
): number => {
  const a = topDownInteractionRect(sourceKind, sourceX, sourceY, sourceFlags);
  const b = topDownInteractionRect(targetKind, targetX, targetY, targetFlags);
  const dx = exactAxisGap(a.x0, a.x1, b.x0, b.x1);
  const dy = exactAxisGap(a.y0, a.y1, b.y0, b.y1);
  return dx * dx + dy * dy;
};

export const topDownEdgeDistanceSq = (s: State, a: number, b: number): number => {
  const e = s.e;
  return topDownEdgeDistanceSqBetween(e.kind[a]!, e.x[a]!, e.y[a]!, e.flags[a]!, e.kind[b]!, e.x[b]!, e.y[b]!, e.flags[b]!);
};

export const topDownEdgeDistance = (s: State, a: number, b: number): number =>
  isqrt(topDownEdgeDistanceSq(s, a, b));

export const withinTopDownEdgeRange = (s: State, a: number, b: number, range: number): boolean =>
  topDownEdgeDistanceSq(s, a, b) <= range * range;

export const bwApproxEdgeDistanceSq = (s: State, a: number, b: number): number => {
  const d = bwApproxEdgeDistance(s, a, b);
  return d * d;
};

export const withinBwApproxEdgeRange = (s: State, a: number, b: number, range: number): boolean =>
  bwApproxEdgeDistance(s, a, b) <= range;

/** @deprecated Use `topDownEdgeDistance` for gameplay or `bwApproxEdgeDistance` for BW audits. */
export const edgeDistance = bwApproxEdgeDistance;
/** @deprecated Use `topDownEdgeDistanceSq` for gameplay or `bwApproxEdgeDistanceSq` for BW audits. */
export const edgeDistanceSq = bwApproxEdgeDistanceSq;
/** @deprecated Use `withinTopDownEdgeRange` for gameplay or `withinBwApproxEdgeRange` for BW audits. */
export const withinEdgeRange = withinBwApproxEdgeRange;
/** @deprecated Use `bwApproxEdgeDistanceBetween`. */
export const edgeDistanceBetween = bwApproxEdgeDistanceBetween;
/** @deprecated Use `topDownEdgeDistanceSq`. */
export const exactEdgeDistanceSq = topDownEdgeDistanceSq;
