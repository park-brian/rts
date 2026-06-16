# Machine Shop

Top-down primitive target: a compact add-on pad with a right-side capsule, three vent stripes, and a parent connector edge. It should read as a factory attachment module.

SVG parts in the current draft:

- `addon-pad`: rectangular add-on base.
- `side-capsule`: rounded upgrade capsule.
- `vent-1`, `vent-2`, `vent-3`: simple horizontal vent lines.
- `parent-connector`: short connection edge to the parent building.

Animation/implementation notes: pulse `side-capsule` for upgrades. The connector should remain aligned to the add-on attachment side when the renderer eventually places it next to a factory.

Do not draw: separate floor plates, tall machinery, pipes crossing the parent, or tiny workshop details.
