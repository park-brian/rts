# Art & Asset Strategy

> Status: living design doc. Goal: a crisp, elegant, mobile-first look that stays **lightweight,
> in-house, and 100% license-clean** for a public GitHub Pages deploy. Renders through the
> imperative WebGL world layer (see [architecture §6](./architecture.md#6-rendering--ui-browser-ts)).
>
> **Implemented (vertical slice).** The WebGL2 path described below is live in `packages/app`:
> a tiny regl-like core (`src/gl/gl.ts`) drives two instanced sprite passes — a normal-blend
> batch (ground shadows, every unit/building/resource body, HP bars, selection rings, rally
> markers) and an **additive** batch (ambient building/resource lights + combat particles). Self-
> drawn SVG sprites (`src/art/sprites.ts`, a neon **"tron" treatment** — a near-black chassis with
> glowing, team-colored edges and a bright power core, the bloom baked in via an SVG blur) bake
> into a runtime color+mask texture atlas (`src/gl/atlas.ts`) at startup; team color is a
> fragment-shader multiply through the mask channel (§4); fog is a soft, linear-filtered texture
> quad. A CPU particle pool (`src/gl/particles.ts`) spawns muzzle flashes and death explosions by
> diffing observable state frame-to-frame (cosmetic only — never the sim). Units rotate to face
> their move target. Canvas2D (`src/render2d.ts`) remains the fallback and the source of the
> 2D-overlay chrome (minimap, drag box). The full three-race sprite roster (Terran/Protoss/Zerg,
> canonical to [sc1-spec.md](./sc1-spec.md)) is showcased in `packages/app/units.html`; the engine
> bakes the Terran subset it currently has Kinds for. Next: re-bake per zoom bucket (§3.3),
> multi-frame sprite animation, and richer effects (impact sparks, smoke) on the same substrate.

## 1. Hard rule: only CC0 or self-made ships

The published build is a **static, public** bundle. Every shipped asset must be either:
- **self-made** (we own it outright — e.g. our SVG sprites), or
- **CC0 / public domain** (no attribution legally required).

No "free for non-commercial," no attribution-required, no scraped assets. (We may still credit
sources like Kenney as a courtesy.) This keeps the Pages deploy clean forever.

## 2. Two sources, one pipeline

We use **both**, chosen per-asset; they feed the *same* runtime texture-atlas pipeline (§3):

### Primary — self-drawn SVG (units, buildings, UI icons)
Recommended default for gameplay sprites, because it matches the project's ethos and constraints:
- **In-house & tiny** — vector source is a few KB, no external dependency, we own it.
- **Crisp at any scale** — mobile spans a wide range of device-pixel-ratios *and* we support
  pinch-zoom; SVG rasterizes sharp at every zoom bucket where a fixed PNG would alias/blur.
- **Per-player recolor is trivial** — RTS needs up to 8 team colors from one sprite (§4).
- **Elegant flat aesthetic** — a clean minimalist vector style reads well on a small screen and
  is fast for us (the agent) to author consistently and programmatically.

### Accelerator / fallback — Kenney.nl CC0 packs
Use where drawing is tedious or a polished look is wanted fast — all CC0:
- **[Tiny Battle](https://kenney-assets.itch.io/tiny-battle)** — 180+ top-down warfare sprites
  (units, tiles); the closest ready-made RTS look.
- **[Tower Defense (Top-Down)](https://kenney.nl/assets/tower-defense-top-down)** — 300 top-down
  tiles/towers/enemies.
- **[UI Pack](https://kenney.nl/assets), Game Icons, Particle Pack** — HUD frames, command-card
  icons, effect textures.
- Good first targets: **terrain tiles, effect/particle textures, UI chrome, placeholder unit
  art** while our own SVG sprites are drawn. (Audio packs later.)

> Both are interchangeable inputs to §3. Start the vertical slice with simple SVG sprites + a
> Kenney tileset for terrain; swap individual assets either way freely.

## 3. Pipeline: source art → GPU texture atlas

The game world renders as **batched textured quads on WebGL** — we never draw live SVG DOM nodes
or per-sprite canvases in the loop. So all art becomes a **texture atlas** at runtime:

1. **Sources** live in `packages/render/assets/` — `.svg` we authored and/or Kenney `.png`.
2. **At startup**, rasterize each SVG to an offscreen canvas at the current
   `devicePixelRatio × zoom-bucket` and **pack** all sprites (SVG-derived + Kenney PNGs) into one
   atlas texture uploaded to the GPU once. Kenney PNGs are copied in directly.
3. **Re-bake** the atlas only when the DPR or zoom bucket changes (a handful of discrete buckets,
   not per-frame) — keeps sprites crisp across zoom without runtime cost in the hot loop.
4. A small **manifest** (JSON) maps each unit/building/icon → atlas rect + anchor + tile
   footprint, consumed by the renderer.

This is buildless (rasterization happens in-browser via `Image`/`OffscreenCanvas`), DPI-perfect,
and keeps the 60fps path to pure quad batching.

## 4. Per-player team color

One sprite must serve all players. Author each sprite with a **team-colorable region** and tint
it in the fragment shader:
- Simplest scheme: a grayscale/neutral base sprite **plus a 1-channel team mask** (the region to
  recolor). Final color = `base × lighting + teamMask × teamColor`. One draw, one sprite, any of
  the 8 player colors via a uniform.
- For SVG this is natural (mark the team region with a known fill we export to the mask channel).
  For Kenney sprites, generate the mask once at import.

Health bars, selection rings, and fog are drawn procedurally (no sprite needed).

## 5. Vertical-slice asset list (Terran subset)

Minimum to get the first playable, Pages-deployed slice on screen:
- **Terrain:** buildable ground, unbuildable/cliff, ramp, resource-field decal (tiles — Kenney
  Tiny Battle/Tower-Defense is a fast start).
- **Resources:** mineral patch, vespene geyser.
- **Units:** SCV, Marine (+ team-mask).
- **Buildings:** Command Center, Supply Depot, Barracks (+ team-mask).
- **UI/overlays:** command-card icons (move, attack, stop, build, train), resource icons
  (minerals, gas, supply), selection ring, health/shield bar, fog overlay. (Kenney UI Pack +
  Game Icons accelerate these.)

Expand per the roadmap: full Terran roster → Protoss/Zerg, more tilesets, effects.

## 6. Open questions / deferred
- Final art direction / palette (flat-vector vs. pixel) — prototype both early via Playwright
  screenshots at phone resolutions and pick what reads best on a small vertical screen.
- Animation approach: simple multi-frame sprites vs. procedural transforms (rotate/scale/recoil)
  on a single sprite — the latter is lighter and fits vector well.
- Audio (SFX/music) — later; Kenney has CC0 audio packs when we get there.
