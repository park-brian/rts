// Game: drives the deterministic sim at a fixed timestep, owns the camera,
// selection, and the human command queue, computes fog for the human player, and
// publishes HUD state. Rendering and input live in sibling modules.

import {
  Sim, generateMap, createBotControllers, FPS, TILE, ONE, Kind, Units, Role,
  slotOf, eid, isEnemy, isAlive, NEUTRAL, toReplay, mapFromSpec,
  type MapDef, type Command, type PlayerCommands, type Controller,
  type Replay, type MapSpec,
} from './sim.ts';
import { ui, type Mode } from './store.ts';

const TICK_MS = 1000 / FPS;

export class Game {
  sim!: Sim;
  map!: MapDef;
  controllers: (Controller | null)[] = [];
  human = 0; // human player index, -1 in spectate
  mode: Mode = 'play';
  perTeam = 1; // players per side (1 = 1v1, 2 = 2v2, …)
  seed = 1;

  camX = 0; camY = 0; zoom = 1; // camera (world px) + scale
  viewW = 1; viewH = 1; // CSS px

  selection = new Set<number>();
  queued: Command[] = [];
  box: { x0: number; y0: number; x1: number; y1: number } | null = null; // live drag box (screen px)

  // replay viewer state (mode === 'replay')
  replay: Replay | null = null;
  replayTick = 0;
  replaySpeed = 1;
  paused = false;

  visible!: Uint8Array; // per-tile, human vision this frame
  explored!: Uint8Array;
  private acc = 0;
  private lastSel = 0;
  private framed = false;

  constructor(mode: Mode = 'play', seed = (Math.random() * 1e9) | 0) {
    this.restart(mode, seed);
  }

  restart(mode: Mode, seed = (Math.random() * 1e9) | 0, perTeam = this.perTeam): void {
    if (mode === 'replay') { this.startReplay(); return; } // toggle into watching the last game
    this.mode = mode;
    this.seed = seed;
    this.perTeam = perTeam;
    this.replay = null;
    const players = perTeam * 2;
    this.map = generateMap(perTeam, seed);
    this.sim = new Sim({ map: this.map, players, seed, record: true }); // record so the game is replayable
    const bots = createBotControllers(players);
    this.human = mode === 'play' ? 0 : -1;
    this.controllers = Array.from({ length: players }, (_, p) => (mode === 'play' && p === 0 ? null : bots[p]!));
    this.selection.clear();
    this.queued = [];
    this.visible = new Uint8Array(this.map.w * this.map.h);
    this.explored = new Uint8Array(this.map.w * this.map.h);
    ui.mode.value = mode;
    ui.perTeam.value = perTeam;
    ui.placement.value = 0;
    ui.amove.value = false;
    ui.rally.value = false;
    ui.hasReplay.value = false;
    this.framed = false;
    if (this.viewW > 1) this.frame();
  }

  private mapSpec(): MapSpec {
    return { kind: 'procedural', perTeam: this.perTeam, seed: this.seed };
  }

  /** Switch into replay playback. With no argument, watch the game just played. */
  startReplay(replay?: Replay): void {
    const r = replay ?? (this.sim.frames ? toReplay(this.sim, this.mapSpec()) : null);
    if (!r || r.frames.length === 0) return;
    this.replay = r;
    this.mode = 'replay';
    this.perTeam = r.map.kind === 'procedural' ? r.map.perTeam : this.perTeam;
    this.seed = r.map.kind === 'procedural' ? r.map.seed : this.seed;
    this.map = mapFromSpec(r.map);
    this.human = -1; // god view for analysis
    this.controllers = [];
    this.selection.clear();
    this.queued = [];
    this.visible = new Uint8Array(this.map.w * this.map.h);
    this.explored = new Uint8Array(this.map.w * this.map.h);
    this.replaySpeed = 1;
    this.paused = false;
    this.seekReplay(0);
    ui.mode.value = 'replay';
    ui.replayTotal.value = r.frames.length;
    ui.replaySpeed.value = 1;
    ui.paused.value = false;
    ui.over.value = false;
    this.framed = false;
    if (this.viewW > 1) this.frame();
  }

  /** Rebuild the replay sim and fast-forward to `tick` (scrubbing). */
  seekReplay(tick: number): void {
    if (!this.replay) return;
    const r = this.replay;
    const target = Math.max(0, Math.min(tick, r.frames.length));
    this.sim = new Sim({ map: this.map, players: r.players, seed: r.seed });
    for (let t = 0; t < target; t++) this.sim.step(r.frames[t] ?? []);
    this.replayTick = target;
    this.paused = target >= r.frames.length;
    this.selection.clear();
    ui.replayTick.value = target;
    ui.paused.value = this.paused;
    this.computeFog();
    this.publish();
  }

  setReplaySpeed(x: number): void { this.replaySpeed = x; ui.replaySpeed.value = x; }
  togglePause(): void {
    if (this.replayTick >= (this.replay?.frames.length ?? 0)) this.seekReplay(0); // restart at the end
    else { this.paused = !this.paused; ui.paused.value = this.paused; }
  }

  /** The replay JSON for the current/just-played game (download payload). */
  exportReplay(): string | null {
    const r = this.replay ?? (this.sim.frames ? toReplay(this.sim, this.mapSpec()) : null);
    return r ? JSON.stringify(r) : null;
  }

  loadReplay(json: string): void {
    this.startReplay(JSON.parse(json) as Replay);
  }

  resize(w: number, h: number): void {
    this.viewW = w; this.viewH = h;
    if (!this.framed && w > 1) this.frame();
    else this.clampCamera();
  }

  /** Pick a sensible default zoom and center on the player's base. */
  frame(): void {
    this.zoom = Math.max(0.4, Math.min(2, this.viewW / (26 * TILE)));
    const loc = this.map.starts[this.human < 0 ? 0 : this.human]!;
    this.centerOn(loc.x * TILE + TILE / 2, loc.y * TILE + TILE / 2);
    this.framed = true;
  }

  centerOn(wx: number, wy: number): void {
    this.camX = wx - this.viewW / this.zoom / 2;
    this.camY = wy - this.viewH / this.zoom / 2;
    this.clampCamera();
  }

  clampCamera(): void {
    const maxX = this.map.w * TILE - this.viewW / this.zoom;
    const maxY = this.map.h * TILE - this.viewH / this.zoom;
    this.camX = Math.max(0, Math.min(this.camX, Math.max(0, maxX)));
    this.camY = Math.max(0, Math.min(this.camY, Math.max(0, maxY)));
  }

  // ---- main loop step (called each rAF with the timestamp) ----
  update(now: number): void {
    if (!this.lastSel) this.lastSel = now;
    let dt = now - this.lastSel;
    this.lastSel = now;
    if (dt > 250) dt = 250; // avoid spiral after a stall
    this.acc += dt;
    if (this.mode === 'replay') {
      const interval = TICK_MS / Math.max(0.01, this.replaySpeed); // honor playback speed
      let steps = 0;
      while (!this.paused && this.acc >= interval && steps < 480) {
        this.replayStep();
        this.acc -= interval;
        steps++;
      }
      if (this.paused) this.acc = 0;
    } else {
      let steps = 0;
      while (this.acc >= TICK_MS && steps < 8) {
        this.tick();
        this.acc -= TICK_MS;
        steps++;
      }
    }
    this.computeFog();
    this.publish();
  }

  private replayStep(): void {
    const r = this.replay;
    if (!r || this.replayTick >= r.frames.length) { this.paused = true; ui.paused.value = true; return; }
    this.sim.step(r.frames[this.replayTick] ?? []);
    this.replayTick++;
    ui.replayTick.value = this.replayTick;
    this.pruneSelection();
    if (this.replayTick >= r.frames.length) { this.paused = true; ui.paused.value = true; }
  }

  /** Advance the sim by n ticks immediately (demos / screenshot automation). */
  fastForward(n: number): void {
    for (let i = 0; i < n && !this.sim.fullState().result.over; i++) this.tick();
    this.computeFog();
    this.publish();
  }

  private tick(): void {
    if (this.sim.fullState().result.over) return;
    const batch: PlayerCommands[] = [];
    for (let p = 0; p < this.controllers.length; p++) {
      const ctrl = this.controllers[p];
      if (ctrl) batch.push({ player: p, cmds: ctrl(this.sim.fullState(), p) });
      else batch.push({ player: p, cmds: this.drainHuman() });
    }
    this.sim.step(batch);
    this.pruneSelection();
  }

  private drainHuman(): Command[] {
    const q = this.queued;
    this.queued = [];
    return q;
  }

  // ---- fog of war (client-side; human's vision) ----
  private computeFog(): void {
    const m = this.map;
    const vis = this.visible;
    if (this.human < 0) { vis.fill(2); this.explored.fill(2); return; } // spectate: see all
    vis.fill(0);
    const e = this.sim.fullState().e;
    for (let i = 0; i < e.hi; i++) {
      if (e.alive[i] !== 1 || e.owner[i] !== this.human) continue;
      const sight = Units[e.kind[i]!]?.sight ?? 0;
      if (sight <= 0) continue;
      const tx = Math.floor(e.x[i]! / ONE / TILE);
      const ty = Math.floor(e.y[i]! / ONE / TILE);
      const r2 = sight * sight;
      for (let dy = -sight; dy <= sight; dy++) {
        const yy = ty + dy; if (yy < 0 || yy >= m.h) continue;
        for (let dx = -sight; dx <= sight; dx++) {
          const xx = tx + dx; if (xx < 0 || xx >= m.w) continue;
          if (dx * dx + dy * dy <= r2) { vis[yy * m.w + xx] = 2; this.explored[yy * m.w + xx] = 1; }
        }
      }
    }
  }

  tileVisible(tx: number, ty: number): number {
    if (tx < 0 || ty < 0 || tx >= this.map.w || ty >= this.map.h) return 0;
    const v = this.visible[ty * this.map.w + tx]!;
    return v === 2 ? 2 : this.explored[ty * this.map.w + tx]! === 1 ? 1 : 0;
  }

  // ---- selection & commands (called by input) ----
  screenToWorld(sx: number, sy: number): [number, number] {
    return [this.camX + sx / this.zoom, this.camY + sy / this.zoom];
  }

  boxSelect(sx0: number, sy0: number, sx1: number, sy1: number): void {
    const [wx0, wy0] = this.screenToWorld(Math.min(sx0, sx1), Math.min(sy0, sy1));
    const [wx1, wy1] = this.screenToWorld(Math.max(sx0, sx1), Math.max(sy0, sy1));
    this.selection.clear();
    if (this.human < 0) return;
    const e = this.sim.fullState().e;
    for (let i = 0; i < e.hi; i++) {
      if (e.alive[i] !== 1 || e.owner[i] !== this.human) continue;
      if ((e.flags[i]! & Role.Structure) !== 0) continue; // box-select units, not buildings
      const x = e.x[i]! / ONE; const y = e.y[i]! / ONE;
      if (x >= wx0 && x <= wx1 && y >= wy0 && y <= wy1) this.selection.add(eid(e, i));
    }
  }

  /** A tap at screen (sx,sy): select own unit, place a building, or command. */
  tap(sx: number, sy: number): void {
    const [wx, wy] = this.screenToWorld(sx, sy);
    if (this.human < 0) return;
    const e = this.sim.fullState().e;

    // Build placement mode.
    if (ui.placement.value !== 0) {
      const worker = this.firstSelected((i) => (e.flags[i]! & Role.Worker) !== 0);
      if (worker >= 0) {
        this.queued.push({ t: 'build', unit: eid(e, worker), kind: ui.placement.value, x: (wx * ONE) | 0, y: (wy * ONE) | 0 });
      }
      ui.placement.value = 0;
      return;
    }

    // Set-rally mode: point every selected structure's rally at the tapped spot.
    if (ui.rally.value) {
      for (const id of this.selection) {
        if (isAlive(e, id) && (e.flags[slotOf(id)]! & Role.Structure) !== 0) {
          this.queued.push({ t: 'rally', building: id, x: (wx * ONE) | 0, y: (wy * ONE) | 0 });
        }
      }
      ui.rally.value = false;
      return;
    }

    const hit = this.hitTest(wx, wy);
    // Tapping our own unit selects it.
    if (hit >= 0 && e.owner[slotOf(hit)] === this.human && (e.flags[slotOf(hit)]! & Role.Structure) === 0) {
      this.selection.clear(); this.selection.add(hit);
      ui.amove.value = false;
      return;
    }
    if (this.selection.size === 0) {
      // No selection: tap a structure to select it (for production).
      if (hit >= 0 && e.owner[slotOf(hit)] === this.human) { this.selection.clear(); this.selection.add(hit); }
      return;
    }

    const tx = (wx * ONE) | 0; const ty = (wy * ONE) | 0;
    const amove = ui.amove.value;
    ui.amove.value = false;
    for (const id of this.selection) {
      if (!isAlive(e, id)) continue;
      const i = slotOf(id);
      if ((e.flags[i]! & Role.Structure) !== 0) continue;
      if (hit >= 0 && isEnemy(this.sim.fullState(), this.human, e.owner[slotOf(hit)]!)) {
        this.queued.push({ t: 'attack', unit: id, target: hit });
      } else if (hit >= 0 && e.owner[slotOf(hit)] === NEUTRAL && (e.flags[i]! & Role.Worker) !== 0) {
        this.queued.push({ t: 'harvest', unit: id, patch: hit });
      } else if (amove) {
        this.queued.push({ t: 'amove', unit: id, x: tx, y: ty });
      } else {
        this.queued.push({ t: 'move', unit: id, x: tx, y: ty });
      }
    }
  }

  private firstSelected(pred: (slot: number) => boolean): number {
    const e = this.sim.fullState().e;
    for (const id of this.selection) {
      if (isAlive(e, id) && pred(slotOf(id))) return slotOf(id);
    }
    return -1;
  }

  hitTest(wx: number, wy: number): number {
    const e = this.sim.fullState().e;
    let best = -1; let bestD = Infinity;
    for (let i = 0; i < e.hi; i++) {
      if (e.alive[i] !== 1) continue;
      if (this.human >= 0 && e.owner[i] !== this.human && this.tileVisible(Math.floor(e.x[i]! / ONE / TILE), Math.floor(e.y[i]! / ONE / TILE)) !== 2) continue;
      const r = Math.max(10, Units[e.kind[i]!]!.radius / ONE);
      const dx = e.x[i]! / ONE - wx; const dy = e.y[i]! / ONE - wy;
      const d = dx * dx + dy * dy;
      if (d <= r * r && d < bestD) { bestD = d; best = eid(e, i); }
    }
    return best;
  }

  stopSelected(): void {
    const e = this.sim.fullState().e;
    for (const id of this.selection) if (isAlive(e, id)) this.queued.push({ t: 'stop', unit: id });
    ui.placement.value = 0; ui.amove.value = false; ui.rally.value = false;
  }

  trainSelected(kind: number): void {
    const e = this.sim.fullState().e;
    for (const id of this.selection) {
      if (isAlive(e, id) && (e.flags[slotOf(id)]! & Role.Producer) !== 0) {
        this.queued.push({ t: 'train', building: id, kind });
      }
    }
  }

  deselect(): void {
    this.selection.clear();
    ui.placement.value = 0; ui.amove.value = false; ui.rally.value = false;
  }

  /** Double-tap: select every visible (on-screen) unit of the tapped unit's type. */
  selectAllByType(sx: number, sy: number): void {
    if (this.human < 0) return;
    const [wx, wy] = this.screenToWorld(sx, sy);
    const e = this.sim.fullState().e;
    const hit = this.hitTest(wx, wy);
    if (hit < 0) return;
    const hs = slotOf(hit);
    if (e.owner[hs] !== this.human || (e.flags[hs]! & Role.Structure) !== 0) return;
    const kind = e.kind[hs]!;
    const x0 = this.camX; const y0 = this.camY;
    const x1 = this.camX + this.viewW / this.zoom; const y1 = this.camY + this.viewH / this.zoom;
    this.selection.clear();
    for (let i = 0; i < e.hi; i++) {
      if (e.alive[i] !== 1 || e.owner[i] !== this.human || e.kind[i] !== kind) continue;
      if ((e.flags[i]! & Role.Structure) !== 0) continue;
      const x = e.x[i]! / ONE; const y = e.y[i]! / ONE;
      if (x >= x0 && x <= x1 && y >= y0 && y <= y1) this.selection.add(eid(e, i));
    }
    ui.amove.value = false;
  }

  // ---- minimap navigation (geometry mirrors render.ts drawMinimap) ----
  minimapRect(): { ox: number; oy: number; W: number; H: number; scale: number } {
    const m = this.map; const size = 116; const pad = 8;
    const scale = size / Math.max(m.w, m.h);
    const W = m.w * scale; const H = m.h * scale;
    return { ox: this.viewW - W - pad, oy: this.viewH - H - pad, W, H, scale };
  }

  /** If (sx,sy) is on the minimap, recenter the camera there. Returns true if handled. */
  minimapPan(sx: number, sy: number): boolean {
    const r = this.minimapRect();
    if (sx < r.ox - 2 || sy < r.oy - 2 || sx > r.ox + r.W + 2 || sy > r.oy + r.H + 2) return false;
    this.centerOn(((sx - r.ox) / r.scale) * TILE, ((sy - r.oy) / r.scale) * TILE);
    return true;
  }

  private pruneSelection(): void {
    const e = this.sim.fullState().e;
    for (const id of [...this.selection]) if (!isAlive(e, id)) this.selection.delete(id);
  }

  private publish(): void {
    const s = this.sim.fullState();
    const p = this.human < 0 ? 0 : this.human;
    ui.minerals.value = s.players.minerals[p]!;
    ui.supplyUsed.value = s.players.supplyUsed[p]!;
    ui.supplyMax.value = s.players.supplyMax[p]!;
    ui.seconds.value = Math.floor(s.tick / FPS);
    ui.over.value = s.result.over;
    ui.winner.value = s.result.winner;
    ui.hasReplay.value = this.mode !== 'replay' && s.result.over && this.sim.frames !== null;

    // selection summary
    const e = s.e;
    let count = 0; let kindName = ''; let canBuild = false; let producer = 0;
    for (const id of this.selection) {
      if (!isAlive(e, id)) continue;
      count++;
      const k = e.kind[slotOf(id)]!;
      kindName = Units[k]!.name;
      if ((e.flags[slotOf(id)]! & Role.Worker) !== 0) canBuild = true;
      if ((e.flags[slotOf(id)]! & Role.Producer) !== 0) producer = k;
    }
    ui.selCount.value = count;
    ui.selKindName.value = count > 1 ? `${kindName} ×${count}` : kindName;
    ui.selCanBuild.value = canBuild;
    ui.selProducer.value = producer;
  }
}

// re-export a few constants the UI needs
export { Kind };
