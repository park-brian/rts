import type { Game } from './game.ts';
import { CREEP_RADIUS, Kind, POWER_RADIUS, providesCreep, requiresCreep, requiresPower } from './sim.ts';

export type PlacementFieldOverlay = {
  kind: 'creep' | 'power';
  x: number;
  y: number;
  radius: number;
  source: 'existing' | 'candidate';
};

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