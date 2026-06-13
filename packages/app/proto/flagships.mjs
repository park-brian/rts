// Prototype flagship sprites — flat, top-down "signature distillation" style.
// Each unit = 2-4 recognizable overhead parts, facing up (−y), with a strong
// forward nose so facing reads. `TEAMFILL` is replaced per-render by a team hex.
// Race coding: Terran = round/square + amber/steel; Protoss = crystal + cyan/gold;
// Zerg = organic + violet/bone. Tank ships as two layers (hull + turret) to show
// independent turret aim.

const EDGE = '#0d1018';
const STEEL = '#2a2f3a';
const STEEL2 = '#3c424f';
const WARN = '#ffb43d';
const CYAN = '#5fe3ff';
const GOLD = '#ffd56a';
const BIO = '#b14bff';
const BONE = '#d9c7a8';
const HI = '#ffffff';

const svg = (inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">${inner}</svg>`;

// Each entry: { layers: [svgString, ...], label }. One layer unless noted.
export const FLAGSHIPS = {
  marine: { label: 'Marine · Terran', race: 'T', layers: [svg(`
    <circle cx="22" cy="41" r="9" fill="TEAMFILL" stroke="${EDGE}" stroke-width="2"/>
    <circle cx="42" cy="41" r="9" fill="TEAMFILL" stroke="${EDGE}" stroke-width="2"/>
    <rect x="37" y="7" width="6" height="31" rx="2.5" fill="${STEEL}" stroke="${EDGE}" stroke-width="1.4"/>
    <circle cx="32" cy="34" r="11" fill="TEAMFILL" stroke="${EDGE}" stroke-width="2.5"/>
    <path d="M24 31 a8 8 0 0 1 16 0 z" fill="${STEEL}"/>
    <circle cx="28" cy="29" r="2.3" fill="${HI}" opacity="0.4"/>`)] },

  scv: { label: 'SCV · Terran', race: 'T', layers: [svg(`
    <rect x="14" y="22" width="4" height="24" rx="2" fill="${STEEL}"/>
    <rect x="46" y="22" width="4" height="24" rx="2" fill="${STEEL}"/>
    <rect x="23" y="6" width="5" height="14" rx="2" fill="${WARN}" stroke="${EDGE}" stroke-width="1.2"/>
    <rect x="36" y="6" width="5" height="14" rx="2" fill="${WARN}" stroke="${EDGE}" stroke-width="1.2"/>
    <rect x="16" y="18" width="32" height="32" rx="5" fill="TEAMFILL" stroke="${EDGE}" stroke-width="2.5"/>
    <rect x="24" y="27" width="16" height="14" rx="2" fill="${STEEL2}"/>
    <rect x="19" y="21" width="13" height="3" rx="1.5" fill="${HI}" opacity="0.22"/>`)] },

  drone: { label: 'Drone · Zerg', race: 'Z', layers: [svg(`
    <path d="M40 26 l9 -4" stroke="${BONE}" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <path d="M24 28 l-9 -3" stroke="${BONE}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <path d="M32 6 C44 12 46 34 40 49 C36 57 28 57 24 49 C18 34 20 12 32 6 Z" fill="TEAMFILL" stroke="${EDGE}" stroke-width="2.5"/>
    <path d="M24 32 q8 5 16 0" fill="none" stroke="${EDGE}" stroke-width="1.4" opacity="0.45"/>
    <path d="M25 40 q7 5 14 0" fill="none" stroke="${EDGE}" stroke-width="1.4" opacity="0.45"/>
    <ellipse cx="32" cy="16" rx="7" ry="6" fill="${BIO}"/>
    <circle cx="32" cy="15" r="2.4" fill="#1a0b22"/>`)] },

  hydralisk: { label: 'Hydralisk · Zerg', race: 'Z', layers: [svg(`
    <path d="M28 20 L13 30" stroke="${BONE}" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M29 26 L15 39" stroke="${BONE}" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M36 20 L51 30" stroke="${BONE}" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M35 26 L49 39" stroke="${BONE}" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M32 6 C41 18 41 35 37 51 L27 51 C23 35 23 18 32 6 Z" fill="TEAMFILL" stroke="${EDGE}" stroke-width="2.5"/>
    <ellipse cx="32" cy="15" rx="6" ry="7" fill="${BIO}"/>
    <path d="M29 9 l3 7 3 -7 z" fill="#1a0b22"/>`)] },

  dragoon: { label: 'Dragoon · Protoss', race: 'P', layers: [svg(`
    <path d="M32 32 L13 13 M32 32 L51 13 M32 32 L15 51 M32 32 L49 51" stroke="${STEEL2}" stroke-width="4.5" stroke-linecap="round"/>
    <circle cx="13" cy="13" r="3" fill="${STEEL}"/><circle cx="51" cy="13" r="3" fill="${STEEL}"/>
    <circle cx="15" cy="51" r="3" fill="${STEEL}"/><circle cx="49" cy="51" r="3" fill="${STEEL}"/>
    <path d="M32 13 C42 20 44 30 32 51 C20 30 22 20 32 13 Z" fill="TEAMFILL" stroke="${EDGE}" stroke-width="2.5"/>
    <circle cx="32" cy="31" r="7.5" fill="${CYAN}"/>
    <circle cx="32" cy="31" r="3.6" fill="#eaffff"/>
    <circle cx="32" cy="14" r="3.2" fill="${GOLD}"/>`)] },

  zealot: { label: 'Zealot · Protoss', race: 'P', layers: [svg(`
    <path d="M23 4 L20 25 L27 25 Z" fill="${CYAN}" stroke="${EDGE}" stroke-width="0.8"/>
    <path d="M41 4 L37 25 L44 25 Z" fill="${CYAN}" stroke="${EDGE}" stroke-width="0.8"/>
    <path d="M16 34 L24 24 L26 40 Z" fill="TEAMFILL" stroke="${EDGE}" stroke-width="2"/>
    <path d="M48 34 L40 24 L38 40 Z" fill="TEAMFILL" stroke="${EDGE}" stroke-width="2"/>
    <circle cx="32" cy="37" r="11" fill="TEAMFILL" stroke="${EDGE}" stroke-width="2.5"/>
    <circle cx="32" cy="34" r="4.2" fill="${GOLD}"/>
    <circle cx="28" cy="32" r="2" fill="${HI}" opacity="0.45"/>`)] },

  // Siege Tank: hull (faces movement) + turret (tracks target), drawn as two layers.
  tankHull: { label: 'Siege Tank · Terran', race: 'T', layers: [svg(`
    <rect x="9" y="13" width="10" height="38" rx="3" fill="${STEEL}" stroke="${EDGE}" stroke-width="1.5"/>
    <rect x="45" y="13" width="10" height="38" rx="3" fill="${STEEL}" stroke="${EDGE}" stroke-width="1.5"/>
    <rect x="11" y="18" width="6" height="3" fill="${STEEL2}"/><rect x="11" y="26" width="6" height="3" fill="${STEEL2}"/>
    <rect x="11" y="34" width="6" height="3" fill="${STEEL2}"/><rect x="11" y="42" width="6" height="3" fill="${STEEL2}"/>
    <rect x="47" y="18" width="6" height="3" fill="${STEEL2}"/><rect x="47" y="26" width="6" height="3" fill="${STEEL2}"/>
    <rect x="47" y="34" width="6" height="3" fill="${STEEL2}"/><rect x="47" y="42" width="6" height="3" fill="${STEEL2}"/>
    <rect x="18" y="17" width="28" height="30" rx="5" fill="TEAMFILL" stroke="${EDGE}" stroke-width="2.5"/>`)],
    turret: svg(`
    <rect x="29" y="1" width="6" height="33" rx="2" fill="${STEEL2}" stroke="${EDGE}" stroke-width="1.5"/>
    <rect x="27" y="6" width="10" height="4" rx="1" fill="${STEEL}"/>
    <circle cx="32" cy="34" r="11" fill="TEAMFILL" stroke="${EDGE}" stroke-width="2.5"/>
    <rect x="26" y="30" width="12" height="9" rx="2" fill="${STEEL}"/>
    <circle cx="28" cy="30" r="2" fill="${HI}" opacity="0.35"/>`) },

  // One building per race — top-down "roof signature", footprint-symmetric (no facing).
  commandCenter: { label: 'Command Center · Terran', race: 'T', scale: 1.0, building: true, layers: [svg(`
    <rect x="6" y="6" width="52" height="52" rx="11" fill="TEAMFILL" stroke="${EDGE}" stroke-width="3"/>
    <rect x="9" y="9" width="12" height="12" rx="3" fill="${STEEL}"/><rect x="43" y="9" width="12" height="12" rx="3" fill="${STEEL}"/>
    <rect x="9" y="43" width="12" height="12" rx="3" fill="${STEEL}"/><rect x="43" y="43" width="12" height="12" rx="3" fill="${STEEL}"/>
    <circle cx="32" cy="32" r="15" fill="${STEEL}" stroke="${EDGE}" stroke-width="2"/>
    <circle cx="32" cy="32" r="8" fill="${WARN}"/>
    <rect x="11" y="11" width="20" height="3.5" rx="1.5" fill="${HI}" opacity="0.2"/>`)] },

  nexus: { label: 'Nexus · Protoss', race: 'P', scale: 1.0, building: true, layers: [svg(`
    <path d="M32 5 L57 32 L32 59 L7 32 Z" fill="TEAMFILL" stroke="${EDGE}" stroke-width="3"/>
    <path d="M32 14 L50 32 L32 50 L14 32 Z" fill="none" stroke="${GOLD}" stroke-width="1.6" opacity="0.7"/>
    <circle cx="32" cy="32" r="10" fill="${STEEL}" stroke="${EDGE}" stroke-width="1.5"/>
    <circle cx="32" cy="32" r="6" fill="${CYAN}"/>
    <circle cx="29" cy="29" r="2" fill="${HI}" opacity="0.5"/>`)] },

  hatchery: { label: 'Hatchery · Zerg', race: 'Z', scale: 1.0, building: true, layers: [svg(`
    <path d="M32 7 C50 9 57 24 54 38 C51 54 38 58 32 58 C26 58 13 54 10 38 C7 24 14 9 32 7 Z" fill="TEAMFILL" stroke="${EDGE}" stroke-width="3"/>
    <ellipse cx="22" cy="26" rx="5" ry="6" fill="#1a0b22"/>
    <ellipse cx="43" cy="28" rx="5" ry="6" fill="#1a0b22"/>
    <ellipse cx="31" cy="44" rx="6" ry="7" fill="#1a0b22"/>
    <circle cx="32" cy="30" r="5" fill="${BIO}"/>
    <path d="M18 16 q10 -6 22 -2" fill="none" stroke="${HI}" stroke-width="2" opacity="0.18"/>`)] },
};
