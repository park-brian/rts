// Self-drawn SVG sprite art (100% in-house → CC0-clean for the Pages deploy, per
// docs/specs/assets.md §1). Flat, top-down, minimalist — reads well on a small
// vertical phone screen and rasterizes crisp at any zoom (vector source).
//
// Each sprite has two layers that feed the texture atlas (gl/atlas.ts):
//   • `body` — the full-color art. Team-colorable regions are drawn near-white so
//     a fragment-shader multiply by the player color yields a vivid team tint.
//   • `mask` — the same silhouette in white, with non-team detail shapes punched
//     out in black, so guns/glass/accents stay their own color (assets.md §4).
// Sprites without a `mask` (minerals, geyser) are never team-tinted.
//
// All art is authored in a 64×64 viewBox, centered, "facing" up (−y) so the
// renderer can rotate units toward their move target.

export type SpriteDef = {
  body: string; // inner SVG markup, full color
  mask?: string; // inner SVG markup, team region white / details black
  scale?: number; // world-size multiplier vs. the unit's interaction radius (default 1)
};

const TEAM = '#eef2f6'; // near-white base for team regions (× player color in-shader)
const EDGE = '#0b0e13'; // outline
const STEEL = '#2b3038'; // dark metal detail
const STEEL2 = '#3a3f47';
const GLASS = '#7fd1ff';
const WARN = '#ffcc4d';

export const SPRITES: Record<string, SpriteDef> = {
  // --- SCV: compact top-down builder vehicle, claw arm pointing "up". ---
  scv: {
    scale: 1.7,
    body: `
      <rect x="12" y="16" width="6" height="32" rx="2" fill="${STEEL2}"/>
      <rect x="46" y="16" width="6" height="32" rx="2" fill="${STEEL2}"/>
      <rect x="16" y="14" width="32" height="36" rx="6" fill="${TEAM}" stroke="${EDGE}" stroke-width="2"/>
      <rect x="22" y="22" width="20" height="16" rx="3" fill="${STEEL}"/>
      <rect x="25" y="24" width="14" height="9" rx="2" fill="${GLASS}"/>
      <rect x="28" y="7" width="8" height="9" rx="2" fill="${WARN}"/>`,
    mask: `
      <rect x="12" y="16" width="6" height="32" rx="2" fill="#000"/>
      <rect x="46" y="16" width="6" height="32" rx="2" fill="#000"/>
      <rect x="16" y="14" width="32" height="36" rx="6" fill="#fff"/>
      <rect x="22" y="22" width="20" height="16" rx="3" fill="#000"/>
      <rect x="28" y="7" width="8" height="9" rx="2" fill="#000"/>`,
  },

  // --- Marine: armored infantry, helmet + visor, rifle barrel facing up. ---
  marine: {
    scale: 1.7,
    body: `
      <rect x="29" y="6" width="6" height="22" rx="2" fill="${STEEL2}"/>
      <circle cx="32" cy="35" r="16" fill="${TEAM}" stroke="${EDGE}" stroke-width="2"/>
      <circle cx="32" cy="31" r="9" fill="${STEEL}"/>
      <rect x="26" y="22" width="12" height="5" rx="2" fill="${GLASS}"/>`,
    mask: `
      <rect x="29" y="6" width="6" height="22" rx="2" fill="#000"/>
      <circle cx="32" cy="35" r="16" fill="#fff"/>
      <circle cx="32" cy="31" r="9" fill="#000"/>`,
  },

  // --- Command Center: large hub with a central landing pad. ---
  commandCenter: {
    scale: 1.0,
    body: `
      <rect x="5" y="5" width="54" height="54" rx="11" fill="${TEAM}" stroke="${EDGE}" stroke-width="3"/>
      <rect x="9" y="9" width="11" height="11" rx="2" fill="${STEEL2}"/>
      <rect x="44" y="9" width="11" height="11" rx="2" fill="${STEEL2}"/>
      <rect x="9" y="44" width="11" height="11" rx="2" fill="${STEEL2}"/>
      <rect x="44" y="44" width="11" height="11" rx="2" fill="${STEEL2}"/>
      <circle cx="32" cy="32" r="15" fill="${STEEL}"/>
      <circle cx="32" cy="32" r="8" fill="${WARN}"/>`,
    mask: `
      <rect x="5" y="5" width="54" height="54" rx="11" fill="#fff"/>
      <rect x="9" y="9" width="11" height="11" rx="2" fill="#000"/>
      <rect x="44" y="9" width="11" height="11" rx="2" fill="#000"/>
      <rect x="9" y="44" width="11" height="11" rx="2" fill="#000"/>
      <rect x="44" y="44" width="11" height="11" rx="2" fill="#000"/>
      <circle cx="32" cy="32" r="15" fill="#000"/>`,
  },

  // --- Supply Depot: low slab with hazard striping. ---
  supplyDepot: {
    scale: 1.0,
    body: `
      <rect x="9" y="14" width="46" height="36" rx="9" fill="${TEAM}" stroke="${EDGE}" stroke-width="3"/>
      <rect x="16" y="21" width="32" height="7" rx="3" fill="${WARN}"/>
      <rect x="16" y="33" width="32" height="7" rx="3" fill="${STEEL}"/>`,
    mask: `
      <rect x="9" y="14" width="46" height="36" rx="9" fill="#fff"/>
      <rect x="16" y="21" width="32" height="7" rx="3" fill="#000"/>
      <rect x="16" y="33" width="32" height="7" rx="3" fill="#000"/>`,
  },

  // --- Barracks: blocky production building, door + roof vents + beacon. ---
  barracks: {
    scale: 1.0,
    body: `
      <rect x="7" y="9" width="50" height="46" rx="7" fill="${TEAM}" stroke="${EDGE}" stroke-width="3"/>
      <rect x="13" y="15" width="13" height="9" rx="2" fill="${STEEL2}"/>
      <rect x="38" y="15" width="13" height="9" rx="2" fill="${STEEL2}"/>
      <rect x="24" y="35" width="16" height="20" rx="2" fill="${STEEL}"/>
      <rect x="28" y="13" width="8" height="8" rx="2" fill="#ff5a4d"/>`,
    mask: `
      <rect x="7" y="9" width="50" height="46" rx="7" fill="#fff"/>
      <rect x="13" y="15" width="13" height="9" rx="2" fill="#000"/>
      <rect x="38" y="15" width="13" height="9" rx="2" fill="#000"/>
      <rect x="24" y="35" width="16" height="20" rx="2" fill="#000"/>`,
  },

  // --- Refinery: structure over a geyser, twin gas tanks. ---
  refinery: {
    scale: 1.0,
    body: `
      <rect x="9" y="15" width="46" height="35" rx="9" fill="${TEAM}" stroke="${EDGE}" stroke-width="3"/>
      <circle cx="22" cy="33" r="8" fill="#3fae57"/>
      <circle cx="42" cy="33" r="8" fill="#3fae57"/>
      <circle cx="22" cy="33" r="3" fill="#0b3b22"/>
      <circle cx="42" cy="33" r="3" fill="#0b3b22"/>
      <rect x="30" y="18" width="4" height="14" fill="${STEEL}"/>`,
    mask: `
      <rect x="9" y="15" width="46" height="35" rx="9" fill="#fff"/>
      <circle cx="22" cy="33" r="8" fill="#000"/>
      <circle cx="42" cy="33" r="8" fill="#000"/>`,
  },

  // --- Mineral field: cyan crystal cluster (neutral, never tinted). ---
  mineral: {
    scale: 1.25,
    body: `
      <polygon points="18,46 28,16 35,32 45,14 50,46" fill="#2fc7ba" stroke="#08433d" stroke-width="2" stroke-linejoin="round"/>
      <polygon points="24,46 30,24 37,46" fill="#7ff0e6"/>
      <polygon points="39,46 45,22 51,46" fill="#7ff0e6"/>
      <polygon points="28,16 31,24 25,24" fill="#bffaf2"/>`,
  },

  // --- Vespene geyser: dark vent venting green gas (neutral). ---
  geyser: {
    scale: 1.0,
    body: `
      <ellipse cx="32" cy="44" rx="24" ry="13" fill="#243224" stroke="${EDGE}" stroke-width="2"/>
      <ellipse cx="32" cy="42" rx="13" ry="8" fill="#11200f"/>
      <circle cx="30" cy="30" r="7" fill="#56d364" opacity="0.85"/>
      <circle cx="38" cy="22" r="5" fill="#56d364" opacity="0.6"/>
      <circle cx="33" cy="15" r="3.5" fill="#56d364" opacity="0.4"/>`,
  },
};

/** Wrap inner markup into a standalone, sized SVG document for rasterization. */
export const svgDoc = (inner: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">${inner}</svg>`;
