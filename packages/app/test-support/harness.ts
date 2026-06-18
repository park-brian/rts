import { Game } from '../src/game.ts';
import { ui } from '../src/store.ts';
import { Kind, ONE, Role, TILE, eid, slotOf, structureFootprint } from '../src/sim.ts';

export const freshGame = (): Game => {
  const g = new Game('play', 1234);
  g.resize(390, 844);
  const cc = findEntity(g, Kind.CommandCenter, 0);
  centerOnEntity(g, cc);
  g.queued = [];
  ui.armedCommand.value = { t: 'none' };
  ui.controlScheme.value = 'mobile';
  return g;
};

export const desktopGame = (seed: number): Game => {
  const g = new Game('play', seed);
  ui.controlScheme.value = 'desktop';
  ui.mode.value = 'play';
  return g;
};

export const findEntity = (g: Game, kind: number, owner: number): number => {
  const e = g.sim.fullState().e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.kind[i] === kind && e.owner[i] === owner) return eid(e, i);
  }
  throw new Error(`missing entity kind=${kind} owner=${owner}`);
};

export const findOwnedWorkers = (g: Game): number[] => {
  const e = g.sim.fullState().e;
  const ids: number[] = [];
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.owner[i] === 0 && (e.flags[i]! & Role.Worker) !== 0) ids.push(eid(e, i));
  }
  return ids;
};

export const selectFirst = (g: Game, kind: number): number => {
  const e = g.sim.fullState().e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.kind[i] === kind && e.owner[i] === 0) {
      const id = eid(e, i);
      select(g, [id]);
      return id;
    }
  }
  throw new Error(`missing kind ${kind}`);
};

export const select = (g: Game, ids: number[]): void => {
  g.selection.clear();
  for (const id of ids) g.selection.add(id);
};

export const centerOnEntity = (g: Game, id: number): void => {
  const e = g.sim.fullState().e;
  const slot = slotOf(id);
  g.centerOn(e.x[slot]! / ONE, e.y[slot]! / ONE);
};

export const screenOf = (g: Game, id: number): { x: number; y: number } => {
  const e = g.sim.fullState().e;
  const slot = slotOf(id);
  return screenOfWorld(g, e.x[slot]! / ONE, e.y[slot]! / ONE);
};

export const screenOfWorld = (g: Game, wx: number, wy: number): { x: number; y: number } => ({
  x: (wx - g.camX) * g.zoom,
  y: (wy - g.camY) * g.zoom,
});

export const screenOfStructureFootprintEdge = (g: Game, id: number): { x: number; y: number } => {
  const e = g.sim.fullState().e;
  const slot = slotOf(id);
  const fp = structureFootprint(e.kind[slot]!, e.x[slot]!, e.y[slot]!);
  const wx = ((fp.x0 + fp.x1 + 1) * TILE) / 2;
  const wy = (fp.y1 + 1) * TILE - 1;
  return screenOfWorld(g, wx, wy);
};
