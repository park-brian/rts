# Zerg Unit Rig Design

This folder is for Zerg unit rigs: original hand-authored SVG primitives in the same 64x64 contract as the Terran sheet, but with a separate organic shape language.

The output is rig design, not finished game wiring:

- `viewBox="0 0 64 64"` and source facing up.
- `data-anchor` is the logical rotation/placement pivot.
- `data-visible-box` records visible ink bounds for renderer fitting.
- `data-part` names are stable animation handles.
- Geometry remains canonical; gameplay radius and render scale live outside the SVG.

## Design Language

Zerg units should read as mandible-first living silhouettes:

- Carapace plates, mandibles, jaws, claws, tusks, wing claws, tails, spikes, and sacs.
- Curves and tapered bodies rather than Terran rectangles or Protoss rings.
- Bilateral symmetry is the default in this abstract top-down view: left/right mandibles, claws, tusks, wings, and spikes should usually mirror each other.
- One or two large biological tells per unit; no texture fields.

Avoid many legs, teeth rows, vein texture, underside detail, slime/noise, and tiny repeated spines. When in doubt, simplify toward head/mandibles/body rather than wing veins or surface texture.

## Local Files

- `unit-sprite-primitives.md` - locked or draft primitive recipes for each Zerg unit.
- `zerg-animation-parts.md` - planned part handles and animation/emission roles.
- `building-sprite-primitives.md` - primitive recipes and footprints for Zerg structures.
- `zerg-building-animation-parts.md` - planned structure part handles and state roles.
- `zerg-building-sprite-sheet.html` - building rig preview sheet.
- `shot-zerg-building-sprite-sheet.mjs` - Playwright screenshot capture for the building sheet.

Shared contracts remain in:

- `../sprite-rigging-contract.md`
- `../plan.md`
- `../references/sc/zerg/unit/*/description.md`

## Workflow

1. Read the unit's reference description under `../references/sc/zerg/unit/`.
2. Reduce it to jaws, claws, wings, sac, tail, or spine parts that can animate cleanly.
3. Author the rig in a future `zerg-sprite-sheet.html` with metadata on every animated part.
4. Screenshot the sheet with a Playwright `.mjs` capture script, mirroring `../shot-terran-sprite-sheet.mjs`.
5. Port stable rigs into `packages/app/src/art/sprites.ts` as `Tron` data only when they are ready for the atlas.

For buildings, follow the same workflow but include `data-footprint` on every root SVG. The footprint is placement metadata; it must not change canonical rig coordinates.

Building footprints come from `../../specs/bwapi-unit-dimensions.md`; use that local spec as the source of truth for `data-footprint`.
