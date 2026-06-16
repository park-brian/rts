# Zerg Sprite Animation Parts

Zerg rigs follow the shared metadata contract in `../sprite-rigging-contract.md`.

All sprites face up in source. Emission directions are local vectors before game rotation.

## Unit Notes

| Unit | Moving parts | Emission parts |
|---|---|---|
| Larva | `body` wriggles; `segment-arc-*` can pulse subtly. | none |
| Egg | `sac-*` and `inner-glow` pulse during morph. | hatch/morph effect from anchor |
| Drone | `left-wing`, `right-wing` hover-bob; `body` stays compact. | worker action from `front-core`, `0 -1` if needed |
| Overlord | `tentacle-*` sway from body origins; `eye-core` pulses slowly. | detector/supply aura from `eye-core` |
| Zergling | `left-claw`, `right-claw` step/swing; `jaw` can snap on attack. | melee arc from jaw/claws |
| Hydralisk | `left-spine-arc`, `right-spine-arc` bob; `mandible-*` can open for attack. | spine shot from `head-core`, `0 -1` |
| Lurker | `side-spike-*` are deploy/attack handles; `body` flattens when burrowed. | line-spike attack from anchor/head, `0 -1` |
| Mutalisk | `left-wing`, `right-wing` flap; `tail` trails from body. | glaive shot from `head-core`, `0 -1` |
| Scourge | `left-wing`, `right-wing` flutter; `split-tail` trails. | suicide impact from anchor |
| Guardian | `left-claw-wing`, `right-claw-wing` slow flap; abdomen stays heavy. | siege projectile from `head-core`, `0 -1` |
| Devourer | `maw` opens/pulses; side fins drift. | acid projectile from `maw`, `0 -1` |
| Queen | `side-wing-*` hover; `tail` sways; `caster-core` pulses. | spell effects from `caster-core` |
| Defiler | `spine-tail` and `root-tentacle-*` crawl; `caster-core` pulses. | spell effects from `caster-core` |
| Ultralisk | `left-tusk`, `right-tusk` are attack arcs; `head-plate` drives the melee read. | melee arcs from tusks |
| Infested Terran | `belly-sac` pulses aggressively; small limb strokes jitter. | explosion from `belly-sac`/anchor |
| Broodling | `left-claw`, `right-claw` twitch; body scuttles from anchor. | melee arc from claws |

