// WebGL2 world renderer. Built on the regl-like core (gl/gl.ts), it draws the
// whole scene in three commands regardless of unit count:
//   1. terrain — one textured quad (the baked terrain canvas → GPU texture).
//   2. sprites — ONE instanced draw for every unit/building/resource plus their
//      HP bars, selection rings, and rally markers. All geometry is a single
//      quad; per-instance attributes carry position, size, rotation, atlas UV,
//      tint, and team color. This is the hot path and it's GPU-batched.
//   3. fog    — one textured quad over a tiny per-tile visibility texture, linear-
//      filtered for soft edges.
// Team color is applied in the fragment shader via the atlas mask (assets.md §4).

import { TILE, ONE, Units, Role, Kind, Order, eid, slotOf, isAlive, type MapDef } from '../sim.ts';
import type { Game } from '../game.ts';
import { Gl, type Command, type Buffer, type Texture } from './gl.ts';
import { SPRITES } from '../art/sprites.ts';
import type { Atlas } from './atlas.ts';

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

const SPRITE_OF: Record<number, string> = {
  [Kind.SCV]: 'scv',
  [Kind.Marine]: 'marine',
  [Kind.CommandCenter]: 'commandCenter',
  [Kind.SupplyDepot]: 'supplyDepot',
  [Kind.Barracks]: 'barracks',
  [Kind.Refinery]: 'refinery',
  [Kind.Mineral]: 'mineral',
  [Kind.Geyser]: 'geyser',
};
// World-size multiplier per kind (vs. interaction radius), from the sprite defs.
const scaleOf = (kind: number): number => SPRITES[SPRITE_OF[kind] ?? '']?.scale ?? 1;

const FLOATS = 16; // floats per sprite instance (pos2,size2,rot1,uv4,color4,team3)
const FOG_COLOR = new Float32Array([4 / 255, 6 / 255, 10 / 255]);

const buildTerrainCanvas = (m: MapDef): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.width = m.w * TILE; c.height = m.h * TILE;
  const g = c.getContext('2d')!;
  for (let ty = 0; ty < m.h; ty++) {
    for (let tx = 0; tx < m.w; tx++) {
      const i = ty * m.w + tx;
      const walk = m.walk[i] === 1;
      const high = m.elev[i]! >= 1;
      g.fillStyle = !walk ? '#222732' : high ? '#3c5740' : '#26331f';
      g.fillRect(tx * TILE, ty * TILE, TILE, TILE);
    }
  }
  g.fillStyle = 'rgba(0,0,0,0.35)'; // cliff shading below high/blocked tiles
  for (let ty = 0; ty < m.h - 1; ty++) {
    for (let tx = 0; tx < m.w; tx++) {
      const a = m.walk[ty * m.w + tx] === 0 || m.elev[ty * m.w + tx]! >= 1;
      const b = m.walk[(ty + 1) * m.w + tx] === 0 || m.elev[(ty + 1) * m.w + tx]! >= 1;
      if (a && !b) g.fillRect(tx * TILE, (ty + 1) * TILE, TILE, 3);
    }
  }
  return c;
};

export class GlRenderer {
  private core: Gl;
  private quad01: Buffer; // 0..1 quad for fullscreen-ish textured passes
  private corner: Buffer; // -0.5..0.5 quad for centered sprites
  private instBuf: Buffer;
  private inst = new Float32Array(1024 * FLOATS);
  private n = 0; // instance count this frame

  private colorTex: Texture;
  private maskTex: Texture;
  private fogTex: Texture;
  private fogData = new Uint8Array(1);
  private terrainTex: Texture | null = null;
  private terrainKey: MapDef | null = null;

  private drawTerrain: Command;
  private drawSprites: Command;
  private drawFog: Command;
  private proj = new Float32Array(4);
  private atlas: Atlas;

  constructor(core: Gl, atlas: Atlas) {
    this.core = core;
    const gl = core.gl;

    this.quad01 = core.buffer().data(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    this.corner = core.buffer().data(new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]), gl.STATIC_DRAW);
    this.instBuf = core.buffer().data(this.inst, gl.DYNAMIC_DRAW);

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

    const stride = FLOATS * 4;
    this.drawSprites = core.command({
      vert: SPRITE_VERT, frag: SPRITE_FRAG, primitive: gl.TRIANGLE_STRIP,
      attributes: {
        aCorner: { buffer: this.corner, size: 2 },
        iPos: { buffer: this.instBuf, size: 2, stride, offset: 0, divisor: 1 },
        iSize: { buffer: this.instBuf, size: 2, stride, offset: 8, divisor: 1 },
        iRot: { buffer: this.instBuf, size: 1, stride, offset: 16, divisor: 1 },
        iUV: { buffer: this.instBuf, size: 4, stride, offset: 20, divisor: 1 },
        iColor: { buffer: this.instBuf, size: 4, stride, offset: 36, divisor: 1 },
        iTeam: { buffer: this.instBuf, size: 3, stride, offset: 52, divisor: 1 },
      },
      uniforms: ['uProj', 'uColor', 'uMask'],
    });

    this.atlas = atlas;
  }

  // --- instance writer ---
  private grow(): void {
    const next = new Float32Array(this.inst.length * 2);
    next.set(this.inst);
    this.inst = next;
    this.instBuf.data(this.inst, this.core.gl.DYNAMIC_DRAW);
  }
  private push(
    x: number, y: number, w: number, h: number, rot: number,
    uv: readonly [number, number, number, number],
    cr: number, cg: number, cb: number, ca: number,
    tr: number, tg: number, tb: number,
  ): void {
    if ((this.n + 1) * FLOATS > this.inst.length) this.grow();
    const o = this.n * FLOATS;
    const a = this.inst;
    a[o] = x; a[o + 1] = y; a[o + 2] = w; a[o + 3] = h; a[o + 4] = rot;
    a[o + 5] = uv[0]; a[o + 6] = uv[1]; a[o + 7] = uv[2]; a[o + 8] = uv[3];
    a[o + 9] = cr; a[o + 10] = cg; a[o + 11] = cb; a[o + 12] = ca;
    a[o + 13] = tr; a[o + 14] = tg; a[o + 15] = tb;
    this.n++;
  }

  render(game: Game, dpr: number): void {
    const core = this.core;
    const gl = core.gl;
    const m = game.map;
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

    // 2) build + draw all sprite instances.
    this.n = 0;
    this.buildSprites(game);
    if (this.n > 0) {
      this.instBuf.sub(this.inst.subarray(0, this.n * FLOATS));
      this.drawSprites({ count: 4, instances: this.n, uniforms: { uProj: proj, uColor: this.colorTex, uMask: this.maskTex } });
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

  private buildSprites(game: Game): void {
    const e = game.sim.fullState().e;
    const uv = this.atlas.uv;
    const white = uv.white!;
    const ring = uv.ring!;
    const zoom = game.zoom;

    // Pass A: bodies (units / buildings / resources).
    for (let i = 0; i < e.hi; i++) {
      if (e.alive[i] !== 1) continue;
      const wx = e.x[i]! / ONE; const wy = e.y[i]! / ONE;
      const ttx = Math.floor(wx / TILE); const tty = Math.floor(wy / TILE);
      const vis = game.tileVisible(ttx, tty);
      const kind = e.kind[i]!;
      const def = Units[kind]!;
      const isStruct = (def.roles & Role.Structure) !== 0;
      const isRes = (def.roles & Role.Resource) !== 0;
      const isGeyser = kind === Kind.Geyser;
      const own = e.owner[i] === game.human;
      if (!own && !isRes && !isGeyser && vis !== 2) continue; // hide unseen enemies
      if ((isRes || isGeyser) && vis === 0) continue; // hide unexplored resources

      const sprite = uv[SPRITE_OF[kind] ?? ''] ?? white;
      const scale = scaleOf(kind);
      const baseR = def.radius / ONE;
      const mobile = !isStruct && !isRes && !isGeyser;
      const r = mobile ? Math.max(baseR, 5 / zoom) : baseR;
      const size = 2 * r * scale;

      let rot = 0;
      if (mobile) {
        const ord = e.order[i]!;
        if (ord === Order.Move || ord === Order.AttackMove || ord === Order.Build || ord === Order.Harvest) {
          const dx = e.tx[i]! - e.x[i]!; const dy = e.ty[i]! - e.y[i]!;
          if (dx * dx + dy * dy > 16) rot = Math.atan2(dx, -dy); // art faces -y
        }
      }
      const alpha = isStruct && e.built[i] !== 1 ? 0.55 : 1;
      const [tr, tg, tb] = teamColor(e.owner[i]!);
      this.push(wx, wy, size, size, rot, sprite, 1, 1, 1, alpha, tr, tg, tb);
    }

    // Pass B: overlays (drawn after bodies so they sit on top).
    for (let i = 0; i < e.hi; i++) {
      if (e.alive[i] !== 1) continue;
      const id = eid(e, i);
      const kind = e.kind[i]!;
      const def = Units[kind]!;
      const isStruct = (def.roles & Role.Structure) !== 0;
      const isRes = (def.roles & Role.Resource) !== 0;
      const isGeyser = kind === Kind.Geyser;
      const wx = e.x[i]! / ONE; const wy = e.y[i]! / ONE;
      const ttx = Math.floor(wx / TILE); const tty = Math.floor(wy / TILE);
      const vis = game.tileVisible(ttx, tty);
      const own = e.owner[i] === game.human;
      if (!own && !isRes && !isGeyser && vis !== 2) continue;
      if ((isRes || isGeyser) && vis === 0) continue;

      const scale = scaleOf(kind);
      const mobile = !isStruct && !isRes && !isGeyser;
      const r = (mobile ? Math.max(def.radius / ONE, 5 / zoom) : def.radius / ONE) * scale;
      const selected = game.selection.has(id);

      if (selected) {
        const sr = r + 3 / zoom;
        this.push(wx, wy, sr * 2, sr * 2, 0, ring, 1, 0.88, 0.3, 1, 0, 0, 0);
      }
      // HP bar for damaged things with a hp pool.
      if (e.hp[i]! < def.hp && def.hp > 0) {
        const bw = r * 1.8;
        const top = wy - r - 5 / zoom;
        const th = 3 / zoom;
        const frac = Math.max(0, e.hp[i]! / def.hp);
        this.push(wx, top, bw, th, 0, white, 0, 0, 0, 0.85, 0, 0, 0);
        const col = frac > 0.5 ? [0.35, 1, 0.48] : frac > 0.25 ? [1, 0.82, 0.3] : [1, 0.35, 0.3];
        this.push(wx - bw / 2 + (bw * frac) / 2, top, bw * frac, th, 0, white, col[0]!, col[1]!, col[2]!, 1, 0, 0, 0);
      }
    }

    // Pass C: rally lines for selected structures.
    for (const id of game.selection) {
      if (!isAlive(e, id)) continue;
      const i = slotOf(id);
      if ((e.flags[i]! & Role.Structure) === 0 || e.rallyX[i]! < 0) continue;
      const bx = e.x[i]! / ONE; const by = e.y[i]! / ONE;
      const rx = e.rallyX[i]! / ONE; const ry = e.rallyY[i]! / ONE;
      const dx = rx - bx; const dy = ry - by;
      const len = Math.hypot(dx, dy);
      if (len < 1) continue;
      const rot = Math.atan2(dy, dx);
      this.push((bx + rx) / 2, (by + ry) / 2, len, 1.5 / zoom, rot, white, 1, 0.88, 0.3, 0.85, 0, 0, 0);
      const dot = 4 / zoom;
      this.push(rx, ry, dot * 2, dot * 2, 0, ring, 1, 0.88, 0.3, 1, 0, 0, 0);
    }
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
