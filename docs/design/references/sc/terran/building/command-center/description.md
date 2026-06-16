# Command Center

Top-down primitive target: a large octagonal HQ footprint with a centered command dome and four square corner modules. The shape should read as a landing-capable base first, not as a tall building.

SVG parts in the current draft:

- `footprint`: the large octagonal outer hull and visible building boundary.
- `command-dome`: central circle, the anchor for pulsing command/status effects.
- `upper-left-module`, `upper-right-module`, `lower-left-module`, `lower-right-module`: corner landing/service modules.
- `landing-cross-a`, `landing-cross-b`: simple centered landing mark.

Animation/implementation notes: use `data-anchor="32 32"` as the building placement center. The dome can pulse for active production or selection. Corner modules can stay static unless later used for lift-off/landing feedback.

Do not draw: walls, ramps, shadows, underside legs, tiny roof machinery, or isometric height cues.
