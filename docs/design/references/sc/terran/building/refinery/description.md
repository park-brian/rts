# Refinery

Top-down primitive target: a compact gas-processing ring with four square tank pods and two simple pipe arcs. It should read as machinery around a resource node.

Placement footprint: `4x2` build tiles, sourced from BWAPI.

SVG parts in the current draft:

- `vent-ring`: central circular processing ring.
- `upper-left-tank`, `upper-right-tank`, `lower-left-tank`, `lower-right-tank`: four tank pods around the ring.
- `pipe-a`, `pipe-b`: curved pipe lines connecting the pods.
- `gas-core`: central glowing gas/status core.

Animation/implementation notes: pulse `gas-core` and `vent-ring` while harvesting. The tanks remain static; the pipes can glow in sequence if we want resource-flow feedback.

Do not draw: smoke stacks, tall refinery towers, shadows, ground geyser detail, or isometric pipe undersides.
