# minigame — a solvable miniature of the RTS macro game

A **standalone** research toy that imports nothing from `packages/*`. It strips the
full RTS down to its strategic skeleton — **actions, costs, affordances, and a
movement cost** — and is deliberately small enough that an exact game-theoretic
**oracle** can solve it. That oracle is ground truth: it grades scripted bots
(and, later, learned policies) by exactly how exploitable they are.

> Why this exists: almost everything that makes RTS *hard to learn* — long-horizon
> credit assignment, a huge maskable action space, strategic **non-transitivity**,
> and value-of-information — survives this reduction. The expensive *representation*
> (2D maps, pathfinding, micro, spatial nets) does not. So the whole AI pipeline
> (env contract, behavior cloning, PPO, a PFSP league, distillation) can be brought
> up and validated here, in microseconds per step, against an exact optimum.

## The game (no 2D plane)

Two symmetric players, each with a **base (HP)** and a pool of **workers (per-unit HP)**.
Every turn is **simultaneous**; each worker takes one role:

| role | effect |
|---|---|
| **harvest** | `+income` minerals (a soft target at home) |
| **defend** | shoots incoming attackers (the cost of safety) |
| **attack** | marches to the enemy and strikes |

Attackers commit to a **target** when launched: enemy **Harvesters** (economic
denial), **Defenders** (a mutual trade), or the **Base** (win-condition damage).
Defenders always fire back, so tunneling harvesters/base means eating **free hits** —
which is why HP is load-bearing and why you must usually clear defense first.

**Movement cost.** `marchTime` is the turns an attack spends *in transit* before it
strikes. The troops are **committed** (gone from economy and defense) and **visible**
to the defender as a warning. This is the **rush-distance** dial: small `marchTime`
favors rushes, large favors macro/defense. `marchTime = 0` recovers the instant game.

The base also builds workers (`workerCost`, `buildTime`). **Win** by razing the enemy
base; a game still alive at the `horizon` is a **draw**. Everything is integer and
deterministic.

## The oracle

The game is a finite-horizon, simultaneous-move, zero-sum Markov game, so its value
obeys backward induction: a state's value is the value of the one-shot **matrix game**
whose entries are the successor-state values (Shapley). `oracle.ts` computes this
exactly over the reachable tree with memoization (+ mirror symmetry `V(swap(s)) = −V(s)`),
solving a zero-sum matrix game (`matrixgame.ts`, exact LP via simplex, with
saddle-point and dominance fast paths) at each node.

It exposes:
- **`solve(state)`** — exact value + optimal **mixed** strategies (mixing is required
  in general, e.g. attack-vs-defend is a matching-pennies-like guess under the march
  delay — a pure minimax would not be a correct oracle).
- **`bestResponseValue(start, policy, side)`** — how much a best-responder beats a
  fixed bot by; i.e. exactly **how far from optimal** that bot is. This is the
  ground-truth quality metric the whole ML plan optimizes.

## What it demonstrates (run `node minigame/main.ts`)

1. **A non-transitive metagame.** The scripted archetypes form the classic cycle
   **cheese > macro > turtle > cheese** (rush beats greedy macro, macro beats turtle,
   turtle beats rush). This is the structural reason a single fixed policy is always
   exploitable and a **league** is needed. Crank `baseHp` up and defense dominates —
   the cycle collapses, exactly as "diversity is a regime you tune into" predicts.
2. **Every fixed bot is exploitable.** From the symmetric start the game value is `0`
   (optimal play draws), yet a best-responder beats *each* deterministic archetype
   (value `−1`). That gap is what self-play has to close.

## Files

| file | what |
|---|---|
| `types.ts` | `Params`, `State`, `Action`, `Raid` |
| `params.ts` | `TINY` (instant oracle), `TINY_MARCH` (movement oracle, ~1.5 s), `SMALL` (sim, non-transitive regime) |
| `game.ts` | rules: legal actions, simultaneous `step`, focus-fire combat, raids, terminal test, canonical key |
| `matrixgame.ts` | exact zero-sum matrix-game solver (LP + saddle/dominance) |
| `oracle.ts` | backward-induction solver + best-response/exploitability |
| `policies.ts` | scripted archetypes (cheese / macro / turtle / harasser / greedy) |
| `arena.ts` | play policies forward; round-robin payoff matrix; cycle counter |
| `main.ts` | demo CLI tying it together |
| `*.test.ts` | `node --test minigame/*.test.ts` |

## Run

```bash
node minigame/main.ts                                   # demo
node --test minigame/game.test.ts minigame/matrixgame.test.ts \
            minigame/oracle.test.ts minigame/arena.test.ts   # tests (~6s)
```

## Scope & next levers

This is **v1**: no 2D, single raid in flight, free retreat (only the *approach* costs
time), full observability. The deliberate next steps, each adding one ML-relevant
phenomenon:
- **paid scouting / hidden opponent state** → a true POMDP and forced mixed strategies;
- **multiple simultaneous raids + retreat cost** → richer commitment dynamics;
- **behavior-cloning** the archetypes into a conditioned policy, then PPO, then a PFSP
  league — each validated against the oracle's exploitability numbers.
