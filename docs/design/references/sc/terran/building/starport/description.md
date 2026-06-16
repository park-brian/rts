# Starport

Top-down primitive target: a large circular landing ring with an inner pad, four spoke lines, two side hangars, and a small center core. It should read as an aircraft landing facility at contact-sheet distance.

SVG parts in the current draft:

- `landing-ring`: main landing pad ring.
- `inner-pad`: dark central landing area.
- `north-spoke`, `south-spoke`, `west-spoke`, `east-spoke`: four pad alignment marks.
- `left-hangar`, `right-hangar`: side hangar blocks.
- `pad-core`: center status light.

Animation/implementation notes: pulse `landing-ring` or `pad-core` for active production/landing. Hangars stay static unless later opened for launch effects.

Do not draw: runway perspective, ship silhouettes, vertical tower sides, or detailed hangar doors.
