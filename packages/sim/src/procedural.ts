// Procedural map generation. Goals (docs/specs/maps.md): symmetric & fair,
// vertical-major, teams on opposite (south/north) sides, base plateaus reachable
// only via a ramp (natural chokepoint), some midfield obstacles for tactical
// variety — and ALWAYS fully connected (validated by flood fill; obstacles dropped
// if they would wall anything off). NvN scales the width: 2v2 is twice as wide.

import type { MapDef, ResourceSpawn, StartLoc } from './map.ts';
import { PATCH_AMOUNT } from './data.ts';
import { makeRng, range, type Rng } from './rng.ts';

const LANE_W = 64; // width per matchup lane
const H = 96; // map height (portrait)
const PLAT_HW = 7; // plateau half-width (tiles)
const PLAT_HH = 6; // plateau half-height
const RAMP_HW = 2; // ramp half-width

const fillRect = (g: Uint8Array, w: number, x0: number, y0: number, x1: number, y1: number, v: number): void => {
  for (let y = Math.max(0, y0); y <= y1; y++) for (let x = Math.max(0, x0); x <= x1; x++) g[y * w + x] = v;
};

const carveBase = (m: MapDef, cx: number, cy: number, faceUp: boolean): void => {
  const w = m.w;
  const x0 = cx - PLAT_HW; const x1 = cx + PLAT_HW;
  const y0 = cy - PLAT_HH; const y1 = cy + PLAT_HH;
  // Plateau: high ground, walkable, buildable.
  fillRect(m.elev, w, x0, y0, x1, y1, 1);
  fillRect(m.walk, w, x0, y0, x1, y1, 1);
  fillRect(m.build, w, x0, y0, x1, y1, 1);
  // Cliff ring (impassable) around the plateau, except the center-facing ramp gap.
  const rampY = faceUp ? y0 - 1 : y1 + 1;
  for (let x = x0 - 1; x <= x1 + 1; x++) {
    const topY = y0 - 1; const botY = y1 + 1;
    if (x >= 0 && x < w) {
      setCliff(m, x, topY); setCliff(m, x, botY);
    }
  }
  for (let y = y0 - 1; y <= y1 + 1; y++) {
    setCliff(m, x0 - 1, y); setCliff(m, x1 + 1, y);
  }
  // Open the ramp gap on the center-facing edge.
  for (let x = cx - RAMP_HW; x <= cx + RAMP_HW; x++) {
    if (x >= 0 && x < w && rampY >= 0 && rampY < m.h) {
      m.walk[rampY * w + x] = 1; m.build[rampY * w + x] = 0; m.elev[rampY * w + x] = 1;
    }
  }
};

const setCliff = (m: MapDef, x: number, y: number): void => {
  if (x < 0 || y < 0 || x >= m.w || y >= m.h) return;
  m.walk[y * m.w + x] = 0; m.build[y * m.w + x] = 0;
};

const reachableFrom = (m: MapDef, sx: number, sy: number): Uint8Array => {
  const w = m.w; const n = w * m.h;
  const seen = new Uint8Array(n);
  const q = [sy * w + sx];
  seen[sy * w + sx] = 1;
  for (let h = 0; h < q.length; h++) {
    const u = q[h]!; const ux = u % w; const uy = (u - ux) / w;
    for (let d = 0; d < 4; d++) {
      const nx = ux + (d === 0 ? 1 : d === 1 ? -1 : 0);
      const ny = uy + (d === 2 ? 1 : d === 3 ? -1 : 0);
      if (nx < 0 || ny < 0 || nx >= w || ny >= m.h) continue;
      const v = ny * w + nx;
      if (seen[v] === 0 && m.walk[v] === 1) { seen[v] = 1; q.push(v); }
    }
  }
  return seen;
};

export const mapConnected = (m: MapDef): boolean => {
  const s0 = m.starts[0]!;
  const seen = reachableFrom(m, s0.x, s0.y);
  for (const st of m.starts) if (seen[st.y * m.w + st.x] !== 1) return false;
  for (const r of m.resources) if (seen[r.y * m.w + r.x] !== 1) return false;
  return true;
};

/**
 * Generate a symmetric NvN map. `perTeam` players per side (1 = 1v1, 2 = 2v2, …).
 */
export const generateMap = (perTeam: number, seed: number): MapDef => {
  const w = LANE_W * perTeam;
  const h = H;
  const n = w * h;
  const rng = makeRng(seed);

  const build = (): MapDef => ({
    name: `Procedural ${perTeam}v${perTeam} (#${seed})`,
    w, h,
    walk: new Uint8Array(n).fill(1),
    build: new Uint8Array(n).fill(1),
    elev: new Uint8Array(n),
    starts: [],
    resources: [],
    teams: [],
  });

  const m = build();
  const starts: StartLoc[] = [];
  const teams: number[] = [];
  const resources: ResourceSpawn[] = [];

  for (let i = 0; i < perTeam; i++) {
    const cx = i * LANE_W + (LANE_W >> 1);
    const south: StartLoc = { x: cx, y: h - 14 };
    const north: StartLoc = { x: cx, y: 14 };
    starts.push(south); teams.push(0);
    starts.push(north); teams.push(1);
    addResources(resources, south, +1);
    addResources(resources, north, -1);
  }
  m.starts = starts; m.teams = teams; m.resources = resources;

  for (let i = 0; i < starts.length; i++) {
    carveBase(m, starts[i]!.x, starts[i]!.y, teams[i] === 0); // south (team 0) ramps up toward center
  }

  // Midfield obstacles, mirrored top/bottom, then validate connectivity.
  addObstacles(m, rng);
  if (!mapConnected(m)) {
    // Fallback: clear obstacles (plateaus + ramps + open field are always connected).
    m.walk = new Uint8Array(n).fill(1);
    m.build = new Uint8Array(n).fill(1);
    m.elev = new Uint8Array(n);
    for (let i = 0; i < starts.length; i++) carveBase(m, starts[i]!.x, starts[i]!.y, teams[i] === 0);
  }
  return m;
};

const addResources = (out: ResourceSpawn[], base: StartLoc, dir: number): void => {
  // Patches behind the base (away from the ramp), inside the plateau.
  for (let i = 0; i < 8; i++) {
    out.push({ x: base.x - 4 + i, y: base.y + dir * 4, amount: PATCH_AMOUNT, gas: false });
  }
  out.push({ x: base.x + 6, y: base.y + dir * 3, amount: 0, gas: true }); // one gas geyser per base
};

const addObstacles = (m: MapDef, rng: Rng): void => {
  const w = m.w; const h = m.h;
  const blobs = 2 + range(rng, 3); // 2..4 obstacle blobs (mirrored)
  for (let b = 0; b < blobs; b++) {
    const bw = 2 + range(rng, 4);
    const bh = 2 + range(rng, 4);
    const x = 6 + range(rng, Math.max(1, w - 12 - bw));
    const y = 24 + range(rng, Math.max(1, h - 48 - bh)); // central band only
    fillRect(m.walk, w, x, y, x + bw, y + bh, 0);
    fillRect(m.build, w, x, y, x + bw, y + bh, 0);
    fillRect(m.elev, w, x, y, x + bw, y + bh, 1);
    // Mirror across the horizontal mid-axis for fairness.
    const my = h - 1 - (y + bh);
    fillRect(m.walk, w, x, my, x + bw, my + bh, 0);
    fillRect(m.build, w, x, my, x + bw, my + bh, 0);
    fillRect(m.elev, w, x, my, x + bw, my + bh, 1);
  }
};
