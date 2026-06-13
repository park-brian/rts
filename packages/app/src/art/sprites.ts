// Engine sprite table. Bodies are the flat top-down "signature distillation" art
// from the shared roster (art/roster.ts, also driving the sprites.html viewer).
// Every roster sprite is wired for the GL renderer here: the team region (the
// TEAMFILL token) is neutralized to a grey gradient on the color layer, and a mask
// is derived automatically (team region → white, every other fill/stroke → black,
// "none" preserved) so the fragment shader multiplies the player color through the
// mask channel (assets.md §4). Because the roster is flat-filled and draw-ordered,
// details that overlap the team silhouette punch themselves out of the mask.
//
// Minerals & the geyser are neutral resources (no mask, never team-tinted) and are
// authored here directly. Units are scaled up so they read against building-scale
// footprints. Adding a unit/building anywhere = author it in roster.ts; it shows up
// here (and in the atlas) automatically.

import { ROSTER, EDGE } from './roster.ts';

export type SpriteDef = { body: string; mask?: string; scale?: number };

// Neutralize a roster body for the mask-multiply tint. Three team tones — light
// highlight / medium / dark shadow facets — become grey levels so `base × team`
// yields shades of the player color (faceted volume); all three sit in the mask.
const neutral = (svg: string): string =>
  svg
    .replaceAll('TEAMLITE', '#eef1f6')
    .replaceAll('TEAMDARK', '#787f8c')
    .replaceAll('TEAMFILL', '#c2c7cf');

// Derive the team mask from a body: white over any team tone, black elsewhere.
const autoMask = (svg: string): string =>
  svg
    .replace(/stroke="[^"]*"/g, 'stroke="#000"')
    .replace(/fill="(?!none"|TEAMFILL"|TEAMDARK"|TEAMLITE")[^"]*"/g, 'fill="#000"')
    .replace(/fill="TEAM(?:FILL|DARK|LITE)"/g, 'fill="#fff"');

export const SPRITES: Record<string, SpriteDef> = {};
for (const s of ROSTER) {
  SPRITES[s.name] = {
    scale: (s.cat === 'unit' ? 1.7 : 1.0) * (s.scale ?? 1),
    body: neutral(s.svg),
    mask: s.svg.includes('TEAMFILL') ? autoMask(s.svg) : undefined,
  };
}

// --- Neutral resources (never team-tinted): mineral crystals + vespene geyser. ---
SPRITES.mineral = {
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
};
SPRITES.geyser = {
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
};

/** Wrap inner markup into a standalone, sized SVG document for rasterization. */
export const svgDoc = (inner: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">${inner}</svg>`;
