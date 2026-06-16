# Marine

Reference image: `liquipedia-marine.jpg`

The reference is an isometric armored infantry figure, but the gameplay-scale identity is much simpler: three overlapping circles and one gun rectangle. Do not draw a full person. The silhouette should read as a head circle covering two side shoulder circles, with a plain weapon bar.

Distinctive features:

- Main helmet circle.
- Front half/faceplate split on the helmet circle.
- Two side shoulder circles, partially covered by the main helmet circle.
- Rifle as a plain rectangle, drawn below the side circles in visual z-order.
- Compact infantry footprint.

SVG plan:

- `panels`: rifle rectangle first, then two side circles, then one main helmet circle.
- `lines`: one short faceplate split across the front half of the helmet circle.
- `cores`: small chest/visor dot only if it helps.
- Keep the side circles separate; they are movement animation handles.

Omit:

- Full body, legs, boots, hands, face, backpack detail, shadows, underside, isometric height, mechanical details, and any extra armor plates.
