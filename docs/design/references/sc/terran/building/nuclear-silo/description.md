# Nuclear Silo

Top-down primitive target: a circular hatch ring with a central missile core, two side clamps, and one vertical hatch seam. It should be unmistakably a sealed launch hatch.

SVG parts in the current draft:

- `hatch-ring`: circular silo hatch.
- `missile-core`: central armed missile/core circle.
- `left-clamp`, `right-clamp`: side locking clamps.
- `hatch-seam`: straight vertical seam through the hatch.

Animation/implementation notes: pulse `hatch-ring` and `missile-core` when armed. The clamps can slide outward for launch preparation. Keep all effects centered on the hatch.

Do not draw: missile body from the side, silo depth, blast shadows, warning labels, or perspective doors.
