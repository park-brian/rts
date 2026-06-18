# Perspective, Maps & Elevation

> Status: living design doc. Covers the camera perspective, map layout philosophy for a vertical
> phone screen, how elevation reads in top-down, and the map data model. Combat/vision effects of
> elevation are specified in [`sc1-spec.md` §A.7](./sc1-spec.md#7-vision--detection); this doc is
> about *presentation* and the *map format*.

## 1. Perspective: orthographic top-down, north-up

**Decision: top-down (orthographic, north-up), not isometric.** Optionally a very slight tilt
(~10°) later if cliffs need more pop — but the playfield logic is straight overhead.

Why top-down wins on mobile:
- **Screen usage** — a rectangular top-down playfield fills a portrait screen; an isometric
  diamond wastes the corners and fights the tall aspect ratio.
- **Touch targeting** — direct, unambiguous screen→tile mapping. Isometric skews the mapping and
  introduces depth ambiguity (floor vs. the unit drawn "behind" it) — punishing for fat fingers.
- **Art cost** — one top-down sprite per unit, **rotated** for facing (exactly our single-SVG
  approach in [`assets.md`](./assets.md)). Isometric wants ~8 pre-rendered angles per unit.
- **Camera** — thumb pan/zoom is intuitive straight overhead.
- **AI synergy** — the world grid maps 1:1 to the AI's spatial observation planes (no isometric
  skew), and to the tile/walk grid used for pathfinding and determinism.

## 2. Map design for a portrait screen

The tall screen *is* the design constraint, and it's an asset: **the axis of conflict runs
top↕bottom**, matching portrait and making the dominant scroll a natural vertical thumb-swipe.

- **Vertical-major, rotationally symmetric (180°)** for 1v1 fairness. You start **south
  (bottom)**, the opponent **north (top)**.
- **Compact** maps relative to SC1 ladder sizes → shorter games, less scrolling, better for
  mobile sessions. (Tune size during playtest-by-screenshot.)
- Each main base has: a defensible **ramp** to high ground, a nearby **natural expansion**, and
  **contested resources toward the center**.
- **Chokepoints** between the mains; an open-ish middle for engagements.
- Team games (later): 2v2 = SW+SE vs NW+NE (still vertical-major), etc.
- Standard resource layout per base: ~8 mineral patches + 1–2 vespene geysers (per
  [`sc1-spec.md`](./sc1-spec.md)).

## 3. Elevation in top-down (low / high + ramps)

We can't use isometric height, but top-down has clean, proven cues that suit our flat-vector
aesthetic — the target look is almost **topographic / board-game**:

1. **Value steps — lighter = higher.** The primary, universal read.
2. **Cliff-edge band + directional drop-shadow** where high meets low (shadow on the low side).
   This is the strongest single cue — *the shadow is the height*. Tile-based cliff-edge sprites.
3. **Distinct ramp tiles** — the only ground passage between levels; visually "a slope."
4. **Crisp plateau outlines** — contour-like edges; intentional and legible at phone size.
5. Optional: a subtle larger drop-shadow / outline on **units standing on high ground**.

Keep it to **2 levels (low / high), 3 maximum**, like SC1. The combination above reads instantly
on a small screen without a tilted camera; a slight tilt is a later polish option, not required.

**Mechanics (see [`sc1-spec.md` §A.7](./sc1-spec.md#7-vision--detection)):** high ground grants
vision over low ground; low→high attacks have a ~53% miss chance; cliffs are impassable to ground
units (air ignores elevation); ramps are the passages and are normal walkable terrain.

## 4. Map data model

A map is **data** (no code), loaded by the deterministic sim. Tile-grid based (32px build tiles /
8px walk tiles per [`sc1-spec.md` §A.2](./sc1-spec.md#2-tile--coordinate-system)). Per-tile and
per-map fields (exact serialization TBD — likely compact typed arrays + JSON header):

- **Dimensions** — width/height in build tiles (vertical-major).
- **Per build-tile:**
  - `terrain` — type/tileset index (for rendering).
  - `elevation` — 0 (low) / 1 (high) / (2) — discrete level.
  - `walkable` — derived at walk-tile resolution (cliffs = blocked).
  - `buildable` — can a building be placed here.
  - `ramp` — flag + orientation (connects two elevation levels; walkable).
  - `doodad`/decoration — purely visual.
- **Resources** — list of mineral patches and geysers. Store both BW concepts explicitly:
  integer initial build-tile footprint (`x`,`y`) for placement legality, plus an optional integer
  pixel center (`px`,`py`) for exact body-edge distance and harvest timing. Resource depots use
  BWAPI's resource-placement exclusion windows against the initial tile (`minerals: x -5..+6,
  y -4..+5; geysers: x -7..+6, y -5..+5`, strict comparisons). Starting bases should solve the
  mineral line as a resource arc around the depot edge, not as a straight row. Base/resource
  generation works in reusable cluster footprints: exact depot anchor, depot build footprint,
  resource footprints, and an enclosing reservation footprint used by procedural generation before
  terrain or other features are stamped. Base cluster resource placement is scored against named
  top-down dock-to-dock targets: minerals use the current three-worker band ending at 97px, while
  gas uses the current exact 83px refinery-route target. These are generator targets, not hidden
  runtime reach bonuses. Workers must still visibly dock using top-down physical contact. Equal
  route distance is the first-order economy target: with a shared movement speed model, equal
  distance preserves relative trip timing across SCVs, Drones, and Probes without per-unit
  placement hacks. Gas still needs its own three-worker cadence validation; the current solver only
  pins the refinery dock distance. Route timing
  diagnostics expose target BW-equivalent route frames, actual top-down dock-to-dock route frames,
  positive slack when the route is shorter, and an invalid flag when the top-down route is too long.
  Workers do not wait to hide short routes; they deposit immediately at physical depot contact. The
  resource solver should hit the cheap top-down saturation distances directly. Procedural map
  generation rejects main-base mineral layouts with invalid routes or excessive route asymmetry,
  and base placement retries deterministic local depot-anchor candidates before stamping resources.
- **Start locations** — ordered (index 0 = south, 1 = north, …) with rotational symmetry.
- **Base sites** — optional generated-map metadata for mains, naturals, islands, fortress sites,
  etc. A base site stores team/owner intent, depot center, depot footprint, whole-cluster
  reservation footprint, resource direction, ramp association, and timing profile without requiring
  a depot to exist there yet.
- **Metadata** — name, max players, symmetry, recommended modes.

The renderer derives cliff-edge/shadow/ramp visuals from the `elevation` field of adjacent tiles
(no need to author shadows by hand). The sim uses `walkable`/`buildable`/`elevation`/`ramp` for
pathing, placement, vision, and the low→high miss roll. Determinism: maps are static data hashed
into the replay/seed header.

## 5. Vertical-slice map

One small, symmetric, vertical-major 1v1 map: south start vs north start, each with a main on
**high ground** behind a **ramp**, ~8 minerals + 1 geyser at the main, one natural expansion, and
a contested patch in the middle. Two elevation levels. This exercises the full elevation
representation + mechanics (ramps, high-ground vision, low→high miss) in the first playable build.

Procedural baseline: for deterministic stress tests, the first generated preset uses one full-width
shared north plateau and one full-width shared south plateau. Allies on the same team share that
plateau. Each lane has a ramp down to a low-ground natural, and `midfield: empty` leaves the center
combat band clear; optional modules add blocks, dual chokes, arenas, or raised centers after the
base/resource validation pass.

## 6. Open questions / deferred
- Exact map serialization format (binary typed arrays vs. JSON vs. an existing tilemap format).
- A 3rd elevation level — include only if it earns its complexity.
- Whether to support a slight camera tilt for cliff readability (prototype via screenshots).
- Map editor / authoring workflow (later; for now maps are hand-authored data files).
- Destructible/special terrain, doodads that block vision — later.
