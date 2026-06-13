# RTS

A real-time strategy game in the spirit of **StarCraft: Brood War**, **built for mobile**, and
designed from the ground up as a research platform for **superhuman AI** (in the spirit of
AlphaStar). Fully playable in the browser against a computer opponent — with optional computer
teammates and a variety of maps — and architected so the AI can be swapped for human players
over a network without touching the simulation.

> **Status: design phase.** This commit establishes the vision, full game specification, engine
> architecture, mobile-UI design, AI/training plan, and a researched reference library. Code
> implementation begins next, starting with a Terran-only vertical slice.

## Vision & pillars

1. **StarCraft 1 gameplay, faithfully.** Specs start identical to SC:BW — same resources,
   supply, unit/building stats, damage-type-vs-size combat, tech trees. See
   [`docs/specs/sc1-spec.md`](docs/specs/sc1-spec.md).
2. **Mobile-first, rethought.** Not a shrunk PC UI — an interaction model redesigned for a small
   vertical touchscreen (thumb-first controls, selection-then-action, reduced-APM automation),
   verified continuously with Playwright screenshots. See [`docs/specs/ui-mobile.md`](docs/specs/ui-mobile.md).
3. **One deterministic simulation, many consumers.** A single Rust core runs in the browser
   (WASM), in headless training (native), and in network play — no second implementation to
   drift. Deterministic + fixed-point → reproducible replays, lockstep netcode, stable RL. See
   [`docs/specs/architecture.md`](docs/specs/architecture.md).
4. **Players are an interface.** Local human, networked human, scripted bot, and neural-net
   policy are interchangeable behind one `observe → commands` boundary.
5. **Built for superhuman AI on a small budget.** The engine is high-throughput and runs many
   parallel games so we can train AlphaStar-spirit agents on a few GPUs — substituting
   simulation throughput + an imitation warmstart + a self-play league for DeepMind's TPU fleet.
   See [`docs/specs/ai-training.md`](docs/specs/ai-training.md).

## Architecture at a glance

```
            ┌──────────────────────────────────────────────┐
            │            sim core  (Rust)                  │
            │  deterministic · fixed-point · ECS/SoA       │
            │  no I/O · no float · step(cmds) -> state     │
            └──────┬─────────────┬──────────────┬──────────┘
          wasm     │    cdylib   │     PyO3      │
          ┌────────▼───┐ ┌───────▼─────┐ ┌──────▼────────┐
          │  browser   │ │ headless    │ │ python RL     │
          │ TS + WebGL │ │ bots /      │ │ (PyTorch)     │
          │ mobile UI  │ │ self-play / │ │ vec-envs /    │
          │ + input    │ │ replays     │ │ league train  │
          └────────────┘ └─────────────┘ └───────────────┘
```

- **Engine:** Rust, deterministic, fixed-point integer math, data-oriented (ECS/SoA) for
  cache-friendly bulk iteration and high throughput.
- **Browser:** TypeScript + WebGL renderer and mobile UI; drives the sim via WASM.
- **Training:** Python (PyTorch) over PyO3 bindings, stepping many parallel native sims.
- **Decisions locked:** Rust sim core from day 1; first milestone is a **Terran-only vertical
  slice** (full stack end-to-end), then expand to Protoss/Zerg, more maps, and teammates.

## Repository layout (planned)

```
crates/
  sim/         deterministic core (no I/O, no float)
  sim-wasm/    wasm-bindgen wrapper -> browser
  sim-py/      PyO3 wrapper -> python RL
  headless/    native CLI: run games, self-play, replays, benchmarks
web/           TS + WebGL renderer, mobile UI, input
train/         python RL: vec-env, policy nets, league, training loops
maps/          map definitions (data)
replays/       recorded command-stream replays
docs/          specs, research notes, papers, tooling (see below)
```

## Documentation

| Doc | What's in it |
|---|---|
| [`docs/specs/architecture.md`](docs/specs/architecture.md) | Engine design: determinism, ECS/SoA core, tick pipeline, player interface, build targets, repo layout. |
| [`docs/specs/sc1-spec.md`](docs/specs/sc1-spec.md) | The game data: universal mechanics + combat model, and full Terran / Protoss / Zerg unit, building, and tech data. |
| [`docs/specs/ui-mobile.md`](docs/specs/ui-mobile.md) | Mobile-first vertical UI: layout zones, touch grammar, control groups, APM-reduction, Playwright verification workflow. |
| [`docs/specs/ai-training.md`](docs/specs/ai-training.md) | AI plan: scripted bots → behavior-cloning warmstart → PPO → PFSP self-play league → distillation; throughput strategy. |
| [`docs/research/`](docs/research/) | Synthesized research: [AlphaStar](docs/research/alphastar.md), [efficient RL](docs/research/efficient-rl.md), [SC1 spells & upgrades](docs/research/sc1-spells-upgrades.md). |
| [`docs/papers/index.md`](docs/papers/index.md) | Annotated reading list of 39 reference papers (text committed; PDFs regenerable). |

## Research foundation (the short version)

AlphaStar proved superhuman RTS is possible; its cost was **throughput** (384 TPUs, 44 days),
not algorithmic mystery. Our plan, grounded in the research under `docs/`:

- **Throughput is the lever.** A fast deterministic batched simulator is the asset that lets a
  small team substitute frames-per-second for a TPU fleet (existence proof: **Gym-µRTS** beat
  every prior competition bot in ~60h on a single GPU).
- **Stay model-free** (PPO/APPO) — we own perfect cheap dynamics, so a learned world model
  mostly adds bias; we borrow model-based *tricks* (network scaling, high replay ratio, resets).
- **Warmstart by behavior-cloning our own scripted bots** — the highest-leverage single step,
  no human replay data required.
- **Get action/observation design right** — spatial feature maps, factored (GridNet /
  autoregressive) action heads, and **invalid-action masking** (non-negotiable).
- **Reach superhuman via a PFSP self-play league + a couple of exploiters**, then **distill**
  into one shippable agent.

## Tooling

```bash
# Download + extract reference papers (PDFs are git-ignored; text is committed)
pip install pymupdf
python3 docs/scripts/fetch_papers.py
```

## Roadmap

1. **Foundations (this commit):** vision, specs, architecture, UI design, AI plan, research. ✅
2. **Terran vertical slice:** Rust sim core (economy, a few buildings/units, combat, fog, one
   map, win condition) + mobile UI in the browser + a scripted opponent.
3. **AI loop:** Gym/PyO3 interface, scripted bot ladder, behavior-cloning warmstart, PPO fine-tune.
4. **Superhuman:** self-play + PFSP league + PBT; distill; APM/reaction constraints; human eval.
5. **Expand:** full Terran roster → Protoss & Zerg, more maps, computer teammates, network play.
