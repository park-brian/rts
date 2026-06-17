# Zerg Building Animation Parts

Zerg building rigs follow the shared metadata contract in `../sprite-rigging-contract.md`, with `data-footprint` added to each root SVG.

## Building Notes

| Building | Moving/state parts | Emission parts |
|---|---|---|
| Hatchery | `center-brood-mound` and `brood-core` pulse; `root-*` stay planted. | larva/morph effect from `brood-core` |
| Lair | `under-spine-mound` pulses below `center-brood-mound`; `brood-core` glows deeper than Hatchery. | morph/production effect from `brood-core` |
| Hive | `*-spike` wedges pulse below `center-brood-mound`; `hive-core` is the main glow. | high-tech morph effect from `hive-core` |
| Creep Colony | `central-stalk-exposed-aura` and `stalk-core` pulse; `root-*` creep outward. | colony morph from `stalk-core` |
| Sunken Colony | `attack-spine` thrusts/fires from `root-base`; roots brace. | ground spike from `attack-spine`, `0 -1` |
| Spore Colony | `left-spore-pod`, `right-spore-pod`, and `top-spore-pod` pulse inside `bulb-cap`. | anti-air spores from pod ring |
| Spawning Pool | `pool-core` ripples; rim teeth stay rigid. | unit tech glow from `pool-core` |
| Evolution Chamber | `mutation-node-*` and `mutation-core` pulse during upgrades. | upgrade glow from `mutation-core` |
| Hydralisk Den | `den-eye-exposed-aura` and `spine-arc-*` pulse. | tech glow from `den-core` |
| Extractor | `gas-sac` pulses inside `vent-ring`; side horn clamps stay rigid. | gas glow from `gas-sac` |
| Spire | `spire-eye-exposed-aura`, `spire-eye`, and `air-core` pulse above the `spire-stalk`. | air tech glow from `air-core` |
| Greater Spire | `greater-eye-cluster-exposed-aura` outlines the overlapping eye cluster; side eye cores pulse under the larger `greater-main-eye`. | advanced air tech glow from `greater-core` |
| Queen's Nest | `*-spoke` parts pulse outward from `nest-core`. | caster tech glow from `nest-core` |
| Nydus Canal | `mouth-ring` opens/pulses; `throat` stays dark. | unit transport/mouth effect from `throat` |
| Ultralisk Cavern | `tusk-*`, `cavern-eye`, and `cavern-core` pulse; mound remains heavy. | tech glow from `cavern-core` |
| Defiler Mound | `caster-slit` pulses vertically. | caster tech glow from `caster-slit` |
