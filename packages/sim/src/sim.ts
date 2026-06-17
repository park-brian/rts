// The Sim: a thin wrapper over world state + the tick pipeline, exposing the
// public engine API (see docs/specs/architecture.md §4). Pure: no I/O, no DOM.

import type { MapDef } from './map.ts';
import type { State } from './world.ts';
import type { Command, CommandResult, PlayerCommands } from './commands.ts';
import { Terran, type Faction } from './data.ts';
import { cloneState, hashState } from './world.ts';
import { setupMatch } from './setup.ts';
import { stepWorld } from './tick.ts';
import { serializeState, deserializeState } from './serialize.ts';
import { observe, type Observation } from './observe.ts';
import { vision } from './systems/vision.ts';

export type SimOptions = { map: MapDef; players: number; seed: number; record?: boolean; vision?: boolean; factions?: Faction[] };
export type Snapshot = State; // an in-memory deep-cloned state (see serialize() for bytes)

/** Deep-copy one tick's command batch so a recorded replay is immune to caller reuse. */
const cloneBatch = (batch: PlayerCommands[]): PlayerCommands[] =>
  batch
    .filter((pc) => pc.cmds.length > 0)
    .map((pc) => ({ player: pc.player, cmds: pc.cmds.map((c) => ({ ...c }) as Command) }));

export class Sim {
  state: State;
  seed = 0;
  factions: Faction[] = [];
  /** Per-tick recorded command batches (frames[t] applied at tick t), or null when not recording. */
  frames: PlayerCommands[][] | null = null;
  /** Deterministic receipts for the most recent step's command batch. */
  lastCommandResults: CommandResult[] = [];

  constructor(opts: SimOptions) {
    this.factions = Array.from({ length: opts.players }, (_, i) => opts.factions?.[i] ?? Terran);
    this.state = setupMatch(opts.map, opts.players, opts.seed, this.factions);
    this.state.trackVision = !!opts.vision;
    if (this.state.trackVision) vision(this.state);
    this.seed = opts.seed;
    if (opts.record) this.frames = [];
  }

  static fromState(state: State): Sim {
    const sim = Object.create(Sim.prototype) as Sim;
    sim.state = state;
    sim.seed = 0;
    sim.factions = [];
    sim.frames = null;
    sim.lastCommandResults = [];
    return sim;
  }

  get tick(): number {
    return this.state.tick;
  }

  /** Advance one logical tick with this tick's commands (one bundle per player). */
  step(batch: PlayerCommands[] = []): CommandResult[] {
    if (this.frames && !this.state.result.over) this.frames.push(cloneBatch(batch));
    this.lastCommandResults = stepWorld(this.state, batch);
    return this.lastCommandResults;
  }

  /** Full god-view state (rendering / scripted AI). */
  fullState(): State {
    return this.state;
  }

  /** Fog-limited observation for player `p` (fair-play view; RL/network seam). */
  observe(p: number): Observation {
    return observe(this.state, p);
  }

  snapshot(): Snapshot {
    return cloneState(this.state);
  }

  static restore(snap: Snapshot): Sim {
    return Sim.fromState(cloneState(snap));
  }

  /** Flat byte buffer of the full state (persist to disk / transfer to a Worker). */
  serialize(): ArrayBuffer {
    return serializeState(this.state);
  }

  static deserialize(buf: ArrayBuffer): Sim {
    return Sim.fromState(deserializeState(buf));
  }

  /** Deterministic state fingerprint (replay/desync checks). */
  hash(): number {
    return hashState(this.state);
  }
}
