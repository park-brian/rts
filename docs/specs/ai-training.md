# AI & Training Plan

> Status: living design doc. Goal: superhuman RTS play in the spirit of AlphaStar, but
> achievable by a small team on a few GPUs. Research backing: [`../research/alphastar.md`](../research/alphastar.md),
> [`../research/efficient-rl.md`](../research/efficient-rl.md), and papers under [`../papers/`](../papers/).

## 0. The thesis

AlphaStar proved superhuman RTS is possible; its cost was **throughput** (a 384-TPU,
44-day league), not algorithmic mystery. Our defining asset is the [deterministic, fast,
headless Rust sim](./architecture.md) that runs **many parallel games**. With that, we
substitute throughput-driven model-free RL + an imitation warmstart + a small self-play
league for DeepMind's fleet. The closest existence proof on small hardware is **Gym-µRTS**
(SOTA full-RTS DRL, beat every prior competition bot in ~60h on a *single* GPU). Our job is
to scale that recipe with throughput and self-play, not reproduce AlphaStar's scale.

Five load-bearing decisions:
1. **Throughput first** — frames-per-second is the real budget. Everything is downstream.
2. **Stay model-free** (PPO/APPO). We own perfect cheap dynamics, so a learned world model
   mostly adds bias; we steal model-based *tricks* (network scaling, high replay ratio,
   self-supervised aux losses, periodic resets) instead.
3. **Warmstart by behavior-cloning our own scripted bots** — highest-leverage single step;
   removes the cold-start exploration tax with **no human replay data required**.
4. **Get action/observation design right** — spatial feature maps + factored
   (GridNet / autoregressive) action heads + **invalid-action masking** (non-negotiable).
5. **Reach (super)human via a PFSP league + a couple of exploiters**, then **distill** the
   league into one shippable agent.

## 1. The environment interface (the contract with the sim)

The training stack consumes the sim through the [`PolicyController` boundary](./architecture.md#5-players-as-an-interface-input-source-abstraction). Concretely we expose a Gym/PettingZoo-style API via the PyO3 bindings (`crates/sim-py`):

- `reset(map, seed, opponents) -> obs`
- `step(action) -> obs, reward, done, info`
- a **vectorized** form, `step_batch`, advancing N independent games in one call (the SoA
  layout + cheap `snapshot/restore` make resets and batching cheap).
- **Action masks** returned every step so the policy never samples illegal actions.

Two observation modes (same as the controller boundary): **fog-limited** (fair play /
final agents) and **full god-view** (scripted bots, the critic's opponent-observation
baseline). Reproducibility is free — the sim is deterministic and seeded.

## 2. Observation & action representation

**Observation** (per player, per decision):
- **Spatial feature planes** — a multi-channel "image" of the map: terrain/height,
  walkability, ownership, unit-type occupancy, HP/shields, fog/visibility, resources,
  selection, and an alert channel. Downsampled to a fixed resolution (e.g. 64×64 or 128×128).
- **Entity list** — variable-length set of visible units/buildings, each a feature vector
  (type, owner, pos, hp/shield/energy, cooldowns, build progress, orders).
- **Scalar/global vector** — minerals, gas, supply used/cap, tech/upgrades owned, game
  clock, and a **conditioning scalar** (see §5: MMR-/style-conditioning).

**Action** — factored and decoded autoregressively, mirroring AlphaStar but trimmed:
`action_type → (delay) → selected_units → target_unit | target_point | building/tech arg`.
For unit selection over variable counts, use a **pointer network** over entity embeddings
(AlphaStar) and/or a **GridNet** per-cell head (Gym-µRTS) — we'll prototype both and pick by
throughput/quality. **Invalid-action masking applied at every head.**

## 3. Network architecture (start small, scale later)

A trimmed AlphaStar:
- **Entity encoder:** 1–2 layer Transformer / self-attention over the entity set (perm-equivariant; produces per-entity keys for the pointer head + a pooled embedding).
- **Spatial encoder:** small ResNet/CNN over the feature planes → a `map_skip` (for the spatial action head) + a pooled embedding.
- **Scalar encoder:** MLP.
- **Core:** a GRU/LSTM (handles partial observability / memory across the camera/fog).
- **Action heads:** autoregressive, with **scatter connections** linking selected units back
  into the spatial head for target-point decoding.
- **Critic:** separate value head; at *training time only* it may see the **opponent's
  observation** for a low-variance baseline (free variance reduction in self-play). Value
  heads are dropped at eval.

Borrow BBF/DreamerV3 scaling lessons: bigger nets are both stronger *and* more
data-efficient — start small for iteration speed, scale once the loop works.

## 4. Stage 0 — Scripted AI (also the demonstrator + the opponent pool)

The scripted AI is required by the spec ("easy to develop hardcoded AI with simple patterns
and full map vision") and doubles as (a) the BC demonstrator and (b) the initial league
opponents. It reads `full_state()` (god vision) and runs simple, composable behaviors:

- **Economy manager:** keep workers mining, build workers up to a target, expand on a timer/economy trigger, build supply ahead of the cap.
- **Build-order / production manager:** follow a parameterized build order; tech up; train army from a composition template; research key upgrades.
- **Military manager:** rally an army; **attack in waves at the enemy base**; **return to defend** when the base is attacked; build **simple counters** to scouted enemy composition; form a **death ball**; basic **micro** (focus fire, retreat low-HP units, stutter-step, siege/unsiege, cast key spells).
- **Difficulty knobs:** APM cap, reaction delay, scouting/full-vision, economy handicap —
  so the same bot spans "easy" to "hard" and provides a difficulty ladder for human play.

These bots are deterministic, fast, and varied (rusher / turtle / macro / specific build
templates) — exactly the diverse demonstrator set BC and the league want.

## 5. Stage 1 — Imitation warmstart (behavior cloning)

- Generate a large corpus of **scripted-vs-scripted** games (and, later, human games if we
  collect any) — cheap because the sim is fast. Log `(observation, action_mask, action)`.
- **Behavior-clone** a policy that already opens, expands, produces, and micros competently.
  This is the single highest-leverage step (AlphaStar's supervised phase; JueWu-SL reached
  human level with SL alone). It skips the random-flailing phase RL would otherwise pay for.
- **Style/quality conditioning:** condition the policy on a scalar (which bot/strategy, or a
  quality/"MMR" proxy à la AlphaStar Unplugged) and set it to "best/aggressive" at eval. A
  cheap stand-in for AlphaStar's z-pseudo-rewards that also preserves strategic diversity.

## 6. Stage 2 — RL fine-tuning (PPO/APPO)

- Start from a **proven PPO** (CleanRL / PufferLib / Sample Factory), not a from-scratch impl.
- "What Matters in On-Policy RL" defaults: clip ≈ 0.25, GAE λ ≈ 0.95, per-minibatch advantage
  normalization, Adam lr ≈ 3e-4, small-init policy head, careful **γ near 1** for the long
  RTS horizon.
- **KL-to-BC anchor** early in RL (AlphaStar's distillation loss) to avoid forgetting sane
  play and drifting into degenerate exploits.
- Opponents: the **scripted bot ladder** first (easy → hard), a clean, measurable target.
- Efficiency tricks: high gradient-steps-per-frame where stable, network scaling, periodic
  partial resets (BBF). **No learned world model** initially.
- **Tame the horizon** with a lightweight option/hierarchy if needed (a strategic manager
  choosing macro-goals; tactical/scripted executors).

## 7. Stage 3 — Self-play league (the path to superhuman)

Plain self-play cycles (RTS strategy is non-transitive) and produces brittle agents. Use the
AlphaStar league structure at small scale:
- **1 main agent** (never resets) + **1–2 exploiters** (reset to the BC policy when they've
  learned a counter, or on timeout). Consider the data-efficient **Minimax Exploiter**.
- **PFSP** opponent sampling with **f_hard(x) = (1−x)^p** (default; a smooth max-min — beat
  *everyone* in the pool, integrate rare strong counters) and **f_var(x) = x(1−x)**
  (curriculum for exploiters/struggling agents). Keep **frozen checkpoints** in the pool to
  prevent forgetting.
- Manage the population with **PBT** to auto-tune hyperparameters under a fixed budget.
- TStarBot-X is our efficiency blueprint; JaxMARL/SMAX is the cheap-GPU self-play template.

## 8. Stage 4 — Distillation & shipping

- Periodically **distill** the league's specialists into one robust **main agent**
  (Kickstarting): fewer steps, higher final performance, and a single cheap network to ship.
- The shipped agent must run **WASM-side at interaction speed on a phone** (or via a thin
  inference service). Quantize / shrink as needed; the autoregressive action decoding must
  fit a real-time budget. Enforce **APM caps + reaction delay** for fair human matches.

## 9. Throughput plan (the real lever)

- **Native vectorized sim** is the default high-throughput path: hundreds of `Sim` instances
  across cores via the headless crate + PyO3 `step_batch`, feeding APPO/PufferLib to keep the
  GPU saturated (target **≥10⁵–10⁶ env-steps/s on one node**).
- If we hit a wall, evaluate an **EnvPool-grade** batched executor, or a JAX/CUDA
  re-expression of the hot loop for the **Anakin/podracer** "everything on the accelerator"
  pattern. This is a later optimization, not a Stage-0 requirement — but the sim's data layout
  is designed to keep that door open.
- Benchmark games/sec continuously (the headless crate has a `bench` mode); throughput is a
  first-class, tracked metric.

## 10. Evaluation

- **Vs. scripted ladder:** win-rate per difficulty (the Unplugged `very_hard`-bot analog).
- **Elo** within the league + **robustness** = 1 − min win-rate over a fixed reference set
  (catches exploitable agents that have high *average* win-rate).
- **Vs. humans:** ladder games under APM/reaction-delay constraints (later).
- All evals are reproducible (seeded deterministic sim) and recorded as command-stream
  replays for inspection.

## 11. Phased roadmap (maps onto the Terran-first vertical slice)

1. **Sim + Gym/PyO3 interface + obs/action/masks** for the Terran slice; `bench` mode.
2. **Scripted bot** (economy/production/military managers) with difficulty knobs.
3. **BC warmstart** from scripted-vs-scripted games; verify the cloned policy plays sanely.
4. **PPO fine-tune** vs the scripted ladder; beat `hard`.
5. **Self-play + tiny PFSP league + PBT**; track Elo/robustness; beat the strongest scripts decisively.
6. **Distill + shrink** for in-browser inference; APM/reaction constraints; human eval.
7. Expand: more units, then Protoss/Zerg, more maps, teammates (multi-agent).

## 12. Decisions deferred

- **PyTorch vs JAX.** PyTorch + PufferLib/CleanRL for fast iteration now; JAX kept open for a
  future Anakin-style accelerator-resident pipeline if throughput demands it.
- Camera-style partial observability (fair human comparison) vs. full-map observation — start
  full-map for tractability, add camera later.
- Exact action factorization (pointer vs GridNet vs hybrid) — decide empirically.
- Hierarchy/options — add only if the flat agent struggles with the horizon.
