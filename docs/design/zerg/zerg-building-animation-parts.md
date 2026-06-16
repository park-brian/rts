# Zerg Building Animation Parts

Zerg building rigs follow the shared metadata contract in `../sprite-rigging-contract.md`, with `data-footprint` added to each root SVG.

## Building Notes

| Building | Moving/state parts | Emission parts |
|---|---|---|
| Hatchery | `larva-sac-*` and `brood-core` pulse; `root-*` stay planted. | larva/morph effect from `brood-core` |
| Lair | `crown-spine-*` pulse; `brood-core` glows deeper than Hatchery. | morph/production effect from `brood-core` |
| Hive | `crown-horn-*` and sacs pulse in sequence. | high-tech morph effect from `hive-core` |
| Creep Colony | `stalk-core` pulses; `root-*` creep outward. | colony morph from `stalk-core` |
| Sunken Colony | `spine` thrusts/fires from base; roots brace. | ground spike from `spine`, `0 -1` |
| Spore Colony | `spore-pod-*` pulse; `cap` flexes. | anti-air spores from pod ring |
| Spawning Pool | `pool-core` ripples; rim teeth stay rigid. | unit tech glow from `pool-core` |
| Evolution Chamber | `lobe-*` pulse; `rib-seam-*` glow during upgrades. | upgrade glow from `mutation-core` |
| Hydralisk Den | `jaw-*` opens; `spine-arc-*` pulse. | tech glow from `den-mouth` |
| Extractor | `gas-sac` pulses; `tendril-*` grip the geyser. | gas glow from `gas-sac` |
| Spire | `wing-arc-*` pulse; `spire-core` glows. | air tech glow from `spire-core` |
| Greater Spire | `crown-wing-*` pulse; `greater-core` is the main state part. | advanced air tech glow |
| Queen's Nest | `egg-sac-*` pulse; `wing-plate-*` flex subtly. | caster tech glow from `nest-core` |
| Nydus Canal | `mouth-ring` opens/pulses; `throat` stays dark. | unit transport/mouth effect from `throat` |
| Ultralisk Cavern | `tusk-arc-*` and `cavern-mouth` pulse; mound remains heavy. | tech glow from `cavern-mouth` |
| Defiler Mound | `spine-tail` curls; `caster-core` pulses. | caster tech glow from `caster-core` |

