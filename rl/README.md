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

## Honest scope & next

- This is a **flat MLP** over a small feature vector — perfect for the minigame's
  compact state. It is *not* the spatial GridNet/CNN policy that full microRTS
  needs; pure-TS training of that is not the right tool.
- The clean next steps, in order:
  1. **Self-play + a tiny PFSP league** over this same env (the minigame has an
     exact **oracle**, so we can measure the league's exploitability — the one
     setting where we have ground truth for convergence).
  2. **A `microrts/` Env adapter** (spatial obs planes + per-cell action mask from
     `legalActions`) exposing the same contract — then run a real conv-net PPO
     over a Python bridge (the project's stated plan), reusing this masking design.
