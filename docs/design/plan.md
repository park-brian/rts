# Sprite Design Plan

This is the working plan for redesigning the RTS sprites as self-authored SVG line art. The target is not detailed StarCraft fan art. The target is a pure 2D top-down silhouette language: each unit should be readable from two or three iconic parts, then rendered in our existing Tron-like sprite system.

Current implementation references:

- Runtime SVG source: `packages/app/src/art/sprites.ts`
- Three-race visual codex prototype: `packages/app/units.html`
- Atlas and team-mask pipeline: `packages/app/src/gl/atlas.ts`
- WebGL sprite renderer: `packages/app/src/gl/renderer.ts`
- Canonical roster and stats: `docs/specs/sc1-spec.md`
- Asset rules: `docs/specs/assets.md`

## 1. Design Goal

Make every Brood War unit recognizable at RTS gameplay scale using:

- A near-black filled chassis or body.
- Team-colored neon outline and a small number of team-colored internal details.
- A 64x64 SVG viewBox, centered, facing up (-Y).
- Strong pure top-down silhouettes inspired by Brood War unit roles and proportions.
- Extreme simplification: if a detail is not readable at 20-40 px on screen, it should usually be removed.

The clearest mental model:

> StarCraft silhouette, arcade readability, SVG line drawing.

Examples:

- Marine: three overlapping circles plus a gun rectangle. No full body rendering.
- Firebat: Marine standard with bigger side circles and twin flame rectangles.
- Medic: Marine standard with small side circles and a cross.
- Ghost: Marine standard with small side circles and a long gun rectangle.
- Siege Tank: two tread blocks, central turret, barrel.
- Mutalisk: wing pair, narrow body, tail.
- Zergling: jaws, longer torso, forward claw arcs.
- Hydralisk: Marine-like read with large jaws and curved side spines instead of Terran side circles.
- Dragoon: orb/shell, four legs.
- Zealot: Marine-like helmet/shoulders, two sword arcs instead of a gun.

## 2. Hard Constraints

1. Shipped art must be self-authored.
2. Downloaded StarCraft/Liquipedia images are reference-only and must not ship in the app bundle.
3. Do not trace reference images. Use them to identify iconic shapes, then reduce them into our own simple geometry.
4. Every gameplay sprite must work as SVG source first. We author the shapes directly; image generation is not part of the active pipeline.
5. Every sprite must be team-recolorable through the existing mask model unless it is a neutral/resource sprite.
6. Sprite complexity must remain low enough to hand-edit. Prefer paths, polygons, circles, and lines over dense freeform curves.

## 3. Existing Sprite Grammar

The code in `packages/app/src/art/sprites.ts` already defines the right structure:

- `panels`: dark filled body plates with neon outlines.
- `insets`: dark recessed fills, no neon.
- `lines`: pure neon line details.
- `cores`: filled neon nodes.
- `scale`: world-size multiplier.
- `color`: fixed hue for neutral non-team sprites.

Keep that structure. New sprites should be authored as `Tron` data, not as duplicated full SVG documents.

Preferred geometry:

- `polygon` for hard Terran machinery.
- `path` with simple quadratic curves for Protoss and Zerg.
- `circle` and `ellipse` for cores, eyes, vents, shield nodes.
- `line` and `polyline` for barrels, treads, spines, antennae.

Avoid:

- Tiny decorative panels.
- Complex gradients.
- Text labels.
- Photorealistic material cues.
- Many nested groups.
- Sprite-specific filters beyond the shared glow.

## 4. Race Shape Language

### Terran

Industrial, chunky, rectilinear.

- Silhouette: rectangles, cut corners, treads, barrels, pods.
- Internal lines: vents, armor splits, gun direction.
- Signature forms: machines have obvious weapon barrels; infantry have helmet/shoulder/gun triangles.
- Best primitives: `rect`, `polygon`, straight `line`, short `path`.

### Protoss

Crystalline, shielded, floating, ceremonial.

- Silhouette: diamonds, arcs, crescents, ovals, symmetrical energy forms.
- Internal lines: concentric shield arcs and center psi cores.
- Signature forms: every unit should feel like armor around an energy kernel.
- Best primitives: `circle`, `ellipse`, diamond `polygon`, smooth `path`.

### Zerg

Organic, sharp, asymmetric-but-balanced.

- Silhouette: claws, wings, carapace plates, spines, tails.
- Internal lines: veins, rib arcs, mandibles, segment splits.
- Signature forms: living shapes should still have one clean top-down outline.
- Best primitives: curved `path`, teardrop polygons, paired claws/spines.

## 5. Reference Pipeline

Reference art is for analysis and prompt grounding only.

1. Build a local reference cache under `docs/design/references/sc/`.
2. Pull one or more Liquipedia image references per unit where available.
3. Store metadata beside references:
   - unit name
   - source URL
   - date fetched
   - notes about silhouette cues
4. Do not import reference images into the game or docs intended for public asset distribution unless we have rights.
5. Use references to write a one-line silhouette breakdown per unit.
6. Translate the simplified silhouette breakdown directly into original SVG geometry.

Reference analysis checklist:

- What is the one unmistakable top-down outline?
- What two details distinguish this unit from nearby units?
- What detail must be deleted because it will not read at gameplay scale?
- What facing direction cue points toward -Y?
- Is the unit mostly round, wedge-shaped, long, wide, or winged?

## 6. Direct SVG Construction Pipeline

Image generation is no longer part of the active roadmap. It produced shapes that were too complex and too often drifted away from literal top-down reads. From here, every sprite is designed directly as a tiny SVG primitive assembly.

Output target:

- One authored `Tron` entry per unit in `packages/app/src/art/sprites.ts`.
- A 64x64 viewBox, centered, facing up.
- Literal top-down view only.
- Three to seven large primitives for most units.
- Shapes that are easy to name: circle, oval, rectangle, rounded rectangle, wedge, arc, line.
- No generated bitmap dependency.

Construction standard:

- Write the primitive recipe in the unit's `description.md`.
- Draw the smallest viable `Tron` geometry by hand.
- Inspect it at full size and at 32 px.
- Remove details until the silhouette reads from its main parts alone.
- Keep movement and attack handles as separate primitives where animation will need them.

Terran infantry standard:

- Marine: two side circles, one main helmet circle covering them, one faceplate split, one gun rectangle.
- Firebat: same standard with larger side circles and two short flame rectangles.
- Medic: same standard with smaller side circles and a cross made from two rectangles.
- Ghost: same standard with smaller side circles and a longer gun rectangle.
- SCV: square version of the standard: square cabin, two square side blocks, two V arms.
- Goliath: bigger square version of the standard: square body, two square side blocks, twin cannon rectangles.

## 7. SVG Authoring Pipeline

For each unit:

1. Read the spec row in `docs/specs/sc1-spec.md`.
2. Check the unit against Liquipedia reference images.
3. Write the silhouette sentence in this doc or a unit prompt sheet.
4. Draw a 64x64 `Tron` sprite in `packages/app/src/art/sprites.ts`.
5. Add it to the codex in `packages/app/units.html` if the codex still carries separate geometry.
6. Add a `Kind` and `SPRITE_OF` mapping when the sim unit exists.
7. Verify in the unit codex page and in-game renderer.
8. Reduce detail until it reads clearly at small sizes.

Definition of done for a sprite:

- It is recognizable at 32 px.
- It is still distinct when team-colored red, blue, yellow, purple, green, and orange.
- It faces upward in source.
- It rotates correctly in game.
- It has no shipped external IP assets.
- It uses the existing body/mask atlas path.
- It has no unnecessary geometry.

For each design sheet:

1. Keep the authored SVG sheet under `docs/design/`.
2. Keep the PNG screenshot script beside it under `docs/design/`.
3. Regenerate PNG screenshots after every geometry pass.
4. Store the full sheet, grid crop, and individual sprite crops under `docs/design/screenshots/`.
5. Review both the full contact sheet and the individual crops before treating a pass as ready for user review.

Current screenshot commands:

- Terran unit sheet: `npm run shot:terran-units`
- Terran building sheet: `npm run shot:terran-buildings`

## 8. Prompt And Design Inventory

Create a separate prompt/design sheet once this plan is in place:

- `docs/design/unit-sprite-prompts.md`

That sheet should contain one entry per unit:

- canonical unit name
- race
- role
- reference links
- silhouette sentence
- SVG authoring notes
- implementation status

Status values:

- `todo`
- `reference-found`
- `svg-drafted`
- `in-codex`
- `in-game`
- `qa-pass`

## 9. Full Unit Checklist

The checklist below intentionally includes tiny and spawned units so we do not miss gameplay pieces.

### Terran Units

| Unit | Top-down silhouette target | Status |
|---|---|---|
| SCV | squat hex worker body, side treads, front claw/arms | existing, simplify pass needed |
| Marine | three overlapping circles, faceplate split, gun rectangle | existing, simplify per note |
| Firebat | Marine standard with larger side circles and twin short flame rectangles | todo |
| Medic | rounded helmet, medical pack/halo, no weapon | todo |
| Ghost | slim helmet/cloak wedge, long rifle line | todo |
| Vulture | long hover-bike wedge, rear fins, front cannon | todo |
| Siege Tank (tank mode) | two tread blocks, central turret, forward barrel | todo |
| Siege Tank (siege mode) | braced treads, deployed side stabilizers, long cannon | todo |
| Goliath | square body, square side blocks, twin cannon rectangles | todo |
| Wraith | narrow fighter body, swept wings, tail prongs | existing, simplify pass needed |
| Dropship | boxy transport fuselage, side pods, rear ramp shape | todo |
| Science Vessel | round sensor hull, side pods, detector dish/core | todo |
| Valkyrie | wide missile frigate, multiple side launch pods | todo |
| Battlecruiser | huge long capital hull, broad shoulders, nose bridge | todo |
| Spider Mine | small triangular mine, three prongs, central light | todo |
| Nuclear Missile | long missile silhouette, fins, warning core | todo |

### Protoss Units

| Unit | Top-down silhouette target | Status |
|---|---|---|
| Probe | small diamond drone, orbit nodes, center core | codex draft |
| Zealot | armored torso, two psi-blade arcs | codex draft |
| Dragoon | rounded walker shell, four legs, central core | codex draft |
| High Templar | robed small caster shape, large psi halo | todo |
| Dark Templar | angular cloaked body, single warp blade crescent | todo |
| Archon | large energy sphere/body, twin arm flares | todo |
| Dark Archon | darker energy sphere/body, crescent shell arcs | todo |
| Reaver | heavy beetle/robot shell, rear body, scarab mouth | todo |
| Scarab | tiny glowing orb/projectile | todo |
| Observer | tiny cloaked eye/drone, lens core, side fins | todo |
| Shuttle | oval transport body, two side nacelles | todo |
| Scout | fighter body, curved wings, center cockpit | codex draft |
| Carrier | large crescent capital hull, interceptor bays | todo |
| Interceptor | tiny diamond fighter, single core | todo |
| Arbiter | round crescent saucer, stasis core, cloak aura shape | todo |
| Corsair | thin crescent fighter, split wing tips | todo |

### Zerg Units

| Unit | Top-down silhouette target | Status |
|---|---|---|
| Larva | small curled grub, head dot, segmented body | todo |
| Egg | oval cocoon, vein seams, glowing slit | todo |
| Drone | beetle worker body, small mandibles, rear abdomen | codex draft |
| Overlord | large floating sac, eye nodes, tentacles | codex draft |
| Zergling | small clawed beast, head, scythe forelimbs | codex draft, simplify pass needed |
| Hydralisk | Marine-like read with large jaws and curved side spines | codex draft |
| Lurker | buried low spined body, long lateral spikes | todo |
| Mutalisk | bat wings, narrow body, tail | codex draft |
| Scourge | tiny winged suicide body, split tail | todo |
| Guardian | heavy flying crab, wide wings, long abdomen | todo |
| Devourer | bulky flying carapace, maw/front horn, wings | todo |
| Queen | floating insect body, long tail, side wings | todo |
| Defiler | current Sunken Colony-style spined body, flipped around, caster core | todo |
| Ultralisk | massive horned body, huge tusks/scythes | todo |
| Infested Terran | small humanoid blob, swollen explosive core | todo |
| Broodling | tiny clawed creature, simpler than zergling | todo |

## 10. Building Checklist

The immediate request is units, but the game will need buildings in the same language. Track these here so the art direction does not diverge.

### Terran Buildings

Command Center, Supply Depot, Refinery, Barracks, Engineering Bay, Bunker, Academy, Missile Turret, Factory, Machine Shop, Starport, Control Tower, Armory, Science Facility, Physics Lab, Covert Ops, Comsat Station, Nuclear Silo.

Current design artifacts:

- Primitive notes: `docs/design/terran-building-primitives.md`
- SVG review sheet: `docs/design/terran-building-sprite-sheet.html`
- PNG workflow: `npm run shot:terran-buildings`
- PNG output: `docs/design/screenshots/terran-building-*.png`

### Protoss Buildings

Nexus, Pylon, Assimilator, Gateway, Forge, Photon Cannon, Cybernetics Core, Shield Battery, Robotics Facility, Stargate, Citadel of Adun, Templar Archives, Robotics Support Bay, Observatory, Fleet Beacon, Arbiter Tribunal.

### Zerg Buildings

Hatchery, Lair, Hive, Creep Colony, Sunken Colony, Spore Colony, Spawning Pool, Evolution Chamber, Hydralisk Den, Extractor, Spire, Greater Spire, Queen's Nest, Nydus Canal, Ultralisk Cavern, Defiler Mound.

## 11. Scale Rules

Sprites are drawn once in a canonical 64x64 rig space. Never scale or rewrite the SVG coordinates to express game size. Scale belongs outside the SVG: the renderer places the canonical sprite into a world footprint derived from sim radius.

Relative part relationships must be preserved inside the rig. Animated parts should move from their own parent/local anchors, not from the sprite center unless the whole unit is rotating.

Suggested starting scale bands:

- Tiny spawned units: `1.15-1.35`
- Infantry/small ground: `1.55-1.8`
- Medium ground: `1.6-1.9`
- Large vehicles/monsters: `1.4-1.7`
- Air fighters: `1.45-1.75`
- Capital air: `1.8-2.2`
- Structures/resources: `1.0`

Scale is a renderer/readability control, not a lore-size control and not a geometry edit. If the silhouette reads better slightly oversized, adjust the renderer/display multiplier or simplify the local silhouette; do not multiply the SVG points.

## 12. QA Plan

Visual QA should happen in three contexts:

1. `packages/app/units.html`
   - full-size inspection
   - six-team recolor strip
   - race grouping consistency
2. In-game renderer
   - rotation
   - fog visibility
   - selection rings and HP bars
   - team color mask behavior
3. Mobile viewport
   - smallest practical gameplay size
   - dense unit clusters
   - red/blue/yellow team readability

Minimum checks:

- No sprite becomes an unreadable glowing blob.
- No sprite relies on a detail thinner than the stroke width.
- Similar units differ by silhouette, not just internal lines.
- Caster units have distinct silhouettes even without spell effects.
- Tiny spawned units remain visible without being confused for particles.

## 13. Implementation Order

Recommended order:

1. Freeze the primitive sprite grammar.
2. Create `docs/design/unit-sprite-primitives.md`.
3. Fill primitive recipes for the entire unit checklist.
4. Redraw SCV and Marine using the simplified language.
5. Add Firebat, Medic, Ghost.
6. Do Terran vehicles and air.
7. Port the simpler codex Protoss/Zerg drafts into `sprites.ts` once their sim `Kind`s exist.
8. QA each race as a full sheet before implementing combat effects.

## 14. Open Decisions

- Whether `units.html` should import from `sprites.ts` to avoid maintaining two geometry copies.
- Whether each unit gets one static SVG or a small set of animation frames.
- Whether siege mode, burrowed lurker, cloaked units, hallucinations, and loaded transports need separate sprite states.
- Whether spell effects should be separate SVG/particle assets or pure procedural renderer effects.
- Whether buildings should be drawn in the same pass immediately after units or after the full unit roster is complete.

## 15. Immediate Next Actions

1. Create `docs/design/unit-sprite-primitives.md`.
2. Add one primitive recipe per unit in the checklist.
3. Start with Terran infantry because they define the simplicity threshold.
4. Update the Marine sprite to the reduced standard: side circles, helmet circle, faceplate split, gun rectangle.
5. Update SCV, Firebat, Medic, Ghost, and Goliath against the same standard.
