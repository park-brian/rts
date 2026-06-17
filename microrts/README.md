# microrts — a standalone microRTS-style engine

A self-contained, deterministic RTS engine in the spirit of **microRTS** (Ontañón) —
the standard small-but-real testbed for RTS AI. It imports nothing from `packages/*`
or `minigame/*`. This is the **2D step up** from the minigame: it puts the spatial
plane back (grid, movement, positions) while keeping everything small and fully
controllable.

> Fidelity note: stats in `units.ts` are µRTS-**style** defaults (approximate), not a
> bit-exact port of the Java reference. They're data, so matching the reference later
> is a table edit.

## The model

- A grid map with the standard unit set: **Base** (stores resources, makes Workers),
  **Barracks** (makes Light/Heavy/Ranged), **Worker** (harvests, builds, weak melee),
  **Light/Heavy/Ranged** combat units, and neutral **Resource** patches.
- **Durative, simultaneous actions** — the defining microRTS feature. Every frame each
  *idle* unit may be issued one action (`None / Move / Harvest / Return / Produce /
  Attack`); the action spans multiple frames (`units.ts` durations); units act
  concurrently. This is what makes the action space combinatorial and the game
  "real-time" rather than turn-based.
- **Deterministic, integer, no RNG.** Resolution order is by unit id; combat damage on
  a frame is accumulated and applied **simultaneously** (two units that kill each other
  the same frame both die — no ordering advantage in fights).
- Resources are spent when production *begins* (a microRTS convention).

### First-resolver bias (honest caveat)

A simultaneous-move grid has an unavoidable edge: when two units contest a cell, the
lower-id unit wins the reservation and acts first, so player 0 has a small systemic
advantage and a mirror match need not draw. This is true of real microRTS too; the fix
is not to fake symmetry but to **evaluate bots on both sides** — see `playBothSides`.

## Files

| file | what |
|---|---|
| `types.ts` | `Kind`, `UnitAction`, `Unit`, `GameState`, directions |
| `units.ts` | µRTS-style unit stats (hp/cost/damage/range/durations) |
| `game.ts` | engine: `legalActions`, `step` (assign → advance one frame → complete), simultaneous combat, `winner`, `hashState` |
| `setup.ts` | a small symmetric map with an immediate harvest loop |
| `bots.ts` | scripted bots: `economyBot` (passive), `workerRush` |
| `run.ts` | `playGame`, `playBothSides` (bias-robust), ASCII `render` |
| `main.ts` | demo |
| `game.test.ts` | determinism, action legality, harvest/return, production, combat, full game terminates, both-sides robustness |

## Run

```bash
node microrts/main.ts                  # demo: a game, a fair both-sides record, a board snapshot
node --test microrts/game.test.ts      # 9 tests
```

## Why it's here / next

microRTS is where the deterministic search methods we want live (Portfolio Greedy
Search, NaïveMCTS, ABCD) and what Gym-µRTS used to show affordable RTS RL (PPO +
invalid-action masking + GridNet on one GPU). This engine is the substrate to:

- drop in a **search bot** (depth-limited simultaneous-move search / portfolio search)
  over `legalActions`, evaluated by `playBothSides`;
- build a **Gym-style interface** (`step` + action masks from `legalActions`) for RL;
- port the minigame's deterministic-micro + learned-strategy split onto a real 2D map,
  graded against scripted baselines instead of an exact oracle (the state space is far
  too large to solve exactly here).
