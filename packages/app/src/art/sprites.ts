// Self-drawn SVG sprite art (100% in-house → CC0-clean for the Pages deploy, per
// docs/specs/assets.md §1). Flat top-down with baked volume: a consistent
// top-left light gives each sprite a highlight (upper-left) and a darker
// lower-right, plus a crisp dark outline so it reads on a small phone screen.
//
// Each sprite has two layers that feed the texture atlas (gl/atlas.ts):
//   • `body` — full-color art. Team-colorable regions use a near-neutral grey
//     gradient so a fragment-shader multiply by the player color yields a vivid,
//     still-shaded team tint. Non-team detail (guns, glass, vents) keeps its own
//     color and is punched out of the mask.
//   • `mask` — the team silhouette in white with detail shapes in black.
// Sprites without a `mask` (minerals, geyser) are never team-tinted.
//
// Authored in a 64×64 viewBox, centered, "facing" up (−y) so units can rotate
// toward their move target. Gradient ids are local to each rasterized SVG.

export type SpriteDef = {
  body: string; // inner SVG markup, full color
  mask?: string; // inner SVG markup, team region white / details black
  scale?: number; // world-size multiplier vs. the unit's interaction radius (default 1)
};

const EDGE = '#0b0e13'; // outline
const STEEL = '#262b33'; // dark metal detail
const STEEL2 = '#3a414b';
const WARN = '#ffb43d';

// Team gradient: neutral greys (no hue) so the in-shader multiply stays a clean
// team color, light at top-left → darker at bottom-right (matches the lighting).
const tg = (id = 't'): string =>
  `<linearGradient id="${id}" x1="0.1" y1="0.05" x2="0.9" y2="1">` +
  `<stop offset="0" stop-color="#f4f6f9"/><stop offset="0.55" stop-color="#dfe3e8"/>` +
  `<stop offset="1" stop-color="#bcc2ca"/></linearGradient>`;
// Glass/visor (cool blue) and a warm light (landing pad / glow).
const glass = (id = 'v'): string =>
  `<radialGradient id="${id}" cx="0.35" cy="0.3" r="0.8">` +
  `<stop offset="0" stop-color="#cdeeff"/><stop offset="1" stop-color="#2f6f9e"/></radialGradient>`;
const warm = (id = 'w'): string =>
  `<radialGradient id="${id}" cx="0.4" cy="0.35" r="0.75">` +
  `<stop offset="0" stop-color="#ffe49a"/><stop offset="1" stop-color="#ef9d1c"/></radialGradient>`;
// A soft top-left highlight reused across sprites.
const HI = '#ffffff';

export const SPRITES: Record<string, SpriteDef> = {
  // --- SCV: top-down builder; tread strips, cab + window, drill/claw facing up. ---
  scv: {
    scale: 1.7,
    body: `<defs>${tg()}${glass()}</defs>
      <rect x="12" y="17" width="7" height="30" rx="3" fill="${STEEL}"/>
      <rect x="45" y="17" width="7" height="30" rx="3" fill="${STEEL}"/>
      <rect x="14" y="21" width="3" height="22" rx="1.5" fill="${STEEL2}"/>
      <rect x="47" y="21" width="3" height="22" rx="1.5" fill="${STEEL2}"/>
      <rect x="20" y="7" width="24" height="11" rx="3" fill="${WARN}" stroke="${EDGE}" stroke-width="1.5"/>
      <rect x="25" y="4" width="4" height="6" rx="1" fill="#cf8a1f"/>
      <rect x="35" y="4" width="4" height="6" rx="1" fill="#cf8a1f"/>
      <rect x="16" y="14" width="32" height="37" rx="7" fill="url(#t)" stroke="${EDGE}" stroke-width="2"/>
      <rect x="22" y="24" width="20" height="17" rx="3" fill="${STEEL}"/>
      <rect x="24" y="26" width="16" height="11" rx="2" fill="url(#v)"/>
      <rect x="18" y="16" width="22" height="4" rx="2" fill="${HI}" opacity="0.22"/>`,
    mask: `
      <rect x="12" y="17" width="7" height="30" rx="3" fill="#000"/>
      <rect x="45" y="17" width="7" height="30" rx="3" fill="#000"/>
      <rect x="20" y="7" width="24" height="11" rx="3" fill="#000"/>
      <rect x="16" y="14" width="32" height="37" rx="7" fill="#fff"/>
      <rect x="22" y="24" width="20" height="17" rx="3" fill="#000"/>`,
  },

  // --- Marine: torso + shoulder pauldrons (team), helmet/visor, rifle, backpack. ---
  marine: {
    scale: 1.7,
    body: `<defs>${tg()}${glass()}</defs>
      <rect x="27" y="41" width="10" height="12" rx="3" fill="${STEEL}"/>
      <rect x="33" y="7" width="5" height="23" rx="2" fill="${STEEL2}" stroke="${EDGE}" stroke-width="1"/>
      <rect x="31" y="24" width="10" height="9" rx="2" fill="${STEEL}"/>
      <circle cx="20" cy="35" r="8" fill="url(#t)" stroke="${EDGE}" stroke-width="2"/>
      <circle cx="44" cy="35" r="8" fill="url(#t)" stroke="${EDGE}" stroke-width="2"/>
      <rect x="22" y="26" width="20" height="25" rx="9" fill="url(#t)" stroke="${EDGE}" stroke-width="2"/>
      <circle cx="32" cy="26" r="9" fill="${STEEL}" stroke="${EDGE}" stroke-width="1.5"/>
      <path d="M25 27 a7 7 0 0 1 14 0 z" fill="url(#v)"/>
      <circle cx="28" cy="23" r="2.4" fill="${HI}" opacity="0.5"/>`,
    mask: `
      <circle cx="20" cy="35" r="8" fill="#fff"/>
      <circle cx="44" cy="35" r="8" fill="#fff"/>
      <rect x="22" y="26" width="20" height="25" rx="9" fill="#fff"/>
      <rect x="27" y="41" width="10" height="12" rx="3" fill="#000"/>
      <circle cx="32" cy="26" r="9" fill="#000"/>
      <rect x="33" y="7" width="5" height="23" rx="2" fill="#000"/>
      <rect x="31" y="24" width="10" height="9" rx="2" fill="#000"/>`,
  },

  // --- Command Center: large hub, central landing pad, corner modules. ---
  commandCenter: {
    scale: 1.0,
    body: `<defs>${tg()}${warm()}</defs>
      <rect x="5" y="5" width="54" height="54" rx="13" fill="url(#t)" stroke="${EDGE}" stroke-width="3"/>
      <rect x="11" y="11" width="42" height="42" rx="9" fill="none" stroke="${EDGE}" stroke-width="1" opacity="0.22"/>
      <rect x="8" y="8" width="12" height="12" rx="3" fill="${STEEL}"/>
      <rect x="44" y="8" width="12" height="12" rx="3" fill="${STEEL}"/>
      <rect x="8" y="44" width="12" height="12" rx="3" fill="${STEEL}"/>
      <rect x="44" y="44" width="12" height="12" rx="3" fill="${STEEL}"/>
      <circle cx="32" cy="32" r="16" fill="${STEEL}" stroke="${EDGE}" stroke-width="2"/>
      <circle cx="32" cy="32" r="9" fill="url(#w)"/>
      <path d="M9 16 a8 8 0 0 1 7 -7" fill="none" stroke="${HI}" stroke-width="3" opacity="0.25" stroke-linecap="round"/>`,
    mask: `
      <rect x="5" y="5" width="54" height="54" rx="13" fill="#fff"/>
      <rect x="8" y="8" width="12" height="12" rx="3" fill="#000"/>
      <rect x="44" y="8" width="12" height="12" rx="3" fill="#000"/>
      <rect x="8" y="44" width="12" height="12" rx="3" fill="#000"/>
      <rect x="44" y="44" width="12" height="12" rx="3" fill="#000"/>
      <circle cx="32" cy="32" r="16" fill="#000"/>`,
  },

  // --- Supply Depot: low slab, hazard stripe, status lights. ---
  supplyDepot: {
    scale: 1.0,
    body: `<defs>${tg()}</defs>
      <rect x="8" y="14" width="48" height="36" rx="10" fill="url(#t)" stroke="${EDGE}" stroke-width="3"/>
      <rect x="15" y="20" width="34" height="7" rx="3" fill="${WARN}"/>
      <rect x="15" y="31" width="34" height="8" rx="3" fill="${STEEL}"/>
      <circle cx="19" cy="35" r="2.2" fill="#5aff7a"/>
      <circle cx="26" cy="35" r="2.2" fill="#5aff7a"/>
      <rect x="14" y="16" width="26" height="3.5" rx="1.5" fill="${HI}" opacity="0.2"/>`,
    mask: `
      <rect x="8" y="14" width="48" height="36" rx="10" fill="#fff"/>
      <rect x="15" y="20" width="34" height="7" rx="3" fill="#000"/>
      <rect x="15" y="31" width="34" height="8" rx="3" fill="#000"/>`,
  },

  // --- Barracks: production block, bay door, roof vents, beacon. ---
  barracks: {
    scale: 1.0,
    body: `<defs>${tg()}</defs>
      <rect x="7" y="9" width="50" height="46" rx="8" fill="url(#t)" stroke="${EDGE}" stroke-width="3"/>
      <rect x="13" y="15" width="14" height="9" rx="2" fill="${STEEL}"/>
      <rect x="37" y="15" width="14" height="9" rx="2" fill="${STEEL}"/>
      <rect x="15" y="17" width="10" height="2" rx="1" fill="${STEEL2}"/>
      <rect x="39" y="17" width="10" height="2" rx="1" fill="${STEEL2}"/>
      <rect x="23" y="34" width="18" height="21" rx="2" fill="${STEEL}"/>
      <rect x="26" y="38" width="12" height="17" rx="1" fill="${STEEL2}"/>
      <rect x="28" y="11" width="8" height="7" rx="2" fill="#ff5a4d"/>
      <rect x="12" y="11" width="26" height="3.5" rx="1.5" fill="${HI}" opacity="0.2"/>`,
    mask: `
      <rect x="7" y="9" width="50" height="46" rx="8" fill="#fff"/>
      <rect x="13" y="15" width="14" height="9" rx="2" fill="#000"/>
      <rect x="37" y="15" width="14" height="9" rx="2" fill="#000"/>
      <rect x="23" y="34" width="18" height="21" rx="2" fill="#000"/>`,
  },

  // --- Refinery: structure over a geyser, twin gas tanks + pipes. ---
  refinery: {
    scale: 1.0,
    body: `<defs>${tg()}<radialGradient id="g" cx="0.4" cy="0.35" r="0.8">
        <stop offset="0" stop-color="#76e89a"/><stop offset="1" stop-color="#2c8a48"/></radialGradient></defs>
      <rect x="8" y="15" width="48" height="35" rx="10" fill="url(#t)" stroke="${EDGE}" stroke-width="3"/>
      <rect x="29" y="17" width="6" height="16" rx="2" fill="${STEEL}"/>
      <circle cx="21" cy="33" r="9" fill="url(#g)" stroke="${EDGE}" stroke-width="2"/>
      <circle cx="43" cy="33" r="9" fill="url(#g)" stroke="${EDGE}" stroke-width="2"/>
      <circle cx="21" cy="33" r="3" fill="#0c3b22"/>
      <circle cx="43" cy="33" r="3" fill="#0c3b22"/>
      <rect x="14" y="17" width="22" height="3.5" rx="1.5" fill="${HI}" opacity="0.2"/>`,
    mask: `
      <rect x="8" y="15" width="48" height="35" rx="10" fill="#fff"/>
      <circle cx="21" cy="33" r="9" fill="#000"/>
      <circle cx="43" cy="33" r="9" fill="#000"/>
      <rect x="29" y="17" width="6" height="16" rx="2" fill="#000"/>`,
  },

  // --- Mineral field: faceted cyan crystals (neutral, never tinted). ---
  mineral: {
    scale: 1.25,
    body: `<defs>
        <linearGradient id="c" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stop-color="#9ff7ec"/><stop offset="1" stop-color="#19a9a0"/></linearGradient>
        <linearGradient id="c2" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stop-color="#cafdf6"/><stop offset="1" stop-color="#36cabe"/></linearGradient></defs>
      <polygon points="17,47 28,15 35,33 46,13 51,47" fill="url(#c)" stroke="#063b37" stroke-width="2" stroke-linejoin="round"/>
      <polygon points="23,47 30,23 38,47" fill="url(#c2)"/>
      <polygon points="40,47 46,21 52,47" fill="url(#c2)"/>
      <polygon points="28,15 31,24 25,25" fill="#dffdf8"/>
      <polygon points="46,13 49,24 42,24" fill="#dffdf8" opacity="0.9"/>`,
  },

  // --- Vespene geyser: dark vent with rising green gas (neutral). ---
  geyser: {
    scale: 1.0,
    body: `<defs>
        <radialGradient id="r" cx="0.5" cy="0.45" r="0.6">
          <stop offset="0" stop-color="#1c2a18"/><stop offset="1" stop-color="#2c3a2a"/></radialGradient>
        <radialGradient id="gg" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stop-color="#7dff8e"/><stop offset="1" stop-color="#2f9a46"/></radialGradient></defs>
      <ellipse cx="32" cy="45" rx="25" ry="14" fill="url(#r)" stroke="${EDGE}" stroke-width="2"/>
      <ellipse cx="32" cy="43" rx="13" ry="8" fill="#0e1a0c"/>
      <circle cx="30" cy="31" r="8" fill="url(#gg)" opacity="0.9"/>
      <circle cx="39" cy="22" r="5.5" fill="url(#gg)" opacity="0.7"/>
      <circle cx="33" cy="14" r="3.5" fill="url(#gg)" opacity="0.5"/>`,
  },
};

/** Wrap inner markup into a standalone, sized SVG document for rasterization. */
export const svgDoc = (inner: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">${inner}</svg>`;
