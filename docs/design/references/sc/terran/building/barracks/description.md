# Barracks

Top-down primitive target: a large production block with a centered door slot, two roof vents, and four square foot pads. It should read as the infantry factory without needing wall or height detail.

SVG parts in the current draft:

- `body`: main rectangular production hull.
- `door-slot`: dark center exit slot.
- `left-roof-vent`, `right-roof-vent`: paired vent rectangles.
- `upper-left-foot`, `upper-right-foot`, `lower-left-foot`, `lower-right-foot`: four anchoring pads.

Animation/implementation notes: animate `door-slot` for unit production. The vents can pulse softly during training. The four pads define the footprint corners and should stay mathematically symmetric.

Do not draw: side walls, roof bevel textures, windows, stairs, or any vertical facade cues.
