// Player commands — the universal interface point. The same command type flows
// from the UI, the network, scripted bots, and (later) neural-net policies, so
// replays, netcode, and RL trajectories are all the same data.
//
// Entity references are EntityIds (see entity/world.ts). Positions are fixed-point px.

import type { State } from '../entity/world.ts';

export const COMMAND_TYPES = [
  'train',
  'research',
  'build',
  'addon',
  'lift',
  'land',
  'transform',
  'burrow',
  'mine',
  'load',
  'unload',
  'cancelBuild',
  'move',
  'attack',
  'amove',
  'ability',
  'harvest',
  'repair',
  'rally',
  'hold',
  'stop',
] as const;
export type CommandType = typeof COMMAND_TYPES[number];

export type CommandRejectReason =
  | 'stale-entity'
  | 'wrong-owner'
  | 'missing-capability'
  | 'target-not-found'
  | 'target-not-allowed'
  | 'missing-requirement'
  | 'invalid-ability'
  | 'not-enough-energy'
  | 'not-enough-hit-points'
  | 'target-out-of-range'
  | 'not-affordable'
  | 'supply-blocked'
  | 'queue-full'
  | 'capacity-full'
  | 'placement-blocked'
  | 'placement-off-map'
  | 'placement-requires-geyser'
  | 'incomplete-producer';

export type Command =
  | { t: 'train'; building: number; kind: number }
  | { t: 'research'; building: number; tech: number }
  | { t: 'build'; unit: number; kind: number; x: number; y: number }
  | { t: 'addon'; building: number; kind: number }
  | { t: 'lift'; building: number }
  | { t: 'land'; building: number; x: number; y: number }
  | { t: 'transform'; unit: number; kind: number; target?: number }
  | { t: 'burrow'; unit: number; active: boolean }
  | { t: 'mine'; unit: number }
  | { t: 'load'; transport: number; unit: number }
  | { t: 'unload'; transport: number; unit: number; x: number; y: number }
  | { t: 'cancelBuild'; building: number }
  | { t: 'move'; unit: number; x: number; y: number; target?: number; queue?: boolean }
  | { t: 'attack'; unit: number; target: number } // attack a specific entity
  | { t: 'amove'; unit: number; x: number; y: number; queue?: boolean } // attack-move to a point
  | { t: 'ability'; unit: number; ability: number; target?: number; x?: number; y?: number }
  | { t: 'harvest'; unit: number; patch: number }
  | { t: 'repair'; unit: number; target: number }
  | { t: 'rally'; building: number; x: number; y: number; target?: number } // set a structure's rally point/target
  | { t: 'hold'; unit: number }
  | { t: 'stop'; unit: number };

type CommandTypeCoverage =
  [Command['t']] extends [CommandType]
    ? [CommandType] extends [Command['t']]
      ? true
      : never
    : never;
const commandTypeCoverage: CommandTypeCoverage = true;
void commandTypeCoverage;

export type PlayerCommands = { player: number; cmds: Command[] };

export type CommandResult =
  | { player: number; index: number; t: Command['t']; ok: true }
  | { player: number; index: number; t: Command['t']; ok: false; reason: CommandRejectReason };

/** A controller maps (god-view for now) state -> commands for one player. */
export type Controller = (state: State, player: number) => Command[];
