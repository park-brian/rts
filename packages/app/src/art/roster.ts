// Full sprite roster — flat top-down "signature distillation" for every unit and
// building across all three races. Each sprite is authored in a 64×64 viewBox,
// centered, facing up (−y), as a handful of overhead-recognizable parts. The team
// region is painted with the literal token `TEAMFILL`, swapped per render: the
// standalone viewer (sprites.html) substitutes a player color; the engine
// (art/sprites.ts) substitutes a neutral so the GL mask-multiply tints it.
//
// Race coding: Terran = round/boxy + amber/steel; Protoss = crystal facets +
// cyan/gold; Zerg = organic curves + violet/bone. `air` lifts the unit (the
// viewer/engine add a detached shadow); `turret` is a second sprite layer that
// aims independently of the hull.

export const EDGE = '#0d1018';
export const STEEL = '#2a2f3a';
export const STEEL2 = '#3c424f';
export const STEEL3 = '#586273';
export const WARN = '#ffb43d';
export const REDL = '#ff5a4d';
export const CYAN = '#5fe3ff';
export const GOLD = '#ffd56a';
export const PSI = '#9b7bff';
export const BIO = '#b14bff';
export const BONE = '#d9c7a8';
export const ACID = '#7dff8e';
export const GASG = '#48c46a';
export const MINC = '#6fe9e0';
export const DARK = '#160f1e';
export const HI = '#ffffff';
export const T = 'TEAMFILL';

// ---- tiny SVG part helpers (keep each sprite to a few legible primitives) ----
const A = (s: string | number = 2): string => ` stroke="${EDGE}" stroke-width="${s}"`;
const C = (x: number, y: number, r: number, f: string, s: number | 0 = 2): string =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${f}"${s ? A(s) : ''}/>`;
const E = (x: number, y: number, rx: number, ry: number, f: string, s: number | 0 = 2): string =>
  `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${f}"${s ? A(s) : ''}/>`;
const R = (x: number, y: number, w: number, h: number, rx: number, f: string, s: number | 0 = 0): string =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${f}"${s ? A(s) : ''}/>`;
const P = (d: string, f: string, s: number | 0 = 0): string => `<path d="${d}" fill="${f}"${s ? A(s) : ''}/>`;
const PL = (pts: string, f: string, s: number | 0 = 0): string => `<polygon points="${pts}" fill="${f}"${s ? A(s) : ''}/>`;
const L = (x1: number, y1: number, x2: number, y2: number, col: string, w: number | string = 2.4): string =>
  `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${col}" stroke-width="${w}" stroke-linecap="round" fill="none"/>`;
// Stroked freeform path (curving spines, tendrils, segments).
const SP = (d: string, col: string, w: number | string = 2.4, op: number | string = 1): string =>
  `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" opacity="${op}"/>`;
const G = (x: number, y: number, r: number, col: string, op: number | string = 1): string =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${col}" opacity="${op}"/>`;
const HL = (x: number, y: number, w: number, h: number): string =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5" fill="${HI}" opacity="0.2"/>`;
const RING = (x: number, y: number, r: number, col: string, w = 1.6, op = 0.7): string =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${col}" stroke-width="${w}" opacity="${op}"/>`;

// --- Faceted style (matches the hand-authored reference look): bold filled angular
// polygons, no outlines. The team region is `TP` (team-filled); `HL` is a light
// facet highlight (cut-paper bevel); `DK` is near-black detail; `AC` is an accent. ---
const FACET = '#d6d2db';
const NEARBLACK = '#16121a';
const TP = (pts: string): string => `<polygon points="${pts}" fill="TEAMFILL"/>`;
const FH = (pts: string): string => `<polygon points="${pts}" fill="${FACET}"/>`;
const DK = (pts: string): string => `<polygon points="${pts}" fill="${NEARBLACK}"/>`;
const AC = (pts: string, col: string): string => `<polygon points="${pts}" fill="${col}"/>`;
const DOT = (x: number, y: number, r: number, col: string): string => `<circle cx="${x}" cy="${y}" r="${r}" fill="${col}"/>`;

import { IMPORTED } from './imported.ts';

export type Sprite = {
  race: 'terran' | 'protoss' | 'zerg';
  cat: 'unit' | 'building';
  name: string;
  label: string;
  scale?: number;
  air?: boolean;
  svg: string; // inner markup, 64×64, facing up
  turret?: string; // optional independently-rotating second layer
};

// =====================================================================
// TERRAN
// =====================================================================
const terran: Sprite[] = [
  // SCV: a worker in a boxy power-suit — square helmet + square pauldrons (the
  // Marine's anatomy, squared off) with a forward welding tool instead of a rifle.
  { race: 'terran', cat: 'unit', name: 'scv', label: 'SCV', svg:
    TP('10,31 22,29 22,47 12,49') + FH('10,31 12,49 15,48 14,32') +
    TP('54,31 42,29 42,47 52,49') + FH('54,31 52,49 49,48 50,32') +
    TP('22,23 42,23 45,49 19,49') + FH('19,49 22,23 26,24 24,48') +
    DK('25,27 39,27 40,40 24,40') + AC('28,29 36,29 35,38 29,38', '#bfe0f2') +
    AC('29,5 35,5 34,22 30,22', WARN) + DK('30,2 34,2 33,7 31,7') + DOT(32, 7, 2, '#ffe49a') },

  { race: 'terran', cat: 'unit', name: 'marine', label: 'Marine', svg:
    TP('11,32 23,28 25,44 13,48') + FH('11,32 13,48 16,47 15,33') +
    TP('53,32 41,28 39,44 51,48') + FH('53,32 51,48 48,47 49,33') +
    TP('23,29 41,29 44,50 20,50') + FH('20,50 23,29 27,30 24,49') +
    TP('25,15 39,15 44,27 32,32 20,27') + FH('20,27 25,15 28,16 24,27') +
    DK('26,20 38,20 41,27 32,31 23,27') + DK('41,6 46,8 45,30 40,28') },

  { race: 'terran', cat: 'unit', name: 'firebat', label: 'Firebat', svg:
    C(22, 41, 9, T) + C(42, 41, 9, T) +
    R(24, 5, 7, 16, 3, STEEL, 1.3) + R(33, 5, 7, 16, 3, STEEL, 1.3) +
    G(27, 7, 2.6, REDL) + G(36, 7, 2.6, REDL) +
    C(32, 35, 11, T, 2.5) + P('M25 32 a7 7 0 0 1 14 0 z', STEEL2) },

  { race: 'terran', cat: 'unit', name: 'medic', label: 'Medic', svg:
    C(22, 41, 9, T) + C(42, 41, 9, T) + C(32, 34, 11, T, 2.5) +
    P('M25 31 a7 7 0 0 1 14 0 z', '#cdeeff') +
    R(30, 27, 4, 14, 1, REDL) + R(25, 32, 14, 4, 1, REDL) },

  { race: 'terran', cat: 'unit', name: 'ghost', label: 'Ghost', svg:
    R(38, 6, 4, 30, 2, STEEL2, 1) +
    C(24, 40, 7, T) + C(40, 40, 7, T) + C(32, 33, 9, T, 2.2) +
    P('M26 31 a6 6 0 0 1 12 0 z', '#9fb4cc') + G(28, 28, 1.8, HI, 0.5) },

  { race: 'terran', cat: 'unit', name: 'vulture', label: 'Vulture', svg:
    L(16, 24, 14, 46, STEEL3, 4) + L(48, 24, 50, 46, STEEL3, 4) +
    P('M32 6 L44 40 L32 50 L20 40 Z', T, 2.5) + R(28, 30, 8, 16, 2, STEEL) +
    G(32, 50, 3, WARN) + HL(26, 16, 8, 3) },

  { race: 'terran', cat: 'unit', name: 'siegeTank', label: 'Siege Tank',
    svg:
      R(9, 13, 10, 38, 3, STEEL, 1.5) + R(45, 13, 10, 38, 3, STEEL, 1.5) +
      R(11, 18, 6, 3, 0, STEEL2) + R(11, 26, 6, 3, 0, STEEL2) + R(11, 34, 6, 3, 0, STEEL2) + R(11, 42, 6, 3, 0, STEEL2) +
      R(47, 18, 6, 3, 0, STEEL2) + R(47, 26, 6, 3, 0, STEEL2) + R(47, 34, 6, 3, 0, STEEL2) + R(47, 42, 6, 3, 0, STEEL2) +
      R(18, 17, 28, 30, 5, T, 2.5),
    turret:
      R(29, 1, 6, 33, 2, STEEL2, 1.5) + R(27, 6, 10, 4, 1, STEEL) +
      C(32, 34, 11, T, 2.5) + R(26, 30, 12, 9, 2, STEEL) + G(28, 30, 2, HI, 0.35) },

  { race: 'terran', cat: 'unit', name: 'goliath', label: 'Goliath', svg:
    L(15, 22, 11, 44, STEEL3, 5) + L(49, 22, 53, 44, STEEL3, 5) +
    R(18, 18, 28, 30, 5, T, 2.5) +
    R(14, 12, 10, 9, 2, STEEL, 1.2) + R(40, 12, 10, 9, 2, STEEL, 1.2) +
    R(16, 9, 6, 5, 1, STEEL2) + R(42, 9, 6, 5, 1, STEEL2) +
    R(29, 8, 6, 14, 2, STEEL2, 1) },

  { race: 'terran', cat: 'unit', name: 'wraith', label: 'Wraith', air: true, svg:
    P('M32 5 L40 30 L32 38 L24 30 Z', T, 2.5) +
    P('M22 26 L8 42 L20 40 Z', STEEL, 1.2) + P('M42 26 L56 42 L44 40 Z', STEEL, 1.2) +
    R(27, 40, 4, 8, 1, REDL) + R(33, 40, 4, 8, 1, REDL) + G(32, 22, 2.4, HI, 0.4) },

  { race: 'terran', cat: 'unit', name: 'dropship', label: 'Dropship', air: true, svg:
    P('M32 6 C46 12 48 40 40 52 L24 52 C16 40 18 12 32 6 Z', T, 2.5) +
    R(26, 22, 12, 18, 3, STEEL2) +
    C(18, 24, 4, STEEL, 1) + C(46, 24, 4, STEEL, 1) + C(18, 44, 4, STEEL, 1) + C(46, 44, 4, STEEL, 1) },

  { race: 'terran', cat: 'unit', name: 'scienceVessel', label: 'Science Vessel', air: true, svg:
    E(32, 34, 24, 18, T, 2.5) + C(32, 30, 10, STEEL2, 1.5) + C(32, 28, 5, CYAN) +
    C(14, 38, 3, WARN) + C(50, 38, 3, WARN) + C(32, 48, 3, WARN) + G(26, 24, 3, HI, 0.4) },

  { race: 'terran', cat: 'unit', name: 'valkyrie', label: 'Valkyrie', air: true, svg:
    P('M32 6 L38 34 L32 44 L26 34 Z', T, 2.2) +
    R(8, 20, 16, 16, 3, STEEL, 1.4) + R(40, 20, 16, 16, 3, STEEL, 1.4) +
    R(11, 23, 3, 10, 1, REDL) + R(16, 23, 3, 10, 1, REDL) + R(45, 23, 3, 10, 1, REDL) + R(50, 23, 3, 10, 1, REDL) },

  { race: 'terran', cat: 'unit', name: 'battlecruiser', label: 'Battlecruiser', air: true, scale: 1.3, svg:
    P('M32 4 C42 14 44 40 38 56 L26 56 C20 40 22 14 32 4 Z', T, 3) +
    R(27, 2, 10, 12, 3, STEEL2, 1.4) + R(30, 0, 4, 8, 1, STEEL3) +
    R(22, 44, 20, 10, 3, STEEL) + G(27, 49, 2.4, CYAN) + G(37, 49, 2.4, CYAN) + HL(26, 12, 8, 3) },

  { race: 'terran', cat: 'unit', name: 'spiderMine', label: 'Spider Mine', scale: 0.8, svg:
    L(20, 24, 10, 14, STEEL3, 2.4) + L(44, 24, 54, 14, STEEL3, 2.4) +
    L(20, 40, 10, 50, STEEL3, 2.4) + L(44, 40, 54, 50, STEEL3, 2.4) +
    C(32, 32, 12, T, 2.5) + G(32, 32, 4, REDL) },

  // ---- Terran buildings ----
  // Command Center: armored hub with corner engine pods, an off-set circular
  // landing pad (cross-marked) and a forward vehicle bay door.
  { race: 'terran', cat: 'building', name: 'commandCenter', label: 'Command Center', svg:
    R(6, 6, 52, 52, 12, T, 3) +
    R(8, 8, 9, 9, 2, STEEL, 1) + R(47, 8, 9, 9, 2, STEEL, 1) + R(8, 47, 9, 9, 2, STEEL, 1) + R(47, 47, 9, 9, 2, STEEL, 1) +
    C(32, 29, 15, STEEL, 2) + C(32, 29, 10, STEEL2, 1) + C(32, 29, 6, WARN) +
    L(32, 17, 32, 41, '#15191f', 2) + L(20, 29, 44, 29, '#15191f', 2) +
    R(25, 50, 14, 7, 2, STEEL) + HL(12, 12, 18, 3) },

  { race: 'terran', cat: 'building', name: 'supplyDepot', label: 'Supply Depot', svg:
    R(10, 16, 44, 32, 9, T, 3) + R(16, 21, 32, 9, 3, WARN) + R(16, 33, 32, 8, 3, STEEL) +
    G(20, 37, 2.2, ACID) + G(27, 37, 2.2, ACID) + HL(14, 18, 22, 3) },

  { race: 'terran', cat: 'building', name: 'refinery', label: 'Refinery', svg:
    R(8, 15, 48, 35, 10, T, 3) + R(29, 17, 6, 16, 2, STEEL) +
    C(21, 33, 9, GASG, 2) + C(43, 33, 9, GASG, 2) + C(21, 33, 3, '#0c3b22', 0) + C(43, 33, 3, '#0c3b22', 0) + HL(14, 17, 22, 3) },

  { race: 'terran', cat: 'building', name: 'barracks', label: 'Barracks', svg:
    R(7, 9, 50, 46, 8, T, 3) + R(13, 15, 14, 9, 2, STEEL) + R(37, 15, 14, 9, 2, STEEL) +
    R(23, 34, 18, 21, 2, STEEL) + R(26, 38, 12, 17, 1, STEEL2) + R(28, 11, 8, 7, 2, REDL) },

  { race: 'terran', cat: 'building', name: 'engineeringBay', label: 'Engineering Bay', svg:
    R(8, 10, 48, 44, 9, T, 3) + C(38, 26, 12, STEEL, 1.5) + L(38, 26, 50, 18, STEEL3, 2.5) +
    R(13, 38, 16, 10, 2, STEEL2) + G(18, 16, 2.4, WARN) },

  { race: 'terran', cat: 'building', name: 'bunker', label: 'Bunker', svg:
    R(9, 13, 46, 38, 12, T, 3) + R(8, 10, 10, 10, 3, STEEL) + R(46, 10, 10, 10, 3, STEEL) +
    R(8, 44, 10, 10, 3, STEEL) + R(46, 44, 10, 10, 3, STEEL) +
    R(20, 24, 24, 6, 2, DARK) + R(20, 34, 24, 6, 2, DARK) },

  { race: 'terran', cat: 'building', name: 'academy', label: 'Academy', svg:
    R(9, 11, 46, 42, 9, T, 3) + C(32, 30, 13, STEEL, 2) +
    R(29, 22, 6, 18, 1, REDL) + R(23, 28, 18, 6, 1, REDL) + HL(13, 13, 20, 3) },

  { race: 'terran', cat: 'building', name: 'missileTurret', label: 'Missile Turret', scale: 0.85, svg:
    R(16, 40, 32, 14, 4, STEEL, 2) + C(32, 30, 14, T, 2.5) +
    R(20, 22, 7, 14, 2, STEEL2, 1) + R(37, 22, 7, 14, 2, STEEL2, 1) + G(32, 30, 4, CYAN) },

  { race: 'terran', cat: 'building', name: 'factory', label: 'Factory', svg:
    R(7, 10, 50, 44, 8, T, 3) + R(22, 30, 24, 24, 2, STEEL) + R(26, 34, 16, 20, 1, STEEL2) +
    C(16, 18, 6, STEEL, 1.5) + G(16, 18, 2.4, REDL) },

  { race: 'terran', cat: 'building', name: 'machineShop', label: 'Machine Shop', scale: 0.8, svg:
    R(12, 16, 40, 32, 7, T, 3) + C(32, 32, 11, STEEL, 2) + L(26, 32, 38, 32, STEEL3, 3) + L(32, 26, 32, 38, STEEL3, 3) },

  { race: 'terran', cat: 'building', name: 'starport', label: 'Starport', svg:
    R(7, 9, 50, 46, 9, T, 3) + C(32, 32, 16, STEEL, 2) + C(32, 32, 9, STEEL2) +
    L(32, 16, 32, 8, STEEL3, 3) + G(20, 18, 2.4, WARN) + G(44, 18, 2.4, WARN) },

  { race: 'terran', cat: 'building', name: 'controlTower', label: 'Control Tower', scale: 0.8, svg:
    R(12, 16, 40, 32, 7, T, 3) + C(32, 26, 9, STEEL, 1.5) + L(32, 26, 44, 16, STEEL3, 2.5) + G(32, 38, 2.4, CYAN) },

  { race: 'terran', cat: 'building', name: 'armory', label: 'Armory', svg:
    R(8, 12, 48, 40, 8, T, 3) + R(20, 8, 6, 18, 2, STEEL2, 1) + R(38, 8, 6, 18, 2, STEEL2, 1) +
    R(16, 34, 32, 12, 3, STEEL) + HL(12, 14, 20, 3) },

  { race: 'terran', cat: 'building', name: 'scienceFacility', label: 'Science Facility', svg:
    R(8, 10, 48, 44, 10, T, 3) + C(32, 30, 14, STEEL, 2) + C(32, 30, 7, CYAN) + RING(32, 30, 11, CYAN, 1.4, 0.6) },

  { race: 'terran', cat: 'building', name: 'physicsLab', label: 'Physics Lab', scale: 0.8, svg:
    R(12, 16, 40, 32, 7, T, 3) + C(32, 32, 9, STEEL2, 1.5) + C(32, 32, 5, CYAN) },

  { race: 'terran', cat: 'building', name: 'covertOps', label: 'Covert Ops', scale: 0.8, svg:
    R(12, 16, 40, 32, 7, T, 3) + C(32, 32, 10, STEEL, 1.5) + C(32, 32, 4, '#0c1018') + G(30, 30, 1.6, CYAN) },

  { race: 'terran', cat: 'building', name: 'comsatStation', label: 'Comsat Station', scale: 0.8, svg:
    R(12, 16, 40, 32, 7, T, 3) + E(34, 30, 11, 8, STEEL, 1.5) + L(30, 32, 44, 20, STEEL3, 2.5) },

  { race: 'terran', cat: 'building', name: 'nuclearSilo', label: 'Nuclear Silo', scale: 0.8, svg:
    R(12, 16, 40, 32, 7, T, 3) + C(32, 32, 11, STEEL, 2) +
    P('M32 24 L40 38 L24 38 Z', WARN) + R(26, 28, 12, 3, 0, EDGE) },
];

// =====================================================================
// PROTOSS  (crystal facets, cyan/gold psionic cores)
// =====================================================================
const protoss: Sprite[] = [
  { race: 'protoss', cat: 'unit', name: 'probe', label: 'Probe', air: true, svg:
    RING(32, 34, 13, GOLD, 1.4, 0.5) + P('M32 16 L44 34 L32 44 L20 34 Z', T, 2.5) +
    C(32, 31, 5, CYAN) + G(32, 14, 2.6, GOLD) },

  { race: 'protoss', cat: 'unit', name: 'zealot', label: 'Zealot', svg:
    AC('19,3 26,9 23,28 17,25', CYAN) + AC('45,3 38,9 41,28 47,25', CYAN) +
    AC('19,3 17,25 19,24 21,6', '#d6f7ff') + AC('45,3 47,25 45,24 43,6', '#d6f7ff') +
    TP('12,29 26,23 28,39 14,44') + FH('12,29 14,44 17,43 16,31') +
    TP('52,29 38,23 36,39 50,44') + FH('52,29 50,44 47,43 48,31') +
    TP('24,25 40,25 43,51 21,51') + FH('21,51 24,25 28,26 25,50') +
    DK('28,20 36,20 35,27 29,27') + AC('29,32 35,32 34,45 30,45', GOLD) },

  { race: 'protoss', cat: 'unit', name: 'dragoon', label: 'Dragoon', svg:
    DK('30,30 13,12 17,14 32,28') + DK('34,30 51,12 47,14 32,28') +
    DK('30,34 13,52 17,50 32,36') + DK('34,34 51,52 47,50 32,36') +
    AC('11,10 19,12 17,18 9,16', STEEL2) + AC('53,10 45,12 47,18 55,16', STEEL2) +
    AC('11,54 19,52 17,46 9,48', STEEL2) + AC('53,54 45,52 47,46 55,48', STEEL2) +
    TP('26,17 38,17 47,26 47,38 38,47 26,47 17,38 17,26') + FH('17,26 26,17 30,19 21,28') +
    DOT(32, 31, 8, CYAN) + DOT(32, 31, 3.8, '#eaffff') + AC('29,15 35,15 34,21 30,21', GOLD) },

  { race: 'protoss', cat: 'unit', name: 'highTemplar', label: 'High Templar', svg:
    RING(32, 34, 14, CYAN, 1.6, 0.5) +
    P('M32 8 C42 18 42 40 32 52 C22 40 22 18 32 8 Z', T, 2.5) +
    C(32, 26, 5, GOLD) + G(32, 26, 2.4, HI, 0.6) },

  { race: 'protoss', cat: 'unit', name: 'darkTemplar', label: 'Dark Templar', svg:
    P('M28 4 L24 30 L30 30 Z', PSI, 0.8) + P('M40 6 L36 28 L42 28 Z', PSI, 0.8) +
    P('M32 14 C40 22 40 40 32 52 C24 40 24 22 32 14 Z', T, 2.5) +
    C(32, 30, 4, '#1a0b22') + G(31, 28, 1.6, PSI) },

  { race: 'protoss', cat: 'unit', name: 'archon', label: 'Archon', svg:
    RING(32, 32, 16, CYAN, 1.4, 0.4) + RING(32, 32, 12, PSI, 1.4, 0.6) +
    C(32, 32, 9, '#cdeeff', 0) + C(32, 32, 5, HI, 0) +
    L(32, 16, 32, 23, CYAN, 2) + L(48, 32, 41, 32, CYAN, 2) + L(32, 48, 32, 41, CYAN, 2) + L(16, 32, 23, 32, CYAN, 2) },

  { race: 'protoss', cat: 'unit', name: 'darkArchon', label: 'Dark Archon', svg:
    RING(32, 32, 16, PSI, 1.4, 0.4) + RING(32, 32, 12, BIO, 1.4, 0.6) +
    C(32, 32, 9, '#3a1640', 0) + C(32, 32, 4, PSI, 0) +
    L(32, 17, 32, 24, PSI, 2) + L(47, 32, 40, 32, PSI, 2) + L(32, 47, 32, 40, PSI, 2) + L(17, 32, 24, 32, PSI, 2) },

  { race: 'protoss', cat: 'unit', name: 'reaver', label: 'Reaver', scale: 1.15, svg:
    L(16, 22, 12, 46, STEEL2, 5) + L(48, 22, 52, 46, STEEL2, 5) +
    P('M32 8 C48 16 50 38 44 52 L20 52 C14 38 16 16 32 8 Z', T, 2.5) +
    R(24, 28, 16, 16, 4, STEEL) + C(32, 36, 5, CYAN) },

  { race: 'protoss', cat: 'unit', name: 'scarab', label: 'Scarab', scale: 0.7, svg:
    P('M32 14 L46 34 L32 50 L18 34 Z', T, 2.5) + C(32, 33, 5, CYAN) + G(32, 33, 2, HI, 0.6) },

  { race: 'protoss', cat: 'unit', name: 'observer', label: 'Observer', air: true, scale: 0.85, svg:
    RING(32, 32, 15, CYAN, 1.4, 0.45) + C(32, 32, 11, T, 2.2) + C(32, 32, 6, '#0c1018') + G(32, 32, 3, CYAN) },

  { race: 'protoss', cat: 'unit', name: 'shuttle', label: 'Shuttle', air: true, svg:
    P('M32 8 C44 14 46 40 38 50 L26 50 C18 40 20 14 32 8 Z', T, 2.5) +
    PL('20,24 8,30 22,38', GOLD, 1) + PL('44,24 56,30 42,38', GOLD, 1) + C(32, 28, 5, CYAN) },

  { race: 'protoss', cat: 'unit', name: 'scout', label: 'Scout', air: true, svg:
    P('M32 5 L40 32 L32 42 L24 32 Z', T, 2.5) +
    PL('22,26 6,38 22,40', GOLD, 1) + PL('42,26 58,38 42,40', GOLD, 1) +
    R(26, 38, 4, 9, 1, CYAN) + R(34, 38, 4, 9, 1, CYAN) },

  { race: 'protoss', cat: 'unit', name: 'carrier', label: 'Carrier', air: true, scale: 1.3, svg:
    P('M32 6 C46 14 48 42 40 54 L24 54 C16 42 18 14 32 6 Z', T, 3) +
    C(32, 30, 8, STEEL, 1.5) + C(32, 30, 4, CYAN) +
    G(18, 20, 2.4, GOLD) + G(46, 20, 2.4, GOLD) + G(16, 38, 2.4, GOLD) + G(48, 38, 2.4, GOLD) + G(32, 50, 2.4, GOLD) },

  { race: 'protoss', cat: 'unit', name: 'interceptor', label: 'Interceptor', air: true, scale: 0.6, svg:
    P('M32 10 L42 38 L32 46 L22 38 Z', T, 2) + G(32, 30, 3, CYAN) },

  { race: 'protoss', cat: 'unit', name: 'arbiter', label: 'Arbiter', air: true, scale: 1.2, svg:
    RING(32, 32, 17, CYAN, 1.4, 0.35) +
    P('M32 6 L50 32 L32 56 L14 32 Z', T, 2.8) + C(32, 32, 9, STEEL, 1.5) + C(32, 32, 5, GOLD) + G(32, 32, 2.4, HI, 0.6) },

  { race: 'protoss', cat: 'unit', name: 'corsair', label: 'Corsair', air: true, svg:
    P('M32 6 L36 28 L32 34 L28 28 Z', T, 2) +
    PL('30,22 10,44 28,38', T, 2) + PL('34,22 54,44 36,38', T, 2) + G(32, 18, 2.4, CYAN) },

  // ---- Protoss buildings ----
  { race: 'protoss', cat: 'building', name: 'nexus', label: 'Nexus', svg:
    P('M32 5 L57 32 L32 59 L7 32 Z', T, 3) + P('M32 14 L50 32 L32 50 L14 32 Z', 'none', 0).replace('fill="none"', `fill="none" stroke="${GOLD}" stroke-width="1.6" opacity="0.7"`) +
    C(32, 32, 10, STEEL, 1.5) + C(32, 32, 6, CYAN) + G(29, 29, 2, HI, 0.5) },

  { race: 'protoss', cat: 'building', name: 'pylon', label: 'Pylon', scale: 0.8, svg:
    PL('32,6 50,32 32,58 14,32', T, 2.5) + PL('32,18 42,32 32,46 22,32', CYAN, 0) + G(32, 32, 4, HI, 0.7) },

  { race: 'protoss', cat: 'building', name: 'assimilator', label: 'Assimilator', svg:
    P('M32 7 L55 30 L48 52 L16 52 L9 30 Z', T, 3) + C(32, 34, 11, GASG, 2) + C(32, 34, 4, '#0c3b22') + G(24, 18, 2.4, CYAN) },

  { race: 'protoss', cat: 'building', name: 'gateway', label: 'Gateway', svg:
    R(8, 8, 48, 48, 12, T, 3) + RING(32, 32, 17, GOLD, 2.5, 0.8) + RING(32, 32, 11, CYAN, 2, 0.7) + G(32, 32, 5, CYAN) },

  { race: 'protoss', cat: 'building', name: 'forge', label: 'Forge', svg:
    P('M10 12 L54 12 L48 54 L16 54 Z', T, 3) + R(24, 26, 16, 18, 3, STEEL) + G(32, 35, 5, WARN) },

  { race: 'protoss', cat: 'building', name: 'photonCannon', label: 'Photon Cannon', scale: 0.85, svg:
    PL('32,8 50,22 44,46 20,46 14,22', T, 2.5) +
    L(32, 28, 32, 12, GOLD, 3) + L(32, 28, 18, 22, GOLD, 3) + L(32, 28, 46, 22, GOLD, 3) + C(32, 30, 5, CYAN) },

  { race: 'protoss', cat: 'building', name: 'cyberneticsCore', label: 'Cybernetics Core', svg:
    R(8, 8, 48, 48, 12, T, 3) + RING(32, 32, 16, GOLD, 2, 0.7) + C(32, 32, 8, STEEL, 1.5) + C(32, 32, 4, CYAN) },

  { race: 'protoss', cat: 'building', name: 'shieldBattery', label: 'Shield Battery', scale: 0.85, svg:
    P('M12 14 L52 14 L46 50 L18 50 Z', T, 3) + R(22, 22, 8, 22, 2, CYAN) + R(34, 22, 8, 22, 2, CYAN) },

  { race: 'protoss', cat: 'building', name: 'roboticsFacility', label: 'Robotics Facility', svg:
    R(8, 10, 48, 44, 10, T, 3) + R(20, 24, 24, 20, 4, STEEL) + R(24, 28, 16, 12, 2, CYAN) + G(16, 18, 2.4, GOLD) },

  { race: 'protoss', cat: 'building', name: 'stargate', label: 'Stargate', svg:
    RING(32, 32, 24, T, 6, 1).replace('opacity="1"', '') + RING(32, 32, 17, GOLD, 2.5, 0.8) + RING(32, 32, 10, CYAN, 2, 0.7) + G(32, 32, 5, CYAN) },

  { race: 'protoss', cat: 'building', name: 'citadelOfAdun', label: 'Citadel of Adun', svg:
    R(10, 12, 44, 44, 10, T, 3) + PL('14,12 20,4 26,12', GOLD, 0) + PL('38,12 44,4 50,12', GOLD, 0) +
    C(32, 34, 9, STEEL, 1.5) + C(32, 34, 4, CYAN) },

  { race: 'protoss', cat: 'building', name: 'templarArchives', label: 'Templar Archives', svg:
    P('M10 14 L54 14 L48 54 L16 54 Z', T, 3) + RING(32, 34, 12, GOLD, 1.6, 0.7) + C(32, 34, 6, PSI) + G(32, 34, 2.4, HI, 0.6) },

  { race: 'protoss', cat: 'building', name: 'roboticsSupportBay', label: 'Robotics Support Bay', scale: 0.85, svg:
    R(10, 14, 44, 36, 8, T, 3) + P('M32 22 L44 34 L32 44 L20 34 Z', STEEL, 1.5) + C(32, 34, 4, CYAN) },

  { race: 'protoss', cat: 'building', name: 'observatory', label: 'Observatory', scale: 0.85, svg:
    R(10, 16, 44, 34, 9, T, 3) + C(32, 30, 11, STEEL, 1.5) + C(32, 30, 5, CYAN) + RING(32, 30, 8, GOLD, 1.2, 0.6) },

  { race: 'protoss', cat: 'building', name: 'fleetBeacon', label: 'Fleet Beacon', svg:
    P('M32 8 L52 24 L44 52 L20 52 L12 24 Z', T, 3) + RING(32, 34, 13, CYAN, 1.6, 0.5) + C(32, 34, 5, GOLD) + G(32, 34, 2.4, HI, 0.6) },

  { race: 'protoss', cat: 'building', name: 'arbiterTribunal', label: 'Arbiter Tribunal', svg:
    PL('32,6 56,24 46,56 18,56 8,24', T, 3) + C(32, 34, 10, STEEL, 1.5) + C(32, 34, 5, CYAN) + RING(32, 34, 13, GOLD, 1.4, 0.6) },
];

// =====================================================================
// ZERG  (organic curves, violet/bone, dark orifices)
// =====================================================================
const zerg: Sprite[] = [
  { race: 'zerg', cat: 'unit', name: 'larva', label: 'Larva', scale: 0.7, svg:
    P('M32 10 C40 14 40 50 32 54 C24 50 24 14 32 10 Z', T, 2.5) +
    L(26, 24, 38, 24, EDGE, 1.2) + L(26, 32, 38, 32, EDGE, 1.2) + L(26, 40, 38, 40, EDGE, 1.2) + C(32, 16, 3, BIO, 0) },

  // Drone: rounded grub body, head node, two gather-limbs and a belly segment.
  { race: 'zerg', cat: 'unit', name: 'drone', label: 'Drone', svg:
    SP('M44 30 C51 27 53 24 50 21', BONE, 2.6) + SP('M20 32 C13 29 11 26 14 23', BONE, 2.2) +
    E(32, 35, 15, 17, T, 2.5) +
    E(32, 18, 8, 7, BIO, 2) + C(32, 17, 2.6, '#1a0b22', 0) +
    SP('M23 37 C28 41 36 41 41 37', EDGE, 1.4, 0.45) },

  { race: 'zerg', cat: 'unit', name: 'overlord', label: 'Overlord', air: true, scale: 1.25, svg:
    P('M32 6 C52 10 56 34 48 50 C42 60 22 60 16 50 C8 34 12 10 32 6 Z', T, 3) +
    L(24, 50, 20, 60, BONE, 2.4) + L(40, 50, 44, 60, BONE, 2.4) + L(32, 52, 32, 62, BONE, 2.4) +
    E(32, 28, 9, 7, '#1a0b22', 0) + C(32, 28, 3, BIO, 0) },

  // Zergling: small, fast, hunched — bulky carapace, angular scythe-claws, mandibles.
  { race: 'zerg', cat: 'unit', name: 'zergling', label: 'Zergling', scale: 0.9, svg:
    AC('27,24 12,11 19,9 30,21', BONE) + AC('37,24 52,11 45,9 34,21', BONE) +
    TP('26,20 38,20 41,38 32,53 23,38') + FH('23,38 26,20 29,21 27,38') +
    AC('29,18 25,7 32,17', BONE) + AC('35,18 39,7 32,17', BONE) +
    DOT(32, 27, 2.8, BIO) },

  // Hydralisk: a hooded top-down serpent — raised carapace hood spines swept back
  // and out, sharp forward mandibles, a tapering abdomen (faceted).
  { race: 'zerg', cat: 'unit', name: 'hydralisk', label: 'Hydralisk', svg:
    TP('24,21 7,31 14,35 27,27') + FH('7,31 14,35 14,32 11,31') +
    TP('40,21 57,31 50,35 37,27') + FH('57,31 50,35 50,32 53,31') +
    TP('26,24 38,24 36,30 28,30') +
    TP('27,28 37,28 40,40 32,54 24,40') + FH('24,40 27,28 30,29 28,40') +
    TP('26,13 38,13 41,23 32,28 23,23') + FH('23,23 26,13 29,14 25,23') +
    AC('28,13 25,2 31,12', BONE) + AC('36,13 39,2 33,12', BONE) +
    DOT(32, 20, 3, BIO) },

  { race: 'zerg', cat: 'unit', name: 'lurker', label: 'Lurker', scale: 1.1, svg:
    L(32, 30, 14, 12, BONE, 2.6) + L(32, 30, 50, 12, BONE, 2.6) + L(32, 30, 10, 34, BONE, 2.6) +
    L(32, 30, 54, 34, BONE, 2.6) + L(32, 30, 24, 54, BONE, 2.6) + L(32, 30, 40, 54, BONE, 2.6) +
    P('M32 12 C44 20 44 36 38 48 L26 48 C20 36 20 20 32 12 Z', T, 2.5) + E(32, 24, 6, 7, BIO, 0) },

  { race: 'zerg', cat: 'unit', name: 'mutalisk', label: 'Mutalisk', air: true, svg:
    P('M32 8 C38 16 38 34 34 48 L30 48 C26 34 26 16 32 8 Z', T, 2.5) +
    P('M30 22 C14 18 8 30 16 40 C22 34 28 32 30 30 Z', T, 1.6) + P('M34 22 C50 18 56 30 48 40 C42 34 36 32 34 30 Z', T, 1.6) +
    L(32, 46, 32, 58, BONE, 2.2) + C(32, 16, 3, BIO, 0) },

  { race: 'zerg', cat: 'unit', name: 'scourge', label: 'Scourge', air: true, scale: 0.75, svg:
    C(32, 34, 11, T, 2.5) +
    PL('22,26 8,16 24,20', T, 1.4) + PL('42,26 56,16 40,20', T, 1.4) +
    L(28, 28, 24, 22, BONE, 1.8) + L(36, 28, 40, 22, BONE, 1.8) + G(32, 34, 3, BIO) },

  { race: 'zerg', cat: 'unit', name: 'guardian', label: 'Guardian', air: true, scale: 1.2, svg:
    P('M32 6 C46 12 48 36 42 52 L22 52 C16 36 18 12 32 6 Z', T, 3) +
    P('M22 26 C8 24 6 36 14 44 Z', T, 1.6) + P('M42 26 C56 24 58 36 50 44 Z', T, 1.6) +
    E(32, 42, 8, 6, '#1a0b22', 0) + C(32, 22, 3, BIO, 0) },

  { race: 'zerg', cat: 'unit', name: 'devourer', label: 'Devourer', air: true, scale: 1.2, svg:
    P('M32 8 C48 14 50 38 42 52 L22 52 C14 38 16 14 32 8 Z', T, 3) +
    L(20, 22, 8, 14, BONE, 2.6) + L(44, 22, 56, 14, BONE, 2.6) + L(22, 34, 10, 32, BONE, 2.4) + L(42, 34, 54, 32, BONE, 2.4) +
    G(24, 30, 2.4, ACID) + G(40, 30, 2.4, ACID) + C(32, 20, 3, BIO, 0) },

  { race: 'zerg', cat: 'unit', name: 'queen', label: 'Queen', air: true, scale: 1.15, svg:
    RING(32, 34, 15, BIO, 1.4, 0.4) +
    P('M32 6 C42 14 42 40 32 52 C22 40 22 14 32 6 Z', T, 2.5) +
    PL('24,24 10,34 26,38', T, 1.6) + PL('40,24 54,34 38,38', T, 1.6) +
    L(28, 10, 24, 2, BONE, 2) + L(36, 10, 40, 2, BONE, 2) + C(32, 26, 4, ACID, 0) },

  { race: 'zerg', cat: 'unit', name: 'defiler', label: 'Defiler', scale: 1.1, svg:
    P('M32 8 C42 16 42 40 36 52 L28 52 C22 40 22 16 32 8 Z', T, 2.5) +
    L(28, 22, 14, 16, BONE, 2) + L(28, 30, 12, 28, BONE, 2) + L(28, 38, 14, 42, BONE, 2) +
    L(36, 22, 50, 16, BONE, 2) + L(36, 30, 52, 28, BONE, 2) + L(36, 38, 50, 42, BONE, 2) +
    E(32, 18, 5, 6, BIO, 0) + G(32, 18, 2, ACID) },

  { race: 'zerg', cat: 'unit', name: 'ultralisk', label: 'Ultralisk', scale: 1.3, svg:
    P('M32 12 C48 18 50 40 44 54 L20 54 C14 40 16 18 32 12 Z', T, 3) +
    P('M26 14 C18 6 12 8 14 18 Z', BONE, 1.4) + P('M38 14 C46 6 52 8 50 18 Z', BONE, 1.4) +
    L(26, 16, 22, 4, BONE, 3) + L(38, 16, 42, 4, BONE, 3) + E(32, 32, 7, 8, '#1a0b22', 0) },

  { race: 'zerg', cat: 'unit', name: 'infestedTerran', label: 'Infested Terran', scale: 0.85, svg:
    C(22, 41, 8, T) + C(42, 41, 8, T) + C(32, 33, 10, T, 2.5) +
    P('M24 30 a8 8 0 0 1 16 0 z', '#1a0b22') + G(28, 30, 2, ACID) + G(36, 30, 2, ACID) },

  { race: 'zerg', cat: 'unit', name: 'broodling', label: 'Broodling', scale: 0.7, svg:
    P('M32 12 C40 20 40 40 34 50 L30 50 C24 40 24 20 32 12 Z', T, 2.5) +
    L(28, 22, 18, 12, BONE, 2.2) + L(36, 22, 46, 12, BONE, 2.2) + C(32, 18, 2.6, BIO, 0) },

  // ---- Zerg buildings ----
  // Hatchery: an organic "volcano" — a broad carapace mound with a glowing magma
  // crater at the summit and a couple of side vent orifices.
  { race: 'zerg', cat: 'building', name: 'hatchery', label: 'Hatchery', svg:
    P('M32 10 C50 12 58 28 54 46 C50 58 14 58 10 46 C6 28 14 12 32 10 Z', T, 3) +
    E(32, 31, 15, 11, '#3a1530', 2) +
    E(32, 31, 9, 6, BIO, 0) + E(32, 31, 4.5, 3, ACID, 0) +
    E(16, 43, 4, 5, '#1a0b22', 0) + E(48, 43, 4, 5, '#1a0b22', 0) },

  { race: 'zerg', cat: 'building', name: 'lair', label: 'Lair', svg:
    P('M32 7 C50 9 57 24 54 38 C51 54 38 58 32 58 C26 58 13 54 10 38 C7 24 14 9 32 7 Z', T, 3) +
    P('M18 18 C12 10 22 8 24 16 Z', T, 1.6) + P('M46 18 C52 10 42 8 40 16 Z', T, 1.6) +
    E(24, 30, 5, 6, '#1a0b22', 0) + E(42, 32, 5, 6, '#1a0b22', 0) + C(32, 34, 6, BIO, 0) },

  { race: 'zerg', cat: 'building', name: 'hive', label: 'Hive', scale: 1.05, svg:
    P('M32 6 C52 8 59 24 55 40 C51 56 38 59 32 59 C26 59 13 56 9 40 C5 24 12 8 32 6 Z', T, 3) +
    L(20, 16, 12, 6, BONE, 2.6) + L(44, 16, 52, 6, BONE, 2.6) + L(32, 12, 32, 2, BONE, 2.6) +
    E(24, 32, 5, 6, '#1a0b22', 0) + E(42, 32, 5, 6, '#1a0b22', 0) + C(32, 36, 7, ACID, 0) },

  { race: 'zerg', cat: 'building', name: 'creepColony', label: 'Creep Colony', scale: 0.85, svg:
    E(32, 36, 22, 18, T, 3) + C(32, 30, 8, '#1a0b22', 0) + C(32, 30, 4, BIO, 0) + L(32, 30, 32, 10, BONE, 2.4) },

  { race: 'zerg', cat: 'building', name: 'sunkenColony', label: 'Sunken Colony', svg:
    E(32, 40, 22, 16, T, 3) +
    L(32, 40, 24, 10, BONE, 3) + L(32, 40, 40, 10, BONE, 3) + L(32, 40, 32, 4, BONE, 3) + C(32, 40, 5, '#1a0b22', 0) },

  { race: 'zerg', cat: 'building', name: 'sporeColony', label: 'Spore Colony', svg:
    E(32, 44, 20, 14, T, 3) + L(32, 44, 32, 16, BONE, 3) + E(32, 16, 10, 9, T, 2.2) + C(32, 16, 4, ACID, 0) },

  { race: 'zerg', cat: 'building', name: 'spawningPool', label: 'Spawning Pool', svg:
    E(32, 34, 24, 20, T, 3) + E(32, 34, 16, 12, '#1a0b22', 0) +
    C(26, 32, 3, BIO, 0) + C(38, 36, 3, BIO, 0) + C(33, 30, 2.4, ACID, 0) },

  { race: 'zerg', cat: 'building', name: 'evolutionChamber', label: 'Evolution Chamber', svg:
    P('M32 8 C50 12 54 34 46 50 C40 58 24 58 18 50 C10 34 14 12 32 8 Z', T, 3) +
    P('M24 24 C32 30 32 38 24 44', 'none', 0).replace('fill="none"', `fill="none" stroke="${ACID}" stroke-width="2.2"`) +
    P('M40 24 C32 30 32 38 40 44', 'none', 0).replace('fill="none"', `fill="none" stroke="${ACID}" stroke-width="2.2"`) },

  { race: 'zerg', cat: 'building', name: 'hydraliskDen', label: 'Hydralisk Den', svg:
    E(32, 36, 23, 19, T, 3) + L(20, 24, 8, 14, BONE, 2.6) + L(44, 24, 56, 14, BONE, 2.6) + L(32, 22, 32, 8, BONE, 2.6) +
    E(32, 36, 9, 7, '#1a0b22', 0) + C(32, 36, 3, BIO, 0) },

  { race: 'zerg', cat: 'building', name: 'extractor', label: 'Extractor', svg:
    P('M10 32 C10 18 24 14 32 14 C40 14 54 18 54 32 C54 46 40 50 32 50 C24 50 10 46 10 32 Z', T, 3) +
    E(20, 30, 6, 5, GASG, 1.4) + E(44, 30, 6, 5, GASG, 1.4) + E(32, 32, 7, 6, '#1a0b22', 0) },

  { race: 'zerg', cat: 'building', name: 'spire', label: 'Spire', svg:
    P('M32 4 C40 18 40 34 40 50 L24 50 C24 34 24 18 32 4 Z', T, 3) +
    L(28, 18, 18, 10, BONE, 2.4) + L(36, 18, 46, 10, BONE, 2.4) + C(32, 12, 3, ACID, 0) + E(32, 44, 8, 6, '#1a0b22', 0) },

  { race: 'zerg', cat: 'building', name: 'greaterSpire', label: 'Greater Spire', scale: 1.05, svg:
    P('M32 4 C42 18 42 34 42 52 L22 52 C22 34 22 18 32 4 Z', T, 3) +
    L(26, 16, 14, 6, BONE, 2.6) + L(38, 16, 50, 6, BONE, 2.6) + L(32, 10, 32, 2, BONE, 2.6) +
    C(32, 14, 3.4, ACID, 0) + E(32, 46, 8, 6, '#1a0b22', 0) },

  { race: 'zerg', cat: 'building', name: 'queensNest', label: "Queen's Nest", svg:
    E(32, 36, 23, 19, T, 3) + C(24, 34, 4, '#1a0b22', 0) + C(40, 34, 4, '#1a0b22', 0) + C(32, 42, 4, '#1a0b22', 0) +
    C(24, 34, 2, ACID, 0) + C(40, 34, 2, ACID, 0) + L(32, 20, 32, 8, BONE, 2.4) },

  { race: 'zerg', cat: 'building', name: 'nydusCanal', label: 'Nydus Canal', svg:
    C(32, 34, 22, T, 3) + C(32, 34, 14, '#1a0b22', 0) +
    L(32, 34, 22, 16, BONE, 2.6) + L(32, 34, 42, 16, BONE, 2.6) + L(32, 34, 16, 44, BONE, 2.6) + L(32, 34, 48, 44, BONE, 2.6) },

  { race: 'zerg', cat: 'building', name: 'ultraliskCavern', label: 'Ultralisk Cavern', svg:
    P('M10 36 C10 18 24 12 32 12 C40 12 54 18 54 36 C54 50 40 52 32 52 C24 52 10 50 10 36 Z', T, 3) +
    L(22, 22, 12, 8, BONE, 3) + L(42, 22, 52, 8, BONE, 3) + E(32, 38, 11, 8, '#1a0b22', 0) },

  { race: 'zerg', cat: 'building', name: 'defilerMound', label: 'Defiler Mound', svg:
    E(32, 36, 24, 19, T, 3) +
    L(14, 30, 6, 26, BONE, 2.2) + L(50, 30, 58, 26, BONE, 2.2) + L(20, 22, 14, 14, BONE, 2.2) + L(44, 22, 50, 14, BONE, 2.2) +
    E(32, 36, 9, 7, '#1a0b22', 0) + G(32, 36, 3, ACID) },
];

export const ROSTER: Sprite[] = [...terran, ...protoss, ...zerg];

// Apply any imported high-fidelity art overrides (art/imported.ts) in place, so the
// viewer (sprites.html) and the engine atlas both use them.
for (const s of ROSTER) {
  const ov = IMPORTED[s.name];
  if (ov) { s.svg = ov.svg; if (ov.scale !== undefined) s.scale = ov.scale; }
}

/** Wrap inner markup as a standalone, sized SVG document for rasterization. */
export const svgDoc = (inner: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">${inner}</svg>`;

/** Look up a sprite's inner markup by name (engine uses this for the playable subset). */
export const bodyOf = (name: string): Sprite | undefined => ROSTER.find((s) => s.name === name);
