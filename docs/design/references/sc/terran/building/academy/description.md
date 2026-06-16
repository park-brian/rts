# Academy

Top-down primitive target: a circular academy dome with a smaller tower circle, a rear block, and a crescent courtyard line. It should feel like a training/research campus rather than a production box.

SVG parts in the current draft:

- `main-dome`: large circular academy body.
- `tower-dome`: smaller offset tower circle.
- `courtyard-crescent`: open crescent line at the lower edge.
- `rear-block`: small rectangular support block.

Animation/implementation notes: pulse `main-dome` for research and blink `tower-dome` for scanner/training status. The crescent is static and mainly gives the academy a distinct top-down read.

Do not draw: statues, walls, entrances, tall tower sides, or any underside details.
