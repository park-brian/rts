// Standalone microRTS-style engine — shared types.
//
// Imports nothing from packages/* or minigame/*. A faithful-in-spirit port of
// the microRTS model (Ontañón): a small grid RTS with the standard unit set and,
// crucially, DURATIVE + SIMULTANEOUS actions — every unit acts concurrently and
// each action spans multiple frames. Deterministic, integer, no RNG.
//
// Stats (units.ts) are µRTS-style DEFAULTS, approximate — not a bit-exact copy
// of the Java reference. They are data, so matching the reference later is a
// table edit, not code.

export const Kind = {
  Resource: 0, // neutral mineral patch
  Base: 1, // stores resources, produces Workers
  Barracks: 2, // produces combat units
  Worker: 3, // harvests, builds Base/Barracks, weak attacker
  Light: 4, // cheap melee
  Heavy: 5, // tanky melee
  Ranged: 6, // attacks at a distance
} as const;
export type KindT = (typeof Kind)[keyof typeof Kind];

export const NEUTRAL = -1; // owner of Resource nodes
export type Player = 0 | 1;

// 4-connected directions (microRTS uses orthogonal movement).
export const DIRS = [
  { dx: 0, dy: -1 }, // 0 up
  { dx: 1, dy: 0 }, // 1 right
  { dx: 0, dy: 1 }, // 2 down
  { dx: -1, dy: 0 }, // 3 left
] as const;

export const ActionType = {
  None: 0,
  Move: 1,
  Harvest: 2,
  Return: 3,
  Produce: 4,
  Attack: 5,
} as const;
export type ActionTypeT = (typeof ActionType)[keyof typeof ActionType];

// A command issued to a single (idle) unit.
export type UnitAction =
  | { type: 0 } // None
  | { type: 1; dir: number } // Move
  | { type: 2; dir: number } // Harvest (toward an adjacent resource)
  | { type: 3; dir: number } // Return (toward an adjacent own base)
  | { type: 4; dir: number; kind: KindT } // Produce kind into adjacent cell
  | { type: 5; targetId: number }; // Attack a unit in range

// In-progress action state, with the frame it completes on.
export type Busy = { action: UnitAction; completeAt: number };

export type Unit = {
  id: number;
  kind: KindT;
  owner: number; // Player | NEUTRAL
  x: number;
  y: number;
  hp: number;
  carrying: number; // workers: resource being carried; Resource node: amount left
  busy: Busy | null; // null = idle / can act
};

export type GameState = {
  w: number;
  h: number;
  time: number;
  nextId: number;
  resources: [number, number]; // stockpiled resources per player
  units: Unit[];
};

// A player's command set for one frame: actions for some of its idle units.
export type Assignment = { unitId: number; action: UnitAction };
