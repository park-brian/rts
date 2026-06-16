# Unit Sprite Primitives

This is the active design sheet for hand-authored SVG sprites. Image generation is out of the loop. Each unit gets a tiny recipe made from literal top-down shapes that can be written directly into `packages/app/src/art/sprites.ts`.

Rules:

- Literal top-down only.
- Use the fewest large shapes that identify the unit.
- Prefer circles, ovals, rectangles, rounded rectangles, wedges, arcs, and straight lines.
- Do not draw hidden body mass, undersides, legs, boots, hands, cables, vents, bolts, panels, texture, or shadows.
- Weapons must touch the shapes that hold them.
- Similar units should differ by primitive proportions, not surface decoration.

## Terran Unit Recipes

| Unit | Primitive recipe | Status |
|---|---|---|
| SCV | Square cabin/head, two square side blocks, two V-angled rectangular arms. | recipe locked |
| Marine | Two side circles, one main helmet circle covering them, one faceplate split, one gun rectangle. | SVG drafted |
| Firebat | Marine standard with larger side circles, two short held flame rectangles, no flame effect. | recipe locked |
| Medic | Marine standard with smaller side circles, visor, cross from two rectangles on the back half of the helmet, no weapon. | recipe locked |
| Ghost | Marine standard with smaller side circles and one longer held gun rectangle. | recipe locked |
| Vulture | Two narrow forward triangles split down the middle, longer rear rectangular body, two slightly wider rear thrusters tucked close to the body. | recipe locked |
| Siege Tank | Two tread rectangles, central hull rectangle, turret rectangle/circle, one barrel rectangle. | recipe locked |
| Siege Tank (Siege Mode) | Exact Tank base, longer barrel rectangle, two identically sized support rectangles under the body. | recipe locked |
| Goliath | Square body, two larger square side blocks, two long held cannon rectangles. | recipe locked |
| Wraith | Single rectangular body with a trapezoid head, two trapezoid wings forming a W-like silhouette, small forward laser rectangles underneath the wings/body, small front laser, rear engine rectangles. | recipe locked |
| Dropship | Wide cargo box, beveled front, integrated rear-jutting thruster rectangles, center cargo dots that light up as storage is used. | recipe locked |
| Science Vessel | Outer circle, three wedge blades, three small circles between wedges. | recipe locked |
| Valkyrie | Slimmer box body with front bevels ending lower than Dropship, two larger bottom-aligned winglets at the outer wing ends, and two squat wide centered rear thrusters close together. | recipe locked |
| Battlecruiser | H/hammerhead shape: smaller front pair of sideways trapezoid wings, narrow middle, larger rear pair of sideways trapezoid wings, square Yamato cannon with bridge aligned to the front-wing bottom edge, two very long lasers at the rear wingtip edges, two rear thruster cores. | recipe locked |
| Spider Mine | Small circle with simple legs and center dot. | needs final SVG |
| Nuclear Missile | Long missile rectangle/capsule, pointed nose, small fin triangles. | needs final SVG |
