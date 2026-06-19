# Brood War Transition Timing Research

Purpose: source exact Brood War frame counts before replacing instant state flips with timed
transitions in the deterministic sim. Do not ship gameplay timers for these rows from memory,
feel, or animation guesses.

## Current Status

| Transition | Current sim behavior | Confirmed source facts | Timing status |
|---|---|---|---|
| Siege Tank: tank -> siege | Instant `Kind.SiegeTank` -> `Kind.SiegeTankSieged` transform | Local specs/data confirm Siege Tech cost/time and tank/siege unit stats. `tmp/bwapi` confirms explicit `Siege` command, tech-toggle mapping from `Tank_Siege_Mode`, dispatch to `BW::Orders::Siege`, and temporary `Orders::Sieging`. | Unsourced |
| Siege Tank: siege -> tank | Instant `Kind.SiegeTankSieged` -> `Kind.SiegeTank` transform | `tmp/bwapi` confirms explicit `Unsiege` command and dispatch to `BW::Orders::Unsiege`. | Unsourced |
| Zerg burrow | Instant burrow flag/state change | Local specs/data confirm Burrow research cost/time. `tmp/bwapi` confirms explicit `Burrow` command, tech-toggle mapping from `Burrowing`, dispatch to `BW::Orders::Burrow`, and temporary `Orders::Burrowing`. | Unsourced |
| Zerg unburrow | Instant unburrow flag/state change | `tmp/bwapi` confirms explicit `Unburrow` command, dispatch to `BW::Orders::Unburrow`, and temporary `Orders::Unburrowing`. | Unsourced |

## Sources Checked

- `docs/specs/sc1-spec.md`: contains Siege Tank tank/siege stats and Burrow/Siege Tech research
  availability, but no transform frame counts.
- `docs/research/sc1-spells-upgrades.md`: contains research costs and times, but no transform frame
  counts.
- `tmp/bwapi/bwapi/BWAPILIB/UnitCommand.cpp`: confirms BWAPI command constructors and tech toggle
  mapping for Burrowing and Tank Siege Mode.
- `tmp/bwapi/bwapi/BWAPI/Source/BWAPI/GameCommands.cpp`: confirms BWAPI command dispatch to BW
  orders for Burrow, Unburrow, Siege, and Unsiege.
- `tmp/bwapi/bwapi/include/BWAPI/Client/CommandTemp.h`: confirms temporary local orders
  `Orders::Burrowing`, `Orders::Unburrowing`, and `Orders::Sieging`.

BWAPI is useful for command legality and order vocabulary, but the checked paths do not carry the
animation frame counts needed for deterministic transition timers.

## Required Next Source

Use one of these before implementing transition durations:

1. Extract and inspect Brood War animation/order data, especially `iscript.bin` plus any supporting
   DAT files needed to map unit/image/script IDs to Siege Tank and burrow-capable units.
2. Record measured traces from a real Brood War/BWAPI run with frame number, unit type, issued
   command, intermediate order, and completed state.

Any accepted value must record:

- exact frame count at Fastest game speed;
- whether siege and unsiege differ;
- whether burrow and unburrow differ by unit class;
- source path or trace file;
- extraction command or measurement harness version.

## Audit Command

Run:

```sh
npm run research:bw-timings
```

The audit looks for local primary-source candidates under `tmp/`, `docs/research/`, and optional
extra roots passed on the command line. It intentionally reports "unsourced" until a primary source
or measured trace is present and documented.
