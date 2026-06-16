# Protoss Unit Rig Design

This folder is for Protoss unit rigs: original hand-authored SVG primitives in the same 64x64 contract as the Terran sheet, but with a separate Protoss shape language.

The output is not finished game wiring yet. Treat every sprite here as a small rig:

- `viewBox="0 0 64 64"` and source facing up.
- `data-anchor` is the logical rotation/placement pivot.
- `data-visible-box` records visible ink bounds for renderer fitting.
- `data-part` names are stable animation handles.
- Geometry remains canonical; gameplay radius and render scale live outside the SVG.

## Design Language

Protoss units should read like Terran rigs rebuilt by aliens: still readable as cabins, helmets, shoulders, pads, wings, and towers, but with trapezoid armor, red/gold plates, and cyan energy cores.

- Trapezoid heads/canopies, wedge bodies, side pods, and smooth gold armor plates.
- Cyan psi/core inserts as named rig parts, not decorative glow fields.
- Fewer, larger parts than Terran, but still puppet-like: shoulders, blades, bays, prongs, legs.
- Symmetry by default, with controlled asymmetry only for units like Dark Templar or Arbiter.

Avoid tiny gold plate detail, character anatomy, perspective underside, and decorative lightning clutter. Do not make Protoss a pure ring-and-orb language; most references are armored machines or armored humanoids with odd trapezoid heads.

## Local Files

- `unit-sprite-primitives.md` - locked or draft primitive recipes for each Protoss unit.
- `protoss-animation-parts.md` - planned part handles and animation/emission roles.
- `building-sprite-primitives.md` - primitive recipes and footprints for Protoss structures.
- `protoss-building-animation-parts.md` - planned structure part handles and state roles.
- `protoss-building-sprite-sheet.html` - building rig preview sheet.
- `shot-protoss-building-sprite-sheet.mjs` - Playwright screenshot capture for the building sheet.

Shared contracts remain in:

- `../sprite-rigging-contract.md`
- `../plan.md`
- `../references/sc/protoss/unit/*/description.md`

## Workflow

1. Read the unit's reference description under `../references/sc/protoss/unit/`.
2. Reduce it to two or three iconic rig parts.
3. Author the rig in a future `protoss-sprite-sheet.html` with metadata on every animated part.
4. Screenshot the sheet with a Playwright `.mjs` capture script, mirroring `../shot-terran-sprite-sheet.mjs`.
5. Port stable rigs into `packages/app/src/art/sprites.ts` as `Tron` data only when they are ready for the atlas.

For buildings, follow the same workflow but include `data-footprint` on every root SVG. The footprint is placement metadata; it must not change canonical rig coordinates.

Building footprints come from `../../specs/bwapi-unit-dimensions.md`; use that local spec as the source of truth for `data-footprint`.
