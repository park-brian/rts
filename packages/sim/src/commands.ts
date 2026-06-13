// Player commands — the universal interface point. The same command type flows
// from the UI, the network, scripted bots, and (later) neural-net policies, so
// replays, netcode, and RL trajectories are all the same data.
//
// Entity references are EntityIds (see world.ts). Positions are fixed-point px.

import type { State } from './world.ts';

export type Command =
  | { t: 'train'; building: number; kind: number }
  | { t: 'build'; unit: number; kind: number; x: number; y: number }
  | { t: 'move'; unit: number; x: number; y: number }
  | { t: 'attack'; unit: number; target: number } // attack a specific entity
  | { t: 'amove'; unit: number; x: number; y: number } // attack-move to a point
  | { t: 'harvest'; unit: number; patch: number }
  | { t: 'stop'; unit: number };

export type PlayerCommands = { player: number; cmds: Command[] };

/** A controller maps (god-view for now) state -> commands for one player. */
export type Controller = (state: State, player: number) => Command[];
