# Protoss Building Animation Parts

Protoss building rigs follow the shared metadata contract in `../sprite-rigging-contract.md`, with `data-footprint` added to each root SVG.

## Building Notes

| Building | Moving/state parts | Emission parts |
|---|---|---|
| Nexus | `power-node-*` and `warp-core` pulse; `outer-ring` stays rigid. | production warp from `warp-core` |
| Pylon | `power-core` pulses; `field-ring` expands as a power-field read. | power-field from `power-core` |
| Assimilator | `gas-core` pulses; `prong-*` stay rigid around the geyser. | gas glow from `gas-core` |
| Gateway | `gate-slot` and `portal-core` pulse during production; `flat-pyramid` and base rectangles stay rigid. | warp-in from `gate-slot` |
| Forge | `forge-core` and `node-*` pulse while upgrading. | upgrade glow from `forge-core` |
| Photon Cannon | The three rings can rotate or pulse together from center; `inner-core` is the firing part. | photon shot from `inner-core`, `0 -1` |
| Cybernetics Core | `node-*` pulse in sequence around `tech-core`. | upgrade glow from `tech-core` |
| Shield Battery | Four appendages pulse like a cross; `battery-core` drains/fills. | shield effect from `battery-core` |
| Robotics Facility | `production-mouth` opens; `gear-node-*` pulse while producing. | unit warp/rollout from `production-mouth` |
| Stargate | `upper-oval`, `lower-oval`, and `launch-core` pulse as a stacked launch gate. | air warp from `launch-core` |
| Citadel of Adun | `blade-arc-*` pulse; `shrine-core` glows during research. | upgrade glow from `shrine-core` |
| Templar Archives | `psi-halo` pulses; `memory-node-*` blink. | research glow from `archive-core` |
| Robotics Support Bay | `gear-node-*` pulse; `connector` stays aligned to parent. | upgrade glow from gear nodes |
| Observatory | `lens` scans; `antenna-arc-*` pulse. | detector scan from `lens` |
| Fleet Beacon | `signal-ring` expands; `beacon-core` pulses. | fleet tech aura from `beacon-core` |
| Arbiter Tribunal | `stasis-ring` pulses; `crescent-shell` stays rigid. | stasis/tech glow from `tribunal-core` |
