# Siege Tank (Siege Mode)

Reference image: `liquipedia-siege-tank-siege-mode.jpg`

The image is the same base reference as tank mode, so the sprite must communicate deployed mode with the fewest possible changes: the exact tank-mode base, a longer cannon, and two matching support blocks under the body.

Distinctive features:

- Exact same twin tread base, hull, and turret as tank mode.
- Longer forward cannon.
- Two identically sized and placed support rectangles under the body.

SVG plan:

- `panels`: exact tank base geometry, longer barrel, two support rectangles under the base.
- `lines`: long barrel only if needed.
- `cores`: turret core.
- Keep it mathematically aligned with tank mode; do not widen or move the base.

Omit:

- Extra perspective armor detail and multiple barrel decorations.
