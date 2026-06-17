// BWAPI body rectangles used for gameplay math: weapon range, minimum range,
// and selection/collision-style edge distance. These are not render bounds for
// our authored SVG art; buildings still use footprintW/H for build placement.

import { Kind, Units } from './data.ts';
import { fx } from './fixed.ts';
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

const axisGap = (a0: number, a1: number, b0: number, b1: number): number => {
  if (a1 < b0) return b0 - a1;
  if (b1 < a0) return a0 - b1;
  return 0;
};

export const edgeDistanceSq = (s: State, a: number, b: number): number => {
  const e = s.e;
  const ab = bodyBounds(e.kind[a]!);
  const bb = bodyBounds(e.kind[b]!);
  const ax = e.x[a]!;
  const ay = e.y[a]!;
  const bx = e.x[b]!;
  const by = e.y[b]!;
  const dx = axisGap(ax - ab.left, ax + ab.right, bx - bb.left, bx + bb.right);
  const dy = axisGap(ay - ab.up, ay + ab.down, by - bb.up, by + bb.down);
  return dx * dx + dy * dy;
};

export const withinEdgeRange = (s: State, a: number, b: number, range: number): boolean =>
  edgeDistanceSq(s, a, b) <= range * range;
