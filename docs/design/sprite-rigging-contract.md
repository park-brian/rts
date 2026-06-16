# Sprite Rigging And Scale Contract

This is the contract for hand-authored SVG sprites.

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
- `data-visible-box`: authored visible ink bounds, formatted `x y w h`.
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
renderScale = targetDiameter / max(w, h)
worldPoint = unitWorldPosition + rotate((localPoint - anchor) * renderScale, unitFacing)
```

The visible box determines scale only. The root anchor determines placement and rotation. These can differ: a rifle, barrel, wing, or thruster may extend the visible box without moving the logical unit center.

Use `max(w, h)` by default so sprites preserve aspect ratio. If a future renderer needs exact fit for unusually long units, it can add a separate authored `data-fit-axis`, but uniform scaling is the safe default.
