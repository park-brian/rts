// WebGL2 world renderer. Built on the regl-like core (gl/gl.ts), it draws the
// whole scene in a few batched commands regardless of unit count:
//   1. terrain  — one textured quad (baked terrain canvas → GPU texture).
//   2. sprites  — ONE instanced draw (normal blend) for ground shadows, every
//      unit/building/resource body, then HP bars, selection rings, rally markers.
//   3. fx       — ONE instanced draw (additive) for lights: ambient building/
//      resource glows + combat particles (muzzle flashes, explosions).
//   4. fog      — one textured quad over a tiny per-tile visibility texture,
//      linear-filtered for soft edges.
// All sprite geometry is a single quad; per-instance attributes carry position,
// size, rotation, atlas UV, tint, and team color. Team color is applied in the
// fragment shader via the atlas mask (assets.md §4). Combat FX are spawned by
// diffing observable state frame-to-frame — cosmetic only, never the sim.

import {
  TILE, ONE, Units, Role, Kind, ResourceType, CAP, NONE, eid, slotOf, isAlive,
  resolveRallyEndpoint, childActorRenderPresentation, entityCloakOpacity, entityLifeBar, entityRenderHull, illusionPresentation,
  selectionBase, type MapDef,
} from '../sim.ts';
import type { Game } from '../game.ts';
import { Gl, type Command, type Buffer, type Texture } from './gl.ts';
import { spritePlacement, visualRadius } from '../art/placement.ts';
import { Particles } from './particles.ts';
import type { Atlas, UV } from './atlas.ts';
import { type WorkActivity, workActivities } from '../activity.ts';
import { type VisibilityAffordance, visibilityAffordances } from '../visibility-affordances.ts';
import { entityPresentation } from '../entity-presentation.ts';

// Per-player team colors (RGB 0..1) + neutral, mirroring render2d's palette.
const OWN_HEX = ['#4ea1ff', '#ff5a5a', '#ffd24e', '#9b7bff', '#5affa0', '#ff9b4e'];
const NEUTRAL_HEX = '#49d0c0';
const rgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255,
];
const TEAM_RGB = OWN_HEX.map(rgb);
const NEUTRAL_RGB = rgb(NEUTRAL_HEX);
const teamColor = (owner: number): [number, number, number] => TEAM_RGB[owner] ?? NEUTRAL_RGB;

const spriteOf = (kind: number): string => Units[kind]?.sprite ?? '';

const mobileZoomMul = (kind: number, zoom: number): number => {
  const def = Units[kind]!;
  if ((def.roles & (Role.Structure | Role.Resource)) !== 0 || kind === Kind.Geyser) return 1;
  return Math.max(1, (5 / zoom) / (def.radius / ONE));
};

const FLOATS = 16; // floats per instance (pos2,size2,rot1,uv4,color4,team3)
const FOG_COLOR = new Float32Array([4 / 255, 6 / 255, 10 / 255]);

// A growable instance buffer: a CPU Float32Array mirrored to a GPU buffer. push()
// appends one quad instance; flush() uploads the used range for one draw.
class InstanceList {
  arr: Float32Array;
  n = 0;
  private gl: WebGL2RenderingContext;
  private buf: Buffer;
  constructor(gl: WebGL2RenderingContext, buf: Buffer, cap = 1024) {
    this.gl = gl; this.buf = buf;
    this.arr = new Float32Array(cap * FLOATS);
    buf.data(this.arr, gl.DYNAMIC_DRAW);
  }
  reset(): void { this.n = 0; }
  push(
    x: number, y: number, w: number, h: number, rot: number, uv: UV,
    cr: number, cg: number, cb: number, ca: number, tr: number, tg: number, tb: number,
  ): void {
    if ((this.n + 1) * FLOATS > this.arr.length) {
      const next = new Float32Array(this.arr.length * 2);
      next.set(this.arr); this.arr = next;
      this.buf.data(this.arr, this.gl.DYNAMIC_DRAW);
    }
    const o = this.n * FLOATS; const a = this.arr;
    a[o] = x; a[o + 1] = y; a[o + 2] = w; a[o + 3] = h; a[o + 4] = rot;
    a[o + 5] = uv[0]; a[o + 6] = uv[1]; a[o + 7] = uv[2]; a[o + 8] = uv[3];
    a[o + 9] = cr; a[o + 10] = cg; a[o + 11] = cb; a[o + 12] = ca;
    a[o + 13] = tr; a[o + 14] = tg; a[o + 15] = tb;
    this.n++;
  }
  flush(): void { if (this.n > 0) this.buf.sub(this.arr.subarray(0, this.n * FLOATS)); }
}

// Tron terrain: a dark grid world. Tiles fill near-black (subtly bluer/lighter on
// raised plateaus), a faint cyan build-tile grid runs throughout, and elevation /
// walkability boundaries are traced with glowing cyan edges — bright "walls" around
// the playable border & obstacles, dimmer "cliffs" around plateaus. Baked once per map.
const buildTerrainCanvas = (m: MapDef): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.width = m.w * TILE; c.height = m.h * TILE;
  const g = c.getContext('2d')!;
  const W = m.w, H = m.h;
  const walkable = (x: number, y: number): boolean => m.walk[y * W + x] === 1;
  const elevated = (x: number, y: number): boolean => m.elev[y * W + x]! >= 1;

  // 1) tile fills: void (blocked) → low ground → raised plateau.
  for (let ty = 0; ty < H; ty++) {
    for (let tx = 0; tx < W; tx++) {
      const w = walkable(tx, ty);
      g.fillStyle = !w ? '#05070d' : elevated(tx, ty) ? '#0e1622' : '#090d16';
      g.fillRect(tx * TILE, ty * TILE, TILE, TILE);
    }
  }

  // 2) faint build-tile grid across the whole map (the Grid).
  g.strokeStyle = 'rgba(70,214,255,0.06)';
  g.lineWidth = 1;
  g.beginPath();
  for (let tx = 0; tx <= W; tx++) { g.moveTo(tx * TILE + 0.5, 0); g.lineTo(tx * TILE + 0.5, H * TILE); }
  for (let ty = 0; ty <= H; ty++) { g.moveTo(0, ty * TILE + 0.5); g.lineTo(W * TILE, ty * TILE + 0.5); }
  g.stroke();

  // 3) neon boundary traces. Each boundary is emitted once, from the "more solid" tile:
  //    walls = walkable↔blocked (incl. the map border), cliffs = high↔low ground.
  const walls = new Path2D();
  const cliffs = new Path2D();
  for (let ty = 0; ty < H; ty++) {
    for (let tx = 0; tx < W; tx++) {
      if (!walkable(tx, ty)) continue; // only trace from playable tiles
      const hi = elevated(tx, ty);
      const x = tx * TILE, y = ty * TILE;
      const sides: [number, number, number, number, number, number][] = [
        [tx, ty - 1, x, y, x + TILE, y],                       // top
        [tx, ty + 1, x, y + TILE, x + TILE, y + TILE],         // bottom
        [tx - 1, ty, x, y, x, y + TILE],                       // left
        [tx + 1, ty, x + TILE, y, x + TILE, y + TILE],         // right
      ];
      for (const [nx, ny, ax, ay, bx, by] of sides) {
        const inB = nx >= 0 && ny >= 0 && nx < W && ny < H;
        if (!inB || !walkable(nx, ny)) { walls.moveTo(ax, ay); walls.lineTo(bx, by); }
        else if (hi && !elevated(nx, ny)) { cliffs.moveTo(ax, ay); cliffs.lineTo(bx, by); }
      }
    }
  }
  g.lineCap = 'round';
  // soft underglow then a crisp core, for each trace kind.
  g.strokeStyle = 'rgba(70,214,255,0.10)'; g.lineWidth = 5; g.stroke(walls);
  g.strokeStyle = 'rgba(150,235,255,0.55)'; g.lineWidth = 1.6; g.stroke(walls);
  g.strokeStyle = 'rgba(70,214,255,0.05)'; g.lineWidth = 5; g.stroke(cliffs);
  g.strokeStyle = 'rgba(110,205,235,0.30)'; g.lineWidth = 1.4; g.stroke(cliffs);
  return c;
};

export class GlRenderer {
  private core: Gl;
  private atlas: Atlas;
  private quad01: Buffer;
  private corner: Buffer;

  private sprites: InstanceList; // normal blend
  private fx: InstanceList; // additive (lights + particles)
  private particles = new Particles();

  private colorTex: Texture; private maskTex: Texture; private fogTex: Texture;
  private fogData = new Uint8Array(1);
  private terrainTex: Texture | null = null;
  private terrainKey: MapDef | null = null;

  private drawTerrain: Command;
  private drawSprites: Command;
  private drawFx: Command;
  private drawFog: Command;
  private proj = new Float32Array(4);

  // Per-slot frame caches: cull decision + drawn footprint/center, reused across
  // the shadow/body/overlay passes and event diffing without recomputing.
  private drawn = new Uint8Array(CAP);
  private rr = new Float32Array(CAP);
  private wxA = new Float32Array(CAP);
  private wyA = new Float32Array(CAP);
  // Previous-frame state for combat-event detection.
  private prevDrawn = new Uint8Array(CAP);
  private prevAlive = new Uint8Array(CAP);
  private prevWcd = new Int32Array(CAP);
  private prevX = new Int32Array(CAP);
  private prevY = new Int32Array(CAP);
  private prevKind = new Uint16Array(CAP);
  private workScratch: WorkActivity[] = [];
  private visibilityScratch: VisibilityAffordance[] = [];
  private last = 0; // wall-clock seconds of the previous frame

  constructor(core: Gl, atlas: Atlas) {
    this.core = core;
    this.atlas = atlas;
    const gl = core.gl;

    this.quad01 = core.buffer().data(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    this.corner = core.buffer().data(new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]), gl.STATIC_DRAW);

    this.colorTex = core.texture({ source: atlas.color });
    this.maskTex = core.texture({ source: atlas.mask });
    this.fogTex = core.texture({
      width: 1, height: 1, format: gl.RED, internalFormat: gl.R8, type: gl.UNSIGNED_BYTE, filter: gl.LINEAR,
    });

    this.drawTerrain = core.command({
      vert: QUAD_VERT, frag: TERRAIN_FRAG, primitive: gl.TRIANGLE_STRIP, blend: false,
      attributes: { aQuad: { buffer: this.quad01, size: 2 } },
      uniforms: ['uProj', 'uRect', 'uTex'],
    });
    this.drawFog = core.command({
      vert: QUAD_VERT, frag: FOG_FRAG, primitive: gl.TRIANGLE_STRIP,
      attributes: { aQuad: { buffer: this.quad01, size: 2 } },
      uniforms: ['uProj', 'uRect', 'uFog', 'uFogColor'],
    });

    const sBuf = core.buffer();
    const fBuf = core.buffer();
    this.sprites = new InstanceList(gl, sBuf);
    this.fx = new InstanceList(gl, fBuf);
    this.drawSprites = this.spriteCommand(sBuf, true);
    this.drawFx = this.spriteCommand(fBuf, 'add');
  }

  /** A sprite-shader instanced command bound to one instance buffer + blend mode. */
  private spriteCommand(buffer: Buffer, blend: boolean | 'add'): Command {
    const gl = this.core.gl;
    const stride = FLOATS * 4;
    return this.core.command({
      vert: SPRITE_VERT, frag: SPRITE_FRAG, primitive: gl.TRIANGLE_STRIP, blend,
      attributes: {
        aCorner: { buffer: this.corner, size: 2 },
        iPos: { buffer, size: 2, stride, offset: 0, divisor: 1 },
        iSize: { buffer, size: 2, stride, offset: 8, divisor: 1 },
        iRot: { buffer, size: 1, stride, offset: 16, divisor: 1 },
        iUV: { buffer, size: 4, stride, offset: 20, divisor: 1 },
        iColor: { buffer, size: 4, stride, offset: 36, divisor: 1 },
        iTeam: { buffer, size: 3, stride, offset: 52, divisor: 1 },
      },
      uniforms: ['uProj', 'uColor', 'uMask'],
    });
  }

  render(game: Game, dpr: number): void {
    const core = this.core;
    const gl = core.gl;
    const m = game.map;
    const now = performance.now() / 1000;
    const dt = this.last ? Math.min(0.05, now - this.last) : 0;
    this.last = now;

    if (this.terrainKey !== m) {
      const c = buildTerrainCanvas(m);
      if (this.terrainTex) this.terrainTex.set(c);
      else this.terrainTex = core.texture({ source: c });
      this.terrainKey = m;
      this.fogData = new Uint8Array(m.w * m.h);
    }

    const cw = Math.floor(game.viewW * dpr);
    const ch = Math.floor(game.viewH * dpr);
    core.viewport(cw, ch);
    core.clear(4 / 255, 6 / 255, 10 / 255, 1);

    // world → clip projection (dpr cancels; viewport is in device px). Y is flipped.
    const ax = (2 * game.zoom) / game.viewW;
    const ay = (-2 * game.zoom) / game.viewH;
    this.proj[0] = ax;
    this.proj[1] = -game.camX * ax - 1;
    this.proj[2] = ay;
    this.proj[3] = -game.camY * ay + 1;
    const proj = this.proj;

    // 1) terrain.
    const mapRect = new Float32Array([0, 0, m.w * TILE, m.h * TILE]);
    this.drawTerrain({ count: 4, uniforms: { uProj: proj, uRect: mapRect, uTex: this.terrainTex! } });

    // 2) build sprite + fx instances (order matters within each batch).
    this.sprites.reset();
    this.fx.reset();
    this.cullAndShadows(game); // → sprites (shadows), fills drawn/rr/wx/wy caches
    this.bodies(game); // → sprites (bodies) + fx (ambient glows)
    this.workSparks(game);
    this.visibilityAffordances(game);
    this.events(game); // spawn particles from fired/died diffs; updates prev caches
    this.particles.update(dt);
    const glow = this.atlas.uv.glow!;
    this.particles.write((x, y, w, h, rot, r, g, b, a) => this.fx.push(x, y, w, h, rot, glow, r, g, b, a, 0, 0, 0));
    this.overlays(game); // → sprites (selection rings, HP bars, rally)

    this.sprites.flush();
    this.drawSprites({ count: 4, instances: this.sprites.n, uniforms: { uProj: proj, uColor: this.colorTex, uMask: this.maskTex } });
    this.fx.flush();
    if (this.fx.n > 0) {
      this.drawFx({ count: 4, instances: this.fx.n, uniforms: { uProj: proj, uColor: this.colorTex, uMask: this.maskTex } });
    }

    // 3) fog overlay (skipped entirely in god-view).
    if (game.human >= 0) {
      const fog = this.fogData;
      for (let ty = 0; ty < m.h; ty++) {
        for (let tx = 0; tx < m.w; tx++) {
          const v = game.tileVisible(tx, ty);
          fog[ty * m.w + tx] = v === 2 ? 255 : v === 1 ? 128 : 0;
        }
      }
      this.fogTex.put(m.w, m.h, fog);
      this.drawFog({ count: 4, uniforms: { uProj: proj, uRect: mapRect, uFog: this.fogTex, uFogColor: FOG_COLOR } });
    }
  }

  // Decide visibility, cache center/radius, and emit a soft ground shadow per
  // drawn entity (shadows go first in the batch so bodies sit on top of them).
  private cullAndShadows(game: Game): void {
    const state = game.sim.fullState();
    const e = state.e;
    const glow = this.atlas.uv.glow!;
    const zoom = game.zoom;
    for (let i = 0; i < e.hi; i++) {
      this.drawn[i] = 0;
      if (e.alive[i] !== 1 || e.container[i] !== NONE) continue;
      const wx = e.x[i]! / ONE; const wy = e.y[i]! / ONE;
      const kind = e.kind[i]!;
      if (!game.canSeeEntity(i)) continue;

      const presentation = entityPresentation(state, i);
      const p = spritePlacement(kind, presentation.artKind);
      const mul = mobileZoomMul(kind, zoom);
      const r = p.radius * mul;
      this.drawn[i] = 1; this.rr[i] = r; this.wxA[i] = wx; this.wyA[i] = wy;
      const shadowX = wx + p.baseOffsetX * mul;
      const shadowY = wy + p.baseOffsetY * mul;

      // Contact shadow: a squashed dark glow, offset down-right (light from top-left).
      this.sprites.push(shadowX + r * 0.18, shadowY + r * 0.34, p.visibleWidth * mul * 1.15, p.visibleHeight * mul * 0.72, 0, glow, 0, 0, 0, 0.32, 0, 0, 0);
    }
  }

  private bodies(game: Game): void {
    const state = game.sim.fullState();
    const e = state.e;
    const uv = this.atlas.uv;
    const glow = uv.glow!;
    for (let i = 0; i < e.hi; i++) {
      if (this.drawn[i] !== 1) continue;
      const kind = e.kind[i]!;
      const presentation = entityPresentation(state, i);
      const def = Units[kind]!;
      const isStruct = (def.roles & Role.Structure) !== 0;
      const isGeyser = kind === Kind.Geyser;
      const wx = this.wxA[i]!; const wy = this.wyA[i]!;
      const r = this.rr[i]!;
      const p = spritePlacement(kind, presentation.artKind);
      const mul = mobileZoomMul(kind, game.zoom);
      const sprite = uv[p.sprite] ?? uv[spriteOf(kind)] ?? uv.white!;

      // Facing: rotate mobile units from deterministic sim state ("up" art = -y).
      let rot = 0;
      const isMobile = (def.roles & (Role.Structure | Role.Resource)) === 0 && !isGeyser;
      if (isMobile) {
        const dx = e.faceX[i]!;
        const dy = e.faceY[i]!;
        if (dx !== 0 || dy !== 0) rot = Math.atan2(dx, -dy);
      }
      const illusion = illusionPresentation(state, game.human, i);
      const mergeSummon = presentation.state === 'protoss-merge-summon';
      const alpha = ((isStruct && e.built[i] !== 1) || mergeSummon ? 0.68 : 1) *
        entityCloakOpacity(state, i) * illusion.alpha;
      const [tr, tg, tb] = teamColor(e.owner[i]!);
      const c = Math.cos(rot);
      const s = Math.sin(rot);
      const drawX = wx + (p.offsetX * c - p.offsetY * s) * mul;
      const drawY = wy + (p.offsetX * s + p.offsetY * c) * mul;
      this.sprites.push(drawX, drawY, p.width * mul, p.height * mul, rot, sprite,
        illusion.tint[0], illusion.tint[1], illusion.tint[2], alpha, tr, tg, tb);

      // Ambient light: a soft glow that grounds the entity (additive, subtle).
      const baseX = wx + p.baseOffsetX * mul;
      const baseY = wy + p.baseOffsetY * mul;
      if (isStruct && e.built[i] === 1) {
        this.fx.push(baseX, baseY, r * 3.2, r * 3.2, 0, glow, tr, tg, tb, 0.12, 0, 0, 0);
      } else if (mergeSummon) {
        const dark = kind === Kind.DarkArchon;
        this.fx.push(wx, wy, r * 4, r * 4, 0, glow,
          dark ? 0.65 : 0.35, dark ? 0.35 : 0.65, 1, 0.26, 0, 0, 0);
      } else if (presentation.state === 'protoss-warp-in') {
        this.fx.push(baseX, baseY, r * 3.6, r * 3.6, 0, glow, 0.35, 0.65, 1, 0.18, 0, 0, 0);
      } else if (presentation.state === 'zerg-structure-morph') {
        this.fx.push(baseX, baseY, r * 3.2, r * 3.2, 0, glow, 0.35, 0.95, 0.45, 0.16, 0, 0, 0);
      } else if (kind === Kind.Mineral) {
        this.fx.push(wx, wy, r * 2.6, r * 2.6, 0, glow, 0.25, 0.85, 0.78, 0.1, 0, 0, 0);
      } else if (isGeyser || def.resourceType === ResourceType.Gas) {
        this.fx.push(baseX, baseY - r * 0.3, r * 2.4, r * 2.4, 0, glow, 0.3, 0.95, 0.4, 0.12, 0, 0, 0);
      } else {
        const childPresentation = childActorRenderPresentation(kind, r, game.zoom);
        if (childPresentation.role === 'projectile') {
          const glowR = childPresentation.radius;
          this.fx.push(wx, wy, glowR * 3, glowR * 3, 0, glow, 1, 0.75, 0.2, 0.32, 0, 0, 0);
        }
      }
    }
  }

  private workSparks(game: Game): void {
    const s = game.sim.fullState();
    const glow = this.atlas.uv.glow!;
    const zoom = game.zoom;
    for (const a of workActivities(s, this.workScratch)) {
      if (this.drawn[a.worker] !== 1 || this.drawn[a.target] !== 1) continue;
      const x = a.x / ONE;
      const y = a.y / ONE;
      const warm = a.kind === 'build';
      const phaseBase = s.tick + a.worker * 7;
      for (let n = 0; n < 3; n++) {
        const phase = ((phaseBase + n * 4) % 12) / 12;
        const angle = phase * Math.PI * 2 + n * 2.1;
        const dist = (4 + n * 1.7) / zoom;
        const size = (5 - n * 0.8) / zoom;
        const alpha = 0.34 + (1 - phase) * 0.3;
        this.fx.push(
          x + Math.cos(angle) * dist,
          y + Math.sin(angle) * dist,
          size,
          size,
          0,
          glow,
          warm ? 1 : 0.55,
          warm ? 0.72 : 0.95,
          warm ? 0.28 : 1,
          alpha,
          0,
          0,
          0,
        );
      }
    }
  }

  private visibilityAffordances(game: Game): void {
    const s = game.sim.fullState();
    const ring = this.atlas.uv.ring!;
    const glow = this.atlas.uv.glow!;
    const zoom = game.zoom;
    for (const a of visibilityAffordances(game, this.visibilityScratch)) {
      const phase = ((s.tick + a.timer) % 24) / 24;
      if (a.kind === 'scan') {
        const d = a.radius * 2;
        this.sprites.push(a.x, a.y, d, d, 0, ring, 0.42, 0.86, 1, 0.78, 0, 0, 0);
        this.fx.push(a.x, a.y, d * (0.95 + phase * 0.08), d * (0.95 + phase * 0.08), 0, glow, 0.3, 0.75, 1, 0.11, 0, 0, 0);
      } else {
        const d = a.radius * 2 * (0.94 + phase * 0.08);
        this.sprites.push(a.x, a.y, d, d, 0, ring, 1, 0.22, 0.18, 0.95, 0, 0, 0);
        this.sprites.push(a.x, a.y, a.radius * 0.8, 2 / zoom, 0, this.atlas.uv.white!, 1, 0.22, 0.18, 0.95, 0, 0, 0);
        this.sprites.push(a.x, a.y, 2 / zoom, a.radius * 0.8, 0, this.atlas.uv.white!, 1, 0.22, 0.18, 0.95, 0, 0, 0);
      }
    }
  }

  // Diff against last frame to spawn cosmetic combat FX, then snapshot state.
  private events(game: Game): void {
    const e = game.sim.fullState().e;
    for (let i = 0; i < e.hi; i++) {
      const aliveNow = e.alive[i] === 1;
      // Death: an entity we were drawing last frame is gone → explosion at its
      // last-known spot (use prev caches; the slot may already be reused).
      if (this.prevDrawn[i] === 1 && !aliveNow) {
        this.particles.emitExplosion(this.prevX[i]! / ONE, this.prevY[i]! / ONE, Math.max(6, visualRadius(this.prevKind[i]!)));
      }
      // Fire: weapon cooldown jumped up (only reset on a shot) on a drawn unit.
      if (aliveNow && this.drawn[i] === 1 && this.prevAlive[i] === 1 && e.wcd[i]! > this.prevWcd[i]!) {
        const r = this.rr[i]!;
        let dx = 0; let dy = -1;
        const tgt = e.target[i]!;
        if (isAlive(e, tgt)) { dx = e.x[slotOf(tgt)]! - e.x[i]!; dy = e.y[slotOf(tgt)]! - e.y[i]!; }
        else { dx = e.tx[i]! - e.x[i]!; dy = e.ty[i]! - e.y[i]!; }
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len; const uy = dy / len;
        this.particles.emitMuzzle(this.wxA[i]! + ux * r, this.wyA[i]! + uy * r, Math.atan2(uy, ux));
      }
      // Snapshot.
      this.prevDrawn[i] = this.drawn[i]!;
      this.prevAlive[i] = aliveNow ? 1 : 0;
      this.prevWcd[i] = e.wcd[i]!;
      this.prevX[i] = e.x[i]!; this.prevY[i] = e.y[i]!; this.prevKind[i] = e.kind[i]!;
    }
    // Clear stale prev flags above the high-water mark.
    for (let i = e.hi; i < CAP; i++) { this.prevDrawn[i] = 0; this.prevAlive[i] = 0; }
  }

  private overlays(game: Game): void {
    const s = game.sim.fullState();
    const e = s.e;
    const uv = this.atlas.uv;
    const white = uv.white!;
    const ring = uv.ring!;
    const zoom = game.zoom;

    for (let i = 0; i < e.hi; i++) {
      if (this.drawn[i] !== 1) continue;
      const id = eid(e, i);
      const kind = e.kind[i]!;
      const def = Units[kind]!;
      const hull = entityRenderHull(kind, e.x[i]!, e.y[i]!);

      const selected = game.selection.has(id);
      if (selected) {
        const illusion = illusionPresentation(s, game.human, i);
        const ringColor = illusion.known ? [0.49, 0.75, 1] : [1, 0.88, 0.3];
        const base = selectionBase(kind);
        const pad = 3 / zoom;
        if (base.shape === 'circle') {
          const sr = base.radius + pad;
          this.sprites.push(
            this.wxA[i]! + base.offsetX,
            this.wyA[i]! + base.offsetY,
            sr * 2,
            sr * 2,
            0,
            ring,
            ringColor[0]!, ringColor[1]!, ringColor[2]!, 1,
            0, 0, 0,
          );
        } else {
          this.rectOutline(
            this.wxA[i]! + base.offsetX,
            this.wyA[i]! + base.offsetY,
            base.width + pad * 2,
            base.height + pad * 2,
            2 / zoom,
            white,
            ringColor[0]!, ringColor[1]!, ringColor[2]!,
          );
        }
      }
      const bar = entityLifeBar(s, i, selected);
      if (bar) {
        const th = 3 / zoom;
        const width = Math.max(2 / zoom, bar.width);
        const y = bar.y - 5 / zoom;
        this.sprites.push(bar.x, y, width, th, 0, white, 0, 0, 0, 0.85, 0, 0, 0);
        const col = bar.kind === 'construction' ? [0.29, 0.82, 0.75] :
          bar.fraction > 0.5 ? [0.35, 1, 0.48] : bar.fraction > 0.25 ? [1, 0.82, 0.3] : [1, 0.35, 0.3];
        this.sprites.push(bar.x - width / 2 + (width * bar.fraction) / 2, y, width * bar.fraction, th, 0, white, col[0]!, col[1]!, col[2]!, 1, 0, 0, 0);
      }
    }

    // Rally lines for selected structures.
    for (const id of game.selection) {
      if (!isAlive(e, id)) continue;
      const i = slotOf(id);
      if ((e.flags[i]! & Role.Structure) === 0 || e.rallyX[i]! < 0) continue;
      const rally = resolveRallyEndpoint(s, i);
      if (!rally) continue;
      const p = spritePlacement(e.kind[i]!);
      const bx = e.x[i]! / ONE + p.baseOffsetX; const by = e.y[i]! / ONE + p.baseOffsetY;
      const rx = rally.x / ONE;
      const ry = rally.y / ONE;
      const dx = rx - bx; const dy = ry - by;
      const len = Math.hypot(dx, dy);
      if (len < 1) continue;
      this.sprites.push((bx + rx) / 2, (by + ry) / 2, len, 1.5 / zoom, Math.atan2(dy, dx), white, 1, 0.88, 0.3, 0.85, 0, 0, 0);
      const r = rally.target >= 0 ? Math.max(spritePlacement(e.kind[rally.target]!).visibleWidth, spritePlacement(e.kind[rally.target]!).visibleHeight) / 2 + 5 / zoom : 4 / zoom;
      this.sprites.push(rx, ry, r * 2, r * 2, 0, ring, 1, 0.88, 0.3, 1, 0, 0, 0);
    }
  }

  private rectOutline(
    x: number,
    y: number,
    w: number,
    h: number,
    thickness: number,
    uv: UV,
    r: number,
    g: number,
    b: number,
  ): void {
    this.sprites.push(x, y - h / 2, w, thickness, 0, uv, r, g, b, 1, 0, 0, 0);
    this.sprites.push(x, y + h / 2, w, thickness, 0, uv, r, g, b, 1, 0, 0, 0);
    this.sprites.push(x - w / 2, y, thickness, h, 0, uv, r, g, b, 1, 0, 0, 0);
    this.sprites.push(x + w / 2, y, thickness, h, 0, uv, r, g, b, 1, 0, 0, 0);
  }
}

// ---- shaders ----
const QUAD_VERT = `#version 300 es
precision highp float;
in vec2 aQuad;            // 0..1
uniform vec4 uProj;       // world→clip: x'=wx*proj.x+proj.y, y'=wy*proj.z+proj.w
uniform vec4 uRect;       // world x,y,w,h
out vec2 vUV;
void main() {
  vec2 world = uRect.xy + aQuad * uRect.zw;
  vUV = aQuad;
  gl_Position = vec4(world.x * uProj.x + uProj.y, world.y * uProj.z + uProj.w, 0.0, 1.0);
}`;

const TERRAIN_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
out vec4 frag;
void main() { frag = texture(uTex, vUV); }`;

const FOG_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uFog;   // R8: 0 unseen, .5 explored, 1 visible
uniform vec3 uFogColor;
out vec4 frag;
void main() {
  float v = texture(uFog, vUV).r;
  frag = vec4(uFogColor, (1.0 - v) * 0.92);
}`;

const SPRITE_VERT = `#version 300 es
precision highp float;
in vec2 aCorner;          // -0.5..0.5
in vec2 iPos;             // world center
in vec2 iSize;            // world w,h
in float iRot;
in vec4 iUV;              // u0,v0,u1,v1
in vec4 iColor;
in vec3 iTeam;
uniform vec4 uProj;
out vec2 vUV;
out vec4 vColor;
out vec3 vTeam;
void main() {
  float s = sin(iRot), c = cos(iRot);
  vec2 p = aCorner * iSize;
  vec2 r = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
  vec2 world = iPos + r;
  vec2 t = aCorner + 0.5;
  vUV = vec2(mix(iUV.x, iUV.z, t.x), mix(iUV.y, iUV.w, t.y));
  vColor = iColor;
  vTeam = iTeam;
  gl_Position = vec4(world.x * uProj.x + uProj.y, world.y * uProj.z + uProj.w, 0.0, 1.0);
}`;

const SPRITE_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
in vec4 vColor;
in vec3 vTeam;
uniform sampler2D uColor;
uniform sampler2D uMask;
out vec4 frag;
void main() {
  vec4 base = texture(uColor, vUV);
  if (base.a < 0.004) discard;
  float m = texture(uMask, vUV).r;       // team-region weight
  vec3 col = base.rgb * mix(vec3(1.0), vTeam, m) * vColor.rgb;
  frag = vec4(col, base.a * vColor.a);
}`;
