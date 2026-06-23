# Yamato BWAPI Timing Trace

Purpose: measure Brood War Yamato Gun cast timing and interruption semantics from a live BWAPI run
before changing the sim away from instant Yamato damage. The sim must not accept a Yamato windup
constant from memory, animation feel, or BWAPI static weapon data alone.

## Local Runtime

Current local install detected during the timing audit:

- StarCraft: `C:\Program Files (x86)\Starcraft`
- Archives present: `BrooDat.mpq`, `BroodWar.mpq`, `StarCraft.mpq`, `StarDat.mpq`, `patch_rt.mpq`
- BWAPI reference checkout: `tmp/bwapi`
- BWAPI build probe: `BWAPILIB.lib`, `BWAPI.dll`, `BWAPI_PluginInjector.bwl`, and `YamatoTraceAIModule.dll` build locally with VS 2019 Build Tools using `PlatformToolset=v142`; the local BWAPI checkout needs the generated `include/svnrev.h` and an ignored `Util/Source/Util/Path.h` compatibility patch for `<experimental/filesystem>`.
- Program Files runtime writes need admin/UAC. A writable runtime copy at `tmp/starcraft-bwapi` can be used with HKCU `InstallPath`/`Program` pointed at that copy for trace runs.
- Existing BWAPI precedent: `tmp/bwapi/bwapi/TestAIModule/Source/UseTechTest.cpp` already runs
  `TechTypes::Yamato_Gun` against a Zerg Hatchery, but it only waits for target HP to drop.

## Required Trace Scenarios

Record at least these cases before marking Yamato sourced:

1. `baseline`: issue Yamato and do not interrupt.
2. `stop_after_energy_spent`: issue Yamato, wait until energy is spent, then issue Stop.
3. `move_after_energy_spent`: issue Yamato, wait until energy is spent, then issue Move.
4. `caster_killed_after_energy_spent`: issue Yamato, wait until energy is spent, then kill or remove
   the Battlecruiser if the harness can do so repeatably.
5. `target_killed_after_energy_spent`: issue Yamato, wait until energy is spent, then kill/remove the
   target if the harness can do so repeatably.

If a scenario cannot be automated in BWAPI, keep it out of the trace file rather than fabricating it,
and document the limitation in this file before implementing sim behavior.

## JSONL Event Contract

The trace file is newline-delimited JSON. Each line is one event. Required common fields:

- `schema`: exactly `rts.bwapi.yamato-timing.v1`
- `scenario`: one of the scenario names above
- `frame`: BWAPI frame count
- `event`: event name

Required event sequence per scenario:

- `scenario-start`
- `command-issued`
- `energy-spent`
- `target-damaged` for any scenario where damage resolves
- `scenario-end`

Recommended state fields, included on every event when available:

- `casterId`
- `targetId`
- `casterOrder`
- `casterSecondaryOrder`
- `casterEnergy`
- `casterExists`
- `targetHp`
- `targetExists`
- `commandAccepted`
- `interruptionIssued`

Derived values accepted into sim docs/tests must include:

- `energySpentFrame - commandIssuedFrame`
- `targetDamagedFrame - commandIssuedFrame`
- whether damage resolves after each interruption scenario
- whether the caster remains locked until damage or can resume another order first

## Harness Skeleton

`YamatoTraceAIModule.cpp` in this directory is a skeleton BWAPI module. It is intentionally checked in
as research scaffolding, not production code. Copy it into a BWAPI module project, build it against the
local BWAPI checkout/release, run it through Chaoslauncher, and write output to:

`docs/research/traces/yamato-bwapi-YYYYMMDD.jsonl`

The skeleton honors `YAMATO_TRACE_PATH`; set it to the trace path above when the launcher path can inherit environment variables. Otherwise it falls back to `bwapi-yamato-trace.jsonl` in the process working directory; move that file into `docs/research/traces/` before verification.

After collecting a trace, run:

```sh
npm run research:bw-yamato-trace -- --require-complete docs/research/traces/yamato-bwapi-YYYYMMDD.jsonl
npm run research:bw-timings -- docs/research/traces "C:\Program Files (x86)\Starcraft"
```

Only then update `docs/research/bw-transition-timings.md`, `plan.md`, and the sim ability descriptor.
