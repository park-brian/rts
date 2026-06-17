# Protoss Sprite Animation Parts

Protoss rigs follow the shared metadata contract in `../sprite-rigging-contract.md`.

All sprites face up in source. Emission directions are local vectors before game rotation.

## Unit Notes

| Unit | Moving parts | Emission parts |
|---|---|---|
| Probe | `wide-arbiter-shell` hover-bobs as one piece; `worker-core` pulses softly. | worker beam from `worker-core`, `0 -1` if needed |
| Zealot | `left-pauldron-leaf`, `right-pauldron-leaf` bob like Protoss infantry shoulders; `left-psi-blade`, `right-psi-blade` swing from behind the pauldrons; `helmet-oval` and `face-eye` stay above the shoulder mass. | melee arcs from both psi blades |
| Dragoon | `orb-shell` stays centered; each leg has upper segment, knee, and lower segment parts so the walk can hinge instead of sliding a single stroke. | plasma shot from `plasma-core`, `0 -1` |
| High Templar | `left-pauldron-small` and `right-pauldron-small` drift; `helmet-oval` stays centered; `face-eye`, `left-hand-orb`, and `right-hand-orb` pulse independently. | spell effects from `left-hand-orb` and `right-hand-orb` |
| Dark Templar | `left-pauldron-small` and `right-pauldron-small` drift; `helmet-oval` and `face-eye` pulse subtly; `warp-blade` is the main attack part. | melee arc from `warp-blade` |
| Archon | `outer-aura` and `inner-core` pulse; no mechanical body parts. | radial spell/attack from `inner-core` |
| Dark Archon | `outer-aura` pulses around a dark `void-core`. | spell effects from `void-core` |
| Reaver | `long-shell` moves as a heavy body; `launcher-head` and centered `launcher-eye` pulse; no foot parts. | Scarab from `launcher-head`, `0 -1` |
| Scarab | Projectile rig; body stays rigid. | travel direction `0 -1`; impact radial from anchor |
| Observer | `detector-lens` pulses; side fins can hover-bob. | detector/caster effect from `detector-lens` |
| Shuttle | `delta-shell` stays rigid; `cargo-dot-*` fill/pulse on load/unload; `left-rear-thruster`, `center-rear-thruster`, and `right-rear-thruster` glow for movement. | transport state plus rear thruster glow `0 1` |
| Scout | `left-rear-delta-wing`, `right-rear-delta-wing`, and `fuselage` stay rigid; `left-wing-engine` and `right-wing-engine` pulse for fire; `left-rear-thruster` and `right-rear-thruster` glow for movement. | shots from `left-wing-engine` and `right-wing-engine`, `0 -1`; thrusters emit `0 1` |
| Carrier | `narrow-top-hull`, `left-lower-oval`, and `right-lower-oval` stay rigid as a clean triad. | Interceptors launch from side hull edges |
| Interceptor | Tiny rigid fighter; optional `core` pulse. | shot from nose/core, `0 -1` |
| Arbiter | `lower-delta-shell` sits below and behind the main hull; `sleek-delta-shell` drifts above it; `caster-core` pulses high on the body. | cloak/stasis effects from `caster-core` |
| Corsair | `corsair-trident-hull` hover-bobs as one smooth flyer body; `engine-core` pulses for air attack. | disruption shot from `engine-core`, `0 -1` |
