# Terran Building Sprite Primitives

This is the active design sheet for hand-authored Terran building SVG rigs. Buildings use the same rigging contract as units: canonical 64x64 coordinates, no geometry scaling, visible bounds via `data-visible-box`, and build placement via `data-footprint`.

Animation and effect hooks for the Terran building parts are tracked in
`terran-building-animation-parts.md`.

Footprints and pixel bounds come from `docs/specs/bwapi-unit-dimensions.md`, sourced from BWAPI.

Current pass:

- Draw the footprint-proportioned shell first.
- Shells are centered beveled rectangles by default, with Command Center allowed to become a stronger octagon and Factory allowed to become a wide hexagon.
- Shell proportions come from build-tile footprint, fit into the 64x64 rig at a fixed tile visual size.
- BWAPI pixel bounds remain metadata only; they do not drive the top-down shell because those bounds include isometric sprite projection.
- `data-footprint` remains exact build-tile placement metadata.
- For lift-capable Terran buildings, the footprint box is the full occupied envelope and the main hull is inset. Lift pads/feet sit under that inset hull and define the outer footprint read.
- Crosshairs are reserved for rotating parts like fans. Static centers use rings, hubs, or dots without cross marks.
- Foot placement is per building, not generic. Starport uses two left thrusters and one large right building thruster; Engineering Bay uses oversized corner landing pads; Factory uses oversized corner landing pads; Command Center uses large HQ corner pads; Barracks uses smaller corner landing pads; Science Facility uses four endpoint thrusters.
- Identity parts are added as a small number of large named primitives after the shell is stable.

Rules:

- Literal top-down shell first.
- Keep each structure readable from one strong silhouette plus one identity feature.
- Use larger shapes than unit sprites; buildings will be seen as map landmarks.
- Add-ons should read as compact modules that can attach to the right side of their parent.
- Do not draw walls, height, shadows, tiny panels, or isometric undersides.
- After any SVG geometry change, regenerate the PNG review artifacts with `npm run shot:terran-buildings`.
- Review `docs/design/screenshots/terran-building-grid.png` for sheet readability and the individual `terran-building-*.png` crops for part placement.

## Terran Building Recipes

| Building | Primitive recipe | Footprint |
|---|---|---:|
| Command Center | Strong octagonal HQ hull, large centered command ring, four large corner landing pads. | 4x3 |
| Supply Depot | Beveled shell, two fan circles with rotating crosses, white south light/door/bay. | 3x2 |
| Refinery | Beveled shell with three large top-facing smoke stack rings. | 4x2 |
| Barracks | Inset production block, two vertical line marks, four round landing pads at the footprint ends. | 4x3 |
| Engineering Bay | Smaller Barracks-like lab block with stronger bevels, inset hull line, oversized corner landing pads. | 4x3 |
| Bunker | Squat pillbox shell with four rectangular N/S/E/W viewport slits just inside the walls. | 3x2 |
| Academy | Main training dome, small tower dome, rear block, courtyard crescent. | 3x2 |
| Missile Turret | Square base, central rotating pivot, twin launcher rectangles. | 2x2 |
| Factory | Inset octagonal hull, two full-length horizontal split lines, center-band fan, center-band square, oversized corner landing pads. | 4x3 |
| Machine Shop | Add-on pad, upgrade gear, vent stripes, connector edge. | 2x2 add-on |
| Starport | Large centered landing circle, three center-to-center support spokes from thruster centers to pad center, two left thrusters, one right facility thruster. | 4x3 |
| Control Tower | Add-on pad, lowered upward-facing dish cup, antenna dot. | 2x2 add-on |
| Armory | Incomplete octagon: only four inset bevel-corner strokes, with four diagonal rays from the central upgrade hub to the bevel midpoints. | 3x2 |
| Science Facility | Inset lab shell, large central sphere, four endpoint thrusters. | 4x3 |
| Physics Lab | Add-on pad, pivot circle, long instrument capsule. | 2x2 add-on |
| Covert Ops | Add-on rectangle, two parallel roof bars, forward visor slit. | 2x2 add-on |
| Comsat Station | Sonar scanner: concentric scan rings, center ping, sweep arm. | 2x2 add-on |
| Nuclear Silo | Add-on hatch ring, missile core, two side clamps. | 2x2 add-on |
