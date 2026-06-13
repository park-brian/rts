# Sample-Efficient, Compute-Efficient RL for a Superhuman RTS Agent on Limited Hardware

A technical survey and concrete training recipe for a small team (a few GPUs) building a strong/superhuman RTS AI, focused on modern (2019–2025) sample- and compute-efficient methods. The unifying thesis: **AlphaStar's bottleneck was wall-clock/throughput, not algorithmic mystery. If you own a fast, deterministic, massively-parallel simulator, you can substitute throughput-driven on-policy RL (plus an imitation warmstart and a self-play league) for DeepMind's TPU fleet, and modern best-practices close most of the remaining gap.**

---

## 1. Sample-Efficient Model-Free RL (PPO, IMPALA/V-trace, "what matters")

### PPO and the empirics of what actually matters

PPO remains the workhorse of large-scale game RL (OpenAI Five, Gym-µRTS, Honor of Kings, Gran Turismo Sophy all use PPO or close variants): stable, parallelizes trivially, tolerates the off-policy-ness of many parallel actors.

The single most useful reference is **"What Matters in On-Policy Reinforcement Learning?" (Andrychowicz et al., 2020, arXiv:2006.05990)** — 250,000+ agents over 50+ design choices. Actionable findings:

- **The PPO clipping/trust-region mechanism is the critical ingredient** for sample complexity — keeping the new policy near the behavior policy matters more than the loss form.
- Clipping threshold start ≈ **0.25**.
- **γ is one of the most important hyperparameters** — tune per environment, start 0.99. For long-horizon RTS this matters a lot (§5).
- **Adam**, β₁=0.9, lr ≈ 3e-4 default.
- **Per-minibatch advantage normalization**.
- **Small-init policy last layer** (near-uniform initial policy); **tanh** activations robust.
- **GAE**, λ≈0.95.

Complementary: **"The 37 Implementation Details of PPO" (ICLR Blog Track 2022)** and **CleanRL** reference implementations document the "invisible" details (obs/reward normalization, value clipping, orthogonal init, LR annealing, vectorized-env handling, termination vs truncation) that explain most of the reproducibility gap. **Start from CleanRL's PPO rather than writing your own.**

### IMPALA / V-trace — decoupled actor-learner scaling

**IMPALA (Espeholt et al., 2018, arXiv:1802.01561)**: many **actors** generate trajectories asynchronously; a central **learner** does batched GPU updates. Actors lag → slightly off-policy → **V-trace** (truncated importance sampling) corrects it. ~250k FPS, ~30x A3C. Lesson: **decouple acting from learning so the GPU is never starved.**

### Single-machine high throughput (most relevant)

- **Sample Factory (Petrenko et al., ICML 2020, arXiv:2006.11751)** — **APPO** (Asynchronous PPO). **~130,000+ FPS on a single machine, one GPU**. Proof you do **not** need a cluster for high-throughput on-policy RL.
- **PufferLib / PuffeRL (Suarez, 2024, arXiv:2406.12905)** — modern single-node library; CUDA-native envs up to **20M steps/s**, Torch up to 5M, clean PPO, one-line env wrappers. Excellent fit for a custom fast simulator.

**Takeaway for RTS:** model-free PPO/APPO is the safe, proven path for a complex game with a huge factored action space, *provided you can feed it enough frames*. Simulator throughput (§3) is the real lever.

---

## 2. Model-Based RL / World Models (MuZero, EfficientZero, DreamerV3, TD-MPC2)

Model-based RL buys **sample efficiency** by learning dynamics and training on imagined rollouts / planning, cutting real-env interactions.

- **MuZero (Schrittwieser et al., 2019/2020, arXiv:1911.08265)** — learns latent dynamics, plans with MCTS, masters Go/chess/shogi/Atari **without given rules**. Powerful but search-heavy.
- **EfficientZero (Ye et al., NeurIPS 2021, arXiv:2111.00210)** — first **super-human Atari at 100k frames (~2h play)**, ~194% mean human, matching DQN-at-200M with **500x less data**. Adds: self-supervised temporal-consistency loss, value-prefix prediction, off-policy value correction.
- **EfficientZero V2 (Wang et al., ICML 2024, arXiv:2403.00564)** — discrete *and* continuous, low-dim *and* visual; beats DreamerV3 on 50/66 limited-data tasks.
- **DreamerV3 (Hafner et al., 2023, arXiv:2301.04104)** — recurrent latent world model, actor-critic trained "in imagination." **One fixed hyperparameter set across 150+ tasks**; collected diamonds in Minecraft from scratch, no human data. **Larger models = better *and* more data-efficient.**
- **TD-MPC2 (Hansen et al., ICLR 2024, arXiv:2310.16828)** — decoder-free latent world model + short-horizon MPC; single 317M model over 80 tasks. Strong for continuous control.
- **BBF (Schwarzer et al., 2023, arXiv:2305.19452)** — model-free, but the key "scaling for sample efficiency" result: human-level Atari-100k by **scaling the value net + high replay ratio + periodic resets + receding-horizon updates**. The lesson transfers everywhere.

### Do world models suit RTS? Honest assessment, mixed.

- **Pro:** if real samples were expensive, world models would be the answer.
- **Con (given our premise):** our simulator is **deterministic and very fast**. World models pay off when the *real* env is slow/expensive. If you already own perfect cheap dynamics, **learning an approximate model of dynamics you already have is mostly wasted effort + adds model-bias.**
- **Con on scale:** RTS has extreme partial observability (fog), very long horizons (thousands of steps), a combinatorial structured action space. MuZero-style MCTS over that action space is impractical; Dreamer-style imagination over thousands of steps with fog is hard/underexplored at full-RTS scale.

**Verdict:** with a fast deterministic simulator, **lean model-free** (§1), spend compute on throughput + self-play. Borrow *ideas* (high replay ratio, network scaling, self-supervised aux losses, periodic resets) without committing to a learned world model. Revisit a learned model only later (opponent modeling, search-augmented "thinking" head on key decisions).

---

## 3. High-Throughput / GPU-Accelerated Simulation (the real lever)

Most important section for our situation. The 2020–2025 trend: **put the environment on the accelerator and run thousands of copies in lockstep**, eliminating CPU↔GPU transfer and Python overhead.

### Why batched/vectorized simulation gives order-of-magnitude speedups

Classic loop: CPU actors step the env, ship obs to a GPU learner → GPU stalls on slow serial CPU envs + PCIe. If the env runs on the accelerator as **batched tensor ops** (thousands of envs advanced in one matrix op), then **simulation + action selection + learning all live on the accelerator with zero host transfer** → throughput jumps 2–3 orders of magnitude; train on **billions of frames** in days on one/few accelerators.

### The landscape

- **Isaac Gym (NVIDIA, arXiv:2108.10470)** — GPU PhysX; thousands of parallel envs on one GPU; up to ~300x.
- **Brax (Google, arXiv:2106.13281)** — JAX rigid-body sim; hundreds of millions steps/s on a TPU pod; env + optimizer co-located.
- **EnvPool (Weng et al., 2022, arXiv:2206.10558)** — C++ batched engine; **~1M FPS Atari, ~3M FPS MuJoCo on a DGX-A100**; a general speedup for CPU envs. Good if your sim stays on CPU but you want it fed fast.
- **Pgx (NeurIPS 2023 D&B)** — JAX **board/game** simulators massively parallel on accelerators; closest "game-rules-on-GPU" precedent.
- **JAX env ecosystem** — Jumanji, Gymnax, Brax, XLand-MiniGrid (arXiv:2312.12044) — envs as pure JAX functions, `jit`+`vmap`'d to thousands of instances, fused with the learner.

### "Podracer" / Anakin architectures (the design pattern to copy)

**"Podracer architectures for scalable RL" (Hessel et al., 2021, arXiv:2104.06272):**
- **Anakin** — *everything* (env step, action selection, learning) on the accelerator, replicated across cores; updates via JAX collectives. Requires env in JAX. **~5M steps/s on grid-worlds, >3M steps/s on a 16-core TPU.**
- **Sebulba** — for envs that can't go on-accelerator (kept on host), still co-locating acting + learning.

### GPU-accelerated self-play

**JaxMARL (Rutherford et al., 2023, arXiv:2311.10090)** reimplements SMAC as **SMAX** (no SC2 engine), enabling GPU self-play: **~14x wall-clock speedup, up to 12,500x when vectorizing many runs.** Template for cheap league/self-play on a few GPUs.

**Implication — this is our decisive advantage.** A *deterministic, very fast, batched headless RTS simulator* is exactly what lets a small team substitute throughput for a TPU fleet. **Prioritize making the simulator batchable on-accelerator (or EnvPool-grade fast on CPU).** Every other choice is downstream of frames-per-second.

---

## 4. Self-Play & League Methods Beyond AlphaStar

Self-play = automatic curriculum of stronger opponents — but naive self-play forgets and cycles (rock-paper-scissors). The league fixes this.

- **AlphaStar league** (Nature 2019): Main Agents + Main Exploiters + League Exploiters; **PFSP** (sample opponents ∝ their win-rate against you — concentrate on opponents you currently lose to); frozen checkpoints prevent forgetting/cycling. (Full detail in `alphastar.md`.)
- **TStarBot-X (Han et al., 2020, arXiv:2011.13729)** — **open-source, efficiency-focused** league training for full SC2; concrete tricks (importance sampling, rule-guided exploration, stable league composition) for **far less compute**. One of the most useful papers for a small team building a league.
- **A Robust and Opponent-Aware League Training Method (Huang et al., NeurIPS 2023)** — more compute-efficient, robust league construction.
- **Minimax Exploiter (arXiv:2311.17190)** — more **data-efficient** exploiter design.
- **Population-Based Training — PBT (Jaderberg et al., 2017, arXiv:1711.09846)** — train a population with different hyperparameters; weak copies clone strong ones' weights+hyperparams, then mutate. **Discovers a hyperparameter schedule for free**; avoids sweeps you can't afford.

**Implication:** a **PFSP league with frozen checkpoints + a few exploiters**, managed with **PBT**, is the standard recipe for non-transitive games and is achievable on a few GPUs if the simulator is fast.

---

## 5. Scaling Laws / Efficiency Tricks (distillation, curriculum, BC warmstart, hierarchy)

Multipliers that let a small team punch above its compute weight.

- **Behavior-cloning / imitation warmstart.** AlphaStar trained supervised on ~971k human replays *before* any RL. Imitation gives a strong init and seeds diverse strategies RL can't discover from scratch, and skips the random-flailing phase. **For RTS with sparse rewards and huge action spaces, a BC/imitation warmstart is arguably the single highest-leverage technique.** (See also Learning from Demonstrations in Minecraft, arXiv:2003.06066.)
- **Imitation from *scripted* bots (no human data needed).** Replace human replays with trajectories from your own scripted/rule-based AIs: behavior-clone a policy that already opens correctly, manages economy, micros units, then RL-finetune. Sidesteps cold-start entirely; ideal for a private RTS. (microRTS scripted bots / Gym-µRTS competition AIs are the canonical demonstrators.)
- **Policy distillation / Kickstarting (Schmitt et al., 2018, arXiv:1803.03835).** Teacher → student via a **KL-to-teacher loss**; students can *surpass* teachers: from-scratch performance in **~10x fewer steps**, +42% with specialist teachers. Uses: (a) distill specialists (rusher, turtle, eco) into one generalist; (b) distill a large league agent into a cheap deployable net.
- **Curriculum learning.** Easy→hard: small maps→large; weak bots→strong; subtasks (economy-only, combat-only)→full game. Self-play is an emergent curriculum; explicit curricula bootstrap the early phase.
- **Hierarchical RL for long horizons.** RTS horizons are thousands of steps with delayed reward (γ near 1). The **options framework** (macro-actions: "expand," "tech up," "attack here") lets a high-level meta-policy choose multi-step behaviors while low-level policies execute. (HRL survey: Pateria et al., ACM Computing Surveys 2021.) Even a lightweight manager + scripted/learned executors shortens the effective horizon — well-suited to RTS.
- **Network scaling + high replay ratio + resets (BBF, arXiv:2305.19452; DreamerV3 scaling).** Bigger nets, more gradient steps/env step, periodic partial resets buy sample efficiency directly; cheap to adopt in a PPO/Q stack.

---

## 6. Relevant RTS / Complex-Game AI Projects (besides AlphaStar)

- **OpenAI Five — Dota 2 (Berner et al., 2019, arXiv:1912.06680).** First AI to beat world champions at an esport. Pure **PPO/LSTM self-play at massive scale**. Transferable: self-play scales; large-batch PPO is remarkably stable; **"surgery"** lets you change net/env mid-training without restarting (important if the RTS/sim keeps evolving during a long run). Caveat: enormous compute; copy the *algorithmic simplicity*, not the scale.
- **microRTS competitions** — long-running academic RTS benchmark; deterministic, fast, full-RTS-mechanics testbed with many scripted reference bots. Closest public analog to what we're building; a source of demonstrator bots.
- **Gym-µRTS / MicroRTS-Py (Huang & Ontañón et al., 2021, arXiv:2105.13807).** **Most directly relevant paper.** SOTA DRL on full-game µRTS, **beating every prior competition bot on a single map with ~60 hours on ONE machine (1 GPU, 3 vCPU, 16GB RAM).** Copy wholesale: **GridNet** encoder-decoder action representation (one action per map cell → solves variable-unit-count action space), **invalid-action masking** (huge sample-efficiency win), Spatial-Pyramid-Pooling critic for multiple map sizes. (Code: Farama-Foundation/MicroRTS-Py.)
- **SMAC / SMACv2 (arXiv:1902.04043; arXiv:2212.07489).** Cooperative micromanagement (CTDE). SMACv2 adds procedural generation + real partial observability. **SMAX (JaxMARL, arXiv:2311.10090)** is the GPU-native reimplementation.
- **TStarBot-X (arXiv:2011.13729) and SCC (arXiv:2012.13169).** Open-source efficient SC2 agents/leagues — practical lower-compute counterpoints to AlphaStar.
- **Honor of Kings (MOBA).** **JueWu (Ye et al., 2019, arXiv:1912.09729)** — 1v1 superhuman with **dual-clip PPO, action masking, target-attention, control-dependency decoupling** (techniques for large structured action spaces, directly applicable to RTS). **JueWu-SL (arXiv:2011.12582)** reaches human-level via *supervised learning alone* (validates BC-warmstart). **Honor of Kings Arena (arXiv:2209.08483)**; **Hokoff** offline dataset (arXiv:2408.10556).
- **Gran Turismo Sophy (Wurman et al., Nature 2022).** Superhuman racing via **model-free deep RL (QR-SAC) + mixed-scenario training**. Lessons: careful reward design (speed + etiquette); a fast simulator + distributed actors got there without a learned world model; curriculum over scenarios. Model-free going superhuman in a fast-sim domain on a moderate (industrial, not hyperscaler) budget.

---

## 7. Concrete Recommendations: a practical recipe given a deterministic, fast, parallel RTS simulator

Our stated asset — a **deterministic, very fast, headless simulator that runs many parallel games** — is precisely what makes a small-team superhuman RTS agent feasible.

### A. Maximize simulation throughput first (everything else is downstream)
- If possible, make the simulator **batchable on the accelerator** (hot loop in JAX or CUDA) → thousands of games in lockstep, env + policy + learner fused on the GPU (Anakin/podracer, arXiv:2104.06272; cf. Brax/Pgx/JaxMARL throughput).
- If it must stay on CPU: wrap with **EnvPool**-grade batched C++ execution (arXiv:2206.10558); use **APPO/Sample Factory** (arXiv:2006.11751) or **PufferLib** (arXiv:2406.12905) to keep the GPU saturated.
- Target **≥10⁵–10⁶ env-steps/s on a single node** — the difference between days and months. FPS is the budget.

### B. Observation & action design (decisive for sample efficiency)
- **Observations:** spatial **multi-channel feature maps** (terrain, ownership, unit types/HP, fog, resources) + a small global vector (economy, supply, tech). **CNN/ResNet trunk + small recurrent (LSTM/GRU) or transformer core** for partial observability (AlphaStar/Gym-µRTS pattern).
- **Actions:** **GridNet-style** factored output (action per map cell / per selected unit) for variable unit counts (Gym-µRTS), or AlphaStar/JueWu-style **auto-regressive / attention heads** with **control-dependency decoupling** (arXiv:1912.09729).
- **Invalid-action masking is mandatory** — one of the largest free sample-efficiency wins in this domain.
- **Tame the horizon:** lightweight hierarchy (strategic manager + tactical/scripted executors); tune γ toward 1 with GAE.

### C. Warmstart from scripted AI (highest-leverage single step)
- Write/collect strong **scripted bots** (microRTS bots are templates).
- Generate a large scripted-vs-scripted dataset, **behavior-clone** a policy that already opens, expands, micros competently.
- Keep an auxiliary **KL-to-demonstrator** term early in RL to avoid forgetting sane play.

### D. RL fine-tuning: model-free PPO/APPO
- Start from a **proven PPO** (CleanRL / PufferLib / Sample Factory), not from scratch.
- Apply **"What Matters"** defaults: clip ~0.25, GAE λ≈0.95, per-minibatch adv norm, Adam 3e-4, small-init policy head, careful γ.
- Borrow **BBF-style** efficiency: scale the net, higher gradient-steps-per-frame where stable, periodic resets.
- **No learned world model initially** — you own perfect cheap dynamics. Revisit only for opponent modeling / search-augmented decision head.

### E. Self-play league for true (super)human strength
- Move from "beat scripted bots" to a **PFSP league with frozen checkpoints** + **2–3 exploiters** (consider the Minimax Exploiter, arXiv:2311.17190).
- Use **TStarBot-X (arXiv:2011.13729)** as the *efficiency* blueprint, **JaxMARL/SMAX (arXiv:2311.10090)** as the cheap-GPU-self-play template.
- Use **PBT (arXiv:1711.09846)** for population management + hyperparameter auto-tuning.

### F. Consolidate with distillation
- Periodically **distill** league specialists into one robust main agent (Kickstarting, arXiv:1803.03835) — fewer steps, higher final performance, a single cheap shippable network.

### Why this works on a few GPUs
AlphaStar's cost was dominated by wall-clock to accumulate self-play frames on a slow engine. We bypass that with (1) a **fast deterministic batched simulator**, (2) a **scripted-bot imitation warmstart** removing the cold-start exploration tax, (3) **action masking + good factored action/obs design** removing wasted exploration, (4) a **PFSP league + PBT + distillation** for strength without collapse. **Gym-µRTS already demonstrated SOTA full-RTS DRL beating all competition bots in ~60 hours on a single GPU** — our task is to scale that recipe with throughput and self-play, not reinvent AlphaStar.

---

## Bottom-line guidance

1. **Throughput is the whole game.** Thousands of parallel instances on-accelerator (JAX/CUDA, podracer/Anakin) or EnvPool-fast on CPU. Aim 10⁵–10⁶ steps/s on one node.
2. **Stay model-free** (PPO/APPO via CleanRL/PufferLib/Sample Factory). You own perfect cheap dynamics; steal model-based *tricks* (network scaling, high replay ratio, self-supervised aux losses, resets).
3. **Warmstart by behavior-cloning your scripted bots** — highest-leverage single step; removes the cold-start tax without human data.
4. **Get action/observation design right** — spatial feature maps, GridNet/auto-regressive heads, **invalid-action masking** (non-negotiable). Tame the horizon with a light hierarchy.
5. **Reach superhuman via a PFSP league + exploiters + PBT** (TStarBot-X-style efficiency), then **distill** into one agent.

Closest existence proof on small hardware: **Gym-µRTS** (full-RTS SOTA, all competition bots beaten, ~60h on a single GPU). Scale that recipe with throughput + self-play.
