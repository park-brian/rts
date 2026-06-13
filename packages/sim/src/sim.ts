// The Sim: a thin wrapper over world state + the tick pipeline, exposing the
// public engine API (see docs/specs/architecture.md §4). Pure: no I/O, no DOM.

import type { MapDef } from './map.ts';
import type { State } from './world.ts';
import type { PlayerCommands } from './commands.ts';
import { cloneState, hashState } from './world.ts';
import { setupMatch } from './setup.ts';
import { stepWorld } from './tick.ts';

export type SimOptions = { map: MapDef; players: number; seed: number };
export type Snapshot = State; // an opaque deep-cloned state (byte serialization layered on later)

export class Sim {
  state: State;

  constructor(opts: SimOptions) {
    this.state = setupMatch(opts.map, opts.players, opts.seed);
  }

  static fromState(state: State): Sim {
    const sim = Object.create(Sim.prototype) as Sim;
    sim.state = state;
    return sim;
  }

  get tick(): number {
    return this.state.tick;
  }

  /** Advance one logical tick with this tick's commands (one bundle per player). */
  step(batch: PlayerCommands[] = []): void {
    stepWorld(this.state, batch);
  }

  /** Full god-view state (rendering / scripted AI). */
  fullState(): State {
    return this.state;
  }

  /** Fog-limited observation for player `p`. TODO: implement fog of war. */
  observe(_p: number): State {
    return this.state;
  }

  snapshot(): Snapshot {
    return cloneState(this.state);
  }

  static restore(snap: Snapshot): Sim {
    return Sim.fromState(cloneState(snap));
  }

  /** Deterministic state fingerprint (replay/desync checks). */
  hash(): number {
    return hashState(this.state);
  }
}
