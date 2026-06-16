# Comsat Station

Top-down primitive target: a ring pad overlapped by a compact module and two scanner dish arcs. It should be identifiable by scanning geometry rather than building bulk.

SVG parts in the current draft:

- `scan-ring`: circular scanner base.
- `module`: rectangular add-on module.
- `left-dish`, `right-dish`: two dish arcs.
- `scan-dot-a`, `scan-dot-b`: small scanner lights.

Animation/implementation notes: animate `left-dish` and `right-dish` as scanner sweeps; pulse the dots during active scans. Keep the arcs simple and readable at small scale.

Do not draw: satellite dishes in perspective, tall masts, dish grids, or detailed consoles.
