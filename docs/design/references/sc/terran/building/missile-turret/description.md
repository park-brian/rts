# Missile Turret

Top-down primitive target: a square base with a central pivot and two vertical launcher rectangles. It must be readable as a rotating weapon, not just a box.

SVG parts in the current draft:

- `base`: square foundation.
- `pivot`: central rotating mount.
- `left-launcher`, `right-launcher`: paired missile barrels and missile emission sources.

Animation/implementation notes: `pivot`, `left-launcher`, and `right-launcher` rotate together for aiming. Launcher emission direction is local forward (`0 -1`) before the building turret rotation is applied.

Do not draw: tripod legs, detailed missile tips, radar dishes, or isometric barrel depth.
