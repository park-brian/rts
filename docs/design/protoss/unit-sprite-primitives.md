# Protoss Unit Sprite Primitives

These are rig recipes, not finished illustrations. Each recipe should become a 64x64 top-down SVG with `data-anchor`, `data-visible-box`, and stable `data-part` names.

Rules:

- Literal top-down only.
- Prefer trapezoid heads/canopies, wedge shells, side pods, diamond plates, crescents, and smooth arcs.
- Keep one readable cyan psi/core part per unit.
- Do not draw legs, faces, hands, robes, underside detail, tiny plates, or lightning texture unless the part is a gameplay-scale silhouette.
- Similar units should differ by silhouette first, core/line detail second.
- Think "Terran rig with alien trapezoid armor" before thinking "abstract energy."

## Unit Recipes

| Unit | Primitive recipe | Rig status |
|---|---|---|
| Probe | Very aggressive boomerang worker: one sharp crescent shell with long pointed tips wrapped around a tiny cyan worker core. | recipe locked |
| Zealot | Marine-sized skeleton: two triangular pauldrons, one weird trapezoid helmet/head with eye at the top/front, two simple forward psi blades instead of gun/flame rectangles. | recipe locked |
| Dragoon | Orb walker: one central orb/shell body, four jointed legs with visible knee pivots, one plasma core. | recipe locked |
| High Templar | Medic-like humanoid: triangular pauldrons, trapezoid hood/head with eye at the top/front, inner hood arc, bright caster core. | recipe locked |
| Dark Templar | Ghost-like humanoid: triangular pauldrons, trapezoid hood/head with eye at the top/front, one long asymmetric warp-blade. | recipe locked |
| Archon | Large team-color aura orb with a smaller fixed blue inner core; no humanoid body. | recipe locked |
| Dark Archon | Large team-color aura orb around a fixed dark center disk/core; no body. | recipe locked |
| Reaver | Long slug shell, front launcher mouth, center spine, no feet or rollers. | recipe locked |
| Scarab | Tiny bright orb or pellet with a dark backing circle; projectile scale. | recipe locked |
| Observer | Small football/oval detector body, central lens/core, two small side fins. | recipe locked |
| Shuttle | Smooth delta transport with open cargo bay and small forward core. | recipe locked |
| Scout | Tall smooth fighter: long spline fuselage, rear-set swept wings, wing-tip cores. | recipe locked |
| Carrier | Largest Protoss air rig: three aligned front-to-back oval hulls; narrow center hull is visually above two close side/lower ovals whose feet touch, front bridge/core. | recipe locked |
| Interceptor | Tiny diamond dart with two side fins and a tiny center core. | recipe locked |
| Arbiter | Sleeker Shuttle: sharp smooth delta shell, inner stasis arc, forward caster core. | recipe locked |
| Corsair | Stubby Scout catamaran: swept integrated body, two forward engine spikes with blue tips, small low side fins, compact blue engine/core. | recipe locked |

## Primitive Analogues

Use these comparisons before drawing.

| Protoss unit | Simplify from | What changes |
|---|---|---|
| Probe | Spider Mine / tiny aircraft | Boomerang/crescent shell around one worker core. |
| Zealot | Marine / Firebat | Infantry footprint stays; side circles become triangular pauldrons; gun/flame rectangles become psi blades; helmet becomes trapezoid/weird. |
| Dragoon | Science Vessel / orb drone | Orb stays central; add four jointed legs as animation parts. |
| High Templar | Medic | Shoulder circles become triangular pauldrons; odd head and caster eye replace cross. |
| Dark Templar | Ghost | Shoulder circles become triangular pauldrons; odd head; rifle becomes one long warp blade. |
| Reaver | Siege Tank | Long heavy central body; cannon/barrel becomes front scarab mouth; no feet. |
| Observer | Spider Mine / tiny Science Vessel | Small detector eye with side fins. |
| Shuttle | Dropship | Cargo body becomes a smooth delta shell with bay. |
| Scout | Wraith | Fighter skeleton becomes a taller, smoother fuselage with wings pushed to the back. |
| Carrier | Battlecruiser | Capital mass stays; H-frame becomes a clean triad of aligned ovals, with the center hull layered over the two close side hulls. |
| Arbiter | Shuttle / Science Vessel | Shuttle delta language becomes sleeker, sharper, and caster-focused. |
| Corsair | Scout / Wraith | Scout skeleton is shortened into one swept integrated body with two forward engine spikes and small low side fins. |
