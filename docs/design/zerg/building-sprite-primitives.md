# Zerg Building Sprite Primitives

This is the design sheet for hand-authored Zerg building SVG rigs. Buildings use the same rigging contract as units plus `data-footprint` for build placement. Footprints below come from `../../specs/bwapi-unit-dimensions.md`.

Rules:

- Literal top-down footprint first.
- Zerg structures are living mounds and organs: sacs, mouths, mandibles, roots, spines, vents, tendrils, horns, and carapace shells.
- Each structure should have one strong mound/sac silhouette plus one gameplay identity feature.
- Morph families should share visible ancestry: Hatchery -> Lair -> Hive; Creep Colony -> Sunken/Spore; Spire -> Greater Spire.
- Keep the top-down abstraction symmetrical unless a gameplay state requires otherwise: paired horns, paired roots, paired sacs, paired spikes.
- Do not draw many legs, teeth rows, texture, height, slime noise, walls, or perspective undersides.
- Most structures should still have a mouth, mandible, or horned front so they feel Zerg before any surface detail.

## Building Recipes

| Building | Primitive recipe | Footprint |
|---|---|---:|
| Hatchery | Low brood mound, front mandible roots, larva sacs, central brood core. | 4x3 |
| Lair | Hatchery mound plus taller jaw crown, side horn arcs, deeper core. | 4x3 |
| Hive | Largest mound, huge crown mandibles/horns, multiple brood sacs, heavy core. | 4x3 |
| Creep Colony | Small rooted mound, central stalk/core, two front mandible roots. | 2x2 |
| Sunken Colony | Creep base with one tall attack spine, side mandible roots, rear brace. | 2x2 |
| Spore Colony | Creep base with bulb cap, spore pod ring, horn/antenna dots. | 2x2 |
| Spawning Pool | Low oval mouth-pool, dark inner pit, rim mandibles/teeth as large shapes only. | 3x2 |
| Evolution Chamber | Round mutation sac, three lobe nodes, front mouth slit, rib seams. | 3x2 |
| Hydralisk Den | Jaw-shaped mound, two big side mandibles/spine arcs, central den mouth. | 3x2 |
| Extractor | Living gas ring over vent, horned side clamps, three gripping tendrils, gas sac. | 4x2 |
| Spire | Tall organic spire core, wing/shell arcs, root mandibles around base. | 2x2 |
| Greater Spire | Spire plus larger crown wings/mandibles and heavier central sac. | 2x2 |
| Queen's Nest | Rounded nest bowl, front mandible fan, egg sacs, side wing-like plates. | 3x2 |
| Nydus Canal | Large open mouth/tunnel ring, mandible braces, dark throat. | 2x2 |
| Ultralisk Cavern | Massive horned cavern mouth, huge tusk arcs, heavy body mound. | 3x2 |
| Defiler Mound | Low caster mound, curved mandible/spine tail motif, small caster core. | 4x2 |
