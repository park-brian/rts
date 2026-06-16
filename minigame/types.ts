// Standalone "minimal RTS" model — shared types.
//
// This package is DELIBERATELY isolated: it imports nothing from packages/*.
// It is a research toy whose whole point is to be small enough that an exact
// game-theoretic *oracle* (see oracle.ts) can solve it, giving ground truth to
// grade scripted bots and (later) learned policies against.
//
// The game (no map / no distance, v0):
//   - Two symmetric players. Each owns a base (HP) and a pool of workers.
//   - A worker has per-unit HP and each turn is assigned ONE role:
//       harvest  -> +income minerals (but is a soft target at home)
//       defend   -> shoots enemy attackers at home (the cost of safety)
//       attack   -> travels to the enemy home and engages
//   - Attackers pick a TARGET category: enemy Harvesters | Defenders | Base.
//       * vs Harvesters -> economic denial (harass); enemy defenders shoot you "for free"
//       * vs Defenders   -> a mutual trade
//       * vs Base        -> win-condition damage; enemy defenders shoot you "for free"
//   - The base also builds workers (costs minerals, optional build delay).
//   - Win: reduce the enemy base to 0 HP. Draw at the horizon.
//
// Everything is integer + deterministic, so the same state always resolves the
// same way — a prerequisite for both replay and exact solving.

export type Params = {
  startWorkers: number;
  startMinerals: number;
  workerHp: number; // max HP of a worker
  workerDmg: number; // damage one worker deals per turn
  workerCost: number; // minerals to build a worker
  buildTime: number; // turns until a queued worker is ready (0 = same turn)
  income: number; // minerals per surviving harvester per turn
  maxWorkers: number; // supply cap (bounds the state for the oracle)
  mineralCap: number; // clamp on stored minerals (bounds the state)
  baseHp: number;
  horizon: number; // max turns; a game still live at the horizon is a draw
  // MOVEMENT COST: turns an attack spends in transit before it strikes. The
  // attacker's units are committed (gone from economy/defense) and VISIBLE to
  // the defender during the march — so large marchTime favors defense/macro and
  // small marchTime favors rushes. This is the "rush distance" knob, and the one
  // mechanic that makes a commit-and-strike rush a real, scoutable bet.
  // marchTime = 0 recovers the instant (no-distance) game.
  marchTime: number;
};

// An attack in transit toward the enemy. Carries its own troops, the target it
// committed to at launch, and the turns of travel remaining. Troops in a raid
// are safe (cannot be hit) but are unavailable at home until they return.
export type Raid = {
  hps: number[]; // HP of each worker in the raid
  target: TargetT; // committed at launch
  eta: number; // turns of travel remaining until impact
};

export type PlayerState = {
  minerals: number;
  workers: number[]; // HP of each living worker AT HOME (assignable)
  baseHp: number;
  buildTimer: number; // -1 = nothing in production, else turns remaining
  // At most one raid in flight at a time: committing an army is a real bet, and
  // it keeps the state bounded for the oracle. null = nothing marching.
  inbound: Raid | null;
};

export type State = {
  turn: number;
  a: PlayerState;
  b: PlayerState;
};

// Attack target categories. `as const` (not enum) so Node type-stripping runs it.
export const Target = { Harvesters: 0, Defenders: 1, Base: 2 } as const;
export type TargetT = (typeof Target)[keyof typeof Target];

export type Action = {
  attack: number; // # workers sent to attack
  defend: number; // # workers kept home to fight
  // harvest is implicit: total - attack - defend (no idle workers)
  target: TargetT; // only meaningful when attack > 0
  build: boolean; // queue a worker this turn if affordable & legal
};

// Which player's perspective ("a" is the row / maximizing player in the oracle).
export type Who = 'a' | 'b';

// Terminal result, from player A's perspective: +1 A wins, -1 B wins, 0 draw,
// null = game still in progress.
export type Outcome = 1 | -1 | 0 | null;
