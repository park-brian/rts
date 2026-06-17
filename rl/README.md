# rl — masked PPO (pure TypeScript)

A dependency-free implementation of **PPO with invalid-action masking** and the
standard on-policy optimizations, plus an adapter that trains it on the `minigame`
macro game. This is the project's **Stage-2 (PPO fine-tune)** recipe — the
Gym-µRTS lesson that *masking is non-negotiable* — running in pure Node with no ML
framework and no GPU.

## What's implemented

- **`nn.ts`** — a tiny actor-critic MLP (one tanh hidden layer → policy logits +
  value head) with hand-written backprop and Adam. Small-init policy head. Plus
  masked-softmax / sampling / entropy helpers.
- **`ppo.ts`** — clipped-surrogate PPO with the "what matters in on-policy RL"
  defaults: **GAE(λ)**, **per-minibatch advantage normalization**, an **entropy
  bonus**, **value loss**, **Adam**, **global grad-norm clipping**, multiple epochs
  over shuffled minibatches. **Invalid-action masking is applied at sampling AND
  inside the loss** — illegal actions get exactly zero probability and zero
  gradient.
- **`env.ts`** — the single-agent `Env` interface (every step returns the legal
  **mask**) + a synthetic masked bandit used to test the algorithm.
- **`minigameEnv.ts`** — adapts the minigame macro game: learner = player A,
  opponent = a fixed scripted minigame policy; fixed action enumeration with the
  per-step mask taken from the game's own `legalActions` (one source of truth).

## It actually learns (and the masking is real)

`node rl/train.ts` trains PPO as player A vs the scripted `turtle` on the `SMALL`
preset (obs dim 13, 234-action space masked to the legal subset each step):

```
win-rate vs turtle:  untrained 0.00  ->  trained 1.00   (~9s, no GPU)
generalization (greedy eval) vs greedy/macro/turtle/cheese/harasser: 1.00 across the board
```

Tests (`node --test rl/ppo.test.ts rl/minigame.test.ts`):
- PPO reaches near-optimal reward on the masked bandit;
- masked softmax / sampling never touch an illegal action;
- on the minigame, the trained policy beats an opponent the **untrained** net
  cannot (a real learning delta, not a trivially-winnable game);
- the learned policy only ever issues legal actions.

## Multi-unit masking — commanding every unit at once (the point of masking)

The flat minigame policy above issues *one* action per step. That hides the real
reason masking exists: at scale you emit a command for **every unit in a single
pass**, and because each unit has a *different* legal set, you mask **per unit**
(the GridNet/Gym-µRTS representation). That's built here on the `microrts` engine:

- **`micrortsEnv.ts`** — a factored, per-unit env. Each decision step exposes every
  *idle* unit with its own observation and its own **mask** (a fixed 85-slot
  action head: None / Move / Harvest / Return / Produce×kind / Attack×rel-target),
  the mask taken straight from the engine's `legalActions` for that unit. One
  `step` applies one action *per unit* simultaneously, then fast-forwards to the
  next decision point.
- **`ppoMulti.ts`** — factored PPO: the joint policy over a frame is the product of
  independent per-unit policies, so the joint log-prob is the **sum** of per-unit
  masked log-probs and the gradient distributes to each unit's head. A shared
  per-unit actor commands all units; a separate critic values the global state.

`node rl/trainMicro.ts` learns the **multi-unit economy** (workers harvest/return
while the base produces more workers):

```
untrained economy (net resources/game): -3.0   ->   trained: +5.0   (~3.5s, CPU)
```

Tested (`rl/microrts.test.ts`): every idle unit is commanded with a per-unit mask
that exactly matches the engine's legal set (and base vs worker masks differ);
sampling/greedy never pick a masked-illegal slot for any unit; and the factored
PPO learns the economy (net resources go positive). Net init is per-instance
**seeded**, so training is reproducible regardless of test order.

## Honest scope & next

- The per-unit actor is a **shared MLP** over hand-built unit features — the
  tractable pure-TS stand-in for a conv/GridNet policy. It learns the economy; it
  is not expected to master full-game combat at this size. For that, the same
  per-unit masked contract feeds a real conv-net PPO over a Python bridge (the
  project's stated plan) — the masking design transfers unchanged.
- The clean next steps, in order:
  1. **Win/loss training vs scripted bots** on `micrortsEnv` (set `econReward:
     false`): the factored masked policy is already wired for it; needs reward
     shaping + budget tuning.
  2. **Self-play + a tiny PFSP league** over the minigame env (it has an exact
     **oracle**, so the league's exploitability is *measurable* — the one setting
     with ground truth for convergence).
