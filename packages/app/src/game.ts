// Game: drives the deterministic sim at a fixed timestep, owns the camera,
// selection, and the human command queue, computes fog for the human player, and
// publishes state through HUD helpers. Rendering and input live in sibling modules.

import {
  Sim, generateMap, createBotControllers, FPS, TILE, ONE, Abilities, Ability, Kind, Units, Role,
  slotOf, eid, isAlive, NEUTRAL, NONE, toReplay, mapFromSpec, parseReplay,
  validateCommand, transportCapacity, unloadAnchorSlot,
  Factions,
  transformFor, isLiftedStructureFlags,
  entityWorkQueue,
  type MapDef, type Command, type PlayerCommands, type Controller,
  type Replay, type MapSpec, type State, type Faction, type FactionName,
} from './sim.ts';
import { clearArmedCommand, isPlacementArmed, shouldToggleArmedCommand, ui, type CommandOption, type Mode } from './store.ts';
import { isUserCommandableKind } from './child-actors.ts';
import { clearSelectionView, publishHud, resetControlGroupCounts } from './hud-publisher.ts';
import { CONTROL_GROUP_COUNT, ControlGroupController } from './control-group-controller.ts';
import { CameraController } from './camera-controller.ts';
import { PlacementController, type PlacementGhost } from './placement-controller.ts';
import { TapSelectionController, type TapOptions } from './tap-selection-controller.ts';
import { VisibilityController } from './visibility-controller.ts';
import { pointInBounds, selectableBounds } from './selection-geometry.ts';

const TICK_MS = 1000 / FPS;
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

  selection = new Set<number>();
  private cameraController?: CameraController;
  private visibilityController?: VisibilityController;
  private readonly controlGroupController = new ControlGroupController();
  private readonly placementController = new PlacementController();
  private tapSelectionController?: TapSelectionController;
  queued: Command[] = [];
  box: { x0: number; y0: number; x1: number; y1: number } | null = null; // live drag box (screen px)

  // replay viewer state (mode === 'replay')
  replay: Replay | null = null;
  replayTick = 0;
  replaySpeed = 1;
  paused = false;

  private acc = 0;
  private lastSel = 0;

  get camX(): number { return this.camera().camX; }
  set camX(value: number) { this.camera().camX = value; }
  get camY(): number { return this.camera().camY; }
  set camY(value: number) { this.camera().camY = value; }
  get zoom(): number { return this.camera().zoom; }
  set zoom(value: number) { this.camera().zoom = value; }
  get viewW(): number { return this.camera().viewW; }
  set viewW(value: number) { this.camera().viewW = value; }
  get viewH(): number { return this.camera().viewH; }
  set viewH(value: number) { this.camera().viewH = value; }
  get visible(): Uint8Array { return this.visibility().visible; }
  set visible(value: Uint8Array) { this.visibility().visible = value; }
  get explored(): Uint8Array { return this.visibility().explored; }
  set explored(value: Uint8Array) { this.visibility().explored = value; }

  get controlGroups(): readonly ReadonlySet<number>[] {
    return this.controlGroupController.groups;
  }

  get placementGhost(): PlacementGhost | null {
    return this.placementController.ghost;
  }

  set placementGhost(ghost: PlacementGhost | null) {
    this.placementController.ghost = ghost;
  }

  private tapSelection(): TapSelectionController {
    this.tapSelectionController ??= new TapSelectionController(this);
    return this.tapSelectionController;
  }

  private camera(): CameraController {
    this.cameraController ??= new CameraController(() => this.map);
    return this.cameraController;
  }

  private visibility(): VisibilityController {
    this.visibilityController ??= new VisibilityController(() => this.map);
    return this.visibilityController;
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
    this.visibility().reset();
    ui.mode.value = mode;
    ui.perTeam.value = perTeam;
    ui.humanPlayer.value = this.humanPlayer;
    ui.playerRaces.value = [...this.playerRaceNames];
    clearArmedCommand();
    clearSelectionView();
    ui.hasReplay.value = false;
    this.camera().resetFrame();
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
    this.visibility().reset();
    this.replaySpeed = 1;
    this.paused = false;
    this.seekReplay(0);
    ui.mode.value = 'replay';
    ui.playerRaces.value = [...this.playerRaceNames];
    ui.replayTotal.value = r.frames.length;
    ui.replaySpeed.value = 1;
    ui.paused.value = false;
    ui.over.value = false;
    this.camera().resetFrame();
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
    this.camera().resize(w, h, this.human);
  }

  /** Pick a sensible default zoom and center on the player's base. */
  frame(): void {
    this.camera().frame(this.human);
  }

  centerOn(wx: number, wy: number): void {
    this.camera().centerOn(wx, wy);
  }

  clampCamera(): void {
    this.camera().clamp();
  }

  setEdgePanPointer(sx: number, sy: number): void {
    this.camera().setEdgePanPointer(sx, sy);
  }

  setEdgePanPointerInRect(sx: number, sy: number, w: number, h: number): void {
    this.camera().setEdgePanPointerInRect(sx, sy, w, h);
  }

  clearEdgePan(): void {
    this.camera().clearEdgePan();
  }

  private applyEdgePan(dt: number): void {
    this.camera().applyEdgePan(dt, ui.controlScheme.value === 'desktop');
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

  private computeFog(): void {
    this.visibility().compute(this.sim.fullState(), this.human);
  }

  tileVisible(tx: number, ty: number): number {
    return this.visibility().tileVisible(tx, ty);
  }

  canSeeEntity(slot: number): boolean {
    return this.visibility().canSeeEntity(this.sim.fullState(), this.human, slot);
  }

  // ---- selection & commands (called by input) ----
  screenToWorld(sx: number, sy: number): [number, number] {
    return this.camera().screenToWorld(sx, sy);
  }

  boxSelect(sx0: number, sy0: number, sx1: number, sy1: number): void {
    this.tapSelection().boxSelect(sx0, sy0, sx1, sy1);
  }

  /** A tap at screen (sx,sy): target an armed verb, select own entities, or smart-command. */
  tap(sx: number, sy: number, opts: TapOptions = {}): void {
    this.tapSelection().tap(sx, sy, opts);
  }

  desktopSelectTap(sx: number, sy: number, opts: TapOptions = {}): void {
    this.tapSelection().desktopSelectTap(sx, sy, opts);
  }

  desktopSmartTap(sx: number, sy: number, opts: TapOptions = {}): void {
    this.tapSelection().desktopSmartTap(sx, sy, opts);
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

  isHitTestCandidate(slot: number): boolean {
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

  executeOption(option: CommandOption): boolean {
    if (!option.ok) return false;
    if (option.arm) {
      const toggled = shouldToggleArmedCommand(option.arm, ui.armedCommand.value);
      this.clearTargetModes();
      if (!toggled) ui.armedCommand.value = option.arm;
      return true;
    }
    if (!option.commands?.length) return false;
    const s = this.sim.fullState();
    let queued = false;
    for (const command of option.commands) {
      if (validateCommand(s, this.human, command).ok) {
        this.queued.push(command);
        queued = true;
      }
    }
    if (queued) this.clearTargetModes();
    return queued;
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
    this.tapSelection().selectAllByType(sx, sy, opts);
  }

  // ---- minimap navigation (geometry mirrors render.ts drawMinimap) ----
  minimapRect(): { ox: number; oy: number; W: number; H: number; scale: number } {
    return this.camera().minimapRect();
  }

  /** If (sx,sy) is on the minimap, recenter the camera there. Returns true if handled. */
  minimapPan(sx: number, sy: number): boolean {
    return this.camera().minimapPan(sx, sy);
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
