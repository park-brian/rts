# Control Tower

Top-down primitive target: a small add-on pad with a dish arc, vertical antenna line, and antenna dot. It should be much simpler than the starport but clearly radar-like.

SVG parts in the current draft:

- `addon-pad`: rectangular add-on base.
- `dish-arc`: scanner/radar arc.
- `antenna`: straight antenna stem.
- `antenna-dot`: blinking antenna tip.

Animation/implementation notes: sweep or pulse `dish-arc`; blink `antenna-dot` for active control. Keep the dish anchored to the add-on pad rather than floating as a separate building.

Do not draw: tower height, struts, tiny radar grid lines, or perspective dish underside.
