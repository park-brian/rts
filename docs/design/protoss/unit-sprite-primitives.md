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
| Probe | Small fat Arbiter-like top shell with no lower nested hull, wrapped around a centered cyan worker core. | recipe locked |
| Zealot | Marine-sized skeleton: one tall oval face/head, two narrow angled leaf pauldrons, and two forward psi blades emerging from behind the pauldrons. | recipe locked |
| Dragoon | Orb walker: one central orb/shell body, four jointed legs with visible knee pivots, one plasma core. | recipe locked |
| High Templar | Zealot-family caster: tall oval face/head, smaller round pauldrons, no weapons, and two separated glowing hand orbs above the shoulders. | recipe locked |
| Dark Templar | Zealot-family stealth melee: tall oval face/head, smaller round pauldrons, and one long subtle scimitar-like warp-blade arcing inward from the right pauldron. | recipe locked |
| Archon | Large team-color aura orb with a smaller fixed blue inner core; no humanoid body. | recipe locked |
| Dark Archon | Large team-color aura orb around a fixed dark center disk/core; no body. | recipe locked |
| Reaver | Long slug shell, circular launcher head with centered white eye, center spine starting at the head edge, no feet or rollers. | recipe locked |
| Scarab | Tiny bright orb or pellet with a dark backing circle; projectile scale. | recipe locked |
| Observer | Small football/oval detector body, central white circular lens dot, two small side fins. | recipe locked |
| Shuttle | Wide smooth delta transport with top eye, raised open cargo bay, eight animated cargo dots, and three rear white thruster dots on the bottom wing. | recipe locked |
| Scout | Smooth fighter jet: one rounded curved fuselage, two medium rear delta wings, long vertical oval engines drawn under and forward of the wings, and two small rear white thruster dots. | recipe locked |
| Carrier | Largest Protoss air rig: three aligned front-to-back oval hulls; narrow center hull is visually above two close side/lower ovals whose feet touch, front bridge/core. | recipe locked |
| Interceptor | Tiny diamond dart with two side fins and a tiny center core. | recipe locked |
| Arbiter | Layered sleeker Shuttle: smaller lower delta shell behind the main body, rounded main delta shell, and a high forward caster core. | recipe locked |
| Corsair | Queen-derived trident flyer: one smooth north-facing trident hull with a compact blue engine/core at the base. | recipe locked |

## Primitive Analogues

Use these comparisons before drawing.

| Protoss unit | Simplify from | What changes |
|---|---|---|
| Probe | Spider Mine / tiny aircraft | Boomerang/crescent shell around one worker core. |
| Zealot | Marine / Firebat | Infantry footprint stays; head becomes a tall oval Protoss face; shoulder circles become narrow angled leaf pauldrons; gun/flame rectangles become psi blades. |
| Dragoon | Science Vessel / orb drone | Orb stays central; add four jointed legs as animation parts. |
| High Templar | Medic | Shoulder circles become triangular pauldrons; odd head and caster eye replace cross. |
| Dark Templar | Ghost | Shoulder circles become triangular pauldrons; odd head; rifle becomes one long warp blade. |
| Reaver | Siege Tank | Long heavy central body; cannon/barrel becomes front scarab mouth; no feet. |
| Observer | Spider Mine / tiny Science Vessel | Small detector eye with side fins. |
| Shuttle | Dropship | Cargo body becomes a wide smooth delta shell with a clear cargo-dot bay. |
| Scout | Wraith | Fighter skeleton becomes a simple smooth jet with a long fuselage and two medium rear delta wings. |
| Carrier | Battlecruiser | Capital mass stays; H-frame becomes a clean triad of aligned ovals, with the center hull layered over the two close side hulls. |
| Arbiter | Shuttle / Science Vessel | Shuttle delta language becomes sleeker, sharper, and caster-focused. |
| Corsair | Queen | Zerg trident silhouette becomes a clean Protoss flyer hull; keep the single compact base engine/core. |
