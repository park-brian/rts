# Terran Unit Radius Notes

This table records radius metadata for the hand-authored Terran sprite sheet. It is not SVG geometry. Exact values come from `packages/sim/src/data.ts`; provisional values are design placeholders until the missing units are added to sim data.

| Unit | SC1 size class | Recorded radius | Source |
|---|---:|---:|---|
| SCV | Small | 8 px | exact sim `fx(8)` |
| Marine | Small | 8 px | exact sim `fx(8)` |
| Firebat | Small | 8 px | provisional Small unit radius |
| Medic | Small | 8 px | provisional Small unit radius |
| Ghost | Medium | 10 px | provisional Medium unit radius |
| Vulture | Small | 8 px | provisional Small unit radius |
| Siege Tank | Large | 14 px | provisional Large ground radius |
| Siege Tank (Siege Mode) | Large | 14 px | same base radius as tank mode |
| Goliath | Large | 14 px | provisional Large ground radius |
| Wraith | Large | 12 px | provisional air-fighter radius |
| Dropship | Large | 14 px | provisional transport radius |
| Science Vessel | Large | 14 px | provisional caster-air radius |
| Valkyrie | Large | 14 px | provisional heavy-air radius |
| Battlecruiser | Large | 20 px | provisional capital-air radius |
| Spider Mine | Small | 6 px | provisional tiny ground radius |
| Nuclear Missile | n/a | n/a | projectile/effect, not a collision unit |

Notes:

- Keep sprite geometry in the canonical 64x64 viewBox. Never multiply or rewrite SVG coordinates to represent these radii.
- These radii are for collision, selection, and renderer placement.
- The renderer should combine radius with `data-visible-box` to scale the visible ink area, not the full 64x64 canvas.
- Do not use these provisional numbers as final Brood War-size proof. Replace them when the full sim data table lands.
- Siege mode should retain the tank-mode radius unless gameplay explicitly requires a deployed collision change.
