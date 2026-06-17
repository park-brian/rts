import type { GameState } from './types.ts';
import { Kind } from './types.ts';
import { step, winner } from './game.ts';
import { def } from './units.ts';
import { makeMap } from './setup.ts';
import type { Bot } from './bots.ts';

export type GameResult = { winner: 0 | 1 | 'draw'; cycles: number; final: GameState };

/** Play two bots forward to a result. Deterministic given the bots and map. */
export const playGame = (bot0: Bot, bot1: Bot, s0?: GameState, maxCycles = 3000): GameResult => {
  let s = s0 ?? makeMap();
  for (;;) {
    const w = winner(s, maxCycles);
    if (w !== null) return { winner: w, cycles: s.time, final: s };
    s = step(s, bot0(s, 0), bot1(s, 1));
  }
};

/**
 * Fair head-to-head: play botA as P0 vs botB, then swap sides, netting out the
 * first-resolver bias. Returns botA's record (wins/losses/draws over 2 games).
 */
export const playBothSides = (
  botA: Bot,
  botB: Bot,
  maxCycles = 3000,
): { winsA: number; winsB: number; draws: number } => {
  const r1 = playGame(botA, botB, undefined, maxCycles); // A is P0
  const r2 = playGame(botB, botA, undefined, maxCycles); // A is P1
  let winsA = 0, winsB = 0, draws = 0;
  if (r1.winner === 0) winsA++; else if (r1.winner === 1) winsB++; else draws++;
  if (r2.winner === 1) winsA++; else if (r2.winner === 0) winsB++; else draws++;
  return { winsA, winsB, draws };
};

/** ASCII view of the board (player 0 lowercase-ish, player 1 UPPER, '#' resource). */
export const render = (s: GameState): string => {
  const grid: string[][] = Array.from({ length: s.h }, () => Array.from({ length: s.w }, () => '.'));
  for (const u of s.units) {
    let c = def(u.kind).symbol;
    if (u.owner === 1) c = c.toUpperCase();
    if (u.kind === Kind.Resource) c = '#';
    grid[u.y]![u.x] = c;
  }
  return grid.map((row) => row.join(' ')).join('\n');
};
