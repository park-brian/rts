// Replays: a recorded game = its map spec, player count, seed, and the per-tick
// command stream. Re-simulating reproduces the game exactly (the sim is
// deterministic). This same record IS the lockstep network protocol and the RL
// trajectory format — and the substrate for "what-ifs": restore a snapshot at tick
// T (Sim.snapshot/serialize) and feed alternative commands to branch the future.

import { Sim } from '../sim.ts';
import type { Command, PlayerCommands } from '../commands/types.ts';
import { Factions, factionNameOf, type FactionName } from '../data/index.ts';
import { sliceMap, type MapDef } from '../map/core.ts';
import { generateMap, type MapPreset, type MidfieldModule } from '../map/procedural.ts';

export const REPLAY_VERSION = 1;

/** How to reconstruct the map deterministically (the map isn't stored, its recipe is). */
export type MapSpec =
  | { kind: 'slice' }
  | { kind: 'procedural'; perTeam: number; seed: number; preset?: MapPreset; midfield?: MidfieldModule };

export const mapFromSpec = (spec: MapSpec): MapDef =>
  spec.kind === 'slice' ? sliceMap() : generateMap(spec.perTeam, spec.seed, { preset: spec.preset, midfield: spec.midfield });

export type Replay = {
  version: number;
  map: MapSpec;
  players: number;
  seed: number;
  factions?: FactionName[];
  frames: PlayerCommands[][]; // frames[t] = the command batch applied at tick t
};

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

const isInt = (x: unknown): x is number => Number.isInteger(x);
const isNonNegativeInt = (x: unknown): x is number => isInt(x) && x >= 0;
const isPositiveInt = (x: unknown): x is number => isInt(x) && x > 0;

const fail = (msg: string): never => {
  throw new Error(`replay: ${msg}`);
};

const asRecord = (x: unknown, msg: string): Record<string, unknown> => {
  if (isRecord(x)) return x;
  return fail(msg);
};

const readInt = (x: unknown, msg: string): number => {
  if (isInt(x)) return x;
  return fail(msg);
};

const readNonNegativeInt = (x: unknown, msg: string): number => {
  if (isNonNegativeInt(x)) return x;
  return fail(msg);
};

const readPositiveInt = (x: unknown, msg: string): number => {
  if (isPositiveInt(x)) return x;
  return fail(msg);
};

const readBool = (x: unknown, msg: string): boolean => {
  if (typeof x === 'boolean') return x;
  return fail(msg);
};

const readOptionalQueue = (r: Record<string, unknown>, msg: string): { queue?: boolean } =>
  r.queue === undefined ? {} : { queue: readBool(r.queue, msg) };

const readArray = (x: unknown, msg: string): unknown[] => {
  if (Array.isArray(x)) return x;
  return fail(msg);
};

const validateMapPreset = (x: unknown): MapPreset => {
  if (x === 'teamPlateaus' || x === 'cornerBases' || x === 'isolatedMains' || x === 'fortress') return x;
  return fail('unknown procedural map preset');
};

const validateMidfieldModule = (x: unknown): MidfieldModule => {
  if (x === 'empty' || x === 'blocks' || x === 'dualChoke' || x === 'arena' || x === 'raisedCenter') return x;
  return fail('unknown procedural midfield module');
};

const validateMapSpec = (x: unknown): MapSpec => {
  const r = asRecord(x, 'map must be an object');
  const kind = r.kind;
  if (kind === 'slice') return { kind: 'slice' };
  if (kind === 'procedural') {
    const perTeam = readPositiveInt(r.perTeam, 'procedural map perTeam must be a positive integer');
    const seed = readInt(r.seed, 'procedural map seed must be an integer');
    const preset = r.preset === undefined ? undefined : validateMapPreset(r.preset);
    const midfield = r.midfield === undefined ? undefined : validateMidfieldModule(r.midfield);
    return {
      kind: 'procedural',
      perTeam,
      seed,
      ...(preset === undefined ? {} : { preset }),
      ...(midfield === undefined ? {} : { midfield }),
    };
  }
  return fail('unknown map spec');
};

const validateFactionName = (x: unknown): FactionName => {
  if (x === 'terran' || x === 'protoss' || x === 'zerg') return x;
  return fail('unknown faction');
};

const validateCommand = (x: unknown): Command => {
  const r = asRecord(x, 'command must be an object with type');
  const t = r.t;
  if (typeof t !== 'string') fail('command must be an object with type');
  const unit = r.unit;
  const building = r.building;
  const kind = r.kind;
  const xPos = r.x;
  const yPos = r.y;
  switch (t) {
    case 'train': {
      const trainBuilding = readNonNegativeInt(building, 'invalid train command');
      const trainKind = readPositiveInt(kind, 'invalid train command');
      return { t: 'train', building: trainBuilding, kind: trainKind };
    }
    case 'research': {
      return {
        t: 'research',
        building: readNonNegativeInt(building, 'invalid research command'),
        tech: readPositiveInt(r.tech, 'invalid research command'),
      };
    }
    case 'build': {
      return {
        t: 'build',
        unit: readNonNegativeInt(unit, 'invalid build command'),
        kind: readPositiveInt(kind, 'invalid build command'),
        x: readInt(xPos, 'invalid build command'),
        y: readInt(yPos, 'invalid build command'),
      };
    }
    case 'addon': {
      return {
        t: 'addon',
        building: readNonNegativeInt(building, 'invalid addon command'),
        kind: readPositiveInt(kind, 'invalid addon command'),
      };
    }
    case 'lift': {
      return { t: 'lift', building: readNonNegativeInt(building, 'invalid lift command') };
    }
    case 'land': {
      return {
        t: 'land',
        building: readNonNegativeInt(building, 'invalid land command'),
        x: readInt(xPos, 'invalid land command'),
        y: readInt(yPos, 'invalid land command'),
      };
    }
    case 'transform': {
      const cmd: Command = {
        t: 'transform',
        unit: readNonNegativeInt(unit, 'invalid transform command'),
        kind: readPositiveInt(kind, 'invalid transform command'),
      };
      if (r.target !== undefined) cmd.target = readNonNegativeInt(r.target, 'invalid transform command');
      return cmd;
    }
    case 'burrow': {
      return {
        t: 'burrow',
        unit: readNonNegativeInt(unit, 'invalid burrow command'),
        active: readBool(r.active, 'invalid burrow command'),
      };
    }
    case 'mine': {
      return { t: 'mine', unit: readNonNegativeInt(unit, 'invalid mine command') };
    }
    case 'load': {
      return {
        t: 'load',
        transport: readNonNegativeInt(r.transport, 'invalid load command'),
        unit: readNonNegativeInt(unit, 'invalid load command'),
      };
    }
    case 'unload': {
      return {
        t: 'unload',
        transport: readNonNegativeInt(r.transport, 'invalid unload command'),
        unit: readNonNegativeInt(unit, 'invalid unload command'),
        x: readInt(xPos, 'invalid unload command'),
        y: readInt(yPos, 'invalid unload command'),
      };
    }
    case 'cancelBuild': {
      return { t: 'cancelBuild', building: readNonNegativeInt(building, 'invalid cancelBuild command') };
    }
    case 'move': {
      const cmd: Command = {
        t: 'move',
        unit: readNonNegativeInt(unit, 'invalid move command'),
        x: readInt(xPos, 'invalid move command'),
        y: readInt(yPos, 'invalid move command'),
        ...readOptionalQueue(r, 'invalid move command'),
      };
      if (r.target !== undefined) cmd.target = readNonNegativeInt(r.target, 'invalid move command');
      return cmd;
    }
    case 'attack': {
      return {
        t: 'attack',
        unit: readNonNegativeInt(unit, 'invalid attack command'),
        target: readNonNegativeInt(r.target, 'invalid attack command'),
      };
    }
    case 'amove': {
      return {
        t: 'amove',
        unit: readNonNegativeInt(unit, 'invalid amove command'),
        x: readInt(xPos, 'invalid amove command'),
        y: readInt(yPos, 'invalid amove command'),
        ...readOptionalQueue(r, 'invalid amove command'),
      };
    }
    case 'ability': {
      const cmd: Command = {
        t: 'ability',
        unit: readNonNegativeInt(unit, 'invalid ability command'),
        ability: readPositiveInt(r.ability, 'invalid ability command'),
      };
      if (r.target !== undefined) cmd.target = readNonNegativeInt(r.target, 'invalid ability command');
      if (xPos !== undefined) cmd.x = readInt(xPos, 'invalid ability command');
      if (yPos !== undefined) cmd.y = readInt(yPos, 'invalid ability command');
      return cmd;
    }
    case 'harvest': {
      return {
        t: 'harvest',
        unit: readNonNegativeInt(unit, 'invalid harvest command'),
        patch: readNonNegativeInt(r.patch, 'invalid harvest command'),
      };
    }
    case 'repair': {
      return {
        t: 'repair',
        unit: readNonNegativeInt(unit, 'invalid repair command'),
        target: readNonNegativeInt(r.target, 'invalid repair command'),
      };
    }
    case 'rally': {
      const cmd: Command = {
        t: 'rally',
        building: readNonNegativeInt(building, 'invalid rally command'),
        x: readInt(xPos, 'invalid rally command'),
        y: readInt(yPos, 'invalid rally command'),
      };
      if (r.target !== undefined) return { ...cmd, target: readNonNegativeInt(r.target, 'invalid rally command') };
      return cmd;
    }
    case 'stop': {
      return { t: 'stop', unit: readNonNegativeInt(unit, 'invalid stop command') };
    }
    default:
      return fail(`unknown command type ${t}`);
  }
};

const validatePlayerCommands = (x: unknown): PlayerCommands => {
  const r = asRecord(x, 'player command batch must be an object');
  const player = readNonNegativeInt(r.player, 'player id must be a non-negative integer');
  const cmds = readArray(r.cmds, 'cmds must be an array');
  return { player, cmds: cmds.map(validateCommand) };
};

export const validateReplay = (x: unknown): Replay => {
  const r = asRecord(x, 'root must be an object');
  const version = r.version;
  if (version !== REPLAY_VERSION) fail(`unsupported version ${String(version)}`);
  const players = readPositiveInt(r.players, 'players must be a positive integer');
  const seed = readInt(r.seed, 'seed must be an integer');
  const factions = r.factions === undefined ? undefined : readArray(r.factions, 'factions must be an array').map(validateFactionName);
  if (factions !== undefined && factions.length !== players) fail('factions length must match players');
  const frames = readArray(r.frames, 'frames must be an array');
  return {
    version: REPLAY_VERSION,
    map: validateMapSpec(r.map),
    players,
    seed,
    ...(factions ? { factions } : {}),
    frames: frames.map((frame: unknown) => {
      const frameBatch = readArray(frame, 'each frame must be an array');
      return frameBatch.map(validatePlayerCommands);
    }),
  };
};

export const parseReplay = (json: string): Replay => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    fail('invalid JSON');
  }
  return validateReplay(parsed);
};

/** Assemble a Replay from a recording Sim's captured frames. */
export const toReplay = (sim: Sim, map: MapSpec): Replay => ({
  version: REPLAY_VERSION,
  map,
  players: sim.fullState().teams.length,
  seed: sim.seed,
  factions: sim.factions.length ? sim.factions.map(factionNameOf) : undefined,
  frames: sim.frames ?? [],
});

const simForReplay = (r: Replay): Sim => {
  const replay = validateReplay(r);
  const factions = replay.factions?.map((name) => Factions[name]);
  return new Sim({ map: mapFromSpec(replay.map), players: replay.players, seed: replay.seed, factions });
};

/** Re-simulate a replay to completion; returns the final Sim. */
export const play = (r: Replay): Sim => {
  const replay = validateReplay(r);
  const sim = simForReplay(replay);
  for (const batch of replay.frames) sim.step(batch);
  return sim;
};

/** Re-simulate, returning the per-tick state-hash sequence (the replay-hash check). */
export const replayHashes = (r: Replay): number[] => {
  const replay = validateReplay(r);
  const sim = simForReplay(replay);
  const hs: number[] = [];
  for (const batch of replay.frames) { sim.step(batch); hs.push(sim.hash()); }
  return hs;
};
