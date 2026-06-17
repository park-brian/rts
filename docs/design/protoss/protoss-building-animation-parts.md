# Protoss Building Animation Parts

Protoss building rigs follow the shared metadata contract in `../sprite-rigging-contract.md`, with `data-footprint` added to each root SVG.

## Building Notes

| Building | Moving/state parts | Emission parts |
|---|---|---|
| Nexus | `pyramid-base`, `pyramid-face-edges`, and `apex-cap` are the hull; `warp-eye` pulses lower on the pyramid face. | production warp from `warp-eye` |
| Pylon | `power-crystal` pulses; `left-cradle`, `right-cradle`, and `field-ring` expand as a power-field read. | power-field from `power-crystal` |
| Assimilator | `gas-core`, `left-side-eye`, and `right-side-eye` pulse inside the wide `gas-ring`. | gas glow from `gas-core` |
| Gateway | `left-pyramid-half` and `right-pyramid-half` stay split; `portal-ring` and `portal-core` pulse during production. | warp-in from `portal-core` |
| Forge | `forge-core` pulses inside `forge-circle`; `right-square` and `square-cap` stay rigid. | upgrade glow from `forge-core` |
| Photon Cannon | The three rings can rotate or pulse together from center; `inner-core` is the firing part. | photon shot from `inner-core`, `0 -1` |
| Cybernetics Core | `upper-under-node`, `lower-under-node`, and their core eyes pulse under `main-core-circle`; `central-eye-dot` is the main tech read. | upgrade glow from `central-eye-dot` |
| Shield Battery | `north-appendage`, `south-appendage`, `west-appendage`, and `east-appendage` pulse like narrow charge arms; `battery-core` drains/fills. | shield effect from `battery-core` |
| Robotics Facility | `facility-oval` stays rigid; horizontal bisectors sit behind `iris-ring` and `pupil`. | unit production/rollout from `pupil` |
| Stargate | `upper-launch-hull`, `lower-launch-hull`, and their inner arcs pulse as a side-facing gate; `launch-core` marks the center. | air warp from `launch-core` |
| Citadel of Adun | `left-block`, `right-tall-bar`, and `joining-circle` stay locked; `citadel-core` glows during research. | upgrade glow from `citadel-core` |
| Templar Archives | `archive-leaf` stays rigid; `archive-center-circle` and `right-end-dot` pulse. | research glow from `archive-center-circle` / `right-end-dot` |
| Robotics Support Bay | `support-bay-oval` and `support-hub` sit under the four `*-arm` parts; arms pulse above the bay. | upgrade glow from `support-core` |
| Observatory | `quarter-arc` and three `arc-node-*` parts pulse; spoke lines meet the lower `lens`. | detector scan from `lens` |
| Fleet Beacon | `delta-insignia` pulses behind `beacon-eye`; `beacon-pupil` is the central signal read. | fleet tech aura from `beacon-pupil` |
| Arbiter Tribunal | Four `*-pointed-ray` parts pulse under `tribunal-circle`; `tribunal-core` is the tech glow. | stasis/tech glow from `tribunal-core` |
