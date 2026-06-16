# Archived Reference-Assisted Imagegen Prompt

This file is kept only as a record of the abandoned image-generation experiment. It is not part of the active sprite roadmap. The active workflow is direct hand-authored SVG primitive construction in `packages/app/src/art/sprites.ts`.

Use this when turning a downloaded Liquipedia reference image into an original Tron-ready concept board for SVG authoring.

The input image is a reference only. We use it to understand silhouette, not to trace or ship derivative art.

```text
Use case: stylized-concept
Asset type: RTS sprite inspiration board for hand-authored SVG conversion
Input image: Use the attached [UNIT NAME] reference only to understand broad silhouette cues, proportions, and distinctive parts.
Primary request: Reinterpret and simplify the reference as original literal top-down SVG-like Tron sprite concepts for [UNIT NAME]. Do not copy, trace, or reproduce the source image.
Subject: [DISTINCTIVE FEATURES]
Style/medium: clean vector-like line art, near-black filled shapes, bright cyan/white neon outlines, minimal geometry, tactical Tron interface style.
Composition/framing: draw the unit from literal top-down view only, centered, facing upward, isolated on a flat dark background, three simplified variants side by side.
Shape constraints: use only simple forms that can be redrawn as SVG rectangles, rounded rectangles, polygons, circles, ellipses, arcs, and short lines.
Readability constraints: iconic silhouette first, readable at 32 px, no tiny detail required for recognition.
Simplification: preserve only the 2-4 most distinctive visible-from-above parts; remove decorative panels, texture, shadows, undersides, lower-body anatomy, legs/feet unless they are the unit's main identifier, and any detail hidden by the head/shoulder/top hull.
Copyright constraint: make an original reinterpretation inspired by the reference's broad silhouette; do not match the exact image, pose, rendering, colors, or surface details.
Avoid: logos, text, photorealism, pixel art, dense detail, gradients, painterly shading, background scenery, exact pose replication, copied game sprite frame, orthographic three-quarter view, isometric angle, perspective depth, underside details.
```

After generation, update that unit's `description.md` with:

- the chosen simplified silhouette,
- the discarded reference details,
- the SVG primitive plan,
- any race-language adjustments needed to match our art style.

Minimum-glyph examples:

- Marine: helmet, two pauldrons, one rifle bar.
- Firebat: Marine with bigger pauldrons and twin flame bars.
- Medic: Marine with small pauldrons and a cross.
- Ghost: Marine with small pauldrons and a long gun.
- Zealot: Marine-like helmet/shoulders, two forward psi-sword arcs instead of a gun.
- Zergling: jaws, longer torso, two forward claw arcs.
- Hydralisk: Marine-like read with large jaws and mantis/back-wing limbs instead of pauldrons.
- Dragoon: central orb/shell, four legs.
- Scarab: glowing orb.
