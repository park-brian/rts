# Spec: the mechanical layer and the deterministic fight resolver

## 0. The one thesis

We split the game along a single line:

- **Mechanical layer** — deterministic, computable: how a fight resolves, how units
  move, how production is paid for. Encoded in code, not learned.
- **Strategic layer** — the part that is genuinely a *game*: what to build, what
  composition, whether/where to fight, when to commit. Learned (or, on small
  instances, solved exactly).

The mechanical layer exists to make the strategic layer **cleanly learnable**. It
does that by absorbing all mechanical detail into deterministic functions, so the
strategic layer sees a small `(observation, action)` interface and a reward that
**tracks the decision, not mechanical noise**.

One rule makes this work, and it is testable:

> The mechanical layer must be **deterministic**, **faithful**, and **symmetric**
> (both players run the same code). It need not be *optimal* — only good enough
> that it does not *invert* which strategy should win.

Consequences (both falsifiable, see §5):
1. Not-optimal-but-symmetric is fine: shared mechanics cancel, leaving strategy as
   what's decided.
2. "Good enough" has a number: with strategy held fixed, outcome variance ≈ 0.

This is not a new architecture. The existing minigame already draws this line — its
combat is the trivial deterministic resolver (single unit type, focus-fire
Lanchester), and only the strategic allocation is exposed to the solver. This spec
**thickens the mechanical layer** — a real multi-unit-type fight resolver — beneath
the *same* small strategic interface, and proves strategy stays cleanly solvable.

## 1. Where the line goes

| concern | layer | encoded as |
|---|---|---|
| who shoots whom, focus fire, attrition | mechanical | `resolveFight` |
| damage-type × size counters | mechanical | damage table in unit data |
| range / kiting at army scale | mechanical | opening-volley model |
| terrain frontage (chokes/ramps) | mechanical | `frontage` cap |
| defender / high-ground edge | mechanical | damage multiplier |
| **which composition to field** | strategic | action |
| **whether to take the fight** | strategic | action |
| **what the fight is worth** | strategic | reward from the outcome |

Everything in the top block is this spec's deliverable. The bottom block is what the
resolver *enables* and is exercised by the composition game (§4).

## 2. The fight resolver

A pure function:

```
resolveFight(forceA, forceB, context) -> FightResult
```

### Inputs

- **Force** — a bag of units, each `{ type, hp }` (per-unit HP, so attrition and
  focus fire are exact). Built from a `UnitType` table.
- **UnitType** — `{ name, size, hp, armor, damage, dtype, range, speed, cost }`.
  `size ∈ {Small,Medium,Large}`, `dtype ∈ {Normal,Concussive,Explosive}`.
- **FightContext** — terrain/posture: `{ frontageA, frontageB, dmgMultA, dmgMultB }`.
  `frontage = ∞` is open field; a small frontage is a choke/ramp. `dmgMult`
  carries a defender / high-ground edge (default `1`).

### Effects modeled (and why each is load-bearing)

1. **Damage-type × size** — the composition-counter mechanic. `effDmg = damage ×
   MULT[dtype][size] − armor`, floored at 1. (Explosive: 50/75/100 vs S/M/L;
   Concussive: 100/50/25; Normal: 100/100/100.)
2. **Focus fire** — concentrate damage to *remove* units (a half-dead unit fights at
   full rate). This is what produces square-law / critical-mass tipping emergently.
3. **Range advantage (army-scale kiting)** — the longer-range side gets
   `opening = clamp(ceil((rangeAdv)/closingSpeed), 0, cap)` rounds of *unanswered*
   fire before the exchange. This is why ranged beats melee in the open.
4. **Frontage (terrain)** — at most `frontage` units of a side attack per round.
   A choke lets a small force trade evenly with a big one — the "hold the ramp"
   mechanic. Open field (`∞`) lets numbers and surrounds dominate.
5. **Armor / damage multipliers** — flat mitigation and the defender edge.

### Resolution (deterministic, order-independent)

Round-based attrition until one side is empty or a round cap:
- Apply `opening` one-sided rounds for whichever side has the range edge.
- Each round, **both sides compute damage off the start-of-round state** (so order
  doesn't matter), focus-firing: the `min(living, frontage)` front-line attackers
  pour effective damage into enemy units chosen by a fixed priority (highest threat
  = DPS, ties by lowest HP), spilling to the next as each dies.
- Remove dead, repeat. Cap rounds; if both survive the cap, higher surviving
  **cost-value** wins, else draw.

### Output

```
FightResult { winner: 'A' | 'B' | 'draw', survivorsA: Force, survivorsB: Force, rounds }
```

Survivors are returned so fights **compose** (the winner's remnant fights on).

### Explicitly NOT in v1 (kept out to stay honest about scope)

Splash/AoE, spellcasters, continuous 2D positions, reinforcement mid-fight,
morale/retreat. These are future thickenings of the same function; none changes the
interface.

## 3. Determinism & symmetry requirements

- Pure and integer; same inputs → same `FightResult`, byte-for-byte.
- `resolveFight(A, B, ctx)` and `resolveFight(B, A, swap(ctx))` give mirror results.
- No RNG. (If randomness is ever wanted, it must be a seeded argument, never
  ambient.)

## 4. The strategic interface it slots into: the composition game

To prove the resolver makes strategy *cleanly solvable*, we wrap it in the smallest
possible strategic layer and solve it exactly with the **existing**
`matrixgame.ts` zero-sum solver:

- Both players pick an **army composition** under a fixed **budget** (a bag of unit
  types whose total `cost ≤ budget`). This is the strategic action.
- The payoff matrix `M[i][j] = sign(resolveFight(comp_i, comp_j, ctx))` from the row
  player's view.
- `solveZeroSum(M)` returns the value and the **optimal mixed composition** — i.e.
  "what army should I build, and with what probability." A non-transitive counter
  structure shows up as a **mixed** equilibrium (support > 1), exactly mirroring the
  macro archetypes' rock-paper-scissors but now for *unit choice*.

This is the concrete payoff of the whole architecture: the resolver turns
"what beats what" from something an RL agent must discover over a million games into
a **queryable oracle**, and the composition it should field is the Nash of a matrix
the resolver fills in.

## 5. Acceptance criteria (the falsifiable part)

The implementation is correct iff these tests pass:

1. **Determinism** — repeated `resolveFight` on the same inputs is identical.
2. **Variance test (the core claim)** — with both compositions fixed, the outcome
   does not vary. (Trivially true given determinism, but asserted as the contract:
   the mechanical layer injects *zero* variance into a fixed-strategy reward.)
3. **Counters** — explosive beats an equal-budget Large army; loses to an
   equal-budget Small swarm (explosive is 50% vs Small + limited frontage in the
   open). Concussive beats Small.
4. **Square law** — same unit type, side A with ~2× the count wins with *more than
   half* its force surviving (a super-linear advantage, not a 1:1 trade).
5. **Terrain flips a counter** — a matchup the swarm wins in the open (`frontage=∞`)
   flips to the heavy unit at a choke (`frontage` small).
6. **Composition game is non-transitive** — for a tuned budget/context, the
   composition payoff matrix has a cycle and `solveZeroSum` returns a *mixed*
   optimum (support > 1).

## 6. Files & run

```
minigame/units.ts        # UnitType table (Size/DamageType + the damage multipliers)
minigame/fight.ts        # resolveFight + Force helpers
minigame/compose.ts      # composition game: enumerate comps, build matrix, solve
minigame/fight.test.ts   # acceptance tests 1-5
minigame/compose.test.ts # acceptance test 6
minigame/fightdemo.ts    # prints the composition payoff matrix (open + choke) and the Nash comp
```

```bash
node minigame/fightdemo.ts
node --test minigame/fight.test.ts minigame/compose.test.ts
```

## 7. Out of scope / forward path

- **Wiring the resolver into the full economy game** (replace the single-type
  combat with typed armies + production choices) — a larger change behind the same
  strategic interface; deferred until the resolver is validated standalone.
- **Positions, splash, spellcasters** — future thickenings of `resolveFight`.
- **A learned strategic policy** (vs the exact solver) over the composition/economy
  interface — the eventual consumer; the oracle here is its grader.
