# Zerg Unit Sprite Primitives

These are rig recipes, not finished illustrations. Each recipe should become a 64x64 top-down SVG with `data-anchor`, `data-visible-box`, and stable `data-part` names.

Rules:

- Literal top-down only.
- Prefer tapered paths, teardrops, mandibles, jaw wedges, claw arcs, wing membranes, tusks, spines, and sac ovals.
- Use the fewest large biological parts that identify the unit.
- Keep Zerg abstractly symmetrical: paired mandibles, paired claws, paired side spikes, paired wings.
- Do not draw many legs, feet, teeth rows, surface texture, underside detail, shadows, or decorative slime.
- Similar units should differ by silhouette, not just core placement.
- Most Zerg rigs should expose a front mouth/mandible/tusk cue, even if the unit is airborne or caster-like.

## Unit Recipes

| Unit | Primitive recipe | Rig status |
|---|---|---|
| Larva | Tiny Scourge-like body with two antennae and a small head dot. | recipe locked |
| Egg | Small oval cocoon. | recipe locked |
| Drone | Flat organic leaf body with two soft side leaflets behind it, animated forward-facing grab jaws, small head core. | recipe locked |
| Overlord | Mathematically centered round sac, two mirrored horn/mandible tusks, three tentacle strokes, central eye/core, eight white storage marker dots on a true radius. | recipe locked |
| Zergling | Narrow smooth hull body with an equilateral triangle head, one centered eye spot, two split right-triangle jaw halves under the head with a center gap, and simple triangle limbs. | recipe locked |
| Hydralisk | Centered Zergling-style equilateral triangle head with a small centered eye and two mini Ultra-style upward fangs. | recipe locked |
| Lurker | Mathematically perfect circle body with a central eye, Zergling-style triangle mandibles tucked under the top, and four long spiked triangle limbs. | recipe locked |
| Mutalisk | Two mirrored spiky bat wing membranes, narrow body, visible head mandibles, tail/stinger stroke. | recipe locked |
| Scourge | Tiny winged dart with a small eye; no Mutalisk tail or extra top arc. | recipe locked |
| Guardian | Wide smooth manta body with two forward mandibles around the front wing and a central head/core. | recipe locked |
| Devourer | Slim armored shell, large front maw/core, mini Ultra-style fangs, larger delta wings, and a center ridge starting below the eye spot. | recipe locked |
| Queen | Literal north-facing trident with three prongs, smooth joins, stubby base, and caster core in the base. | recipe locked |
| Defiler | Thin long vertical scorpion-like caster: two aggressive front pincers, narrow body, rear tail starting at the body end, small caster core. | recipe locked |
| Ultralisk | Wide smooth hull body with four bigger stubby triangle legs and two massive upward front tusks. | recipe locked |
| Infested Terran | Terran Marine silhouette with rifle, helmet, pauldrons, and a purple infection dot instead of a visor. | recipe locked |
| Broodling | Mini-Zergling: slim smooth hull body, small triangle head, front triangle limbs only, no mandibles. | recipe locked |

## Primitive Analogues

Use these comparisons before drawing. Zerg analogues translate the same gameplay read into head/mandibles/body first.

| Zerg unit | Simplify from | What changes |
|---|---|---|
| Drone | SCV | Worker body becomes a flat leaf shell; side blocks become soft organic leaflets; arms become animated forward grab jaws. |
| Zergling | Zealot / Firebat | Infantry mass becomes a narrow smooth hull body; head becomes an equilateral triangle; front limbs rake upward; mandibles become two separated right-triangle halves under the head. |
| Hydralisk | Marine | Helmet becomes centered Zergling-style triangle head; arms are replaced by scaled-down Ultra-style fangs. |
| Lurker | Spider / Siege Tank | Low siege body becomes a centered circle; side spines become four long triangle limb plates; front gets fang strokes. |
| Mutalisk | Wraith | Fighter skeleton; wings become bat membranes; nose gets mandibles. |
| Scourge | Interceptor | Tiny dart; nose gets mandibles, eye is small, and tail is removed. |
| Guardian | Drone / heavy air | Drone air grammar smooths into a wide manta silhouette with no separate triangle body. |
| Devourer | Battlecruiser / heavy air | Large mass gets mini Ultra-style fangs, central ridge, larger delta wings, and front maw/core. |
| Queen | Science Vessel / caster air | Caster core sits in the stubby base; body becomes a literal north-facing trident. |
| Defiler | High Templar / caster | Small caster body becomes a long vertical scorpion with aggressive front pincers and a curled spell tail. |
| Ultralisk | Siege Tank / melee brute | Vehicle-like bulk becomes a wide smooth hull with four legs and oversized tusks that sweep upward/front. |
| Infested Terran | Marine | Copy the Marine rig language; replace the visor with an infection dot. |
| Broodling | Zergling | Same smooth-hull/head grammar, reduced with rear legs and mandibles removed. |
