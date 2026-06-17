// Game: drives the deterministic sim at a fixed timestep, owns the camera,
// selection, and the human command queue, computes fog for the human player, and
// publishes HUD state. Rendering and input live in sibling modules.

import {
  Sim, generateMap, createBotControllers, FPS, TILE, ONE, Abilities, Kind, TechDefs, Units, Role,
  slotOf, eid, isEnemy, isAlive, sameTeam, NEUTRAL, NONE, CAP, toReplay, mapFromSpec, parseReplay,
  canPlaceStructure, validateCommand, getTechLevel, transportCapacity, unloadAnchorSlot,
  canDetect, Factions, workerBuildKindsFor, canWorkerStartStructure,
  transformFor, transformTargetsFor,
  type MapDef, type Command, type PlayerCommands, type Controller,
  type Replay, type MapSpec, type State, type Faction, type FactionName,
} from './sim.ts';
import { ui, type Mode } from './store.ts';

const TICK_MS = 1000 / FPS;
const TECH_IDS = Object.keys(TechDefs).map(Number);
const RACE_NAMES: FactionName[] = ['terran', 'protoss', 'zerg'];

const normalizeRace = (race: string | undefined): FactionName =>
  race === 'protoss' || race === 'zerg' ? race : 'terran';

const defaultRaceNames = (players: number): FactionName[] =>
  Array.from({ length: players }, (_, i) => RACE_NAMES[i % RACE_NAMES.length]!);

export class Game {
  sim!: Sim;
  map!: MapDef;
  controllers: (Controller | null)[] = [];
  human = 0; // human player index, -1 in spectate
  mode: Mode = 'play';
  perTeam = 1; // players per side (1 = 1v1, 2 = 2v2, …)
  seed = 1;
  playerRaceNames: FactionName[] = ['terran', 'terran'];
  humanPlayer = 0;

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
  private visibleEntityTick = -1;
  private visibleEntityHuman = -2;
  private visibleEntity = new Uint8Array(CAP);

  constructor(mode: Mode = 'play', seed = (Math.random() * 1e9) | 0) {
    this.restart(mode, seed);
  }

  restart(
    mode: Mode,
    seed = (Math.random() * 1e9) | 0,
    perTeam = this.perTeam,
    raceNames: readonly string[] = this.playerRaceNames,
    humanPlayer = this.humanPlayer,
  ): void {
    if (mode === 'replay') { this.startReplay(); return; } // toggle into watching the last game
    this.mode = mode;
    this.seed = seed;
    this.perTeam = perTeam;
    this.replay = null;
    const players = perTeam * 2;
    this.playerRaceNames = raceNames.length === players
      ? raceNames.map(normalizeRace)
      : defaultRaceNames(players);
    this.humanPlayer = Math.max(0, Math.min(players - 1, humanPlayer));
    const factions: Faction[] = this.playerRaceNames.map((race) => Factions[race]);
    this.map = generateMap(perTeam, seed);
    this.sim = new Sim({ map: this.map, players, seed, record: true, vision: true, factions }); // record + fog for rendering
    const bots = createBotControllers(players, factions);
    this.human = mode === 'play' ? this.humanPlayer : -1;
    this.controllers = Array.from({ length: players }, (_, p) => (mode === 'play' && p === this.humanPlayer ? null : bots[p]!));
    this.selection.clear();
    this.queued = [];
    this.visible = new Uint8Array(this.map.w * this.map.h);
    this.explored = new Uint8Array(this.map.w * this.map.h);
    this.visibleEntityTick = -1;
    ui.mode.value = mode;
    ui.perTeam.value = perTeam;
    ui.humanPlayer.value = this.humanPlayer;
    ui.playerRaces.value = [...this.playerRaceNames];
    ui.placement.value = 0;
    ui.amove.value = false;
    ui.rally.value = false;
    ui.abilityTarget.value = 0;
    ui.targetMode.value = 'none';
    ui.selCanBurrow.value = false;
    ui.selCanUnburrow.value = false;
    ui.selCanHarvest.value = false;
    ui.selCanRepair.value = false;
    ui.selCanAttackMove.value = false;
    ui.selCanStop.value = false;
    ui.selCanMine.value = false;
    ui.selTransformKinds.value = [];
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
    this.playerRaceNames = r.factions ? r.factions.map(normalizeRace) : defaultRaceNames(r.players);
    this.map = mapFromSpec(r.map);
    this.human = -1; // god view for analysis
    this.controllers = [];
    this.selection.clear();
    this.queued = [];
    this.visible = new Uint8Array(this.map.w * this.map.h);
    this.explored = new Uint8Array(this.map.w * this.map.h);
    this.visibleEntityTick = -1;
    this.replaySpeed = 1;
    this.paused = false;
    this.seekReplay(0);
    ui.mode.value = 'replay';
    ui.playerRaces.value = [...this.playerRaceNames];
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
    const factions = (r.factions ? r.factions.map(normalizeRace) : defaultRaceNames(r.players)).map((race) => Factions[race]);
    this.sim = new Sim({ map: this.map, players: r.players, seed: r.seed, vision: true, factions });
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
    this.startReplay(parseReplay(json));
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

  // ---- fog of war: mirror the sim's per-player vision (computed deterministically
  // in the tick pipeline), so the renderer and the policy/network see the same fog. ----
  private computeFog(): void {
    const vis = this.visible;
    if (this.human < 0) { vis.fill(2); this.explored.fill(2); return; } // spectate: see all
    const v = this.sim.fullState().vision[this.human]!;
    for (let t = 0; t < vis.length; t++) {
      vis[t] = v[t]!;
      if (v[t]! >= 1) this.explored[t] = 1; // accumulate explored memory
    }
  }

  tileVisible(tx: number, ty: number): number {
    if (tx < 0 || ty < 0 || tx >= this.map.w || ty >= this.map.h) return 0;
    const v = this.visible[ty * this.map.w + tx]!;
    return v === 2 ? 2 : this.explored[ty * this.map.w + tx]! === 1 ? 1 : 0;
  }

  canSeeEntity(slot: number): boolean {
    this.refreshEntityVisibility();
    return this.visibleEntity[slot] === 1;
  }

  private refreshEntityVisibility(): void {
    const s = this.sim.fullState();
    if (this.visibleEntityTick === s.tick && this.visibleEntityHuman === this.human) return;
    const e = s.e;
    this.visibleEntity.fill(0, 0, e.hi);
    this.visibleEntityTick = s.tick;
    this.visibleEntityHuman = this.human;
    for (let i = 0; i < e.hi; i++) {
      if (e.alive[i] !== 1 || e.container[i] !== NONE) continue;
      if (this.human < 0) { this.visibleEntity[i] = 1; continue; }
      const tx = Math.floor(e.x[i]! / ONE / TILE);
      const ty = Math.floor(e.y[i]! / ONE / TILE);
      const vis = this.tileVisible(tx, ty);
      const def = Units[e.kind[i]!]!;
      if ((def.roles & Role.Resource) !== 0 || e.kind[i] === Kind.Geyser) {
        if (vis !== 0) this.visibleEntity[i] = 1;
      } else if (e.owner[i] === this.human) {
        this.visibleEntity[i] = 1;
      } else if (vis === 2 && canDetect(s, this.human, i)) {
        this.visibleEntity[i] = 1;
      }
    }
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
    const buildings: number[] = [];
    for (let i = 0; i < e.hi; i++) {
      if (e.alive[i] !== 1 || e.container[i] !== NONE || e.owner[i] !== this.human) continue;
      const x = e.x[i]! / ONE; const y = e.y[i]! / ONE;
      if (x < wx0 || x > wx1 || y < wy0 || y > wy1) continue;
      if ((e.flags[i]! & Role.Structure) !== 0) buildings.push(eid(e, i));
      else this.selection.add(eid(e, i));
    }
    if (this.selection.size === 0) for (const id of buildings) this.selection.add(id);
  }

  /** A tap at screen (sx,sy): target an armed verb, select own entities, or smart-command. */
  tap(sx: number, sy: number): void {
    const [wx, wy] = this.screenToWorld(sx, sy);
    if (this.human < 0) return;
    const e = this.sim.fullState().e;
    const tx = (wx * ONE) | 0; const ty = (wy * ONE) | 0;

    // Build placement mode.
    if (ui.placement.value !== 0) {
      const worker = this.firstSelected((i) => (e.flags[i]! & Role.Worker) !== 0);
      if (worker >= 0) {
        const placement = canPlaceStructure(this.sim.fullState(), this.human, worker, ui.placement.value, tx, ty);
        if (placement.ok) {
          this.queued.push({ t: 'build', unit: eid(e, worker), kind: ui.placement.value, x: placement.x, y: placement.y });
          ui.placement.value = 0;
          ui.abilityTarget.value = 0;
          ui.targetMode.value = 'none';
        }
      } else {
        ui.placement.value = 0;
      }
      return;
    }

    if (ui.abilityTarget.value !== 0) {
      const ability = Abilities[ui.abilityTarget.value]!;
      const hit = this.hitTest(wx, wy);
      const ok = ability.target === 'point'
        ? this.castSelectedAbility(ui.abilityTarget.value, undefined, tx, ty)
        : hit >= 0 && this.castSelectedAbility(ui.abilityTarget.value, hit);
      if (ok) ui.abilityTarget.value = 0;
      return;
    }

    const hit = this.hitTest(wx, wy);

    // Set-rally mode: point every selected structure's rally at the tapped spot or entity.
    if (ui.rally.value) {
      const rallyTarget = hit >= 0 && (((e.flags[slotOf(hit)]! & Role.Resource) !== 0) || sameTeam(this.sim.fullState(), this.human, e.owner[slotOf(hit)]!))
        ? hit
        : undefined;
      for (const id of this.selection) {
        if (isAlive(e, id) && (e.flags[slotOf(id)]! & Role.Structure) !== 0) {
          this.queued.push(rallyTarget !== undefined
            ? { t: 'rally', building: id, x: tx, y: ty, target: rallyTarget }
            : { t: 'rally', building: id, x: tx, y: ty });
        }
      }
      ui.rally.value = false;
      ui.abilityTarget.value = 0;
      ui.targetMode.value = 'none';
      return;
    }

    // Attack-move is an explicit target mode: the next world tap is its destination,
    // even if the tap lands on an owned selectable entity.
    if (ui.amove.value) {
      for (const id of this.mobileSelection(e)) this.queued.push({ t: 'amove', unit: id, x: tx, y: ty });
      ui.amove.value = false;
      ui.abilityTarget.value = 0;
      ui.targetMode.value = 'none';
      return;
    }

    if (ui.targetMode.value === 'harvest') {
      if (hit >= 0 && this.queueHarvestTarget(hit)) ui.targetMode.value = 'none';
      return;
    }
    if (ui.targetMode.value === 'repair') {
      if (hit >= 0 && this.queueRepairTarget(hit)) ui.targetMode.value = 'none';
      return;
    }

    // Normal mode rule: tapping your own selectable thing selects it. Friendly
    // target commands (repair/load/future spells) must be armed from the hotbar first.
    if (this.isOwnedSelectable(e, hit)) {
      this.selection.clear(); this.selection.add(hit);
      ui.amove.value = false; ui.abilityTarget.value = 0; ui.targetMode.value = 'none';
      return;
    }

    if (this.selection.size === 0) {
      return;
    }

    const mobile = this.mobileSelection(e);
    if (mobile.length === 0) {
      for (const id of this.selection) {
        if (isAlive(e, id) && (e.flags[slotOf(id)]! & Role.Structure) !== 0) {
          this.queued.push({ t: 'rally', building: id, x: tx, y: ty });
        }
      }
      return;
    }

    for (const id of mobile) {
      const i = slotOf(id);
      if (hit >= 0 && isEnemy(this.sim.fullState(), this.human, e.owner[slotOf(hit)]!)) {
        this.queued.push({ t: 'attack', unit: id, target: hit });
      } else if (hit >= 0 && (e.flags[slotOf(hit)]! & Role.Resource) !== 0 && (e.flags[i]! & Role.Worker) !== 0) {
        this.queued.push({ t: 'harvest', unit: id, patch: hit }); // neutral resources; owned gas selects unless Harvest is armed
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

  private mobileSelection(e: State['e']): number[] {
    const ids: number[] = [];
    for (const id of this.selection) {
      if (!isAlive(e, id)) continue;
      if (e.container[slotOf(id)] !== NONE) continue;
      if ((e.flags[slotOf(id)]! & Role.Structure) === 0) ids.push(id);
    }
    return ids;
  }

  private isOwnedSelectable(e: State['e'], id: number): boolean {
    if (id < 0 || this.human < 0) return false;
    return isAlive(e, id) && e.owner[slotOf(id)] === this.human;
  }

  private queueHarvestTarget(target: number): boolean {
    if (target < 0) return false;
    const s = this.sim.fullState();
    const e = s.e;
    let queued = false;
    for (const id of this.selection) {
      const c: Command = { t: 'harvest', unit: id, patch: target };
      if (isAlive(e, id) && validateCommand(s, this.human, c).ok) {
        this.queued.push(c);
        queued = true;
      }
    }
    return queued;
  }

  private queueRepairTarget(target: number): boolean {
    if (target < 0) return false;
    const s = this.sim.fullState();
    const e = s.e;
    const targetSlot = slotOf(target);
    if (e.built[targetSlot] !== 1) {
      let best: Command | null = null;
      let bestD = Infinity;
      for (const id of this.selection) {
        const c: Command = { t: 'repair', unit: id, target };
        if (!isAlive(e, id) || !validateCommand(s, this.human, c).ok) continue;
        const slot = slotOf(id);
        const dx = e.x[slot]! - e.x[targetSlot]!;
        const dy = e.y[slot]! - e.y[targetSlot]!;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = c; }
      }
      if (!best) return false;
      this.queued.push(best);
      return true;
    }
    let queued = false;
    for (const id of this.selection) {
      const c: Command = { t: 'repair', unit: id, target };
      if (isAlive(e, id) && validateCommand(s, this.human, c).ok) {
        this.queued.push(c);
        queued = true;
      }
    }
    return queued;
  }

  hitTest(wx: number, wy: number): number {
    const e = this.sim.fullState().e;
    let best = -1; let bestD = Infinity;
    for (let i = 0; i < e.hi; i++) {
      if (e.alive[i] !== 1 || e.container[i] !== NONE) continue;
      if (!this.canSeeEntity(i)) continue;
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
    ui.placement.value = 0; ui.amove.value = false; ui.rally.value = false; ui.abilityTarget.value = 0; ui.targetMode.value = 'none';
  }

  trainSelected(kind: number): void {
    const e = this.sim.fullState().e;
    let best = -1;
    let bestLoad = Infinity;
    for (const id of this.selection) {
      if (!isAlive(e, id)) continue;
      const slot = slotOf(id);
      if ((e.flags[slot]! & Role.Producer) === 0 || !Units[e.kind[slot]!]!.produces.includes(kind)) continue;
      const c: Command = { t: 'train', building: id, kind };
      if (!validateCommand(this.sim.fullState(), this.human, c).ok) continue;
      const queued = e.prodKind[slot] === Kind.None ? 0 : 1 + e.prodQueued[slot]!;
      const load = queued * 1_000_000 + e.prodTimer[slot]!;
      if (load < bestLoad) { best = id; bestLoad = load; }
    }
    if (best >= 0) this.queued.push({ t: 'train', building: best, kind });
  }

  researchSelected(tech: number): void {
    const e = this.sim.fullState().e;
    let best = -1;
    for (const id of this.selection) {
      if (!isAlive(e, id)) continue;
      const c: Command = { t: 'research', building: id, tech };
      if (validateCommand(this.sim.fullState(), this.human, c).ok) { best = id; break; }
    }
    if (best >= 0) this.queued.push({ t: 'research', building: best, tech });
  }

  transformSelected(kind: number): void {
    const s = this.sim.fullState();
    const e = s.e;
    const used = new Set<number>();
    const mergePairFor = (id: number): number => {
      if (!isAlive(e, id)) return NONE;
      const slot = slotOf(id);
      for (const other of this.selection) {
        if (other === id || used.has(other) || !isAlive(e, other)) continue;
        const c: Command = { t: 'transform', unit: id, kind, target: other };
        if (validateCommand(s, this.human, c).ok) return other;
      }
      return NONE;
    };
    for (const id of this.selection) {
      if (used.has(id)) continue;
      const c: Command = { t: 'transform', unit: id, kind };
      if (!isAlive(e, id) || !validateCommand(s, this.human, c).ok) continue;
      const transform = transformFor(e.kind[slotOf(id)]!, kind);
      if (transform?.mode === 'merge') {
        const partner = mergePairFor(id);
        if (partner !== NONE) {
          this.queued.push({ ...c, target: partner });
          used.add(id);
          used.add(partner);
        } else {
          this.queued.push(c);
          used.add(id);
        }
      } else {
        this.queued.push(c);
      }
    }
    ui.placement.value = 0; ui.amove.value = false; ui.rally.value = false; ui.abilityTarget.value = 0; ui.targetMode.value = 'none';
  }

  castSelectedAbility(abilityId: number, target?: number, x?: number, y?: number): boolean {
    const s = this.sim.fullState();
    const e = s.e;
    const ability = Abilities[abilityId];
    if (!ability) return false;
    if (ability.target === 'self') {
      let cast = false;
      for (const id of this.selection) {
        const c: Command = { t: 'ability', unit: id, ability: abilityId };
        if (isAlive(e, id) && validateCommand(s, this.human, c).ok) {
          this.queued.push(c);
          cast = true;
        }
      }
      return cast;
    }

    let best: Command | null = null;
    let bestD = Infinity;
    for (const id of this.selection) {
      if (!isAlive(e, id)) continue;
      const c: Command = ability.target === 'point'
        ? { t: 'ability', unit: id, ability: abilityId, x, y }
        : { t: 'ability', unit: id, ability: abilityId, target };
      if (!validateCommand(s, this.human, c).ok) continue;
      const sl = slotOf(id);
      const dx = e.x[sl]! - (x ?? (target !== undefined && isAlive(e, target) ? e.x[slotOf(target)]! : e.x[sl]!));
      const dy = e.y[sl]! - (y ?? (target !== undefined && isAlive(e, target) ? e.y[slotOf(target)]! : e.y[sl]!));
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = c; }
    }
    if (!best) return false;
    this.queued.push(best);
    return true;
  }

  loadSelected(): void {
    const s = this.sim.fullState();
    const e = s.e;
    const transports = [...this.selection].filter((id) =>
      isAlive(e, id) && transportCapacity(s, slotOf(id)) > 0);
    const units = [...this.selection].filter((id) =>
      isAlive(e, id) && !transports.includes(id));
    for (const transport of transports) {
      for (const unit of units) {
        const c: Command = { t: 'load', transport, unit };
        if (validateCommand(s, this.human, c).ok) this.queued.push(c);
      }
    }
    ui.placement.value = 0; ui.amove.value = false; ui.rally.value = false; ui.abilityTarget.value = 0; ui.targetMode.value = 'none';
  }

  unloadSelected(): void {
    const s = this.sim.fullState();
    const e = s.e;
    const offsets = [
      [0, 64], [64, 0], [-64, 0], [0, -64],
      [64, 64], [-64, 64], [64, -64], [-64, -64],
    ];
    for (const transport of this.selection) {
      if (!isAlive(e, transport)) continue;
      const tslot = slotOf(transport);
      const anchor = unloadAnchorSlot(s, tslot);
      if (anchor === NONE) continue;
      let n = 0;
      for (let i = 0; i < e.hi; i++) {
        if (e.alive[i] !== 1 || e.owner[i] !== this.human || e.container[i] !== transport) continue;
        const [ox, oy] = offsets[n % offsets.length]!;
        const ring = Math.trunc(n / offsets.length);
        const c: Command = {
          t: 'unload',
          transport,
          unit: eid(e, i),
          x: e.x[anchor]! + (ox + ring * 24) * ONE,
          y: e.y[anchor]! + oy * ONE,
        };
        if (validateCommand(s, this.human, c).ok) {
          this.queued.push(c);
          n++;
        }
      }
    }
    ui.placement.value = 0; ui.amove.value = false; ui.rally.value = false; ui.abilityTarget.value = 0; ui.targetMode.value = 'none';
  }

  burrowSelected(active: boolean): void {
    const s = this.sim.fullState();
    const e = s.e;
    for (const id of this.selection) {
      const c: Command = { t: 'burrow', unit: id, active };
      if (isAlive(e, id) && validateCommand(s, this.human, c).ok) this.queued.push(c);
    }
    ui.placement.value = 0; ui.amove.value = false; ui.rally.value = false; ui.abilityTarget.value = 0; ui.targetMode.value = 'none';
  }

  mineSelected(): void {
    const s = this.sim.fullState();
    const e = s.e;
    for (const id of this.selection) {
      const c: Command = { t: 'mine', unit: id };
      if (isAlive(e, id) && validateCommand(s, this.human, c).ok) this.queued.push(c);
    }
    ui.placement.value = 0; ui.amove.value = false; ui.rally.value = false; ui.abilityTarget.value = 0; ui.targetMode.value = 'none';
  }

  deselect(): void {
    this.selection.clear();
    ui.placement.value = 0; ui.amove.value = false; ui.rally.value = false; ui.abilityTarget.value = 0; ui.targetMode.value = 'none';
    ui.selCanBurrow.value = false; ui.selCanUnburrow.value = false;
    ui.selCanHarvest.value = false; ui.selCanRepair.value = false; ui.selCanAttackMove.value = false;
    ui.selCanStop.value = false; ui.selCanMine.value = false;
    ui.selTransformKinds.value = [];
  }

  /** Double-tap: select every visible (on-screen) owned entity of the tapped type. */
  selectAllByType(sx: number, sy: number): void {
    if (this.human < 0) return;
    const [wx, wy] = this.screenToWorld(sx, sy);
    const e = this.sim.fullState().e;
    const hit = this.hitTest(wx, wy);
    if (hit < 0) return;
    const hs = slotOf(hit);
    if (e.owner[hs] !== this.human) return;
    const kind = e.kind[hs]!;
    const x0 = this.camX; const y0 = this.camY;
    const x1 = this.camX + this.viewW / this.zoom; const y1 = this.camY + this.viewH / this.zoom;
    this.selection.clear();
    for (let i = 0; i < e.hi; i++) {
      if (e.alive[i] !== 1 || e.container[i] !== NONE || e.owner[i] !== this.human || e.kind[i] !== kind) continue;
      const x = e.x[i]! / ONE; const y = e.y[i]! / ONE;
      if (x >= x0 && x <= x1 && y >= y0 && y <= y1) this.selection.add(eid(e, i));
    }
    ui.amove.value = false; ui.abilityTarget.value = 0; ui.targetMode.value = 'none';
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
    ui.gas.value = s.players.gas[p]!;
    ui.supplyUsed.value = s.players.supplyUsed[p]!;
    ui.supplyMax.value = s.players.supplyMax[p]!;
    ui.seconds.value = Math.floor(s.tick / FPS);
    ui.over.value = s.result.over;
    ui.winner.value = s.result.winner;
    ui.hasReplay.value = this.mode !== 'replay' && s.result.over && this.sim.frames !== null;

    // selection summary
    const e = s.e;
    let count = 0; let kindName = ''; let canRally = false;
    let canLoad = false; let canUnload = false; let canHarvest = false; let canRepair = false;
    let canAttackMove = false; let canStop = false;
    let canBurrow = false; let canUnburrow = false; let canMine = false;
    const buildKinds = new Set<number>();
    const transformKinds = new Set<number>();
    const trainKinds = new Set<number>();
    const abilityIds = new Set<number>();
    const researchTechs = new Set<number>();
    for (const id of this.selection) {
      if (!isAlive(e, id)) continue;
      count++;
      const slot = slotOf(id);
      const k = e.kind[slot]!;
      kindName = Units[k]!.name;
      const nonStructure = (e.flags[slot]! & Role.Structure) === 0;
      if (nonStructure && validateCommand(s, this.human, { t: 'amove', unit: id, x: e.x[slot]!, y: e.y[slot]! }).ok) canAttackMove = true;
      if (validateCommand(s, this.human, { t: 'stop', unit: id }).ok) canStop = true;
      if ((e.flags[slot]! & Role.Worker) !== 0) {
        canHarvest = true;
        for (const build of workerBuildKindsFor(Units[k]!.race)) {
          if (canWorkerStartStructure(s, this.human, slot, build).ok) buildKinds.add(build);
        }
      }
      if (e.kind[slot] === Kind.SCV) canRepair = true;
      if ((e.flags[slot]! & Role.Structure) !== 0) canRally = true;
      for (const train of Units[k]!.produces) {
        if (validateCommand(s, this.human, { t: 'train', building: id, kind: train }).ok) trainKinds.add(train);
      }
      for (const target of transformTargetsFor(k)) {
        if (validateCommand(s, this.human, { t: 'transform', unit: id, kind: target }).ok) transformKinds.add(target);
      }
      for (const ability of Units[k]!.abilities) {
        if (this.canOfferAbility(s, slot, ability)) abilityIds.add(ability);
      }
      for (const tech of TECH_IDS) {
        const c: Command = { t: 'research', building: id, tech };
        if (validateCommand(s, this.human, c).ok) researchTechs.add(tech);
      }
      if (validateCommand(s, this.human, { t: 'burrow', unit: id, active: true }).ok) canBurrow = true;
      if (validateCommand(s, this.human, { t: 'burrow', unit: id, active: false }).ok) canUnburrow = true;
      if (validateCommand(s, this.human, { t: 'mine', unit: id }).ok) canMine = true;
    }
    const selected = [...this.selection].filter((id) => isAlive(e, id));
    for (const transport of selected) {
      const ts = slotOf(transport);
      if (transportCapacity(s, ts) <= 0) continue;
      for (const unit of selected) {
        if (unit === transport) continue;
        if (validateCommand(s, this.human, { t: 'load', transport, unit }).ok) canLoad = true;
      }
      for (let i = 0; i < e.hi; i++) {
        if (e.alive[i] === 1 && e.owner[i] === this.human && e.container[i] === transport) canUnload = true;
      }
    }
    ui.selCount.value = count;
    ui.selKindName.value = count > 1 ? `${kindName} ×${count}` : kindName;
    ui.selCanBuild.value = buildKinds.size > 0;
    ui.selCanRally.value = canRally;
    ui.selBuildKinds.value = [...buildKinds].sort((a, b) => a - b);
    ui.selTransformKinds.value = [...transformKinds].sort((a, b) => a - b);
    ui.selTrainKinds.value = [...trainKinds].sort((a, b) => a - b);
    ui.selAbilities.value = [...abilityIds].sort((a, b) => a - b);
    ui.selResearchTechs.value = [...researchTechs].sort((a, b) => a - b);
    ui.selCanLoad.value = canLoad;
    ui.selCanUnload.value = canUnload;
    ui.selCanHarvest.value = canHarvest;
    ui.selCanRepair.value = canRepair;
    ui.selCanAttackMove.value = canAttackMove;
    ui.selCanStop.value = canStop;
    ui.selCanBurrow.value = canBurrow;
    ui.selCanUnburrow.value = canUnburrow;
    ui.selCanMine.value = canMine;
  }

  private canOfferAbility(s: State, slot: number, abilityId: number): boolean {
    const e = s.e;
    const ability = Abilities[abilityId];
    if (!ability) return false;
    if (ability.tech !== undefined && getTechLevel(s, this.human, ability.tech) <= 0) return false;
    if (ability.target === 'self') return validateCommand(s, this.human, { t: 'ability', unit: eid(e, slot), ability: abilityId }).ok;
    if (e.energy[slot]! < ability.energyCost || e.hp[slot]! <= ability.hpCost) return false;
    return true;
  }
}

// re-export a few constants the UI needs
export { Kind };
