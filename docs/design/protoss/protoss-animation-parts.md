# Protoss Sprite Animation Parts

Protoss rigs follow the shared metadata contract in `../sprite-rigging-contract.md`.

All sprites face up in source. Emission directions are local vectors before game rotation.

## Unit Notes

| Unit | Moving parts | Emission parts |
|---|---|---|
| Probe | `boomerang-shell` hover-bobs as one piece; `worker-core` pulses softly. | worker beam from `worker-core`, `0 -1` if needed |
| Zealot | `left-pauldron-triangle`, `right-pauldron-triangle` bob like Protoss infantry shoulders; `left-psi-blade`, `right-psi-blade` swing from shoulder/blade-rest origins; `trapezoid-helmet` and `helmet-eye` stay above the shoulder mass. | melee arcs from both psi blades |
| Dragoon | `orb-shell` stays centered; each leg has upper segment, knee, and lower segment parts so the walk can hinge instead of sliding a single stroke. | plasma shot from `plasma-core`, `0 -1` |
| High Templar | `left-pauldron-triangle`, `right-pauldron-triangle`, and `inner-hood-arc` drift; `helmet-eye` pulses independently. | spell effects from `helmet-eye` |
| Dark Templar | `left-pauldron-triangle` and `right-pauldron-triangle` drift; `helmet-eye` pulses and `warp-blade` is the main attack part. | melee arc from `warp-blade` |
| Archon | `outer-aura` and `inner-core` pulse; no mechanical body parts. | radial spell/attack from `inner-core` |
| Dark Archon | `outer-aura` pulses around a dark `void-core`. | spell effects from `void-core` |
| Reaver | `long-shell` moves as a heavy body; `launcher-mouth` opens/pulses; no foot parts. | Scarab from `launcher-mouth`, `0 -1` |
| Scarab | Projectile rig; body stays rigid. | travel direction `0 -1`; impact radial from anchor |
| Observer | `lens` pulses; side fins can hover-bob. | detector/caster effect from `lens` |
| Shuttle | `delta-shell` stays rigid; `cargo-dot-*` fill/pulse on load/unload. | transport state only |
| Scout | `left-rear-wing`, `right-rear-wing`, and `fuselage` stay rigid; `wing-tip` cores pulse. | shots from `left-tip` and `right-tip`, `0 -1` |
| Carrier | `narrow-top-hull`, `left-lower-oval`, and `right-lower-oval` stay rigid as a clean triad. | Interceptors launch from side hull edges |
| Interceptor | Tiny rigid fighter; optional `core` pulse. | shot from nose/core, `0 -1` |
| Arbiter | `sleek-delta-shell` drifts; `caster-core` pulses. | cloak/stasis effects from `caster-core` |
| Corsair | `integrated-body` stays rigid; `left-front-engine-spike`, `right-front-engine-spike`, `left-engine-tip`, `right-engine-tip`, and `engine-core` pulse for air attack. | disruption shot from `engine-core`, `0 -1` |
