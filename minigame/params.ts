import type { Params } from './types.ts';

// A TINY preset, tuned so the exact oracle (backward induction over the whole
// reachable game tree) solves in seconds. Small caps keep the state space
// enumerable while still containing real economy/combat/timing tension.
// marchTime 0 = the instant (no-distance) game; this is the cheapest to solve.
export const TINY: Params = {
  startWorkers: 2,
  startMinerals: 0,
  workerHp: 2, // a worker takes 2 hits to kill -> focus-fire matters
  workerDmg: 1,
  workerCost: 1,
  buildTime: 0, // instant build keeps the state space free of a build timer
  income: 1,
  maxWorkers: 3,
  mineralCap: 3,
  baseHp: 3,
  horizon: 5,
  marchTime: 0,
};

// The canonical MOVEMENT oracle: tiny caps + a one-turn march delay, tuned to
// still solve exactly in ~1-2s. The march delay turns the instant game into one
// where a rush is a scoutable commitment — the minimal setting in which movement
// cost actually matters, which is the whole point of certain strategies.
export const TINY_MARCH: Params = { ...TINY, marchTime: 1, baseHp: 3, horizon: 4 };

// A richer preset for the *simulator* and scripted-bot tournaments. Too large to
// solve exactly, but fine to play forward. These caps were chosen by sweeping
// for a NON-TRANSITIVE regime: at baseHp 6 with a 1-turn march, the archetypes
// form the classic rush-paper-scissors cycle (cheese > macro > turtle > cheese)
// — the structural reason a single fixed strategy is exploitable and a league is
// needed. (Crank baseHp up and defense dominates -> the cycle collapses, as the
// "diversity is a regime you tune into" argument predicts.)
export const SMALL: Params = {
  startWorkers: 4,
  startMinerals: 0,
  workerHp: 3,
  workerDmg: 1,
  workerCost: 2,
  buildTime: 1,
  income: 1,
  maxWorkers: 8,
  mineralCap: 30,
  baseHp: 6,
  horizon: 60,
  marchTime: 1,
};
