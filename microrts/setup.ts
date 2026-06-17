import type { GameState, KindT, Unit } from './types.ts';
import { Kind, NEUTRAL } from './types.ts';

// A small symmetric map. Each player starts with a Base and a Worker positioned
// so the worker is adjacent to BOTH a resource patch and its base — an immediate
// harvest/return loop with no pathing needed to bootstrap the economy.
export const makeMap = (w = 8, h = 8, resourceAmount = 25): GameState => {
  let id = 0;
  const u = (kind: KindT, owner: number, x: number, y: number, carrying = 0, hp?: number): Unit => ({
    id: id++, kind, owner, x, y, hp: hp ?? 1, carrying, busy: null,
  });
  const units: Unit[] = [
    // Player 0 — top-left.
    u(Kind.Resource, NEUTRAL, 0, 0, resourceAmount),
    { ...u(Kind.Base, 0, 1, 1), hp: 10 },
    u(Kind.Worker, 0, 0, 1),
    // Player 1 — bottom-right (mirror).
    u(Kind.Resource, NEUTRAL, w - 1, h - 1, resourceAmount),
    { ...u(Kind.Base, 1, w - 2, h - 2), hp: 10 },
    u(Kind.Worker, 1, w - 1, h - 2),
  ];
  return { w, h, time: 0, nextId: id, resources: [5, 5], units };
};
