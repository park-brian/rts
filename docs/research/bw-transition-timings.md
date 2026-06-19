# Brood War Transition Timing Research

Purpose: source exact Brood War frame counts before replacing instant state flips or delayed
ability execution with timed behavior in the deterministic sim. Do not ship gameplay timers for
these rows from memory, feel, or animation guesses.

## Current Status

| Transition | Current sim behavior | Confirmed source facts | Timing status |
|---|---|---|---|
| Siege Tank: tank -> siege | Timed provisional mode transition via `ModeTransitionTimings.Siege` (`sec(2)`) before `Kind.SiegeTank` -> `Kind.SiegeTankSieged` | Local specs/data confirm Siege Tech cost/time and tank/siege unit stats. `tmp/bwapi` confirms explicit `Siege` command, tech-toggle mapping from `Tank_Siege_Mode`, dispatch to `BW::Orders::Siege`, and temporary `Orders::Sieging`. | Unsourced |
| Siege Tank: siege -> tank | Timed provisional mode transition via `ModeTransitionTimings.Siege` (`sec(2)`) before `Kind.SiegeTankSieged` -> `Kind.SiegeTank` | `tmp/bwapi` confirms explicit `Unsiege` command and dispatch to `BW::Orders::Unsiege`. | Unsourced |
| Zerg burrow | Timed provisional mode transition via `ModeTransitionTimings.Burrow` (`sec(1)`) before setting the burrow flag | Local specs/data confirm Burrow research cost/time. `tmp/bwapi` confirms explicit `Burrow` command, tech-toggle mapping from `Burrowing`, dispatch to `BW::Orders::Burrow`, and temporary `Orders::Burrowing`. | Unsourced |
| Zerg unburrow | Timed provisional mode transition via `ModeTransitionTimings.Burrow` (`sec(1)`) before clearing the burrow flag | `tmp/bwapi` confirms explicit `Unburrow` command, dispatch to `BW::Orders::Unburrow`, and temporary `Orders::Unburrowing`. | Unsourced |
| Yamato Gun cast/windup | Instant 260 independent target damage | Local specs/data confirm 150 energy, range 10, 260 damage, and Physics Lab research. `tmp/bwapi` confirms `TechTypes::Yamato_Gun` maps to `Orders::FireYamatoGun`, weapon id 30 has 260 damage and 320px range, and `MoveToFireYamatoGun` reports as `FireYamatoGun`. | Unsourced |

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
- `tmp/bwapi/bwapi/BWAPILIB/Source/TechType.cpp`: confirms Yamato uses
  `Orders::FireYamatoGun`, is a unit-targeted tech, costs 150 energy, and is researched at the
  Physics Lab.
- `tmp/bwapi/bwapi/BWAPILIB/Source/WeaponType.cpp`: confirms Yamato weapon id 30 has 260 damage,
  320px max range, explosive damage type, and the Yamato explosion type.
- `tmp/bwapi/bwapi/BWAPI/Source/BWAPI/BWtoBWAPI.cpp`: confirms `MoveToFireYamatoGun` is exposed
  as `FireYamatoGun` in BWAPI order reporting.
- `tmp/bwapi/bwapi/TestAIModule/Source/UseTechTest.cpp`: confirms the BWAPI test only waits until
  target HP drops; it does not encode the windup frame count or interruption semantics.

BWAPI is useful for command legality and order vocabulary, but the checked paths do not carry the
animation frame counts needed for deterministic transition timers or Yamato cast execution.

The sim's current siege and burrow durations are deliberately marked as unsourced descriptor data in
`ModeTransitionTimings`; they are gameplay placeholders, not BW frame claims.

## Required Next Source

Use one of these before implementing transition or delayed ability durations:

1. Extract and inspect Brood War animation/order data, especially `iscript.bin` plus any supporting
   DAT files needed to map unit/image/script IDs to Siege Tank, burrow-capable units, and the
   Battlecruiser/Yamato image scripts.
2. Record measured traces from a real Brood War/BWAPI run with frame number, unit type, issued
   command, intermediate order, completed state, target HP, caster energy, caster death/disable
   events, and target death/movement events.

Any accepted value must record:

- exact frame count at Fastest game speed;
- whether siege and unsiege differ;
- whether burrow and unburrow differ by unit class;
- for Yamato, whether damage still resolves if the caster dies, moves, is disabled, loses vision,
  or the target dies/moves after energy is spent;
- source path or trace file;
- extraction command or measurement harness version.

## Audit Command

Run:

```sh
npm run research:bw-timings
```

The audit looks for local primary-source candidates under `tmp/`, `docs/research/`, `docs/specs/`,
and optional extra roots passed on the command line. It prints a required-input checklist for
`iscript.bin`, DAT mapping files, known BW MPQ/archive candidates, and measured timing traces. It
intentionally reports "unsourced" until a primary source or measured trace is present and
documented.
