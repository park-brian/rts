# Engine Architecture

> Status: living design doc. Decisions here are binding until explicitly revised.
> Companion docs: [`sc1-spec.md`](./sc1-spec.md) (game data), [`ai-training.md`](./ai-training.md) (AI/RL), [`ui-mobile.md`](./ui-mobile.md) (mobile UI).
>
> **Stack decision (revised): TypeScript-first.** A single-language monorepo. The simulation
> is a pure, deterministic, data-oriented TypeScript core behind a strict interface; rendering,
> UI, and scripted AI are also TypeScript. Native throughput (a Rust→WASM sim port, or a JAX
> vectorized sim for large-scale training) is a **later, measured, replay-validated
> optimization** — not a day-1 commitment. See §9 for the rationale and §3 for why determinism
> survives the choice of language.

## 1. Goals & hard constraints

These goals are in tension; the architecture exists to resolve them:

1. **Browser-playable** vs. a computer opponent, with optional computer teammates, on a variety
   of maps. Mobile-first (small vertical screens).
2. **High simulation throughput** so we can iterate over many games for training. Headless must
   run far faster than real time and scale to many parallel instances.
3. **Deterministic & reproducible.** The same inputs always produce the same game. Required for:
   network multiplayer (lockstep), replays, debugging, and stable RL.
4. **Input-source agnostic.** A "player" is an interface. Local human, networked human, scripted
   AI, and a neural-net policy are interchangeable behind the same boundary.
5. **Single source of truth for the simulation.** The exact same simulation code runs in the
   browser, in headless training, and in network play. No second implementation to drift.

The resolution, given **our resources** (an AI agent iterating in short ephemeral sessions, no
local GPU, mobile UI as the hard problem, training milestones away): build the whole thing in
**TypeScript** first. One language, one toolchain, instant browser feedback, Playwright out of
the box. The sim is written **deterministic and data-oriented behind a strict interface**, so
the *only* deferred property — native throughput — can later be reclaimed by porting just the
sim hot-loop, validated bit-for-bit against the TS version via recorded replays (§9).

## 2. The big picture

```
                    ┌─────────────────────────────────────────────┐
                    │           sim core  (TypeScript)             │
                    │  deterministic · fixed-point ints · SoA      │
                    │  no DOM · no I/O · no float in hot path       │
                    │  step(commands[]) -> new state               │
                    │  observe(player) -> observation              │
                    └───────┬───────────────┬───────────────┬─────┘
            same module     │   same module │   same module │
                    ┌───────▼──────┐ ┌───────▼──────┐ ┌───────▼──────┐
                    │   browser    │ │ node headless│ │ worker pool  │
                    │ WebGL render │ │ CLI: games,  │ │ N parallel   │
                    │ + mobile UI  │ │ self-play,   │ │ games for    │
                    │ + input      │ │ replays, bench│ │ training data│
                    └──────────────┘ └──────────────┘ └──────────────┘
```

One TypeScript package (`sim`) is the heart. It is pure: **no DOM, no I/O, no system clock, no
floating point in the deterministic hot path.** State in, commands in, new state out. It runs
identically in the browser, in Node, and inside a Web Worker — no cross-language boundary.

## 3. Determinism model

Determinism is non-negotiable; it is the foundation for replays, netcode, and RL
reproducibility. **It is a coding discipline, not a property of the language** — a disciplined
integer TS sim is deterministic across V8 platforms.

- **Fixed-point arithmetic.** All positions, velocities, HP, timers use fixed-point integers
  (a small `Fixed` helper over JS integers, e.g. value × 4096, kept within the 32-bit range via
  `| 0` / `Math.imul`). **No `f32`/`f64` in the core**, and none of `Math.sin/sqrt/random` in
  the hot path (use integer/LUT equivalents). Floats are the only realistic source of
  cross-platform divergence in JS, and we simply don't use them in the sim.
- **Deterministic RNG.** A seeded integer PRNG (e.g. PCG/xoshiro over `Uint32`) is part of game
  state. Every random draw is reproducible. The seed is in the replay header.
- **Lockstep tick.** The game advances in discrete logical frames ("ticks"). One canonical tick
  rate (SC1 "Fastest" ≈ 23.81 ticks/sec; exact value in `sc1-spec.md`). All game logic measured
  in ticks, never wall-clock.
- **Ordered iteration.** Entity processing order is fixed and stable (by dense array index /
  entity id), never `Map`/object key-enumeration order for anything that affects state.
- **Enforcement.** A lint rule + a CI **replay-hash test**: re-simulating a recorded
  `(seed, map, command-stream)` must reproduce an identical state hash every tick. This same
  test is what will later validate any Rust/WASM port (§9).
- **Replays = seed + initial state + command stream.** A full game replay is the map id, seed,
  and the per-tick list of player commands. Re-simulating reproduces the game exactly. This also
  *is* the network protocol (lockstep) and the training trajectory format.

## 4. Simulation core design (data-oriented)

The core is built for cache efficiency and bulk iteration, not OOP convenience. V8 rewards this
style: typed arrays, monomorphic code, and zero allocation in the hot loop run *fast*.

- **ECS / Struct-of-Arrays via typed arrays.** Entities (units, buildings) are dense columns in
  `Int32Array`/`Uint16Array`/etc., indexed by a generational `EntityId` (index + generation to
  catch stale references). Parallel arrays (SoA) for cache-friendly bulk passes. No per-entity
  object allocation, no pointer chasing in the tick.
- **The tick pipeline** runs as ordered systems over the arrays:
  1. ingest & validate player commands → unit orders
  2. resource/economy update (mining, supply)
  3. production & build queues (timers)
  4. pathfinding / movement
  5. target acquisition & combat (damage type vs size table)
  6. ability/spell resolution & energy
  7. death/cleanup, fog-of-vision update, event emission
- **Spatial index.** A uniform grid / bucket structure (typed-array backed) for range queries
  (target acquisition, splash, selection, fog). Rebuilt or incrementally updated each tick.
- **Pathfinding.** Tile-grid based (SC1-style 32px build tiles / 8px walk tiles). Start with
  deterministic A* + flow-field/boids-lite for groups; integer-only. Historically the perf hot
  spot — budget for it; it's also the first candidate for a future WASM port.
- **No I/O in core.** Logging, file access, rendering, and timing live in the host layers.
- **Snapshot/restore.** State is plain typed-array buffers, so we can clone/serialize cheaply to
  fork games, save/load, and reset parallel envs fast (memcpy of buffers).

### Public core API (sketch, TypeScript)

```ts
// One game instance — plain TS, runs in browser / Node / Worker identically.
class Sim {
  constructor(map: MapDef, players: PlayerSetup[], seed: number);
  step(commands: PlayerCommands[]): StepResult; // advance 1 tick
  observe(player: PlayerId): Observation;        // fog-limited view
  fullState(): WorldState;                        // for rendering / god-view AI
  snapshot(): ArrayBuffer;                        // flat buffers, cheap
  static restore(buf: ArrayBuffer): Sim;
  hash(): number;                                 // for the replay-determinism test
}
```

`step` takes **one command bundle per player per tick** — the universal interface point for all
controllers.

## 5. Players as an interface (input-source abstraction)

A player is anything that, given an observation, produces commands. This seam makes
humans/bots/policies interchangeable.

```
Controller:  observe(Observation) -> PlayerCommands
  ├─ LocalHumanController   (browser: UI gestures -> commands)
  ├─ NetworkController      (commands arrive over the wire, lockstep)
  ├─ ScriptedController     (hardcoded bot; may read fullState() = "god vision")
  └─ PolicyController       (neural net inference; observe -> action -> commands)
```

- **Commands** are a compact, serializable discriminated union (e.g. `Move`, `Attack`, `Build`,
  `Train`, `Research`, `UseAbility`, `SetRally`, `Cancel`). The *same* command type flows from
  UI, network, scripted bot, and policy — so replays, netcode, and RL trajectories are the same
  data.
- **Observations** come in two flavors: a **fog-limited** observation for fair play, and **full
  god-view** access (`fullState()`) for scripted bots (the spec wants easy hardcoded AI with
  full map vision).
- **APM / action-rate limiting** can be enforced at this boundary for fair AI evaluation
  (mirroring AlphaStar's constraints).

## 6. Rendering & UI (browser, TS)

- Rendering is **pure read-only** over `fullState()` (or the fog-limited observation for the
  human player). It never mutates the sim. It runs at display framerate (60fps) while the sim
  ticks at the logical rate, interpolating between ticks for smoothness.
- **WebGL/Canvas** for the map, units, fog, effects. Sprite/quad batching for mobile GPUs.
- **Mobile-first vertical UI** is a first-class concern with its own doc ([`ui-mobile.md`](./ui-mobile.md)) —
  touch controls, selection, command palette, minimap, all designed for a tall narrow screen,
  verified with Playwright screenshots throughout development.
- The browser drives the sim on a fixed-timestep loop (accumulator) decoupled from render.

## 7. Training & headless (Node)

- The `headless` package runs the sim with **no rendering**, advancing as fast as the CPU
  allows. A Node CLI runs games, self-play, replays, and benchmarks (`bench` mode tracks
  games/sec as a first-class metric).
- **Parallel environments:** many `Sim` instances stepped across a **Web Worker pool** (and/or
  multiple Node processes). The typed-array SoA layout and cheap snapshot/restore make resets
  fast.
- **RL integration (when we get there):** the JS sim can drive a JS-based RL loop directly, or
  expose a Gym-like API to Python over a thin bridge (stdin/stdout JSON, or shared-memory /
  Arrow). The training-throughput substrate is deliberately deferred and decoupled — see
  [`ai-training.md`](./ai-training.md) and §9.

## 8. Repository layout (planned)

```
rts/
├── README.md
├── package.json              # pnpm workspace root
├── pnpm-workspace.yaml
├── packages/
│   ├── sim/                  # deterministic core (no DOM, no I/O, no float in hot path)
│   ├── ai/                   # scripted controllers; later the policy controller
│   ├── render/               # WebGL/Canvas read-only renderer
│   ├── ui/                   # mobile UI components, gesture/touch -> commands
│   ├── app/                  # browser game (Vite) — the thing we screenshot
│   └── headless/             # Node CLI: games, self-play, replays, benchmarks, worker pool
├── maps/                     # map definitions (data)
├── replays/                  # recorded command-stream replays
└── docs/
    ├── specs/                # architecture (this file), sc1-spec, ai-training, ui-mobile
    ├── papers/               # downloaded reference papers (text committed; PDFs regenerable)
    ├── research/             # synthesized research notes
    └── scripts/              # paper fetcher / pdf parser, tooling
```

Tooling: pnpm workspaces, Vite (app), Vitest (unit + replay-hash determinism tests), tsx (Node
scripts), Playwright (mobile UI screenshots).

## 9. Why TypeScript-first (and how the throughput door stays open)

The only thing a native (Rust) core buys us is sim throughput — a requirement that does not bite
until the training stage, while a multi-language build (Rust + WASM + PyO3 + TS) costs friction
on every change during the long pre-training phase that is most of this project's near-term life.
For an AI-agent developer in short sessions, that iteration tax is the dominant cost.

The properties that *seemed* to require Rust don't:
- **Determinism** is a discipline (integer/fixed-point, seeded RNG, ordered iteration), not a
  language feature — see §3.
- **"One sim, many consumers"** is satisfied by pure TS running in browser / Node / Worker, with
  *no* boundary at all.
- **Throughput** has a contained, **verifiable** escape hatch: keep the sim behind the §4
  interface; if/when profiling shows sim throughput is the real training bottleneck, port just
  the hot-loop to **Rust→WASM** (which still serves both browser and Node) or write a **JAX
  vectorized** sim for large-scale batched training. Because the sim is deterministic with
  recorded replays, the port is validated by replaying the same command stream and asserting
  identical per-tick `hash()` — a mechanical, test-gated swap, not a rewrite of the app.

Supporting evidence: **µRTS — the SOTA-efficient RTS-RL benchmark, where Gym-µRTS beat every
competition bot in ~60h on one GPU — runs on the JVM, not native code.** A managed-language sim
is demonstrably viable for serious RTS RL. And the *ultimate* throughput path (AlphaStar-scale)
is a batched JAX sim regardless of day-1 language — so the starting language need not be the
training-throughput language. Day 1 optimizes for a playable mobile game + scripted AI: that's
TypeScript.

## 10. Open questions / deferred

- Pathfinding approach at scale (A* + flow fields vs. SC1's path tables) — prototype/benchmark;
  first candidate for a future WASM hot-loop port.
- Fixed-point scale factor and whether to mirror SC1's exact sub-tile units.
- The training substrate: JS-native RL loop vs. Python bridge vs. eventual WASM/JAX port —
  decided in [`ai-training.md`](./ai-training.md) when we reach that stage and can measure.
- Worker-pool vs. multi-process for parallel headless games — benchmark both.
```
