// Game: drives the deterministic sim at a fixed timestep and wires the app
// controllers for camera, visibility, selection, input commands, and HUD publishing.

import {
  Sim, FPS, Kind, createMatchStats, recordMatchStatsStep,
  type MapDef, type Command, type PlayerCommands, type Controller,
  type Replay, type FactionName, type MatchStats, type MapSpec,
} from './sim.ts';
import { ui, type CommandOption, type Mode } from './store.ts';
import { clearSelectionView, publishHud, resetControlGroupCounts } from './hud-publisher.ts';
import { CameraController } from './camera-controller.ts';
import { type PlacementGhost } from './placement-controller.ts';
import { TapSelectionController, type TapOptions } from './tap-selection-controller.ts';
import { VisibilityController, type LastKnownEnemyAffordance } from './visibility-controller.ts';
import { CONTROL_GROUP_COUNT, SelectionController } from './selection-controller.ts';
import { CommandController } from './command-controller.ts';
import { ReplayController } from './replay-controller.ts';
import {
  createPlaySession, createReplaySeekSim, createReplaySession, defaultPlayerEnabled, defaultTeamIds,
  exportReplayJson, mapSpecFor, parseReplayJson, replayFromCurrent,
} from './game-session.ts';
import {
  botCompetenceGates,
  botExpertReport,
  botPhaseAssessments,
  botPhaseSummaries,
  botExpertHealthRows,
  recordBotDiagnosticResults,
  type AppBotDiagnostics,
  type AppBotExpertReport,
} from './bot-diagnostics.ts';
import type { BotTraceCompetenceGate, BotTracePhaseAssessment, BotTracePhaseSummary } from '@rts/ai';
import type { MatchHealthRow } from './match-health.ts';

const TICK_MS = 1000 / FPS;

export class Game {
  sim!: Sim;
  map!: MapDef;
  controllers: (Controller | null)[] = [];
  human = 0; // human player index, -1 in spectate
  mode: Mode = 'play';
  perTeam = 1; // players per side (1 = 1v1, 2 = 2v2, …)
  seed = 1;
  mapSpec: MapSpec = mapSpecFor(1, 1);
  playerRaceNames: FactionName[] = ['terran', 'terran'];
  playerTeamIds: number[] = defaultTeamIds(2);
  playerEnabled: boolean[] = defaultPlayerEnabled(2);
  fullVision = false;
  humanPlayer = 0;
  matchStats!: MatchStats;
  botDiagnostics: AppBotDiagnostics[] = [];

  private cameraController?: CameraController;
  private visibilityController?: VisibilityController;
  private selectionController?: SelectionController;
  private commandController?: CommandController;
  private replayController = new ReplayController();
  private tapSelectionController?: TapSelectionController;
  box: { x0: number; y0: number; x1: number; y1: number } | null = null; // live drag box (screen px)

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
  get selection(): Set<number> { return this.selectionState().selection; }
  set selection(value: Set<number>) { this.selectionState().selection = value; }
  get queued(): Command[] { return this.commandState().queued; }
  set queued(value: Command[]) { this.commandState().queued = value; }

  get controlGroups(): readonly ReadonlySet<number>[] {
    return this.selectionState().controlGroups;
  }

  get activeSubgroupKind(): number {
    return this.selectionState().activeSubgroupKind;
  }

  get placementGhost(): PlacementGhost | null {
    return this.commandState().placementGhost;
  }

  set placementGhost(ghost: PlacementGhost | null) {
    this.commandState().placementGhost = ghost;
  }

  get replay(): Replay | null { return this.replayController.replay; }
  set replay(value: Replay | null) {
    if (value) this.replayController.start(value);
    else this.replayController.clear();
  }

  get replayTick(): number { return this.replayController.tick; }
  set replayTick(value: number) { this.replayController.tick = value; }

  get replaySpeed(): number { return this.replayController.speed; }
  set replaySpeed(value: number) { this.replayController.speed = value; }

  get paused(): boolean { return this.replayController.paused; }
  set paused(value: boolean) { this.replayController.paused = value; }

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

  private selectionState(): SelectionController {
    this.selectionController ??= new SelectionController({
      state: () => this.sim.fullState(),
      human: () => this.human,
      screenToWorld: (sx, sy) => this.screenToWorld(sx, sy),
      canSeeEntity: (slot) => this.canSeeEntity(slot),
      tileVisible: (tx, ty) => this.tileVisible(tx, ty),
      viewport: () => ({
        camX: this.camX,
        camY: this.camY,
        viewW: this.viewW,
        viewH: this.viewH,
        zoom: this.zoom,
      }),
      centerOn: (wx, wy) => this.centerOn(wx, wy),
    });
    return this.selectionController;
  }

  private commandState(): CommandController {
    this.commandController ??= new CommandController({
      state: () => this.sim.fullState(),
      human: () => this.human,
      selection: () => this.selection,
      firstSelected: (pred) => this.selectionState().firstSelected(pred),
      screenToWorld: (sx, sy) => this.screenToWorld(sx, sy),
    });
    return this.commandController;
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
    mapSpec = mapSpecFor(perTeam, seed, this.mapSpec),
    teamIds: readonly number[] = this.playerTeamIds,
    playerEnabled: readonly boolean[] = this.playerEnabled,
    fullVision = this.fullVision,
  ): void {
    if (mode === 'replay') { this.startReplay(); return; } // toggle into watching the last game
    this.replay = null;
    const session = createPlaySession(mode, mapSpec, raceNames, humanPlayer, teamIds, playerEnabled, fullVision);
    this.mode = session.mode;
    this.seed = session.seed;
    this.perTeam = session.perTeam;
    this.mapSpec = mapSpec;
    this.playerRaceNames = session.setupRaceNames;
    this.playerTeamIds = session.setupTeamIds;
    this.playerEnabled = session.playerEnabled;
    this.fullVision = session.fullVision;
    this.humanPlayer = session.humanPlayer;
    this.map = session.map;
    this.sim = session.sim;
    this.matchStats = createMatchStats(this.sim.fullState());
    this.botDiagnostics = session.botDiagnostics;
    this.human = session.human;
    this.controllers = session.controllers;
    this.selectionState().reset();
    resetControlGroupCounts(CONTROL_GROUP_COUNT);
    this.commandState().reset();
    this.visibility().reset();
    ui.mode.value = mode;
    ui.perTeam.value = perTeam;
    ui.humanPlayer.value = this.humanPlayer;
    ui.playerRaces.value = [...this.playerRaceNames];
    ui.playerTeams.value = [...this.playerTeamIds];
    ui.playerEnabled.value = [...this.playerEnabled];
    ui.fullVision.value = this.fullVision;
    this.clearTargetModes();
    clearSelectionView();
    ui.hasReplay.value = false;
    this.camera().resetFrame();
    if (this.viewW > 1) this.frame();
  }

  /** Switch into replay playback. With no argument, watch the game just played. */
  startReplay(replay?: Replay): void {
    const r = replay ?? replayFromCurrent(this.sim, this.mapSpec);
    if (!r || r.frames.length === 0) return;
    const session = createReplaySession(r, this.perTeam, this.seed);
    this.replayController.start(session.replay, session.replaySpeed, session.paused);
    this.mode = session.mode;
    this.perTeam = session.perTeam;
    this.seed = session.seed;
    this.mapSpec = session.replay.map;
    this.playerRaceNames = session.playerRaceNames;
    this.playerTeamIds = session.playerTeamIds;
    this.playerEnabled = defaultPlayerEnabled(session.playerRaceNames.length);
    this.map = session.map;
    this.sim = session.sim;
    this.matchStats = createMatchStats(this.sim.fullState());
    this.botDiagnostics = session.botDiagnostics;
    this.human = session.human; // god view for analysis
    this.controllers = session.controllers;
    this.selectionState().clear();
    this.commandState().reset();
    this.visibility().reset();
    this.seekReplay(0);
    ui.mode.value = 'replay';
    ui.playerRaces.value = [...this.playerRaceNames];
    ui.playerTeams.value = [...this.playerTeamIds];
    ui.playerEnabled.value = [...this.playerEnabled];
    ui.fullVision.value = this.fullVision;
    ui.over.value = false;
    this.camera().resetFrame();
    if (this.viewW > 1) this.frame();
  }

  /** Rebuild the replay sim and fast-forward to `tick` (scrubbing). */
  seekReplay(tick: number): void {
    const seek = this.replayController.seek(tick);
    if (!seek) return;
    this.sim = createReplaySeekSim(seek.replay, this.map);
    this.matchStats = createMatchStats(this.sim.fullState());
    for (let t = 0; t < seek.tick; t++) {
      const batch = seek.replay.frames[t] ?? [];
      const results = this.sim.step(batch);
      recordMatchStatsStep(this.matchStats, this.sim.fullState(), batch, results);
    }
    this.selectionState().clear();
    this.computeFog();
    this.publish();
  }

  setReplaySpeed(x: number): void { this.replayController.setSpeed(x); }
  togglePause(): void {
    if (this.replayController.ended) this.seekReplay(0); // restart at the end
    else this.replayController.togglePause();
  }

  /** The replay JSON for the current/just-played game (download payload). */
  exportReplay(): string | null {
    return exportReplayJson(this.sim, this.replay, this.mapSpec);
  }

  botExpertHealthRows(): MatchHealthRow[] {
    return botExpertHealthRows(this.botDiagnostics, this.matchStats);
  }

  botExpertReport(): AppBotExpertReport {
    return botExpertReport(this.botDiagnostics, this.matchStats);
  }

  botPhaseSummaries(): BotTracePhaseSummary[] {
    return botPhaseSummaries(this.botDiagnostics, this.matchStats);
  }

  botPhaseAssessments(): BotTracePhaseAssessment[] {
    return botPhaseAssessments(this.botDiagnostics, this.matchStats);
  }

  botCompetenceGates(): BotTraceCompetenceGate[] {
    return botCompetenceGates(this.botDiagnostics, this.matchStats);
  }

  loadReplay(json: string): void {
    this.startReplay(parseReplayJson(json));
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
    const batch = this.replayController.takeStepBatch();
    if (!batch) return;
    const results = this.sim.step(batch);
    recordMatchStatsStep(this.matchStats, this.sim.fullState(), batch, results);
    this.pruneSelection();
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
    const results = this.sim.step(batch);
    recordMatchStatsStep(this.matchStats, this.sim.fullState(), batch, results);
    recordBotDiagnosticResults(this.botDiagnostics, results);
    this.pruneSelection();
  }

  private drainHuman(): Command[] {
    return this.commandState().drain();
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

  lastKnownEnemies(out: LastKnownEnemyAffordance[] = []): LastKnownEnemyAffordance[] {
    return this.visibility().lastKnownEnemies(this.sim.fullState(), this.human, out);
  }

  // ---- selection & commands (called by input) ----
  screenToWorld(sx: number, sy: number): [number, number] {
    return this.camera().screenToWorld(sx, sy);
  }

  boxSelect(sx0: number, sy0: number, sx1: number, sy1: number): void {
    this.selectionState().boxSelect(sx0, sy0, sx1, sy1);
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
    this.commandState().clearTargetModes();
  }

  assignControlGroup(index: number): boolean {
    const result = this.selectionState().assignControlGroup(index);
    if (result.changed) this.publish();
    return result.ok;
  }

  recallControlGroup(index: number, add = false): boolean {
    const result = this.selectionState().recallControlGroup(index, add);
    if (result.ok) this.clearTargetModes();
    if (result.changed) this.publish();
    return result.ok;
  }

  selectSelectionSubgroup(kind: number): boolean {
    const changed = this.selectionState().setActiveSubgroup(kind);
    if (changed) this.publish();
    return changed;
  }

  cycleSelectionSubgroup(direction = 1): boolean {
    const changed = this.selectionState().cycleActiveSubgroup(direction);
    if (changed) this.publish();
    return changed;
  }

  private firstSelected(pred: (slot: number) => boolean): number {
    return this.selectionState().firstSelected(pred);
  }

  updatePlacementGhost(sx: number, sy: number): void {
    this.commandState().updatePlacementGhost(sx, sy);
  }

  commitPlacementGhost(): boolean {
    return this.commandState().commitPlacementGhost();
  }

  cancelPlacementGhost(): void {
    this.commandState().cancelPlacementGhost();
  }

  hitTest(wx: number, wy: number): number {
    return this.selectionState().hitTest(wx, wy);
  }

  isHitTestCandidate(slot: number): boolean {
    return this.selectionState().isHitTestCandidate(slot);
  }

  isOwnedSelectable(id: number): boolean {
    return this.selectionState().isOwnedSelectable(id);
  }

  selectVisibleKind(kind: number): void {
    this.selectionState().selectVisibleKind(kind);
  }

  executeOption(option: CommandOption): boolean {
    return this.commandState().executeOption(option);
  }

  castSelectedAbility(abilityId: number, target?: number, x?: number, y?: number): boolean {
    return this.commandState().castSelectedAbility(abilityId, target, x, y);
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
    this.selectionState().prune();
  }

  private publish(): void {
    const s = this.sim.fullState();
    publishHud({
      state: s,
      human: this.human,
      mode: this.mode,
      hasRecordedReplay: this.sim.frames !== null,
      selection: this.selection,
      activeSubgroupKind: this.activeSubgroupKind,
      controlGroups: this.controlGroups,
      canSeeEntity: (slot) => this.canSeeEntity(slot),
    });
  }
}

// re-export a few constants the UI needs
export { Kind };
