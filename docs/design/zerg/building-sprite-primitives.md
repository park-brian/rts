# Zerg Building Sprite Primitives

This is the design sheet for hand-authored Zerg building SVG rigs. Buildings use the same rigging contract as units plus `data-footprint` for build placement. Footprints below come from `../../specs/bwapi-unit-dimensions.md`.

Rules:

- Literal top-down footprint first.
- Building footprints stay in `data-footprint` metadata; the final preview does not render the development footprint guide.
- Start each structure from its largest biological hull, then add smaller identity parts. As a rule of thumb, use about 90-95% of footprint width for the main mass and 80-90% of footprint height, leaving stroke/glow clearance inside the guide.
- Aura geometry is explicit and exposed-only: draw short `aura` edge paths where a black eye, triangle, or mound protrudes from the parent hull instead of glowing the buried full shape.
- Zerg structures are living mounds and organs: sacs, mouths, mandibles, roots, spines, vents, tendrils, horns, and carapace shells.
- Each structure should have one strong mound/sac silhouette plus one gameplay identity feature.
- Morph families should share visible ancestry: Hatchery -> Lair -> Hive; Creep Colony -> Sunken/Spore; Spire -> Greater Spire.
- Keep the top-down abstraction symmetrical unless a gameplay state requires otherwise: paired horns, paired roots, paired sacs, paired spikes.
- Do not draw many legs, teeth rows, texture, height, slime noise, walls, or perspective undersides.
- Most structures should still have a mouth, mandible, or horned front so they feel Zerg before any surface detail.

## Building Recipes

| Building | Primitive recipe | Footprint |
|---|---|---:|
| Hatchery | Low brood mound, front mandible roots, small centered delta mound and core. | 4x3 |
| Lair | Hatchery base and centered mound over an inverted delta-mound spine layer. | 4x3 |
| Hive | Hatchery base and centered mound over four narrow footprint-reaching spine wedges. | 4x3 |
| Creep Colony | Small rooted mound, central stalk/core with exposed cap aura, two front mandible roots. | 2x2 |
| Sunken Colony | Creep base with one tall attack spine, side mandible roots, rear brace. | 2x2 |
| Spore Colony | Creep base with bulb cap, spore pod ring, horn/antenna dots. | 2x2 |
| Spawning Pool | Low oval mouth-pool, dark inner pit, rim mandibles/teeth as large shapes only. | 3x2 |
| Evolution Chamber | Horizontal mutation sac, central eye dot, three equidistant smaller nodes, top node backed by a black eye circle. | 3x2 |
| Hydralisk Den | Spawning Pool-style oval hull, two side spine arcs, triangular ranged eye with exposed cap aura. | 3x2 |
| Extractor | Simplified living gas ring over vent, horned side clamps, central gas sac; no bottom tendril line. | 4x2 |
| Spire | Eiffel-tower triangular stalk with a black top eye, exposed eye aura, and bright center dot. | 2x2 |
| Greater Spire | Larger triangular stalk with a bigger main top eye and smaller side eyes underneath, using one exposed cluster-outline aura. | 2x2 |
| Queen's Nest | Footprint-filling oval, central eye dot, four short diagonal midpoint spokes. | 3x2 |
| Nydus Canal | Large open mouth/tunnel ring, mandible braces, dark throat. | 2x2 |
| Ultralisk Cavern | Heavy body mound over two front tusks, massive black eye with centered bright dot. | 3x2 |
| Defiler Mound | Low caster mound with one vertical caster slit. | 4x2 |
