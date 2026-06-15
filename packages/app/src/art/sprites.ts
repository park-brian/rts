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

// --- Racial accent palettes (assets.md / Geometric-Grammar art direction) ---
// Each race tints the same neutral team region (tg) so 8-player colors stay
// dominant; identity comes from SHAPE + a FIXED accent set that never tints:
//   • Terran — steel + amber WARN (+ cyan glass). Boxy, riveted, bilateral.
//   • Protoss — GOLD filigree + a glowing psi-blue gem core + shield rim.
//     Faceted triangles/diamonds, radial symmetry, points skyward.
//   • Zerg — bio-orange FLESH/sacs + ACID green. Asymmetric chitin, spines.
const GOLD = '#e8b84b'; // Protoss trim (fixed)
const GOLD2 = '#9c7522';
const ZCHITIN = '#2a1a22'; // Zerg dark carapace detail (warm, not steel)
const ZSPINE = '#160c12';
const ACID = '#8bd146'; // Zerg spit / gas accent

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
// Protoss psionic gem (cool blue-white core) and Zerg living-flesh (orange sac).
const gem = (id = 'p'): string =>
  `<radialGradient id="${id}" cx="0.38" cy="0.32" r="0.85">` +
  `<stop offset="0" stop-color="#eafbff"/><stop offset="0.5" stop-color="#5cc3ff"/>` +
  `<stop offset="1" stop-color="#1f6fd6"/></radialGradient>`;
const flesh = (id = 'f'): string =>
  `<radialGradient id="${id}" cx="0.4" cy="0.35" r="0.8">` +
  `<stop offset="0" stop-color="#ffce8f"/><stop offset="0.55" stop-color="#f0863a"/>` +
  `<stop offset="1" stop-color="#b83f16"/></radialGradient>`;
// Zerg wing membrane (leathery, slightly translucent — fixed, never team-tinted).
const membrane = (id = 'm'): string =>
  `<linearGradient id="${id}" x1="0.1" y1="0" x2="0.7" y2="1">` +
  `<stop offset="0" stop-color="#8a6273"/><stop offset="1" stop-color="#4a2f3c"/></linearGradient>`;
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

  // ===================== TERRAN — air =====================
  // --- Wraith: boxy fuselage + swept rectangular wings, glass canopy, twin
  //     engine glows. A *machine* that flies — hard angles read as Terran air. ---
  wraith: {
    scale: 1.7,
    body: `<defs>${tg()}${glass()}${warm()}</defs>
      <polygon points="24,28 7,43 13,48 27,40" fill="url(#t)" stroke="${EDGE}" stroke-width="2"/>
      <polygon points="40,28 57,43 51,48 37,40" fill="url(#t)" stroke="${EDGE}" stroke-width="2"/>
      <polygon points="32,6 41,20 41,49 23,49 23,20" fill="url(#t)" stroke="${EDGE}" stroke-width="2"/>
      <rect x="27" y="46" width="4" height="9" rx="1.5" fill="${STEEL}"/>
      <rect x="33" y="46" width="4" height="9" rx="1.5" fill="${STEEL}"/>
      <circle cx="29" cy="53" r="3.5" fill="url(#w)"/>
      <circle cx="35" cy="53" r="3.5" fill="url(#w)"/>
      <polygon points="28,16 36,16 34,28 30,28" fill="url(#v)"/>
      <path d="M25 10 L30 9" stroke="${HI}" stroke-width="2" opacity="0.3" stroke-linecap="round"/>`,
    mask: `
      <polygon points="24,28 7,43 13,48 27,40" fill="#fff"/>
      <polygon points="40,28 57,43 51,48 37,40" fill="#fff"/>
      <polygon points="32,6 41,20 41,49 23,49 23,20" fill="#fff"/>
      <polygon points="28,16 36,16 34,28 30,28" fill="#000"/>
      <rect x="27" y="46" width="4" height="9" fill="#000"/>
      <rect x="33" y="46" width="4" height="9" fill="#000"/>`,
  },

  // ===================== PROTOSS =====================
  // --- Probe: hovering faceted drone, gold trim, central psi gem, mining
  //     emitter at the nose, three small claws. (Worker = tool + glow.) ---
  probe: {
    scale: 1.6,
    body: `<defs>${tg()}${gem()}</defs>
      <polygon points="22,40 17,52 23,49" fill="${GOLD2}"/>
      <polygon points="42,40 47,52 41,49" fill="${GOLD2}"/>
      <polygon points="32,46 30,55 34,55" fill="${GOLD2}"/>
      <polygon points="32,15 44,24 44,38 32,47 20,38 20,24" fill="url(#t)" stroke="${EDGE}" stroke-width="2"/>
      <polygon points="32,15 44,24 44,38 32,47 20,38 20,24" fill="none" stroke="${GOLD}" stroke-width="1.6"/>
      <rect x="29" y="9" width="6" height="7" rx="1.5" fill="${GOLD}" stroke="${EDGE}" stroke-width="1"/>
      <circle cx="32" cy="31" r="6.5" fill="url(#p)"/>
      <circle cx="30" cy="29" r="2" fill="#fff" opacity="0.6"/>`,
    mask: `
      <polygon points="32,15 44,24 44,38 32,47 20,38 20,24" fill="#fff"/>
      <circle cx="32" cy="31" r="6.5" fill="#000"/>
      <rect x="29" y="9" width="6" height="7" fill="#000"/>
      <polygon points="22,40 17,52 23,49" fill="#000"/>
      <polygon points="42,40 47,52 41,49" fill="#000"/>
      <polygon points="32,46 30,55 34,55" fill="#000"/>`,
  },

  // --- Zealot: faceted diamond torso, gold shoulder crests, twin glowing psi
  //     blades extended forward, head gem. Melee → blades point up (facing). ---
  zealot: {
    scale: 1.55,
    body: `<defs>${tg()}${gem()}
        <linearGradient id="b" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stop-color="#7fe9ff"/><stop offset="1" stop-color="#eafdff"/></linearGradient></defs>
      <polygon points="23,6 27,6 26,26 22,26" fill="url(#b)" stroke="${EDGE}" stroke-width="0.8"/>
      <polygon points="37,6 41,6 42,26 38,26" fill="url(#b)" stroke="${EDGE}" stroke-width="0.8"/>
      <polygon points="20,24 13,18 18,33" fill="${GOLD}" stroke="${EDGE}" stroke-width="1.2"/>
      <polygon points="44,24 51,18 46,33" fill="${GOLD}" stroke="${EDGE}" stroke-width="1.2"/>
      <polygon points="32,18 43,35 32,50 21,35" fill="url(#t)" stroke="${EDGE}" stroke-width="2"/>
      <polygon points="32,24 38,33 32,42 26,33" fill="${GOLD2}" opacity="0.55"/>
      <circle cx="32" cy="22" r="5" fill="url(#p)"/>`,
    mask: `
      <polygon points="32,18 43,35 32,50 21,35" fill="#fff"/>
      <circle cx="32" cy="22" r="5" fill="#000"/>
      <polygon points="20,24 13,18 18,33" fill="#000"/>
      <polygon points="44,24 51,18 46,33" fill="#000"/>
      <polygon points="23,6 27,6 26,26 22,26" fill="#000"/>
      <polygon points="37,6 41,6 42,26 38,26" fill="#000"/>`,
  },

  // ===================== PROTOSS — air =====================
  // --- Scout: sleek symmetric manta/arrowhead, gold leading edges, central psi
  //     gem, twin engine glows, faint shield rim. Floats → soft elevated shadow. ---
  scout: {
    scale: 1.75,
    body: `<defs>${tg()}${gem()}</defs>
      <polygon points="32,7 55,39 41,45 32,39 23,45 9,39" fill="url(#t)" stroke="${EDGE}" stroke-width="2"/>
      <polygon points="32,7 55,39 41,45 32,39 23,45 9,39" fill="none" stroke="#7fd0ff" stroke-width="1" opacity="0.4"/>
      <path d="M32 8 L52 38" stroke="${GOLD}" stroke-width="1.6" opacity="0.9"/>
      <path d="M32 8 L12 38" stroke="${GOLD}" stroke-width="1.6" opacity="0.9"/>
      <circle cx="27" cy="41" r="3" fill="url(#p)"/>
      <circle cx="37" cy="41" r="3" fill="url(#p)"/>
      <circle cx="32" cy="27" r="5.5" fill="url(#p)"/>
      <circle cx="30" cy="25" r="1.8" fill="#fff" opacity="0.6"/>`,
    mask: `
      <polygon points="32,7 55,39 41,45 32,39 23,45 9,39" fill="#fff"/>
      <circle cx="32" cy="27" r="5.5" fill="#000"/>
      <circle cx="27" cy="41" r="3" fill="#000"/>
      <circle cx="37" cy="41" r="3" fill="#000"/>`,
  },

  // --- Nexus: pyramid-from-above — concentric diamonds rising to a bright warp
  //     gem, gold-trimmed tiers, corner nodes. Radial symmetry = Protoss hub. ---
  nexus: {
    scale: 1.0,
    body: `<defs>${tg()}${gem()}</defs>
      <polygon points="32,3 61,32 32,61 3,32" fill="url(#t)" stroke="${EDGE}" stroke-width="3"/>
      <circle cx="32" cy="6" r="3" fill="${GOLD}"/><circle cx="58" cy="32" r="3" fill="${GOLD}"/>
      <circle cx="32" cy="58" r="3" fill="${GOLD}"/><circle cx="6" cy="32" r="3" fill="${GOLD}"/>
      <polygon points="32,13 51,32 32,51 13,32" fill="url(#t)" stroke="${GOLD}" stroke-width="1.8"/>
      <polygon points="32,21 43,32 32,43 21,32" fill="${STEEL}" stroke="${EDGE}" stroke-width="1.5"/>
      <circle cx="32" cy="32" r="8" fill="url(#p)"/>
      <circle cx="29" cy="29" r="2.6" fill="#fff" opacity="0.7"/>`,
    mask: `
      <polygon points="32,3 61,32 32,61 3,32" fill="#fff"/>
      <polygon points="32,13 51,32 32,51 13,32" fill="#fff"/>
      <polygon points="32,21 43,32 32,43 21,32" fill="#000"/>
      <circle cx="32" cy="32" r="8" fill="#000"/>`,
  },

  // ===================== ZERG =====================
  // --- Drone: asymmetric chitin teardrop over orange flesh, dorsal sac, mineral
  //     mandibles at the front, a couple of spines. (Worker = gather + glow.) ---
  drone: {
    scale: 1.55,
    body: `<defs>${tg()}${flesh()}</defs>
      <ellipse cx="35" cy="40" rx="11" ry="9" fill="url(#f)"/>
      <path d="M31 9 C 44 13, 45 33, 37 47 C 27 51, 19 41, 21 27 C 22 15, 25 11, 31 9 Z"
        fill="url(#t)" stroke="${EDGE}" stroke-width="2"/>
      <path d="M24 24 C 30 22, 36 26, 34 35" fill="none" stroke="${ZCHITIN}" stroke-width="1.6" opacity="0.8"/>
      <polygon points="28,10 25,2 31,9" fill="${ZSPINE}"/>
      <polygon points="36,12 40,4 38,13" fill="${ZSPINE}"/>
      <path d="M27 12 C 24 6, 22 10, 26 16 Z" fill="${ZCHITIN}"/>
      <path d="M35 12 C 39 7, 41 11, 37 16 Z" fill="${ZCHITIN}"/>
      <circle cx="30" cy="18" r="2" fill="#ffcf6a"/>`,
    mask: `
      <path d="M31 9 C 44 13, 45 33, 37 47 C 27 51, 19 41, 21 27 C 22 15, 25 11, 31 9 Z" fill="#fff"/>
      <ellipse cx="35" cy="40" rx="11" ry="9" fill="#000"/>
      <polygon points="28,10 25,2 31,9" fill="#000"/>
      <polygon points="36,12 40,4 38,13" fill="#000"/>`,
  },

  // --- Zergling: tiny low fast carapace blob, twin forward scythe-claws, dorsal
  //     spines, glowing eyes. Asymmetric & spiny → unmistakably Zerg ground. ---
  zergling: {
    scale: 1.35,
    body: `<defs>${tg()}</defs>
      <path d="M26 24 C 20 14, 16 8, 21 6 C 25 8, 28 16, 30 24 Z" fill="${ZCHITIN}" stroke="${EDGE}" stroke-width="1.2"/>
      <path d="M39 25 C 46 16, 49 9, 44 7 C 40 9, 37 17, 35 25 Z" fill="${ZCHITIN}" stroke="${EDGE}" stroke-width="1.2"/>
      <path d="M32 22 C 41 25, 41 44, 33 49 C 24 46, 23 30, 32 22 Z" fill="url(#t)" stroke="${EDGE}" stroke-width="2"/>
      <polygon points="28,40 25,50 31,44" fill="${ZSPINE}"/>
      <polygon points="36,40 39,50 33,44" fill="${ZSPINE}"/>
      <polygon points="32,30 35,38 29,38" fill="${ZSPINE}"/>
      <circle cx="29" cy="27" r="1.7" fill="#ff7a3a"/>
      <circle cx="35" cy="27" r="1.7" fill="#ff7a3a"/>`,
    mask: `
      <path d="M32 22 C 41 25, 41 44, 33 49 C 24 46, 23 30, 32 22 Z" fill="#fff"/>
      <path d="M26 24 C 20 14, 16 8, 21 6 C 25 8, 28 16, 30 24 Z" fill="#000"/>
      <path d="M39 25 C 46 16, 49 9, 44 7 C 40 9, 37 17, 35 25 Z" fill="#000"/>
      <polygon points="32,30 35,38 29,38" fill="#000"/>`,
  },

  // ===================== ZERG — air =====================
  // --- Mutalisk: lumpy asymmetric body, two leathery membrane wings (uneven),
  //     glowing dorsal sac, no engines, spore tail. A *creature* that flies. ---
  mutalisk: {
    scale: 1.7,
    body: `<defs>${tg()}${flesh()}${membrane()}</defs>
      <path d="M28 24 C 12 14, 4 20, 8 30 C 14 30, 20 30, 28 32 Z" fill="url(#m)" stroke="${EDGE}" stroke-width="1.5"/>
      <path d="M36 26 C 52 18, 61 26, 56 36 C 49 35, 43 34, 36 34 Z" fill="url(#m)" stroke="${EDGE}" stroke-width="1.5"/>
      <path d="M12 22 L20 28 M50 24 L42 30" stroke="${ZSPINE}" stroke-width="1" opacity="0.6"/>
      <ellipse cx="33" cy="30" rx="11" ry="13" fill="url(#t)" stroke="${EDGE}" stroke-width="2"/>
      <ellipse cx="33" cy="26" rx="5.5" ry="6" fill="url(#f)"/>
      <polygon points="30,9 28,2 33,9" fill="${ZSPINE}"/>
      <circle cx="29" cy="14" r="1.8" fill="#ff7a3a"/>
      <circle cx="37" cy="15" r="1.6" fill="#ff7a3a"/>
      <path d="M33 43 C 30 50, 36 52, 34 58" fill="none" stroke="${ZCHITIN}" stroke-width="2"/>`,
    mask: `
      <ellipse cx="33" cy="30" rx="11" ry="13" fill="#fff"/>
      <ellipse cx="33" cy="26" rx="5.5" ry="6" fill="#000"/>
      <path d="M28 24 C 12 14, 4 20, 8 30 C 14 30, 20 30, 28 32 Z" fill="#000"/>
      <path d="M36 26 C 52 18, 61 26, 56 36 C 49 35, 43 34, 36 34 Z" fill="#000"/>`,
  },

  // --- Hatchery: bulbous asymmetric mound, carapace plates over orange orifices,
  //     rim spines. Rooted & fleshy → Zerg hub (sits on creep in-world). ---
  hatchery: {
    scale: 1.0,
    body: `<defs>${tg()}${flesh()}</defs>
      <path d="M32 8 C 54 10, 60 28, 56 44 C 50 58, 30 60, 16 52 C 4 44, 6 22, 18 13 C 23 9, 27 8, 32 8 Z"
        fill="url(#f)" stroke="${EDGE}" stroke-width="2"/>
      <path d="M30 12 C 46 12, 52 26, 48 38 C 40 48, 24 48, 18 38 C 13 28, 17 16, 30 12 Z"
        fill="url(#t)" stroke="${EDGE}" stroke-width="2"/>
      <path d="M40 16 C 50 20, 50 34, 44 40 C 50 30, 48 22, 40 16 Z" fill="url(#t)" stroke="${EDGE}" stroke-width="1.5"/>
      <ellipse cx="28" cy="30" rx="7" ry="6" fill="url(#f)"/>
      <ellipse cx="28" cy="30" rx="3" ry="2.6" fill="#3a1408"/>
      <circle cx="42" cy="44" r="3.5" fill="url(#f)"/>
      <polygon points="14,18 6,12 17,17" fill="${ZSPINE}"/>
      <polygon points="52,16 60,11 53,20" fill="${ZSPINE}"/>
      <polygon points="50,50 58,54 49,53" fill="${ZSPINE}"/>
      <polygon points="18,52 12,58 22,54" fill="${ZSPINE}"/>`,
    mask: `
      <path d="M30 12 C 46 12, 52 26, 48 38 C 40 48, 24 48, 18 38 C 13 28, 17 16, 30 12 Z" fill="#fff"/>
      <path d="M40 16 C 50 20, 50 34, 44 40 C 50 30, 48 22, 40 16 Z" fill="#fff"/>
      <ellipse cx="28" cy="30" rx="7" ry="6" fill="#000"/>
      <circle cx="42" cy="44" r="3.5" fill="#000"/>`,
  },
};

/** Wrap inner markup into a standalone, sized SVG document for rasterization. */
export const svgDoc = (inner: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">${inner}</svg>`;
