// Replays: a recorded game = its map spec, player count, seed, and the per-tick
// command stream. Re-simulating reproduces the game exactly (the sim is
// deterministic). This same record IS the lockstep network protocol and the RL
// trajectory format — and the substrate for "what-ifs": restore a snapshot at tick
// T (Sim.snapshot/serialize) and feed alternative commands to branch the future.

import { Sim } from './sim.ts';
import type { PlayerCommands } from './commands.ts';
import { sliceMap, type MapDef } from './map.ts';
import { generateMap } from './procedural.ts';

export const REPLAY_VERSION = 1;

/** How to reconstruct the map deterministically (the map isn't stored, its recipe is). */
export type MapSpec =
  | { kind: 'slice' }
  | { kind: 'procedural'; perTeam: number; seed: number };

export const mapFromSpec = (spec: MapSpec): MapDef =>
  spec.kind === 'slice' ? sliceMap() : generateMap(spec.perTeam, spec.seed);

export type Replay = {
  version: number;
  map: MapSpec;
  players: number;
  seed: number;
  frames: PlayerCommands[][]; // frames[t] = the command batch applied at tick t
};

/** Assemble a Replay from a recording Sim's captured frames. */
export const toReplay = (sim: Sim, map: MapSpec): Replay => ({
  version: REPLAY_VERSION,
  map,
  players: sim.fullState().teams.length,
  seed: sim.seed,
  frames: sim.frames ?? [],
});

const simForReplay = (r: Replay): Sim =>
  new Sim({ map: mapFromSpec(r.map), players: r.players, seed: r.seed });

/** Re-simulate a replay to completion; returns the final Sim. */
export const play = (r: Replay): Sim => {
  const sim = simForReplay(r);
  for (const batch of r.frames) sim.step(batch);
  return sim;
};

/** Re-simulate, returning the per-tick state-hash sequence (the replay-hash check). */
export const replayHashes = (r: Replay): number[] => {
  const sim = simForReplay(r);
  const hs: number[] = [];
  for (const batch of r.frames) { sim.step(batch); hs.push(sim.hash()); }
  return hs;
};
