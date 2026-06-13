# Engine Architecture

> Status: living design doc. Decisions here are binding until explicitly revised.
> Companion docs: [`sc1-spec.md`](./sc1-spec.md) (game data), [`ai-training.md`](./ai-training.md) (AI/RL), [`ui-mobile.md`](./ui-mobile.md) (mobile UI).

## 1. Goals & hard constraints

These goals are in tension; the architecture exists to resolve them:

1. **Browser-playable** vs. a computer opponent, with optional computer teammates, on a variety of maps. Mobile-first (small vertical screens).
2. **Extremely high simulation throughput** so we can iterate over *millions* of games for AlphaStar-style training. The headless sim must run thousands of times faster than real time and scale to many parallel instances.
3. **Deterministic & reproducible.** The same inputs always produce the same game. Required for: network multiplayer (lockstep), replays, debugging, and stable RL.
4. **Input-source agnostic.** A "player" is an interface. Local human, networked human, scripted AI, and a neural-net policy are interchangeable behind the same boundary.
5. **Single source of truth for the simulation.** The exact same simulation code runs in the browser, in headless training, and in network play. No second re-implementation to drift out of sync.

The resolution: a **deterministic, data-oriented simulation core in Rust** that compiles to (a) WASM for the browser and (b) a native library for training and bots. Everything else — rendering, UI, AI policies, training harness — is a *consumer* of that core through narrow interfaces.

## 2. The big picture

```
                    ┌─────────────────────────────────────────────┐
                    │              sim core  (Rust)                │
                    │  deterministic fixed-point lockstep engine   │
                    │  ECS / SoA data layout · no I/O · no float    │
                    │  step(commands[]) -> new state               │
                    │  observe(player) -> observation              │
                    └───────┬───────────────┬───────────────┬─────┘
            wasm-bindgen    │      cdylib    │     PyO3       │
                    ┌───────▼──────┐ ┌───────▼──────┐ ┌───────▼──────┐
                    │   browser    │ │ native bots/ │ │ python RL    │
                    │ TS + WebGL   │ │ headless CLI │ │ (PyTorch/JAX)│
                    │ render + UI  │ │ self-play    │ │ training     │
                    │ + input      │ │ replay tools │ │ vec-envs     │
                    └──────────────┘ └──────────────┘ └──────────────┘
```

One Rust crate (`sim`) is the heart. It is `no_std`-friendly in spirit: **no I/O, no system clock, no threads, no floating point** inside the deterministic core. State in, commands in, new state out.

## 3. Determinism model

Determinism is non-negotiable; it is the foundation for replays, netcode, and RL reproducibility.

- **Fixed-point arithmetic.** All positions, velocities, HP, timers use fixed-point integers (e.g. `i32`/`i64` with a fractional scale, mirroring SC1's sub-tile precision). **No `f32`/`f64` in the core** — floats are non-deterministic across platforms/compilers. A small `fixed` module wraps the type and ops.
- **Deterministic RNG.** A seeded PRNG (e.g. PCG/xoshiro) is part of game state. Every random draw is reproducible. The seed is part of the replay header.
- **Lockstep tick.** The game advances in discrete logical frames ("ticks"). One canonical tick rate (see SC1 "Fastest" ≈ 23.81 ticks/sec; exact value in `sc1-spec.md`). All game logic measured in ticks, never wall-clock.
- **Ordered iteration.** Entity processing order is fixed and stable (by entity id / dense array index), never hash-map iteration order.
- **Replays = seed + initial state + command stream.** A full game replay is the map id, seed, and the per-tick list of player commands. Re-simulating reproduces the game bit-for-bit. This also *is* the network protocol (lockstep) and the training trajectory format.

## 4. Simulation core design (data-oriented)

The core is built for cache efficiency and bulk iteration, not OOP convenience.

- **ECS / Struct-of-Arrays.** Entities (units, buildings) are dense arrays indexed by a generational `EntityId` (index + generation to catch stale references). Components stored in parallel arrays (SoA) for cache-friendly bulk passes. Avoid per-entity heap allocation and pointer chasing.
- **The tick pipeline** runs as ordered systems over the arrays, e.g.:
  1. ingest & validate player commands → unit orders
  2. resource/economy update (mining, supply)
  3. production & build queues (timers)
  4. pathfinding / movement
  5. target acquisition & combat (damage type vs size table)
  6. ability/spell resolution & energy
  7. death/cleanup, fog-of-vision update, event emission
- **Spatial index.** A uniform grid / bucket structure for range queries (target acquisition, splash, selection, fog). Rebuilt or incrementally updated each tick.
- **Pathfinding.** Tile-grid based (SC1-style 32px build tiles / 8px walk tiles). Start with deterministic A* + flow-field/boids-lite for groups; keep it integer-only. Pathing is historically the perf hot spot — budget for it.
- **No I/O in core.** Logging, file access, rendering, and timing live in the host layers. The core only mutates state.
- **Snapshot/restore.** State is plain data (`Clone` / serialize to a flat buffer) so we can fork games, save/load, and reset vec-envs cheaply.

### Public core API (sketch)

```rust
// One game instance.
struct Sim { /* all game state: entities, map, players, rng, tick */ }

impl Sim {
    fn new(map: &MapDef, players: &[PlayerSetup], seed: u64) -> Sim;
    fn step(&mut self, commands: &[PlayerCommands]) -> StepResult; // advance 1 tick
    fn observe(&self, player: PlayerId) -> Observation;            // fog-limited view
    fn full_state(&self) -> &WorldState;                           // for rendering / god-view AI
    fn snapshot(&self) -> Vec<u8>;
    fn restore(buf: &[u8]) -> Sim;
}
```

`step` takes **one command bundle per player per tick** — this is the universal interface point for all controllers.

## 5. Players as an interface (input-source abstraction)

A player is anything that, given an observation, produces commands. This is the seam that makes humans/bots/policies interchangeable.

```
Controller:  observe(Observation) -> PlayerCommands
  ├─ LocalHumanController   (browser: UI gestures -> commands)
  ├─ NetworkController      (commands arrive over the wire, lockstep)
  ├─ ScriptedController     (hardcoded bot; may read full_state = "god vision")
  └─ PolicyController       (neural net inference; observe -> action -> commands)
```

- **Commands** are a compact, serializable enum (e.g. `Move`, `Attack`, `Build`, `Train`, `Research`, `UseAbility`, `SetRally`, `Cancel`). The *same* command type flows from UI, network, scripted bot, and policy. This makes replays, netcode, and RL trajectories the same data.
- **Observations** come in two flavors: a **fog-limited** observation for fair play, and **full god-view** access for scripted bots (the spec explicitly wants easy hardcoded AI with full map vision).
- **APM / action-rate limiting** can be enforced at this boundary for fair AI evaluation (mirroring AlphaStar's constraints).

## 6. Rendering & UI (browser, TS)

- Rendering is **pure read-only** over `full_state()` (or the fog-limited observation for the human player). It never mutates the sim. It can run at display framerate (60fps) while the sim ticks at the logical rate, interpolating between ticks for smoothness.
- **WebGL/Canvas** for the map, units, fog, effects. Sprite/quad batching for performance on mobile GPUs.
- **Mobile-first vertical UI** is a first-class concern with its own doc ([`ui-mobile.md`](./ui-mobile.md)) — touch controls, selection, command palette, minimap, all designed for a tall narrow screen. Verified with Playwright screenshots throughout development.
- The browser drives the sim via the WASM build, calling `step` on a fixed-timestep loop (accumulator) decoupled from render.

## 7. Training & headless (native + Python)

- The native build runs the sim with **no rendering**, advancing as fast as the CPU allows. A headless CLI runs games, self-play, and replays.
- **Vectorized environments:** many `Sim` instances stepped in batch (data-parallel across cores; the SoA layout and cheap snapshot/restore make resets fast). This throughput is the whole point — see `ai-training.md`.
- **Python bindings (PyO3)** expose `reset/step/observe` in a Gym-like API so the RL stack (PyTorch/JAX) can train against the *exact same* simulation that ships in the browser.
- **Warm start from scripted bots** and human-like priors; league/self-play on top. Details in `ai-training.md`.

## 8. Repository layout (planned)

```
rts/
├── README.md
├── Cargo.toml                # cargo workspace
├── crates/
│   ├── sim/                  # the deterministic core (no I/O, no float)
│   ├── sim-wasm/             # wasm-bindgen wrapper -> browser
│   ├── sim-py/               # PyO3 wrapper -> python RL
│   └── headless/             # native CLI: run games, self-play, replays, benchmarks
├── web/                      # TS + WebGL renderer, mobile UI, input
├── train/                    # python RL: vec-env, policy nets, league, training loops
├── maps/                     # map definitions (data)
├── replays/                  # recorded command-stream replays
└── docs/
    ├── specs/                # architecture (this file), sc1-spec, ai-training, ui-mobile
    ├── papers/               # downloaded reference papers (pdf + extracted txt)
    ├── research/             # synthesized research notes
    └── scripts/              # paper fetcher / pdf parser, tooling
```

## 9. Why not pure TypeScript / why Rust

A TS sim is ~1–2 orders of magnitude slower than native for the tight integer loops (movement, combat, pathfinding) that dominate RTS, and JS floats make cross-platform determinism fragile. Since training throughput is the project's defining requirement and a deterministic stateful core is painful to rewrite later, we pay the upfront cost of Rust once and reuse the *same* binary logic in the browser (WASM), bots (native), and training (PyO3). TS still owns everything it's best at: rendering, UI, and input.

## 10. Open questions / deferred

- Exact pathfinding approach at scale (A* + flow fields vs. SC1's path tables) — prototype and benchmark.
- Fixed-point scale factor and whether to mirror SC1's exact sub-tile units.
- WASM threading (SharedArrayBuffer) for in-browser perf — likely not needed for a single game.
- Whether the RL stack is PyTorch or JAX (JAX favors the vectorized/podracer style; decide in `ai-training.md`).
```
