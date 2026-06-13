# AlphaStar: A Deep Technical Reference for Building a Superhuman RTS AI

*Sources: Vinyals et al., "Grandmaster level in StarCraft II using multi-agent reinforcement learning," Nature 575, 350–354 (2019), plus its full Methods/Supplementary; DeepMind blog posts; and Mathieu, Ozair et al., "AlphaStar Unplugged: Large-Scale Offline Reinforcement Learning" (arXiv:2308.03526, 2023). Numeric claims below are taken from the Nature paper's Methods unless otherwise noted.*

---

## 0. Executive summary

AlphaStar is a deep neural policy that plays full 1v1 StarCraft II (all three races) at Grandmaster level, beating 99.8% of ranked human players on the official ladder. The recipe has three load-bearing ideas:

1. **A structured, multi-modal policy network** that consumes a list of game entities (a transformer), the minimap (a ResNet), and global scalars, fuses them through a deep LSTM, and emits a complex structured action **autoregressively** (action type → when → what units → where).
2. **Supervised learning from ~971k human replays** to bootstrap a competent, human-like policy that explores sensibly — without this, RL from scratch never discovers viable strategies.
3. **League training**: a population of agents (main agents + two kinds of exploiters) trained with **prioritized fictitious self-play (PFSP)** so that the final agent is robust to a wide spread of strategies rather than collapsing into a single exploitable one.

The RL itself is an off-policy actor-critic (V-trace) augmented with **UPGO** (a self-imitation update), **TD(λ)** value learning, a **KL-distillation loss toward the supervised policy**, and **pseudo-rewards** that keep the agent following human-like strategies. Crucially the value/baseline cheats at *training time* by seeing the opponent's observations (lower variance), but the policy never does.

---

## 1. AlphaStar architecture

### 1.1 Observation / input representation

AlphaStar plays through a **camera-like interface**, not a god's-eye view. The agent sees the full minimap but only fine-grained unit detail within the camera, can move the camera as an action, and must move it to gather information — the same partial observability humans face. Three input modalities:

- **Entity list** — a variable-length set of all visible units/buildings (the player's own units, plus visible opponent units with some attributes hidden when outside the camera). Each entity is a feature vector (unit type, owner, position, health/shield/energy, build progress, cargo, cooldowns, buffs, order queue, etc.). Padded to a fixed max (~512 entities).
- **Spatial / minimap features** — stacked 2D feature planes (height map, visibility, creep, entity ownership, alerts, "camera" location, etc.), at roughly 128×128 resolution.
- **Scalar features** — global, non-spatial signals: race, available tech / upgrades, resources (minerals, gas), supply used/cap, the current build order, the game clock, and **the statistic z** (the strategy conditioning vector, see §2.5).

### 1.2 Encoders

**Entity encoder (transformer / self-attention).** The entity list is processed by a **transformer** — self-attention over the set of units. (The Nature Methods describe a 3-layer, 2-head self-attention stack with 128-dim heads and a 1024-dim feedforward; some derivative reimplementations use 2 layers — treat 3×2-head as the reference design.) Self-attention is the right inductive bias here: it is permutation-equivariant over an unordered set and lets each unit attend to every other unit. The transformer produces:
- **per-entity embeddings** (passed through ReLU + a 1×1 conv to 256 channels) — these become the *keys* for the pointer network that later selects units, and
- a single **`embedded_entity`** vector (mean-pool of entity outputs → linear(256) → ReLU) feeding the core.

**Spatial encoder (ResNet).** The spatial planes are projected by a conv + ReLU, **downsampled through several stride-2 convs** (e.g. 128→16 spatial resolution, channel sizes ~64/128/128), then passed through **residual blocks**. It outputs two things:
- **`map_skip`** — the full-resolution feature map, retained for the spatial action head (skip connection), and
- **`embedded_spatial`** — a flattened + linear + ReLU vector for the core.

**Scalar encoder.** Each scalar group is embedded (linear + ReLU; one-hots for categoricals) and concatenated into **`embedded_scalar`**.

### 1.3 Core (deep LSTM)

`embedded_entity`, `embedded_spatial`, and `embedded_scalar` are concatenated into one 1-D tensor and fed, with the previous recurrent state, into a **deep LSTM: 3 layers, hidden size 384**. The LSTM is the memory that handles partial observability — it integrates the temporal sequence of (camera-limited) observations so the agent remembers what it saw off-camera. Its output drives all action heads and the value functions.

### 1.4 Action space and autoregressive action heads

A StarCraft action is **structured**: it is a function (e.g. "build", "move", "attack") plus arguments. AlphaStar factorizes one action into six components, decoded **autoregressively** — each component conditions on the LSTM output *and* on the previously sampled components via a running embedding:

1. **Action type** — which of ~hundreds of abilities/functions. MLP over the LSTM output.
2. **Delay** — how many game steps until the agent acts again / next observes. This is how AlphaStar self-paces and naturally limits its action rate (average ~370 ms between decisions, sometimes multiple seconds).
3. **Queued** — whether to queue (shift-click) the order.
4. **Selected units** — *which* units to issue the command to. This is a **pointer network**: it autoregressively points into the per-entity embeddings from the transformer (an LSTM that emits one unit selection at a time, attending over entity keys), so it handles variable-length, variable-cardinality selections.
5. **Target unit** — if the action targets a single unit, another attention/pointer pass over entity embeddings.
6. **Target point** — if the action targets a map location, a **spatial/deconv head** that upsamples from the LSTM embedding combined with `map_skip` via **scatter connections** to produce a spatial probability map over the minimap.

Each head not only outputs its argument but also feeds an embedding forward to the next head, which is what makes the factorization a true autoregressive joint distribution (`P(action) = P(type)·P(delay|type)·P(queued|...)·...`) rather than independent heads. Only the arguments relevant to the chosen action type are sampled.

**Scatter connections.** The selected-unit information is *spatially located* — the units occupy positions on the map. A scatter connection takes the per-entity embeddings and "scatters" them back into a 2-D feature map at each unit's (x,y) location, so the spatial (target point) head knows *where the selected units are*. This bridges the set-structured entity stream and the grid-structured spatial stream. An ablation (Fig. 3F/K) shows scatter connections, the transformer, and the pointer network all materially help.

**Value functions.** Separate from the policy, there is a **value head per reward channel** (win/loss plus each pseudo-reward). At *training time only*, the value/baseline also receives the **opponent's observations** as input, giving a much lower-variance baseline; the policy never sees opponent info, and value heads are discarded at evaluation.

---

## 2. Training methodology

Two phases: supervised bootstrap, then multi-agent RL in the league.

### 2.1 Supervised learning (initialization)

- Dataset: **971,000 replays**, StarCraft II versions 4.8.2–4.8.6, from players with **MMR > 3500** (top ~22%).
- From each replay a **statistic z** is extracted (build order = first 20 constructed buildings/units, plus cumulative statistics like units/buildings/upgrades ever produced).
- Train by behavior cloning: minimize the KL divergence / cross-entropy between human actions and the policy outputs, conditioned on z (z set to zero ~10% of the time so the agent can also play unconditioned).
- The supervised agent already reaches ~top-16% of human players, and — critically — provides a *human-like prior* so that subsequent RL explores realistic strategies instead of random clicking.

### 2.2 Reinforcement learning: the actor-critic core

AlphaStar's RL is an **off-policy actor-critic** in the IMPALA lineage (asynchronous actors + central learner, with importance-sampling correction). The combination that makes it stable despite heavy off-policy data:

- **V-trace** (clipped importance sampling) for the policy-gradient update. Off-policy correction is essential because actors run a slightly stale copy of the parameters (refreshed every 10 s) and data is replayed twice. Notably, V-trace is applied largely to action **type**, while the large autoregressive argument space is handled carefully to avoid the importance ratios collapsing.
- **TD(λ)** for training the value functions (one per reward channel).
- **UPGO (Upgoing Policy Update)** — a *self-imitation* update unique to AlphaStar. Like self-imitation learning, it updates the policy toward actions that did better than expected: it bootstraps the return along the trajectory but, whenever the next-step value exceeds the bootstrap, it follows the actual (better) return instead. This propagates the credit of good-but-rare trajectories ("if you played better than the value predicted, do more of that"), accelerating learning in the very long-horizon StarCraft setting.
- **KL distillation loss** toward the *supervised* policy, applied throughout RL — continually minimizing KL(supervised ‖ current) keeps the agent anchored to human strategy space and prevents it from drifting into degenerate exploits.

Overall loss = weighted sum of V-trace policy loss + TD(λ) value loss + UPGO policy loss + supervised KL loss + entropy.

### 2.3 The AlphaStar League

The league is the key innovation for *robustness*. It maintains a growing population of frozen "players" and trains a small number of learning agents against curricula drawn from that population. **12 agents trained simultaneously**:

- **3 Main Agents** (one per race) — the agents that become "AlphaStar." Opponent mix: **35% pure self-play, 50% PFSP against all past players in the league, 15% PFSP against forgotten main players / past main exploiters** the agent can no longer beat (or self-play if none exist). A copy is snapshotted into the league every ~2×10⁹ steps. **Main agents never reset.**
- **3 Main Exploiters** (one per race) — train *only against the current main agents* to find their specific weaknesses. When winning probability is below 20% they switch to PFSP with f_var weighting over past main-agent copies (a curriculum). Added to the league when they beat all three main agents >70% of the time, or after a 4×10⁹-step timeout; then **reset to supervised parameters**. Their job is to keep the main agents honest.
- **6 League Exploiters** (two per race) — train with PFSP against the *whole* league to find **systemic** weaknesses (strategies no league player can beat). Frozen copies added when they beat the whole league >70%, or after a 2×10⁹-step timeout; **25% chance of resetting** to supervised parameters. Unlike main exploiters, they are *not* targeted back by main exploiters.

During the full run, **almost 900 distinct players** were created in the league.

### 2.4 Prioritized Fictitious Self-Play (PFSP) and why leagues prevent collapse

Naive self-play and fictitious self-play optimize the *average* win-rate against the population. In a highly **non-transitive** game (rock-paper-scissors-like strategy cycles, which StarCraft has), max-average policies are exploitable and self-play "chases its own tail" through strategy cycles without ever becoming robust.

PFSP fixes the opponent-sampling distribution. For learning agent A, a frozen opponent B is sampled with probability

```
P(B) = f(Pr[A beats B]) / Σ_C f(Pr[A beats C])
```

with two weighting functions:

- **f_hard(x) = (1 − x)^p** — focuses on the opponents A *can't yet beat* (f_hard(1)=0 → never wastes games on already-beaten opponents). This is the default; it acts as a smooth **max-min** objective: A must beat *everyone* in the league, not maximize mean win-rate. This is what makes integrating rare-but-strong exploit strategies work — a uniform mixture would just ignore them.
- **f_var(x) = x(1 − x)** — prefers opponents *near A's own skill* (a curriculum), used for main exploiters and for struggling main agents so they get a usable learning signal instead of being crushed.

The architecture as a whole is a practical instance of approximate best-response dynamics (related to fictitious play / PSRO): main agents seek robustness against the whole history; exploiters continuously manufacture new counters; the main agents then have to absorb those counters. This breaks cycles and prevents catastrophic forgetting / strategy collapse.

### 2.5 Reward structure

- **Primary reward**: ternary game outcome (+1 win, 0 draw, −1 loss) at the end of the episode. Sparse, episodic.
- **Pseudo-rewards from statistic z**: at the start of each RL game a z is sampled from human data, and the agent is rewarded for following it: **edit distance** between sampled and executed *build orders*, and **Hamming distance** between sampled and executed *cumulative statistics*. Each pseudo-reward is active with probability 25% per game (so the agent also learns to win without strictly following z), and each has its own value function and TD(λ)/V-trace/UPGO losses. The z-conditioning is *the* mechanism that maintains strategic diversity — different z's produce different openings/strategies, so the population doesn't collapse to one build.
- **KL toward supervised policy**: not a reward but a continual auxiliary loss (see §2.2) serving the same "stay human-like / explore sensibly" purpose.

---

## 3. Scale and compute

| Quantity | Value |
|---|---|
| Supervised dataset | 971,000 replays, MMR > 3500 (top 22%) |
| Learning agents | 12 (3 main, 3 main exploiters, 6 league exploiters) |
| TPUs per agent | 32× TPU v3 |
| Actor inference | 16 actor tasks per agent, each a TPU v3 (8 cores); 16,000 concurrent SC2 matches per agent |
| Game-instance CPUs | ~150 preemptible 28-core machines per agent (batched dynamically for TPU inference) |
| Learner | one central 128-core TPU learner per agent; batch = 512 (4 seqs/core), ~50,000 agent steps/s; data replayed twice; actors refresh params every 10 s |
| Training duration | 44 days |
| Players created | ~900 across the league |

**Action-rate / APM constraints (fairness).** AlphaStar plays under deliberately imposed human-like limits:
- A **monitoring layer** caps action rate over sliding windows (peak APM well below human pros' bursts).
- The **delay** action means the agent self-paces; in real-time evaluation there is a **~110 ms** observation-to-action delay (latency + inference), and the agent commits to its next observation time **~370 ms ahead on average** (so it can react *late* to surprises, like a human).
- Camera interface limits where it can target precisely.

Ablations (Fig. 3G) show APM tuning is a genuine constraint, not cosmetic: **lowering APM hurts, and — surprisingly — *raising* APM also hurts** performance, so the human-like limits are near a sweet spot.

---

## 4. Key algorithms to understand (reading order for an implementer)

1. **IMPALA + V-trace** (Espeholt et al. 2018, arXiv:1802.01561) — distributed actor-learner; off-policy correction. AlphaStar's training skeleton.
2. **UPGO** — AlphaStar's own self-imitation update. Read alongside **Self-Imitation Learning** (Oh et al. 2018, arXiv:1806.05635).
3. **TD(λ)** — value-function training (Sutton & Barto).
4. **PPO** (Schulman et al. 2017, arXiv:1707.06347) — *not* used by AlphaStar, but the standard simpler on-policy alternative; the pragmatic substitute at small scale.
5. **Fictitious play / self-play** — **PSRO** (Lanctot et al. 2017, arXiv:1711.00832) for the "population + best-response" framing; **NFSP** (Heinrich & Silver, arXiv:1603.01121).
6. **League training + PFSP** — the Nature paper Methods are the canonical reference; no separate paper.
7. **Pointer Networks** (Vinyals et al. 2015, arXiv:1506.03134) — the selected-units head.
8. **Transformer** (Vaswani et al. 2017, arXiv:1706.03762) — the entity encoder.

---

## 5. AlphaStar Unplugged (offline RL follow-up, arXiv:2308.03526, 2023)

**What it is.** A re-cast of the StarCraft II problem as a pure **offline RL benchmark**: train *only* from a fixed dataset of human games, with **no environment interaction / no self-play / no league** during learning. Tests whether offline methods can extract a strong policy from logged human data alone.

**What changed vs. original AlphaStar:**
- **No league, no self-play, no online RL.** Everything learned from logged data.
- **Larger, standardized dataset & API.** Filtered to MMR > 3500, yielding ~**1.4M games ≈ 2.8M episodes**, >30 years of gameplay; open-sourced pipeline.
- **Standardized eval metrics**: Elo, **robustness** (1 − min win-rate over reference agents), win-rate vs the built-in `very_hard` bot.
- **MMR-conditioning** instead of z-pseudo-rewards: condition policy on the generating player's MMR; set to max at eval — i.e. Return-Conditioned BC with MMR as the "return."

**Baseline agents:** BC and **Fine-tuned BC** (~84%, ~90% with tuned temperature β≈0.8); **Offline Actor-Critic (OAC)** and **Emphatic OAC (E-OAC)** with **N-step Emphatic Traces** (best family); **MuZero Supervised (+MCTS)**. Return-Conditioned BC and small-benchmark methods **failed**.

**Key lessons:**
- Best recipe = **estimate a value function, then improve the BC policy** (offline actor-critic on a BC backbone). The three best (offline-RL) agents beat the published AlphaStar BC agent ~90%.
- **Naive offline RL fails** — StarCraft's huge action space, long horizon, partial observability, and human-generated (unknown behavior policy) data break standard approaches. Must estimate the behavior policy (BC = μ̂) before off-policy correction is meaningful.

---

## 6. Practical lessons for a smaller-scale RTS AI

**Essential (don't skip):**
- **Supervised bootstrap from human/strong-bot data** — single highest-leverage component. Pure RL from scratch doesn't discover viable RTS strategies in any reasonable budget. A tuned BC agent alone reaches ~84–90% vs the hardest built-in bot (Unplugged).
- **Structured action factorization + autoregressive heads** — type→delay→units→target with a pointer network for unit selection. Scales down.
- **Set encoder for units (attention)** — even a 1–2 layer transformer / Deep Sets pooling beats flattening.
- **An explicit anti-cycling mechanism** — PFSP's f_hard, or at least a fixed pool of diverse scripted opponents. Plain self-play *will* cycle into a brittle agent. You don't need 900 players.
- **Reaction-time / APM constraints** + the agent's own **delay action** for self-pacing, if you care about fair human comparison.

**Required Google-scale compute (can be cut/shrunk):**
- The **44-day, 12-agent, 384-TPU league** is the expensive part. The league's *structure* matters more than its *scale*: shrink to 1 main agent + 1–2 exploiters, fewer snapshots, far fewer concurrent games.
- **16,000 concurrent matches/agent** and the 128-core TPU learner are pure throughput; a single GPU + tens-to-hundreds of parallel game instances is the hobby/lab analog.
- **Per-reward value functions and z-pseudo-rewards** add diversity but also complexity; start with win/loss + KL-to-BC anchor, add shaping later.
- **V-trace + UPGO** is tuned for massive off-policy throughput. At small scale, **PPO** is the pragmatic substitute; keep TD(λ) for the critic; add UPGO once basic RL is stable.

**Simplifications that work at small scale:**
1. Start from a **non-camera / full-observation** interface; add the camera later.
2. **MMR/return-conditioning** (Unplugged-style) is a cheap stand-in for z-pseudo-rewards.
3. Use the **opponent-observation baseline** trick — free variance reduction.
4. Begin in a **restricted environment** (one matchup, one map, smaller roster). Study **mini-AlphaStar** (arXiv:2104.06890) and **TStarBot-X** (arXiv:2011.13729) for which corners to cut.

**Recommended build order:** (1) environment + action interface; (2) curate replays/scripted-bot games, train a solid BC agent; (3) PPO RL fine-tune with a KL-to-BC anchor vs built-in bots; (4) self-play → tiny PFSP league with one exploiter; (5) only then V-trace/UPGO, per-reward critics, camera interface, APM limits.

---

## Two precise figures worth remembering
- PFSP weightings: **f_hard(x) = (1−x)^p** (default, ≈ max-min) and **f_var(x) = x(1−x)** (curriculum for exploiters/struggling agents), where x = P[A beats B].
- The training-only baseline sees the **opponent's observations** for variance reduction; the **policy never does**, and value heads are dropped at evaluation.

These two, plus "BC-bootstrap first" and "leagues over plain self-play," are the ideas most likely to carry over to our own RTS AI.
