# Zerg Sprite Animation Parts

Zerg rigs follow the shared metadata contract in `../sprite-rigging-contract.md`.

All sprites face up in source. Emission directions are local vectors before game rotation.

## Unit Notes

| Unit | Moving parts | Emission parts |
|---|---|---|
| Larva | `tiny-scourge-body` wriggles; `left-antenna` and `right-antenna` twitch. | none |
| Egg | `cocoon-body` pulses during morph. | hatch/morph effect from `cocoon-body` |
| Drone | `left-side-leaf`, `right-side-leaf` hover-bob; `flat-leaf-body` stays compact; `left-grab-jaw` and `right-grab-jaw` open/close for mineral grabbing. | worker action from `head-core`, `0 -1` if needed |
| Overlord | `tentacle-*` sway from body origins; `eye-core` pulses slowly; `storage-marker-*` white dots blink on a mathematically even radial ring. | detector/supply aura from `eye-core` |
| Zergling | Triangle limbs step around `smooth-hull-body`; `left-split-jaw` and `right-split-jaw` snap as separated right-triangle halves under `head-triangle`. | melee arc from split jaws/head front |
| Hydralisk | `left-mini-tusk`, `right-mini-tusk` bob around centered `triangle-head`; `head-core` stays small and high. | spine shot from `head-core`, `0 -1` |
| Lurker | Long triangle spike limbs step/deploy around circular `circle-body`; split triangle mandibles snap under the top; `central-eye` stays fixed. | line-spike attack from anchor/head, `0 -1` |
| Mutalisk | `left-wing`, `right-wing` flap; `tail` trails from body. | glaive shot from `head-core`, `0 -1` |
| Scourge | `left-wing`, `right-wing` flutter; body stays tail-free and compact. | suicide impact from anchor |
| Guardian | `smooth-manta-body` slow hover-bobs; `left-front-mandible` and `right-front-mandible` snap subtly. | siege projectile from `head-core`, `0 -1` |
| Devourer | `maw` opens/pulses; `left-mini-tusk` and `right-mini-tusk` snap; delta wings drift; `center-ridge` stays locked under `acid-core`. | acid projectile from `maw`, `0 -1` |
| Queen | `trident-hull` hover-bobs as one smooth forward trident; base `caster-core` pulses. | spell effects from `caster-core` |
| Defiler | `left-pincer`, `right-pincer` twitch; elongated `scorpion-body` crawls; `segmented-tail` and `tail-stinger` curl; `caster-core` pulses. | spell effects from `caster-core` |
| Ultralisk | `left-tusk`, `right-tusk` are attack arcs; four triangle legs step around `wide-smooth-hull`. | melee arcs from tusks |
| Infested Terran | Marine body stays mostly rigid; `infection-dot` pulses in place of the visor. | explosion from anchor/`infection-dot` |
| Broodling | `smooth-hull-body` scuttles; front triangle limbs step; no mandible parts. | melee arc from head/front limbs |
