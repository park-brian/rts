# Supply Depot

Top-down primitive target: a square storage slab with one central circular fan. The fan has a cross in the center; that cross is the readable rotating element.

Placement footprint: `3x2` build tiles, sourced from BWAPI. The authored icon stays square because the distinctive top-down read is a simple square slab.

SVG parts in the current draft:

- `depot-body`: rounded square storage slab.
- `central-fan`: the main fan circle.
- `fan-cross-horizontal`, `fan-cross-vertical`: the cross inside the fan; rotate these with the fan.

Animation/implementation notes: rotate the fan cross around `32 32`. If the depot later has a lowered/raised state, keep the outline square and animate the fan opacity or rotation speed rather than adding perspective.

Do not draw: stacked crates, side walls, vertical doors, extra vents, or a second fan.
