# Terran Building Animation Parts

Terran building rigs follow the shared metadata contract in
`sprite-rigging-contract.md`, with `data-footprint` added to each root SVG.
The exported building sources are the individual files in
`svgs/terran/buildings/`.

SVG order is z-order: lift pads/thrusters and support pieces are under the hull,
identity lines and light cores are above it. Building art does not rotate in the
current renderer, but local emission directions still use `0 -1` for north/front
and `0 1` for south/rear.

## Building Notes

| Building | Moving/state parts | Emission parts |
|---|---|---|
| Command Center | `lift-*-hq-pad` parts define the lift envelope; `command-ring` pulses for production. | production/rally glow from `command-ring` |
| Supply Depot | `left-fan` and `right-fan` plus their cross lines spin; `south-light-bay` lights by storage/supply state. | fan glow and storage light only |
| Refinery | `left-smoke-stack`, `center-smoke-stack`, and `right-smoke-stack` pulse as gas/smoke sources. | gas/smoke glow from stack centers |
| Barracks | Four lift pads stay under the beveled shell; `vertical-line-left` and `vertical-line-right` are rigid roof reads. | production glow from shell/door area |
| Engineering Bay | Oversized lift pads sit under smaller beveled shell; `inset-hull-line` pulses during upgrades. | upgrade glow from `inset-hull-line` |
| Bunker | Four `*-window-slit` rectangles are fixed firing/occupancy reads inside the shell. | small muzzle flashes may originate at slits |
| Academy | `main-dome` pulses during research; `tower-dome` blinks and `courtyard-crescent` stays rigid. | research glow from `main-dome` / `tower-dome` |
| Missile Turret | `pivot` rotates; `left-launcher` and `right-launcher` are missile source parts. | launchers emit missiles forward, `0 -1` |
| Factory | Heavy lift pads define the envelope; `roof-fan` spins, split lines and `roof-square` stay centered in the band. | production glow from roof fan/square |
| Machine Shop | `upgrade-gear` and `upgrade-gear-hub` spin; connector stays attached to parent edge. | upgrade glow from gear hub |
| Starport | Three lift thrusters sit under the pad/facility; support centerlines align with their center-to-center supports; `landing-pad` and `inner-landing-ring` pulse. | landing/production glow from pad; thrusters glow down/rear as needed |
| Control Tower | `dish-cup` sweeps low on the shell; `antenna-dot` blinks. | scanner/control pulse from antenna dot |
| Armory | Four corner shell strokes stay rigid; diagonal braces and `central-hub` pulse during upgrades. | upgrade glow from `central-hub` |
| Science Facility | Four lift thrusters sit under shell; `central-sphere` and `sphere-equator` pulse. | science/research glow from `central-sphere` |
| Physics Lab | `pivot` and `instrument-capsule` charge together; `instrument-nose` is the bright state core. | research charge from `instrument-nose` |
| Covert Ops | `left-roof-bar` and `right-roof-bar` stay rigid; `forward-visor` flickers. | cloak/ops glow from `forward-visor` |
| Comsat Station | `sonar-ring-outer`, `sonar-ring-inner`, and `sonar-sweep-arm` pulse around `sonar-ping`. | scanner pulse from `sonar-ping` / `sonar-sweep-arm` |
| Nuclear Silo | `hatch-ring`, `missile-core`, and `hatch-seam` show arming state; side clamps can open on launch. | launch/armed glow from `missile-core` |
