import type { Game } from './game.ts';
import {
  CREEP_RADIUS,
  Kind,
  POWER_RADIUS,
  providesCreep,
  requiresCreep,
  requiresPower,
  type QueuedTravelWaypoint,
} from './sim.ts';

export type PlacementFieldOverlay = {
  kind: 'creep' | 'power';
  x: number;
  y: number;
  radius: number;
  source: 'existing' | 'candidate';
};

export type QueuedWaypointMarker =
  | 'circle'
  | 'attack-cross'
  | 'attack-diamond'
  | 'patrol-chevron'
  | 'repair-plus'
  | 'harvest-triangle'
  | 'load-square'
  | 'unload-triangle';

export type QueuedWaypointPresentation = {
  strokeStyle: string;
  marker: QueuedWaypointMarker;
};

export const QueuedWaypointPresentations = {
  move: { strokeStyle: 'rgba(255,225,78,0.78)', marker: 'circle' },
  attack: { strokeStyle: 'rgba(255,86,86,0.82)', marker: 'attack-cross' },
  'attack-move': { strokeStyle: 'rgba(255,120,80,0.78)', marker: 'attack-diamond' },
  patrol: { strokeStyle: 'rgba(90,210,255,0.78)', marker: 'patrol-chevron' },
  repair: { strokeStyle: 'rgba(70,220,150,0.78)', marker: 'repair-plus' },
  harvest: { strokeStyle: 'rgba(80,220,120,0.78)', marker: 'harvest-triangle' },
  load: { strokeStyle: 'rgba(175,170,255,0.78)', marker: 'load-square' },
  unload: { strokeStyle: 'rgba(210,170,255,0.78)', marker: 'unload-triangle' },
} satisfies Record<QueuedTravelWaypoint['intent'], QueuedWaypointPresentation>;

export const queuedWaypointPresentation = (
  intent: QueuedTravelWaypoint['intent'],
): QueuedWaypointPresentation => QueuedWaypointPresentations[intent];

export const placementFieldOverlays = (game: Game, out: PlacementFieldOverlay[] = []): PlacementFieldOverlay[] => {
  out.length = 0;
  const ghost = game.placementGhost;
  if (!ghost || game.human < 0) return out;
  const e = game.sim.fullState().e;
  const showCreep = requiresCreep(ghost.kind) || providesCreep(ghost.kind);
  const showPower = requiresPower(ghost.kind) || ghost.kind === Kind.Pylon;
  if (showCreep || showPower) {
    for (let i = 0; i < e.hi; i++) {
      if (e.alive[i] !== 1 || e.owner[i] !== game.human || e.built[i] !== 1) continue;
      if (showCreep && providesCreep(e.kind[i]!)) {
        out.push({ kind: 'creep', x: e.x[i]!, y: e.y[i]!, radius: CREEP_RADIUS, source: 'existing' });
      }
      if (showPower && e.kind[i] === Kind.Pylon) {
        out.push({ kind: 'power', x: e.x[i]!, y: e.y[i]!, radius: POWER_RADIUS, source: 'existing' });
      }
    }
  }
  if (showCreep && providesCreep(ghost.kind)) {
    out.push({ kind: 'creep', x: ghost.x, y: ghost.y, radius: CREEP_RADIUS, source: 'candidate' });
  }
  if (showPower && ghost.kind === Kind.Pylon) {
    out.push({ kind: 'power', x: ghost.x, y: ghost.y, radius: POWER_RADIUS, source: 'candidate' });
  }
  return out;
};
