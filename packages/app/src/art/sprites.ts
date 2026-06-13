// Engine sprite table for the playable (Terran) subset. Bodies are the flat
// top-down "signature distillation" art shared with the full roster (art/roster.ts,
// also driving the sprites.html viewer); here each team region is neutralized to a
// grey gradient so the GL fragment-shader multiply through the mask channel yields a
// vivid, still-shaded team tint (assets.md §4). Each sprite is two layers:
//   • `body` — full color, team region = url(#t) neutral grey.
//   • `mask` — white over the team silhouette, with black punch-outs where a detail
//     (visor, window, gun, vents…) overlaps that silhouette so it keeps its own color.
// Authored in a 64×64 viewBox, centered, facing up (−y). Minerals/geyser carry no
// mask (neutral resources, never team-tinted). Adding more units = author them in
// art/roster.ts and surface them here once the sim spawns them.

import { bodyOf, EDGE } from './roster.ts';

export type SpriteDef = { body: string; mask?: string; scale?: number };

// Neutralize a roster body (TEAMFILL → shaded grey) for the mask-multiply tint.
const tgDefs =
  `<defs><linearGradient id="t" x1="0.1" y1="0.05" x2="0.9" y2="1">` +
  `<stop offset="0" stop-color="#f4f6f9"/><stop offset="0.55" stop-color="#dfe3e8"/>` +
  `<stop offset="1" stop-color="#bcc2ca"/></linearGradient></defs>`;
const neutral = (name: string): string => tgDefs + bodyOf(name)!.svg.replaceAll('TEAMFILL', 'url(#t)');

export const SPRITES: Record<string, SpriteDef> = {
  // --- SCV: square power-suit (helmet + pauldrons = team), visor + tool punched out. ---
  scv: {
    scale: 1.7,
    body: neutral('scv'),
    mask: `<rect x="11" y="33" width="12" height="13" rx="3" fill="#fff"/>
      <rect x="41" y="33" width="12" height="13" rx="3" fill="#fff"/>
      <rect x="22" y="26" width="20" height="20" rx="5" fill="#fff"/>
      <rect x="26" y="31" width="12" height="8" rx="2" fill="#000"/>
      <rect x="30" y="5" width="5" height="18" rx="2" fill="#000"/>`,
  },

  // --- Marine: round helmet + two pauldrons (team), visor + rifle punched out. ---
  marine: {
    scale: 1.7,
    body: neutral('marine'),
    mask: `<circle cx="21" cy="40" r="9" fill="#fff"/>
      <circle cx="43" cy="40" r="9" fill="#fff"/>
      <circle cx="32" cy="37" r="11" fill="#fff"/>
      <path d="M24 34 a8 8 0 0 1 16 0 z" fill="#000"/>
      <rect x="38" y="13" width="6" height="25" rx="2.5" fill="#000"/>`,
  },

  // --- Command Center: hub body (team), engine pods + landing pad + bay punched out. ---
  commandCenter: {
    scale: 1.0,
    body: neutral('commandCenter'),
    mask: `<rect x="6" y="6" width="52" height="52" rx="12" fill="#fff"/>
      <rect x="8" y="8" width="9" height="9" rx="2" fill="#000"/>
      <rect x="47" y="8" width="9" height="9" rx="2" fill="#000"/>
      <rect x="8" y="47" width="9" height="9" rx="2" fill="#000"/>
      <rect x="47" y="47" width="9" height="9" rx="2" fill="#000"/>
      <circle cx="32" cy="29" r="15" fill="#000"/>
      <rect x="25" y="50" width="14" height="7" rx="2" fill="#000"/>`,
  },

  // --- Supply Depot: slab (team), hazard + status strips punched out. ---
  supplyDepot: {
    scale: 1.0,
    body: neutral('supplyDepot'),
    mask: `<rect x="10" y="16" width="44" height="32" rx="9" fill="#fff"/>
      <rect x="16" y="21" width="32" height="9" rx="3" fill="#000"/>
      <rect x="16" y="33" width="32" height="8" rx="3" fill="#000"/>`,
  },

  // --- Barracks: block (team), vents + bay door + beacon punched out. ---
  barracks: {
    scale: 1.0,
    body: neutral('barracks'),
    mask: `<rect x="7" y="9" width="50" height="46" rx="8" fill="#fff"/>
      <rect x="13" y="15" width="14" height="9" rx="2" fill="#000"/>
      <rect x="37" y="15" width="14" height="9" rx="2" fill="#000"/>
      <rect x="23" y="34" width="18" height="21" rx="2" fill="#000"/>
      <rect x="28" y="11" width="8" height="7" rx="2" fill="#000"/>`,
  },

  // --- Refinery: structure (team), gas tanks + pipe punched out. ---
  refinery: {
    scale: 1.0,
    body: neutral('refinery'),
    mask: `<rect x="8" y="15" width="48" height="35" rx="10" fill="#fff"/>
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
