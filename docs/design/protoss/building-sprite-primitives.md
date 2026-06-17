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
| Nexus | Rectangular pyramid base as real hull, closed glowing triangle face, filled glowing rectangular half-square top cap whose bottom corners meet the triangle edges, and low centered bright eye. | 4x3 |
| Pylon | Diamond crystal centered inside the 2x2 footprint, small cradle arcs and field ring. | 2x2 |
| Assimilator | Wide, narrow gas capsule flush to the 4x2 footprint, small white side eyes on the main oval, tall narrow cyan vent. | 4x2 |
| Gateway | Two physically separated pyramid halves, centered portal circle, all flush inside the 4x3 footprint. | 4x3 |
| Forge | Circle over a right square with a taller side cap, vertically centered in the 3x2 footprint. | 3x2 |
| Photon Cannon | Three concentric circles contained inside the 2x2 footprint. | 2x2 |
| Cybernetics Core | Taller left backing rectangle under a shifted main circle, central dot, and two round right-edge circles underneath. | 3x2 |
| Shield Battery | Thin cross battery with narrow arms and a small inner core, contained inside the 3x2 footprint. | 3x2 |
| Robotics Facility | Eye shape: long outer oval bisected through the center behind a round iris/pupil. | 3x2 |
| Stargate | Side-facing carrier-like hull halves with graceful inner arcs, separated at center and flush to the 4x3 footprint. | 4x3 |
| Citadel of Adun | Long skinny left block reaching rightward, right tall block, and right-shifted joining circle, contained in the 3x2 footprint. | 3x2 |
| Templar Archives | Organic right-pointing leaf shape with a center circle and small dot near the right tip. | 3x2 |
| Robotics Support Bay | Oval bay with a center circle underneath four overlaid rectangular arms. | 3x2 |
| Observatory | Quarter-wheel arc with three spoke nodes and a lower lens, contained in the 3x2 footprint. | 3x2 |
| Fleet Beacon | Starfleet-style delta insignia spanning the footprint, with a small centered eye on top. | 3x2 |
| Arbiter Tribunal | Smaller central circle over four pointed cardinal rays. | 3x2 |
