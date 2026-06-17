# Sprite Rigging And Scale Contract

This is the contract for hand-authored SVG sprites.

This document is intentionally about renderer-facing SVG metadata, not only art
style. Human comments help us review the rigs, but the exporter strips comments
before writing `packages/app/src/art/generated-sprites.ts`; anything the runtime
must eventually consume belongs in `data-*` attributes.

## Hard Rule

Never scale the SVG geometry itself to represent unit size.

Every unit sprite stays in a canonical 64x64 local coordinate system. The points, circles, rectangles, and paths describe the rig and silhouette only. Gameplay size is applied outside the SVG by the renderer or preview surface.

## What Scaling Means

There are three separate concepts:

| Concept | Stored where | Changes SVG coordinates? |
|---|---|---:|
| Local rig geometry | `terran-sprite-sheet.html` / eventual sprite definitions | No |
| Gameplay radius/collision/selection | sim data or `terran-unit-radius.md` while provisional | No |
| Render footprint / preview size | renderer, preview card, or future scale sheet | No |
| Visible ink bounds | `data-visible-box` on the canonical sprite | No |

The renderer should instantiate a canonical 64x64 sprite into a world-size slot derived from gameplay radius. That preserves relative relationships while allowing a Battlecruiser to display larger than a Marine.

Current renderer status:

- `docs/design/export-app-sprites.mjs` preserves SVG inner elements, classes, and part-level `data-*` attributes, but removes comments and local `<style>` blocks.
- Root placement metadata is emitted into `GENERATED_SVG_SPRITE_META` and attached to `SPRITES[key].meta`.
- `packages/app/src/art/placement.ts` reads `data-anchor`, `data-visible-box`, `data-footprint`, and `data-scale-role` from that metadata and caches the world-space placement for each kind.
- `packages/app/src/gl/renderer.ts` rasterizes every generated SVG into a square atlas cell, but sizes and offsets each world quad from the cached placement instead of assuming the whole 64x64 cell is visible art.
- `packages/app/src/render2d.ts` uses the same placement dimensions for its primitive fallback, so no renderer path silently changes building occupancy.
- Part animation and effect hooks are still future work; muzzle/thruster/spell origins should use `data-part`, `data-origin`, `data-emits`, and `data-emission-dir` when that pass begins.

## Rig Anchors

`data-anchor` is the root anchor for the whole sprite. It should be the logical point of rotation:

- Infantry: helmet/head center.
- Vehicles: turret or chassis center.
- Aircraft: fuselage center.
- Round/caster units: circle center.
- Projectiles: body center or travel pivot.

Animated parts should not move around the root center by default. They should move relative to their own logical rest point or parent part.

Use these metadata fields as the rig becomes more formal:

- `data-anchor`: root anchor for placement and rotation, formatted `x y`.
- `data-visible-box`: authored fit box, formatted `x y w h`. For units this
  is visible ink bounds; for buildings this is the invisible base guide that maps
  to `data-footprint`.
- `data-footprint`: build-tile footprint for structures, formatted `w h`.
- `data-forward`: local forward vector. Units face `0 -1` in source.
- `data-bwapi-pixel-bounds`: reference sprite dimensions from `docs/specs/bwapi-unit-dimensions.md`; exported for audit, not used as the top-down footprint.
- `data-part`: stable animation target name.
- `data-parent`: parent part or `root`.
- `data-origin`: local part pivot/reference point in `x y`.
- `data-rest`: local rest reference point in `x y` when different from `data-origin`.
- `data-anim`: intended animation role.
- `data-emits`: projectile/effect type emitted by this part.
- `data-emission-dir`: local emission direction before unit rotation.
- `data-slide-dir`: local deploy/retract direction for sliding parts.

## Parent-Space Animation Examples

Marine:

- Root anchor: helmet center.
- Side circles move relative to their own circle centers for walk/run.
- Firing stance offsets side circles relative to the helmet/weapon hold, not relative to the entire 64x64 viewBox.
- Gun recoil moves relative to the gun mount/side-circle relationship.

Tank:

- Chassis/treads are root-relative.
- Turret and barrel rotate/recoil relative to turret center.
- Siege supports slide from their own rest positions under the body.

Dropship:

- Body is root-relative.
- Cargo dots are state lights in body space; they do not affect scale.
- Thrusters glow from their own rear positions.

Battlecruiser:

- Wings are rigid body parts.
- Rear lasers emit from their own long edge weapons.
- Yamato cannon charges from the square front block.
- Thruster cores glow from the rear core.

## Safe Scaling Workflow

1. Keep the SVG viewBox and primitive coordinates unchanged.
2. Record gameplay radius separately.
3. Record visible ink bounds as `data-visible-box`.
4. Fit the canonical SVG into the target world footprint from that visible box.
5. Preview two sheets:
   - Rig sheet: all sprites shown at equal canvas size for shape review.
   - Scale sheet: the same canonical sprites drawn into world-size slots.
6. If a scaled sprite reads poorly, adjust a display multiplier or simplify the local silhouette. Do not multiply the SVG coordinates.

## Renderer Formula

Given:

- `anchor = [ax, ay]` from `data-anchor`
- `box = [x, y, w, h]` from `data-visible-box`
- `targetDiameter = unitRadius * 2 * displayScale`

Use a uniform render scale:

```text
fitRadius = max distance from anchor to the four visible-box corners
renderScale = gameplayRadius / fitRadius
worldPoint = unitWorldPosition + rotate((localPoint - anchor) * renderScale, unitFacing)
```

This is the circle-covering-the-silhouette rule: the whole `data-visible-box`,
including diagonal corners, must fit inside the gameplay radius circle around the
anchor. Selection and collision still use gameplay radius; they should not shrink
to half the post-scale box width.

The visible box determines scale only. The root anchor determines placement and
rotation. These can differ: a rifle, barrel, wing, or thruster may extend the
visible box without moving the logical unit center. If a future renderer needs
exact path bounds, compute the same radius from geometry at export time and emit
it as metadata; runtime should keep using one cached placement record per kind.

## Building Placement

Buildings keep the same 64x64 local rig, but add `data-footprint`.

For buildings, `data-footprint` is placement metadata and the footprint-sized
world slot is the intended final scale source. `data-visible-box` is the local
invisible base guide that maps to that slot. It is not a promise that all SVG
ink is inside the base. Stylized art may overhang or sit inside the base as long
as the base stays centered and exact. BWAPI pixel bounds and L/U/R/D dimensions
are kept as reference metadata only; they describe original Brood War sprites
and should not drive our top-down SVG shell geometry.

Runtime formula:

```text
slotW = footprintW * TILE
slotH = footprintH * TILE
base = visibleBox
renderScale = min(slotW / base.w, slotH / base.h)
quadW = 64 * renderScale
quadH = 64 * renderScale
baseCenter = [base.x + base.w / 2, base.y + base.h / 2]
stampedCenterOffset.x = footprintW is even ? -TILE / 2 : 0
stampedCenterOffset.y = footprintH is even ? -TILE / 2 : 0
quadCenter = entityWorldPosition + stampedCenterOffset + rotate(([32, 32] - baseCenter) * renderScale, facing)
```

Buildings must map the invisible base to the same tile rectangle stamped by
`structureFootprint()`. `entityWorldPosition` is a tile-center handle. For even
footprint axes, the stamped footprint center is one half tile up/left of that
handle; for odd axes, it is aligned with the handle. If a local base has an odd
width or height and therefore centers on a half-coordinate, the renderer also
offsets the quad so the local base center lands on the stamped footprint center.
For example:

| Sprite | Footprint | Local base box | Stamped bounds relative to entity |
|---|---:|---:|---:|
| Pylon | 2x2 | 19 19 26 26 | x -48..16, y -48..16 |
| Supply Depot | 3x2 | 13 19 39 26 | x -48..48, y -48..16 |
| Command Center / Nexus | 4x3 | 6 13 52 39 | x -80..48, y -48..48 |
| Refinery / Extractor / Assimilator | 4x2 | 6 19 52 26 | x -80..48, y -48..16 |

The Command Center's authored lift pads are larger than the invisible base in
the SVG; that is an art decision, not placement metadata. The base itself is the
`4*32 by 3*32` rectangle from `data-footprint` and remains centered under the
entity.

`packages/app/test/sprite-placement.test.ts` enforces the exact centered base for
every generated building sprite whose metadata declares
`data-scale-role="building-footprint"`.

Gas structures still use the same rule: the geyser placement footprint is the
source of the world slot, while the visible gas-building rig determines how the
SVG fits inside it.

## Z-Order And Effects

SVG document order is the z-order. Put underneath/support/shadow/weapon-origin
parts first, then body panels, then bright cores and state lights last.

Emission vectors are local-space before unit rotation:

- Forward fire, spell launches, claws, jaws, spines: `data-emission-dir="0 -1"`.
- Rear thrusters and exhaust: `data-emission-dir="0 1"`.
- Radial explosions or auras should use the part anchor/origin and omit a
  direction unless an effect system requires one.

Every animated or emitting primitive needs a stable `data-part`, even if the
current renderer cannot yet animate it. Future animation code should target
parts by `data-part`, not by tag order or coordinates.
