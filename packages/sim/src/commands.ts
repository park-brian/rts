// Player commands — the universal interface point. The same command type flows
// from the UI, the network, scripted bots, and (later) neural-net policies, so
// replays, netcode, and RL trajectories are all the same data.
//
// Entity references are EntityIds (see world.ts). Positions are fixed-point px.

import type { State } from './world.ts';

export type CommandRejectReason =
  | 'stale-entity'
  | 'wrong-owner'
  | 'missing-capability'
  | 'target-not-found'
  | 'target-not-allowed'
  | 'not-affordable'
  | 'supply-blocked'
  | 'queue-full'
  | 'placement-blocked'
  | 'placement-off-map'
  | 'placement-requires-geyser'
  | 'incomplete-producer';

export type Command =
  | { t: 'train'; building: number; kind: number }
  | { t: 'build'; unit: number; kind: number; x: number; y: number }
  | { t: 'cancelBuild'; building: number }
  | { t: 'move'; unit: number; x: number; y: number }
  | { t: 'attack'; unit: number; target: number } // attack a specific entity
  | { t: 'amove'; unit: number; x: number; y: number } // attack-move to a point
  | { t: 'harvest'; unit: number; patch: number }
  | { t: 'rally'; building: number; x: number; y: number } // set a structure's rally point
  | { t: 'stop'; unit: number };

export type PlayerCommands = { player: number; cmds: Command[] };

export type CommandResult =
  | { player: number; index: number; t: Command['t']; ok: true }
  | { player: number; index: number; t: Command['t']; ok: false; reason: CommandRejectReason };

/** A controller maps (god-view for now) state -> commands for one player. */
export type Controller = (state: State, player: number) => Command[];
