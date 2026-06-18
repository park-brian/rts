// Game: drives the deterministic sim at a fixed timestep, owns the camera,
// selection, and the human command queue, computes fog for the human player, and
// publishes state through HUD helpers. Rendering and input live in sibling modules.

import {
  Sim, generateMap, createBotControllers, FPS, TILE, ONE, Abilities, Ability, Kind, Units, Role,
  slotOf, eid, isAlive, sameTeam, NEUTRAL, NONE, CAP, toReplay, mapFromSpec, parseReplay,
  validateCommand, transportCapacity, unloadAnchorSlot,
  canDetect, Factions,
  transformFor, isLiftedStructureFlags,
  bodyBounds, structureFootprint,
  type MapDef, type Command, type PlayerCommands, type Controller,
  type Replay, type MapSpec, type State, type Faction, type FactionName,
} from './sim.ts';
import { clearArmedCommand, isPlacementArmed, ui, type Mode } from './store.ts';
import { isUserCommandableKind } from './child-actors.ts';
import { smartCommandCandidates } from './smart-command-candidates.ts';
import { entityWorkQueue } from './entity-work-queue.ts';
import { clearSelectionView, publishHud, resetControlGroupCounts } from './hud-publisher.ts';
import { CONTROL_GROUP_COUNT, ControlGroupController } from './control-group-controller.ts';
import { PlacementController, type PlacementGhost } from './placement-controller.ts';

const TICK_MS = 1000 / FPS;
const RACE_NAMES: FactionName[] = ['terran', 'protoss', 'zerg'];
const EDGE_PAN_MARGIN = 24;
const EDGE_PAN_SPEED = 560; // screen px/sec; converted to world px by zoom
type TapOptions = { shift?: boolean; ctrl?: boolean; preferredHit?: number };
type SelectableBounds = { x0: number; y0: number; x1: number; y1: number; cx: number; cy: number };

const normalizeRace = (race: string | undefined): FactionName =>
  race === 'protoss' || race === 'zerg' ? race : 'terran';

const defaultRaceNames = (players: number): FactionName[] =>
  Array.from({ length: players }, (_, i) => RACE_NAMES[i % RACE_NAMES.length]!);

const usesFootprintBounds = (kind: number): boolean => {
  const def = Units[kind]!;
  return (def.roles & (Role.Structure | Role.Resource)) !== 0 || kind === Kind.Geyser;
};

const selectableBounds = (kind: number, x: number, y: number): SelectableBounds => {
  if (usesFootprintBounds(kind)) {
    const fp = structureFootprint(kind, x, y);
    const x0 = fp.x0 * TILE;
    const y0 = fp.y0 * TILE;
    const x1 = (fp.x1 + 1) * TILE;
    const y1 = (fp.y1 + 1) * TILE;
    return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }
  const b = bodyBounds(kind);
  const cx = x / ONE;
  const cy = y / ONE;
  return {
    x0: cx - b.left / ONE,
    y0: cy - b.up / ONE,
    x1: cx + b.right / ONE,
    y1: cy + b.down / ONE,
    cx,
    cy,
  };
};

const pointInBounds = (x: number, y: number, b: SelectableBounds): boolean =>
  x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;

const boundsIntersectsRect = (b: SelectableBounds, x0: number, y0: number, x1: number, y1: number): boolean =>
  b.x0 <= x1 && b.x1 >= x0 && b.y0 <= y1 && b.y1 >= y0;

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
  private readonly controlGroupController = new ControlGroupController();
  private readonly placementController = new PlacementController();
  queued: Command[] = [];
  box: { x0: number; y0: number; x1: number; y1: number } | null = null; // live drag box (screen px)
  private edgePanX = 0;
  private edgePanY = 0;

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

  get controlGroups(): readonly ReadonlySet<number>[] {
    return this.controlGroupController.groups;
  }

  get placementGhost(): PlacementGhost | null {
    return this.placementController.ghost;
  }

  set placementGhost(ghost: PlacementGhost | null) {
    this.placementController.ghost = ghost;
  }

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
    this.controlGroupController.reset();
    resetControlGroupCounts(CONTROL_GROUP_COUNT);
    this.queued = [];
    this.placementController.clear();
    this.visible = new Uint8Array(this.map.w * this.map.h);
    this.explored = new Uint8Array(this.map.w * this.map.h);
    this.visibleEntityTick = -1;
    ui.mode.value = mode;
    ui.perTeam.value = perTeam;
    ui.humanPlayer.value = this.humanPlayer;
    ui.playerRaces.value = [...this.playerRaceNames];
    clearArmedCommand();
    clearSelectionView();
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

  setEdgePanPointer(sx: number, sy: number): void {
    this.setEdgePanPointerInRect(sx, sy, this.viewW, this.viewH);
  }

  setEdgePanPointerInRect(sx: number, sy: number, w: number, h: number): void {
    if (sx < 0 || sy < 0 || sx > w || sy > h) {
      this.clearEdgePan();
      return;
    }
    this.edgePanX = sx <= EDGE_PAN_MARGIN ? -1 : sx >= w - EDGE_PAN_MARGIN ? 1 : 0;
    this.edgePanY = sy <= EDGE_PAN_MARGIN ? -1 : sy >= h - EDGE_PAN_MARGIN ? 1 : 0;
  }

  clearEdgePan(): void {
    this.edgePanX = 0;
    this.edgePanY = 0;
  }

  private applyEdgePan(dt: number): void {
    if (ui.controlScheme.value !== 'desktop' || (this.edgePanX === 0 && this.edgePanY === 0)) return;
    const step = (EDGE_PAN_SPEED * dt) / 1000 / this.zoom;
    this.camX += this.edgePanX * step;
    this.camY += this.edgePanY * step;
    this.clampCamera();
  }

  // ---- main loop step (called each rAF with the timestamp) ----
  update(now: number): void {
    if (!this.lastSel) this.lastSel = now;
    let dt = now - this.lastSel;
    this.lastSel = now;
    if (dt > 250) dt = 250; // avoid spiral after a stall
    this.applyEdgePan(dt);
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
    const s = this.sim.fullState();
    const e = s.e;
    const buildings: number[] = [];
    for (let i = 0; i < e.hi; i++) {
      if (e.alive[i] !== 1 || e.container[i] !== NONE || e.owner[i] !== this.human) continue;
      if (!isUserCommandableKind(e.kind[i]!)) continue;
      const b = selectableBounds(e.kind[i]!, e.x[i]!, e.y[i]!);
      if (!boundsIntersectsRect(b, wx0, wy0, wx1, wy1)) continue;
      if ((e.flags[i]! & Role.Structure) !== 0) buildings.push(eid(e, i));
      else this.selection.add(eid(e, i));
    }
    if (this.selection.size === 0) for (const id of buildings) this.selection.add(id);
  }

  /** A tap at screen (sx,sy): target an armed verb, select own entities, or smart-command. */
  tap(sx: number, sy: number, opts: TapOptions = {}): void {
    const [wx, wy] = this.screenToWorld(sx, sy);
    if (this.human < 0) return;
    const s = this.sim.fullState();
    const e = s.e;
    const tx = (wx * ONE) | 0; const ty = (wy * ONE) | 0;

    if (isPlacementArmed(ui.armedCommand.value)) return;

    const armed = ui.armedCommand.value;
    if (armed.t === 'ability') {
      const ability = Abilities[armed.ability]!;
      const hit = this.resolvePreferredHit(opts.preferredHit) ?? this.hitTest(wx, wy);
      const ok = ability.target === 'point'
        ? this.castSelectedAbility(armed.ability, undefined, tx, ty)
        : hit >= 0 && this.castSelectedAbility(armed.ability, hit);
      if (ok) clearArmedCommand();
      return;
    }

    const hit = this.resolvePreferredHit(opts.preferredHit) ?? this.hitTest(wx, wy);

    // Set-rally mode: point every selected structure's rally at the tapped spot or entity.
    if (armed.t === 'rally') {
      const rallyTarget = hit >= 0 && (((e.flags[slotOf(hit)]! & Role.Resource) !== 0) || sameTeam(s, this.human, e.owner[slotOf(hit)]!))
        ? hit
        : undefined;
      for (const id of this.selection) {
        if (isAlive(e, id) && (e.flags[slotOf(id)]! & Role.Structure) !== 0) {
          this.queued.push(rallyTarget !== undefined
            ? { t: 'rally', building: id, x: tx, y: ty, target: rallyTarget }
            : { t: 'rally', building: id, x: tx, y: ty });
        }
      }
      clearArmedCommand();
      return;
    }

    // Attack-move is an explicit target mode: the next world tap is its destination,
    // even if the tap lands on an owned selectable entity.
    if (armed.t === 'attackMove') {
      for (const id of this.mobileSelection(e)) this.queued.push({ t: 'amove', unit: id, x: tx, y: ty });
      clearArmedCommand();
      return;
    }

    if (armed.t === 'target' && armed.mode === 'harvest') {
      if (hit >= 0 && this.queueHarvestTarget(hit)) clearArmedCommand();
      return;
    }
    if (armed.t === 'target' && armed.mode === 'repair') {
      if (hit >= 0 && this.queueRepairTarget(hit)) clearArmedCommand();
      return;
    }

    // Normal mode rule: tapping your own selectable thing selects it. Friendly
    // target commands (repair/load/future spells) must be armed from the hotbar first.
    if (this.isOwnedSelectable(e, hit)) {
      this.selection.clear(); this.selection.add(hit);
      clearArmedCommand();
      return;
    }

    if (this.selection.size === 0) {
      return;
    }

    const mobile = this.mobileSelection(e);
    if (mobile.length === 0) {
      for (const id of this.selection) {
        const [command] = smartCommandCandidates(s, this.human, id, { hit, x: tx, y: ty }, 'mobile');
        if (command) this.queued.push(command);
      }
      return;
    }

    for (const id of mobile) {
      const [command] = smartCommandCandidates(s, this.human, id, { hit, x: tx, y: ty }, 'mobile');
      if (command) this.queued.push(command);
    }
  }

  desktopSelectTap(sx: number, sy: number, opts: TapOptions = {}): void {
    if (this.human < 0) return;
    const [wx, wy] = this.screenToWorld(sx, sy);
    const e = this.sim.fullState().e;
    const hit = this.resolvePreferredHit(opts.preferredHit) ?? this.hitTest(wx, wy);
    this.clearTargetModes();
    if (!this.isOwnedSelectable(e, hit)) {
      if (!opts.shift) this.selection.clear();
      return;
    }
    if (opts.ctrl) {
      this.selectVisibleKind(e.kind[slotOf(hit)]!);
      return;
    }
    if (opts.shift) {
      if (this.selection.has(hit)) this.selection.delete(hit);
      else this.selection.add(hit);
      return;
    }
    this.selection.clear();
    this.selection.add(hit);
  }

  desktopSmartTap(sx: number, sy: number, opts: TapOptions = {}): void {
    if (this.human < 0 || isPlacementArmed(ui.armedCommand.value) || this.selection.size === 0) return;
    const [wx, wy] = this.screenToWorld(sx, sy);
    const e = this.sim.fullState().e;
    const tx = (wx * ONE) | 0;
    const ty = (wy * ONE) | 0;
    const hit = this.resolvePreferredHit(opts.preferredHit) ?? this.hitTest(wx, wy);
    if (ui.armedCommand.value.t !== 'none') {
      this.tap(sx, sy, opts);
      return;
    }
    let queued = false;
    const s = this.sim.fullState();
    for (const id of this.selection) {
      const [command] = smartCommandCandidates(s, this.human, id, { hit, x: tx, y: ty }, 'desktop');
      if (command) {
        this.queued.push(command);
        queued = true;
      }
    }
    if (queued) this.clearTargetModes();
  }

  private clearTargetModes(): void {
    clearArmedCommand();
  }

  private centerOnSelection(): void {
    const e = this.sim.fullState().e;
    let x = 0;
    let y = 0;
    let n = 0;
    for (const id of this.selection) {
      if (!isAlive(e, id)) continue;
      const slot = slotOf(id);
      x += e.x[slot]! / ONE;
      y += e.y[slot]! / ONE;
      n++;
    }
    if (n > 0) this.centerOn(x / n, y / n);
  }

  assignControlGroup(index: number): boolean {
    const result = this.controlGroupController.assign(this.sim.fullState(), this.human, this.selection, index);
    if (result.changed) this.publish();
    return result.ok;
  }

  recallControlGroup(index: number, add = false): boolean {
    const result = this.controlGroupController.recall(this.sim.fullState(), this.human, this.selection, index, add);
    if (result.ok) this.clearTargetModes();
    if (result.changed) this.publish();
    if (result.shouldCenter) this.centerOnSelection();
    return result.ok;
  }

  private firstSelected(pred: (slot: number) => boolean): number {
    const e = this.sim.fullState().e;
    for (const id of this.selection) {
      if (isAlive(e, id) && pred(slotOf(id))) return slotOf(id);
    }
    return -1;
  }

  updatePlacementGhost(sx: number, sy: number): void {
    const armed = ui.armedCommand.value;
    const [wx, wy] = this.screenToWorld(sx, sy);
    this.placementController.update({
      state: this.sim.fullState(),
      human: this.human,
      armed,
      worldX: wx,
      worldY: wy,
      firstSelected: (pred) => this.firstSelected(pred),
    });
  }

  commitPlacementGhost(): boolean {
    const command = this.placementController.commit({
      state: this.sim.fullState(),
      armed: ui.armedCommand.value,
      firstSelected: (pred) => this.firstSelected(pred),
    });
    if (!command) return false;
    this.queued.push(command);
    clearArmedCommand();
    return true;
  }

  cancelPlacementGhost(): void {
    this.placementController.clear();
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
    return isAlive(e, id) && e.owner[slotOf(id)] === this.human && isUserCommandableKind(e.kind[slotOf(id)]!);
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
      if (!this.isHitTestCandidate(i)) continue;
      const b = selectableBounds(e.kind[i]!, e.x[i]!, e.y[i]!);
      if (!pointInBounds(wx, wy, b)) continue;
      const dx = b.cx - wx; const dy = b.cy - wy;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = eid(e, i); }
    }
    return best;
  }

  private isHitTestCandidate(slot: number): boolean {
    const e = this.sim.fullState().e;
    if (e.alive[slot] !== 1 || e.container[slot] !== NONE) return false;
    if (!isUserCommandableKind(e.kind[slot]!)) return false;
    if (!this.canSeeEntity(slot)) return false;
    if (this.human >= 0 && e.owner[slot] !== this.human) {
      const tx = Math.floor(e.x[slot]! / ONE / TILE);
      const ty = Math.floor(e.y[slot]! / ONE / TILE);
      if (this.tileVisible(tx, ty) !== 2) return false;
    }
    return true;
  }

  private resolvePreferredHit(hit: number | undefined): number | undefined {
    if (hit === undefined || hit < 0 || !isAlive(this.sim.fullState().e, hit)) return undefined;
    const slot = slotOf(hit);
    return this.isHitTestCandidate(slot) ? hit : undefined;
  }

  stopSelected(): void {
    const e = this.sim.fullState().e;
    for (const id of this.selection) if (isAlive(e, id)) this.queued.push({ t: 'stop', unit: id });
    this.clearTargetModes();
  }

  cancelSelectedBuild(): void {
    const s = this.sim.fullState();
    const e = s.e;
    for (const id of this.selection) {
      const c: Command = { t: 'cancelBuild', building: id };
      if (isAlive(e, id) && validateCommand(s, this.human, c).ok) this.queued.push(c);
    }
    this.clearTargetModes();
  }

  trainSelected(kind: number): void {
    const s = this.sim.fullState();
    const e = s.e;
    let best = -1;
    let bestLoad = Infinity;
    for (const id of this.selection) {
      if (!isAlive(e, id)) continue;
      const slot = slotOf(id);
      if ((e.flags[slot]! & Role.Producer) === 0 || !Units[e.kind[slot]!]!.produces.includes(kind)) continue;
      const c: Command = { t: 'train', building: id, kind };
      if (!validateCommand(s, this.human, c).ok) continue;
      const load = entityWorkQueue(s, slot).producerLoad;
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

  addonSelected(kind: number): void {
    const s = this.sim.fullState();
    const e = s.e;
    for (const id of this.selection) {
      if (!isAlive(e, id)) continue;
      const c: Command = { t: 'addon', building: id, kind };
      if (validateCommand(s, this.human, c).ok) {
        this.queued.push(c);
        break;
      }
    }
    this.clearTargetModes();
  }

  liftSelected(): void {
    const s = this.sim.fullState();
    const e = s.e;
    for (const id of this.selection) {
      if (!isAlive(e, id)) continue;
      const c: Command = { t: 'lift', building: id };
      if (validateCommand(s, this.human, c).ok) this.queued.push(c);
    }
    this.clearTargetModes();
  }

  armLandSelected(): void {
    const e = this.sim.fullState().e;
    const slot = this.firstSelected((i) => isLiftedStructureFlags(e.flags[i]!));
    this.clearTargetModes();
    if (slot >= 0) {
      ui.armedCommand.value = { t: 'land', kind: e.kind[slot]! };
    }
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
    this.clearTargetModes();
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
    this.clearTargetModes();
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
    this.clearTargetModes();
  }

  burrowSelected(active: boolean): void {
    const s = this.sim.fullState();
    const e = s.e;
    for (const id of this.selection) {
      const c: Command = { t: 'burrow', unit: id, active };
      if (isAlive(e, id) && validateCommand(s, this.human, c).ok) this.queued.push(c);
    }
    this.clearTargetModes();
  }

  mineSelected(): void {
    const s = this.sim.fullState();
    const e = s.e;
    for (const id of this.selection) {
      const c: Command = { t: 'mine', unit: id };
      if (isAlive(e, id) && validateCommand(s, this.human, c).ok) this.queued.push(c);
    }
    this.clearTargetModes();
  }

  deselect(): void {
    this.selection.clear();
    this.clearTargetModes();
    clearSelectionView();
  }

  /** Double-tap: select every visible (on-screen) owned entity of the tapped type. */
  selectAllByType(sx: number, sy: number, opts: TapOptions = {}): void {
    if (this.human < 0) return;
    const [wx, wy] = this.screenToWorld(sx, sy);
    const e = this.sim.fullState().e;
    const hit = this.resolvePreferredHit(opts.preferredHit) ?? this.hitTest(wx, wy);
    if (hit < 0) return;
    const hs = slotOf(hit);
    if (e.owner[hs] !== this.human) return;
    const kind = e.kind[hs]!;
    this.selectVisibleKind(kind);
    clearArmedCommand();
  }

  private selectVisibleKind(kind: number): void {
    if (!isUserCommandableKind(kind)) return;
    const e = this.sim.fullState().e;
    const x0 = this.camX; const y0 = this.camY;
    const x1 = this.camX + this.viewW / this.zoom; const y1 = this.camY + this.viewH / this.zoom;
    this.selection.clear();
    for (let i = 0; i < e.hi; i++) {
      if (e.alive[i] !== 1 || e.container[i] !== NONE || e.owner[i] !== this.human || e.kind[i] !== kind) continue;
      const b = selectableBounds(kind, e.x[i]!, e.y[i]!);
      if (boundsIntersectsRect(b, x0, y0, x1, y1)) this.selection.add(eid(e, i));
    }
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
    publishHud({
      state: s,
      human: this.human,
      mode: this.mode,
      hasRecordedReplay: this.sim.frames !== null,
      selection: this.selection,
      controlGroups: this.controlGroups,
      canSeeEntity: (slot) => this.canSeeEntity(slot),
    });
  }
}

// re-export a few constants the UI needs
export { Kind };
