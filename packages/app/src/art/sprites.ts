// Self-drawn SVG sprite art (100% in-house → CC0-clean for the Pages deploy, per
// docs/specs/assets.md §1), in a neon "tron" treatment: a near-black chassis with
// glowing, team-colored edges and a bright power core. The full three-race showcase
// (Terran/Protoss/Zerg, canonical to docs/specs/sc1-spec.md) lives in
// packages/app/units.html; the engine currently has Terran kinds only, so the Terran
// subset is what bakes into the atlas here. Protoss/Zerg art is ready in the showcase
// and ports in the moment their Kinds land in the sim.
//
// Pipeline (gl/atlas.ts): each sprite rasterizes two layers that share one UV cell:
//   • `body` — full-color art. The dark chassis is a fixed near-black (never tinted).
//     The neon edges/cores are drawn in a neutral bright color so the fragment-shader
//     multiply by the player color (assets.md §4) yields a vivid, still-glowing team
//     tint. A baked SVG blur under the strokes makes the neon edge bloom in-engine.
//   • `mask` — the team region (the neon edges + their bloom + cores) in white; the
//     chassis stays transparent so it reads black for every player.
// Neutral sprites (minerals, geyser) carry a fixed hue and no mask, so they're never
// team-tinted.
//
// Authored in a 64×64 viewBox, centered, "facing" up (−y) so units rotate toward a
// move target. Each sprite is described by role layers (see Tron) and the body/mask
// SVG is generated from them, so a sprite is data, not duplicated markup.

const DARK = '#0d1119'; // chassis fill — lifted just off black so silhouettes read on dark terrain
const DARK2 = '#06080d'; // recessed insets (bay doors, vents, maws)
const NEON = '#eef3ff'; // neutral-bright edge → fragment-shader multiply by team color stays a clean tint
// One soft blur, reused per rasterized SVG (filter id is local to each doc). A roomy
// filter region keeps the bloom from clipping; geometry is inset enough to stay in 64².
const GLOW = '<filter id="g" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="1.15"/></filter>';
const EJOIN = 'stroke-linejoin="round" stroke-linecap="round"';

// A sprite as role layers; body/mask are generated from these (see below).
type Tron = {
  sw: number; // neon stroke width
  panels?: string; // plates: dark fill + neon outline (the chassis)
  insets?: string; // recessed dark fills only, no neon (doors, vents, maws)
  lines?: string; // pure neon detail strokes (fill:none)
  cores?: string; // filled neon nodes — the glowing power core
  scale?: number; // world-size multiplier vs. the unit's interaction radius (default 1)
  color?: string; // fixed hue for NEUTRAL sprites (no team mask); omit → team-tinted
};

// glow underlay + crisp pass for stroked geometry (panels' outlines + detail lines).
const strokeLayers = (geom: string, sw: number, color: string): string =>
  `<g color="${color}" fill="none" stroke="currentColor" stroke-width="${sw}" ${EJOIN} filter="url(#g)">${geom}</g>` +
  `<g color="${color}" fill="none" stroke="currentColor" stroke-width="${sw}" ${EJOIN}>${geom}</g>`;
// glow underlay + crisp pass for filled geometry (cores, bright facets).
const fillLayers = (geom: string, color: string): string =>
  `<g color="${color}" fill="currentColor" stroke="none" filter="url(#g)">${geom}</g>` +
  `<g color="${color}" fill="currentColor" stroke="none">${geom}</g>`;

const bodyOf = (t: Tron): string => {
  const c = t.color ?? NEON;
  const stroked = (t.panels ?? '') + (t.lines ?? '');
  return (
    `<defs>${GLOW}</defs>` +
    (t.panels ? `<g fill="${DARK}" stroke="none">${t.panels}</g>` : '') +
    (t.insets ? `<g fill="${DARK2}" stroke="none">${t.insets}</g>` : '') +
    strokeLayers(stroked, t.sw, c) +
    (t.cores ? fillLayers(t.cores, c) : '')
  );
};
// Team mask: white over the neon (edges + bloom + cores); chassis stays transparent
// (→ black for every player). Omitted for neutral sprites so they're never tinted.
const maskOf = (t: Tron): string | undefined => {
  if (t.color) return undefined;
  const stroked = (t.panels ?? '') + (t.lines ?? '');
  return `<defs>${GLOW}</defs>` + strokeLayers(stroked, t.sw, '#fff') + (t.cores ? fillLayers(t.cores, '#fff') : '');
};

export type SpriteDef = {
  body: string; // inner SVG markup, full color
  mask?: string; // inner SVG markup, team region white / chassis transparent
  scale?: number; // world-size multiplier vs. the unit's interaction radius (default 1)
};

const sprite = (t: Tron): SpriteDef => {
  const m = maskOf(t);
  return { body: bodyOf(t), ...(m ? { mask: m } : {}), scale: t.scale ?? 1 };
};

// ---- Terran roster + neutral resources (the engine's current Kinds). ----
const TRON: Record<string, Tron> = {
  // SCV: hex hauler, side treads, forward claw, central core.
  scv: {
    sw: 2, scale: 1.7,
    panels:
      `<rect x="9" y="22" width="7" height="22" rx="2"/><rect x="48" y="22" width="7" height="22" rx="2"/>` +
      `<polygon points="32,13 48,23 48,43 32,53 16,43 16,23"/>`,
    lines:
      `<line x1="12.5" y1="26" x2="12.5" y2="40"/><line x1="51.5" y1="26" x2="51.5" y2="40"/>` +
      `<line x1="23" y1="13" x2="22" y2="4"/><line x1="41" y1="13" x2="42" y2="4"/><line x1="22" y1="6" x2="42" y2="6"/>` +
      `<line x1="22" y1="33" x2="42" y2="33"/>`,
    cores: `<circle cx="32" cy="32" r="4"/>`,
  },
  // Marine: CMC power armor (top-down) — swept shoulder plate, helmet+visor, gauss rifle.
  marine: {
    sw: 2, scale: 1.7,
    panels:
      `<path d="M25 41 L39 41 L37 53 Q32 56 27 53 Z"/>` +
      `<path d="M18 24 Q32 16 46 24 L47 39 Q32 45 17 39 Z"/>` +
      `<circle cx="32" cy="27" r="7"/>` +
      `<rect x="40" y="7" width="5" height="27" rx="1.5"/>`,
    lines: `<path d="M17 33 Q14 26 21 22"/><path d="M27 26 Q32 21 37 26"/><line x1="35" y1="23" x2="42" y2="20"/>`,
    cores: `<circle cx="30" cy="34" r="3"/>`,
  },
  // Command Center: cut-corner fortress, corner bastions, central landing ring.
  commandCenter: {
    sw: 2.4, scale: 1.0,
    panels:
      `<polygon points="20,5 44,5 59,20 59,44 44,59 20,59 5,44 5,20"/>` +
      `<rect x="8" y="8" width="11" height="11" rx="2"/><rect x="45" y="8" width="11" height="11" rx="2"/>` +
      `<rect x="8" y="45" width="11" height="11" rx="2"/><rect x="45" y="45" width="11" height="11" rx="2"/>` +
      `<circle cx="32" cy="32" r="14"/>`,
    lines:
      `<circle cx="32" cy="32" r="9"/>` +
      `<line x1="32" y1="20" x2="32" y2="26"/><line x1="32" y1="38" x2="32" y2="44"/>` +
      `<line x1="20" y1="32" x2="26" y2="32"/><line x1="38" y1="32" x2="44" y2="32"/>`,
    cores: `<circle cx="32" cy="32" r="4.5"/>`,
  },
  // Supply Depot: antenna pylon — base, mast, cross arms, top light.
  supplyDepot: {
    sw: 2.2, scale: 1.0,
    panels: `<polygon points="20,50 44,50 40,60 24,60"/>`,
    lines:
      `<line x1="32" y1="50" x2="32" y2="13"/>` +
      `<line x1="22" y1="22" x2="42" y2="22"/><line x1="25" y1="32" x2="39" y2="32"/><line x1="27" y1="41" x2="37" y2="41"/>` +
      `<line x1="22" y1="22" x2="32" y2="14"/><line x1="42" y1="22" x2="32" y2="14"/>`,
    cores: `<circle cx="32" cy="11" r="3.2"/>`,
  },
  // Barracks: production block, bay door with slats, roof vent chevrons, beacon.
  barracks: {
    sw: 2.2, scale: 1.0,
    panels: `<rect x="8" y="11" width="48" height="44" rx="6"/>`,
    insets: `<rect x="24" y="33" width="16" height="22" rx="2"/>`,
    lines:
      `<polyline points="14,24 20,18 26,24"/><polyline points="38,24 44,18 50,24"/>` +
      `<line x1="28" y1="36" x2="28" y2="55"/><line x1="32" y1="36" x2="32" y2="55"/><line x1="36" y1="36" x2="36" y2="55"/>`,
    cores: `<polygon points="32,5 36,11 28,11"/>`,
  },
  // Refinery: structure over a geyser, twin gas tanks + central riser (gas glow added by the renderer).
  refinery: {
    sw: 2.2, scale: 1.0,
    panels:
      `<rect x="8" y="15" width="48" height="35" rx="10"/>` +
      `<circle cx="21" cy="33" r="9"/><circle cx="43" cy="33" r="9"/>` +
      `<rect x="29" y="17" width="6" height="16" rx="2"/>`,
    insets: `<circle cx="21" cy="33" r="3.4"/><circle cx="43" cy="33" r="3.4"/>`,
    lines: `<line x1="15" y1="20" x2="33" y2="20"/>`,
    cores: `<circle cx="32" cy="42" r="2.4"/>`,
  },
  // Mineral field: a faceted cyan crystal cluster that fills its build-tile square
  // (scale 1.0 → the footprint is exactly one tile; the geometry spans the cell).
  mineral: {
    sw: 2, scale: 1.0, color: '#46f0e0',
    panels: `<polygon points="4,60 5,33 15,11 24,31 32,5 40,31 49,13 59,33 60,60"/>`,
    lines:
      `<line x1="15" y1="11" x2="15" y2="60"/><line x1="24" y1="31" x2="24" y2="60"/>` +
      `<line x1="32" y1="5" x2="32" y2="60"/><line x1="40" y1="31" x2="40" y2="60"/><line x1="49" y1="13" x2="49" y2="60"/>`,
    cores: `<polygon points="32,5 37,21 27,21"/><polygon points="15,11 20,26 10,26"/><polygon points="49,13 54,28 44,28"/>`,
  },
  // Vespene geyser: dark vent with rising green gas (neutral).
  geyser: {
    sw: 2, scale: 1.0, color: '#54f08a',
    panels: `<polygon points="32,30 50,40 50,52 32,60 14,52 14,40"/>`,
    insets: `<ellipse cx="32" cy="40" rx="13" ry="6"/>`,
    lines: `<path d="M28 36 Q24 26 30 18 Q34 12 30 6"/><path d="M38 38 Q42 30 38 22"/>`,
    cores: `<circle cx="29" cy="14" r="2"/>`,
  },
};

export const SPRITES: Record<string, SpriteDef> = Object.fromEntries(
  Object.entries(TRON).map(([k, t]) => [k, sprite(t)]),
);

/** Wrap inner markup into a standalone, sized SVG document for rasterization. */
export const svgDoc = (inner: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">${inner}</svg>`;
