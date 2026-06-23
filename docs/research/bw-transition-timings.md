# Brood War Transition Timing Research

Purpose: source exact Brood War frame counts before replacing instant state flips or delayed
ability execution with timed behavior in the deterministic sim. Do not ship gameplay timers for
these rows from memory, feel, or animation guesses.

## Current Status

| Transition | Current sim behavior | Confirmed source facts | Timing status |
|---|---|---|---|
| Siege Tank: tank -> siege | Timed sourced mode transition via `ModeTransitionTimings.Siege` (64 frames) before `Kind.SiegeTank` -> `Kind.SiegeTankSieged` | `tmp/icecc/data/scripts/iscript.bin` plus DAT mapping files map Siege Tank siege-mode base to `SiegeTank_Siege_Base`; its `Init` animation reaches `sigorder 1` after 64 frames. OpenBW confirms the order waits on that signal after the tank morphs into siege mode. | Sourced |
| Siege Tank: siege -> tank | Timed sourced mode transition via `ModeTransitionTimings.Unsiege` (63 frames) before `Kind.SiegeTankSieged` -> `Kind.SiegeTank` | `tmp/icecc/data/scripts/iscript.bin` maps `SiegeTank_Siege_Base` `SpecialState2` to `sigorder 1` after 63 frames. OpenBW confirms unsiege waits on that signal before morphing back to tank mode. | Sourced |
| Zerg burrow | Timed sourced per-kind mode transition before setting the burrow flag: Drone/Zergling/Hydralisk/Defiler 5 frames, Infested Terran 6 frames, Lurker 20 frames | `tmp/icecc/data/scripts/iscript.bin` plus DAT unit->flingy->sprite->image->iscript mapping reaches `sigorder 4` in each unit's `Burrow` animation. OpenBW confirms burrow completion waits on `order_signal & 4`. | Sourced |
| Zerg unburrow | Timed sourced deterministic random-range mode transition before clearing the burrow flag: Drone/Zergling/Hydralisk/Defiler/Lurker 5-9 frames, Infested Terran 6-10 frames | `tmp/icecc/data/scripts/iscript.bin` shows `waitrand 1 5` followed by unit-specific frame waits before `sigorder 4` in each `UnBurrow` animation. The sim draws from seeded state RNG to preserve deterministic replay behavior. | Sourced |
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
- `tmp/openbw/bwgame.h`: confirms order handlers wait on iscript order signals:
  - `order_Sieging` waits for `order_signal & 1` after the tank morphs into siege mode.
  - `order_Unsieging` waits for `order_signal & 1` before morphing back to tank mode.
  - `order_Burrowing` and `order_Unburrowing` wait for `order_signal & 4` before applying the
    burrowed/unburrowed state.
- `tmp/icecc/data/scripts/iscript.bin` (sha256 prefix `cd35e04eaa8ea95c`) and DAT mappings from
  the same checkout:
  - `tmp/icecc/data/arr/units.dat` (sha256 prefix `da2ee6f116b77329`)
  - `tmp/icecc/data/arr/flingy.dat` (sha256 prefix `89013fa6d81edad9`)
  - `tmp/icecc/data/arr/sprites.dat` (sha256 prefix `3e5ea29bf9937558`)
  - `tmp/icecc/data/arr/images.dat` (sha256 prefix `6b6123e2cc6771d9`)
  - `tmp/icecc/data/arr/orders.dat` (sha256 prefix `0b79cc64f1cd8b23`)
- The extraction path used for burrow-capable units is unit id -> `units.dat` flingy ->
  `flingy.dat` sprite -> `sprites.dat` image -> `images.dat` iscript id -> `iscript.bin`
  animation offsets. For example, Lurker unit id 103 maps to image 921 (`Unknown921` in the old
  list) and iscript id 354 (`Lurker`).

BWAPI is useful for command legality and order vocabulary, but the checked paths do not carry the
animation frame counts needed for deterministic transition timers or Yamato cast execution. OpenBW is
useful for order completion semantics: it confirms siege/unsiege and burrow/unburrow wait for
`sigorder` bits emitted by iscript.

The sim's siege/unsiege and burrow/unburrow durations are now sourced from the `icecc` bundled
Brood War `iscript.bin` and DAT mapping files. Yamato remains deliberately marked unsourced until
a primary script extraction or measured trace pins its cast/windup semantics.

## Derived Transition Frames

| Transition | iscript path | Completion signal | Frames accepted in sim |
|---|---|---:|---:|
| Siege deploy | `SiegeTank_Siege_Base` `Init` | `sigorder 1` | 64 |
| Unsiege | `SiegeTank_Siege_Base` `SpecialState2` | `sigorder 1` | 63 |
| Drone/Zergling/Hydralisk/Defiler burrow | unit `Burrow` animation | `sigorder 4` | 5 |
| Infested Terran burrow | `InfestedTerran` `Burrow` | `sigorder 4` | 6 |
| Lurker burrow | `Lurker` `Burrow` | `sigorder 4` | 20 |
| Drone/Zergling/Hydralisk/Defiler/Lurker unburrow | unit `UnBurrow` animation | `sigorder 4` | random 5-9 |
| Infested Terran unburrow | `InfestedTerran` `UnBurrow` | `sigorder 4` | random 6-10 |

The unburrow ranges come from a leading `waitrand 1 5` plus fixed frame waits before `sigorder 4`.
The sim uses seeded state RNG for that wait so snapshots, hashes, and replays remain deterministic.

## Required Next Source

Use one of these before implementing delayed ability durations or any remaining transition family not covered above:

1. Extract and inspect Brood War animation/order data, especially `iscript.bin` plus any supporting
   DAT files needed to map unit/image/script IDs to the Battlecruiser/Yamato image scripts.
2. Record measured traces from a real Brood War/BWAPI run with frame number, unit type, issued
   command, intermediate order, completed state, target HP, caster energy, caster death/disable
   events, and target death/movement events. Use `docs/research/bwapi-yamato-trace.md` and
   `docs/research/bwapi-yamato-trace/YamatoTraceAIModule.cpp` as the current Yamato trace contract.

Any accepted value must record:

- exact frame count at Fastest game speed;
- whether paired transitions differ;
- whether timings differ by unit class;
- for Yamato, whether damage still resolves if the caster dies, moves, is disabled, loses vision,
  or the target dies/moves after energy is spent;
- source path or trace file;
- extraction command or measurement harness version.

## Audit Command

Run:

```sh
npm run research:bw-timings
npm run research:bw-yamato-trace -- --require-complete docs/research/traces/yamato-bwapi-YYYYMMDD.jsonl
```

The audit looks for local primary-source candidates under `tmp/`, `docs/research/`, `docs/specs/`,
and optional extra roots passed on the command line. It prints a required-input checklist for
`iscript.bin`, DAT mapping files, known BW MPQ/archive candidates, and measured timing traces. It
intentionally reports "unsourced" until a primary source or measured trace is present and
documented.
