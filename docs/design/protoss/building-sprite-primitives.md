# Protoss Building Sprite Primitives

This is the design sheet for hand-authored Protoss building SVG rigs. Buildings use the same rigging contract as units plus `data-footprint` for build placement. Footprints below come from `../../specs/bwapi-unit-dimensions.md`.

Rules:

- Literal top-down footprint first.
- Structures should read as landmarks: one large shell/portal form plus one identity feature.
- Use Protoss geometry from the references: trapezoid pads, tower pylons, red/gold shell plates, cyan inserts, portal grids, and node clusters.
- Keep warp/energy elements as named parts that can pulse independently.
- Do not draw height, walls, tiny gold panels, perspective undersides, or decorative lightning.
- These are not abstract temples. Most read as alien industrial buildings with funny trapezoid heads, pads, or towers.

## Building Recipes

| Building | Primitive recipe | Footprint |
|---|---|---:|
| Nexus | Broad trapezoid HQ pad, central cyan channel/grid, four corner claw/tower posts. | 4x3 |
| Pylon | Tall blue crystal, red/gold cradle, two side shell clamps. | 2x2 |
| Assimilator | Mechanical gas capsule/ring, side towers, large cyan vent core. | 4x2 |
| Gateway | Flat pyramid wedge with two rectangular base blocks and a small dark gate slot. | 4x3 |
| Forge | Lumpy tech block: two tower stacks, side cylinder, cyan forge core. | 3x2 |
| Photon Cannon | Three concentric circles: outer ring, middle ring, inner firing core. | 2x2 |
| Cybernetics Core | Round cyan node cluster with four red/gold base pods. | 3x2 |
| Shield Battery | Cross silhouette: four extended appendages around a round capacitor hub. | 3x2 |
| Robotics Facility | Rectangular portal/workshop pad, cyan grid center, rear tower head. | 3x2 |
| Stargate | Two elegant stacked flat ovals with a small launch core between them. | 4x3 |
| Citadel of Adun | Tri-leg temple rig: central cyan core, three blade/tower arms. | 3x2 |
| Templar Archives | Tall trapezoid archive block, side domes, cyan front cap. | 3x2 |
| Robotics Support Bay | Radial support pad with six small arm pods and central star/core. | 3x2 |
| Observatory | Low U-shaped detector pad, three cyan tower nodes, lens body. | 3x2 |
| Fleet Beacon | Large circular beacon dish, three support legs, cyan dome and side nodes. | 3x2 |
| Arbiter Tribunal | Low tribunal pad with three rear blue pillars, side horns, central red/gold base. | 3x2 |
