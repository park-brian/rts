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

## The mechanical layer (see [`spec.md`](./spec.md))

The macro kernel above models *timing*. A second track models *combat* and *composition*
through a **deterministic, faithful, symmetric mechanical layer** — the rule that lets the
strategic layer be learned cleanly (a reward tracks the decision, not mechanical noise).

- **`fight.ts`** — `resolveFight(forceA, forceB, ctx)`: pure, integer, no RNG. Models
  damage-type × size counters, focus fire (→ square-law tipping), an army-scale opening
  volley for the longer-ranged side, and a frontage cap for terrain (chokes/ramps).
- **`compose.ts`** — the smallest strategic layer on top: pick an army under a budget, the
  resolver fills the payoff matrix, the existing zero-sum solver returns the optimal (mixed)
  army. *What beats what becomes a queryable oracle.* Demo: open-field comp RPS
  (Marine/Vulture/Tank 33% each) collapses to one comp at a choke.
- **`econfight.ts`** — the integration (spec §7): economy + production wired on top of the
  resolver, behind the same small interface (harvest / train worker / produce unit / commit).
  Scripted build orders form a **timing × composition** cycle
  (vultureRush > zealotPush > tankTech > vultureRush). Forward-simulatable, not exactly
  oracle-solvable — ground truth here is scripted payoff matrices + the composition oracle.

## Files

| file | what |
|---|---|
| `types.ts`, `params.ts`, `game.ts` | macro kernel: state/rules, simultaneous `step`, raids, presets |
| `matrixgame.ts` | exact zero-sum matrix-game solver (LP + saddle/dominance) — shared by both tracks |
| `oracle.ts`, `policies.ts`, `arena.ts`, `main.ts` | macro oracle, archetypes, round-robin, demo |
| `units.ts`, `fight.ts` | unit roster + the deterministic fight resolver |
| `compose.ts`, `fightdemo.ts` | composition game (oracle over army choice) + demo |
| `econfight.ts`, `econpolicies.ts`, `econarena.ts`, `econdemo.ts` | economy+production game on the resolver |
| `spec.md` | the mechanical-layer spec + acceptance criteria |
| `*.test.ts` | `node --test minigame/*.test.ts` |

## Run

```bash
node minigame/main.ts        # macro oracle: non-transitivity + exploitability
node minigame/fightdemo.ts   # composition oracle: counters + terrain flip
node minigame/econdemo.ts    # economy+production: build-order metagame
node --test minigame/game.test.ts minigame/matrixgame.test.ts minigame/oracle.test.ts \
  minigame/arena.test.ts minigame/fight.test.ts minigame/compose.test.ts \
  minigame/econfight.test.ts                                        # 41 tests (~7s)
```

## Scope & next levers

This is **v1**: no 2D, single raid/attack in flight, free retreat (only the *approach*
costs time), full observability, and a fight resolver without splash/spellcasters. The
deliberate next steps, each adding one ML-relevant phenomenon:
- **paid scouting / hidden opponent state** → a true POMDP and forced mixed strategies;
- **thicken `resolveFight`** (splash, spellcasters, positions) — same interface, more fidelity;
- **a learned strategic policy** over the econ+composition interface, graded by the
  composition oracle and the scripted payoff matrices;
- **behavior-cloning** the archetypes/build-orders, then PPO, then a PFSP league.
