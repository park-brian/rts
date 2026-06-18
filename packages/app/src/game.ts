// Game: drives the deterministic sim at a fixed timestep, owns the camera,
// selection, and the human command queue, computes fog for the human player, and
// publishes HUD state. Rendering and input live in sibling modules.

import {
  Sim, generateMap, createBotControllers, FPS, TILE, ONE, Abilities, Ability, Kind, TechDefs, Units, Role,
  Order,
  slotOf, eid, isEnemy, isAlive, sameTeam, NEUTRAL, NONE, CAP, toReplay, mapFromSpec, parseReplay,
  canPlaceStructure, validateCommand, transportCapacity, unloadAnchorSlot,
  canDetect, Factions, workerBuildKindsFor, canWorkerStartStructure,
  addonParentKind,
  transformFor, transformTargetsFor, snapBuildAnchor, isLiftedStructureFlags,
  weaponUpgradeBonus, armorUpgradeBonus, shieldArmorBonus,
  upgradedRange, upgradedSpeed, upgradedCooldown, upgradedSight,
  nextTechLevel, techTime,
  isCloaked,
  bodyBounds, structureFootprint,
  type MapDef, type Command, type PlayerCommands, type Controller,
  type Replay, type MapSpec, type State, type Faction, type FactionName,
  type CommandRejectReason, type CommandValidation, type Weapon,
} from './sim.ts';
import { EMPTY_SELECTION_VIEW, clearArmedCommand, isPlacementArmed, ui, type CommandOption, type Mode, type SelectionStatus } from './store.ts';
import { illusionPresentation } from './illusion-presentation.ts';
import { isUserCommandableKind } from './child-actors.ts';
import { entitySelectionName } from './entity-presentation.ts';

const TICK_MS = 1000 / FPS;
const TECH_IDS = Object.keys(TechDefs).map(Number);
const ADDON_IDS = Object.keys(Units).map(Number).filter((kind) => Units[kind]?.buildMethod === 'addon');
const RACE_NAMES: FactionName[] = ['terran', 'protoss', 'zerg'];
const EDGE_PAN_MARGIN = 24;
const EDGE_PAN_SPEED = 560; // screen px/sec; converted to world px by zoom
const CONTROL_GROUPS = 10;
const REASON_PRIORITY: Record<CommandRejectReason, number> = {
  'missing-requirement': 0,
  'not-affordable': 1,
  'supply-blocked': 2,
  'queue-full': 3,
  'incomplete-producer': 4,
  'not-enough-energy': 5,
  'not-enough-hit-points': 6,
  'placement-requires-geyser': 7,
  'placement-off-map': 8,
  'placement-blocked': 9,
  'target-not-found': 10,
  'target-out-of-range': 11,
  'target-not-allowed': 12,
  'missing-capability': 13,
  'invalid-ability': 14,
  'wrong-owner': 15,
  'stale-entity': 16,
};
type CommandOptionMeta = Pick<CommandOption, 'label' | 'detail'>;
type TapOptions = { shift?: boolean; ctrl?: boolean; preferredHit?: number };
type SelectableBounds = { x0: number; y0: number; x1: number; y1: number; cx: number; cy: number };
const ORDER_LABELS: Record<number, string> = {
  [Order.Idle]: 'Idle',
  [Order.Move]: 'Moving',
  [Order.Harvest]: 'Harvesting',
  [Order.Attack]: 'Attacking',
  [Order.AttackMove]: 'Attack-moving',
  [Order.Build]: 'Building',
  [Order.Cast]: 'Casting',
  [Order.Repair]: 'Repairing',
};

const normalizeRace = (race: string | undefined): FactionName =>
  race === 'protoss' || race === 'zerg' ? race : 'terran';

const defaultRaceNames = (players: number): FactionName[] =>
  Array.from({ length: players }, (_, i) => RACE_NAMES[i % RACE_NAMES.length]!);

const addOption = (options: Map<number, CommandOption>, id: number, result: CommandValidation, meta: CommandOptionMeta = {}): void => {
  const current = options.get(id);
  if (result.ok) {
    options.set(id, { id, ok: true, ...meta });
    return;
  }
  if (current?.ok) return;
  if (!current || REASON_PRIORITY[result.reason] < REASON_PRIORITY[current.reason!]) {
    options.set(id, { id, ok: false, reason: result.reason, ...meta });
  }
};

const optionKinds = (options: Map<number, CommandOption>): number[] =>
  [...options.values()].filter((o) => o.ok).map((o) => o.id).sort((a, b) => a - b);

const sortedOptions = (options: Map<number, CommandOption>): CommandOption[] =>
  [...options.values()].sort((a, b) => a.id - b.id);

const nukeTrainOptionMeta = (s: State, slot: number): CommandOptionMeta => {
  const e = s.e;
  if (e.specialAmmo[slot]! > 0) return { label: 'Nuke Ready', detail: 'Ready' };
  if (e.prodKind[slot] === Kind.NuclearMissile) return { label: 'Arming Nuke', detail: 'Arming' };
  return { label: 'Arm Nuke' };
};

const clampProgress = (remaining: number, total: number): number =>
  total <= 0 ? 0 : Math.max(0, Math.min(1, 1 - remaining / total));

const constructionVerb = (kind: number): string => {
  switch (Units[kind]?.buildMethod) {
    case 'warp': return 'Warping';
    case 'morph': return 'Morphing';
    case 'merge': return 'Summoning';
    case 'addon': return 'Adding';
    default: return 'Building';
  }
};

const orderLabel = (order: number): string => ORDER_LABELS[order] ?? 'Acting';

const fixedTile = (value: number): string => {
  const n = value / ONE / TILE;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
};

const pxPerSecond = (value: number): string => ((value / ONE) * FPS).toFixed(1);

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

const weaponDetails = (s: State, slot: number, weapon: Weapon): string => {
  const bonus = weaponUpgradeBonus(s, slot, weapon);
  const shots = weapon.shots && weapon.shots > 1 ? `x${weapon.shots}` : '';
  const dmg = bonus > 0 ? `${weapon.damage}+${bonus}` : String(weapon.damage);
  const range = fixedTile(upgradedRange(s, slot, weapon));
  const cd = upgradedCooldown(s, slot, weapon.cooldown);
  return `${dmg}${shots} R${range} CD${cd}`;
};

const selectionStats = (s: State, slot: number): string[] => {
  const e = s.e;
  const def = Units[e.kind[slot]!]!;
  const stats = [`HP ${e.hp[slot]}/${def.hp}`];
  if (def.shields > 0) stats.push(`Sh ${e.shield[slot]}/${def.shields}`);
  if (e.energyMax[slot]! > 0) stats.push(`E ${e.energy[slot]}/${e.energyMax[slot]}`);
  const armor = armorUpgradeBonus(s, slot);
  stats.push(`Arm ${def.armor}${armor > 0 ? `+${armor}` : ''}`);
  const shieldArmor = shieldArmorBonus(s, slot);
  if (shieldArmor > 0) stats.push(`ShArm +${shieldArmor}`);
  if (def.weapon && def.airWeapon && def.weapon === def.airWeapon) {
    stats.push(`G/A ${weaponDetails(s, slot, def.weapon)}`);
  } else {
    if (def.weapon) stats.push(`G ${weaponDetails(s, slot, def.weapon)}`);
    if (def.airWeapon) stats.push(`A ${weaponDetails(s, slot, def.airWeapon)}`);
  }
  if (def.speed > 0) stats.push(`Spd ${pxPerSecond(upgradedSpeed(s, slot, def.speed))}`);
  if (def.sight > 0) stats.push(`Sight ${upgradedSight(s, slot, def.sight)}`);
  return stats;
};

const selectionVisibilityStats = (s: State, slot: number, viewer: number): string[] => {
  const e = s.e;
  const stats: string[] = [];
  if (e.burrowed[slot] === 1) stats.push('Burrowed');
  if (isCloaked(s, slot)) stats.push('Cloaked');
  const owner = e.owner[slot]!;
  if (viewer >= 0 && viewer !== owner && isCloaked(s, slot) && canDetect(s, viewer, slot)) stats.push('Detected');
  return stats;
};

const selectionStatus = (s: State, slot: number, viewer: number): SelectionStatus => {
  const e = s.e;
  const kind = e.kind[slot]!;
  const def = Units[kind]!;
  const stats = [...selectionStats(s, slot), ...selectionVisibilityStats(s, slot, viewer)];
  if (e.built[slot] !== 1) {
    return {
      label: constructionVerb(kind),
      detail: def.name,
      progress: clampProgress(e.ctimer[slot]!, def.buildTime),
      stats,
    };
  }
  const prod = e.prodKind[slot]!;
  if (prod !== Kind.None) {
    const prodDef = Units[prod]!;
    const queued = e.prodQueued[slot]!;
    return {
      label: prod === Kind.NuclearMissile ? 'Arming' : prodDef.buildMethod === 'morph' ? 'Morphing' : 'Training',
      detail: `${prodDef.name}${queued > 0 ? ` +${queued}` : ''}`,
      progress: clampProgress(e.prodTimer[slot]!, prodDef.buildTime),
      stats,
    };
  }
  const tech = e.researchKind[slot]!;
  if (tech !== Kind.None) {
    const techDef = TechDefs[tech]!;
    const level = nextTechLevel(s, e.owner[slot]!, tech);
    return {
      label: 'Researching',
      detail: techDef.name,
      progress: clampProgress(e.researchTimer[slot]!, techTime(techDef, level)),
      stats,
    };
  }
  return {
    label: isLiftedStructureFlags(e.flags[slot]!) ? 'Flying' : orderLabel(e.order[slot]!),
    detail: '',
    progress: 0,
    stats,
  };
};

const clearSelectionUi = (): void => {
  ui.selectionView.value = EMPTY_SELECTION_VIEW;
};

const sameCounts = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

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
  controlGroups: Set<number>[] = Array.from({ length: CONTROL_GROUPS }, () => new Set<number>());
  queued: Command[] = [];
  box: { x0: number; y0: number; x1: number; y1: number } | null = null; // live drag box (screen px)
  placementGhost: { kind: number; x: number; y: number; ok: boolean } | null = null;
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
  private lastControlGroup = -1;
  private lastControlGroupT = 0;

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
    for (const group of this.controlGroups) group.clear();
    ui.controlGroupCounts.value = Array(CONTROL_GROUPS).fill(0);
    this.queued = [];
    this.placementGhost = null;
    this.visible = new Uint8Array(this.map.w * this.map.h);
    this.explored = new Uint8Array(this.map.w * this.map.h);
    this.visibleEntityTick = -1;
    ui.mode.value = mode;
    ui.perTeam.value = perTeam;
    ui.humanPlayer.value = this.humanPlayer;
    ui.playerRaces.value = [...this.playerRaceNames];
    clearArmedCommand();
    clearSelectionUi();
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
    const e = this.sim.fullState().e;
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
    const e = this.sim.fullState().e;
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
    for (const id of this.selection) if (this.queueDesktopSmartCommand(id, hit, tx, ty)) queued = true;
    if (queued) this.clearTargetModes();
  }

  private queueDesktopSmartCommand(actor: number, hit: number, x: number, y: number): boolean {
    const s = this.sim.fullState();
    const e = s.e;
    if (!isAlive(e, actor)) return false;
    const actorSlot = slotOf(actor);
    const targetSlot = hit >= 0 && isAlive(e, hit) ? slotOf(hit) : -1;
    const tryCommand = (c: Command): boolean => {
      if (!validateCommand(s, this.human, c).ok) return false;
      this.queued.push(c);
      return true;
    };

    if (targetSlot >= 0) {
      if (isEnemy(s, this.human, e.owner[targetSlot]!) && tryCommand({ t: 'attack', unit: actor, target: hit })) return true;
      if ((e.flags[targetSlot]! & Role.Resource) !== 0 && tryCommand({ t: 'harvest', unit: actor, patch: hit })) return true;
      if (tryCommand({ t: 'repair', unit: actor, target: hit })) return true;
      if (tryCommand({ t: 'load', transport: hit, unit: actor })) return true;
      if (tryCommand({ t: 'load', transport: actor, unit: hit })) return true;
      if ((e.flags[actorSlot]! & Role.Structure) !== 0) {
        if (tryCommand({ t: 'rally', building: actor, x, y, target: hit })) return true;
      }
    }

    if ((e.flags[actorSlot]! & Role.Structure) !== 0) return tryCommand({ t: 'rally', building: actor, x, y });
    return tryCommand({ t: 'move', unit: actor, x, y });
  }

  private clearTargetModes(): void {
    clearArmedCommand();
  }

  private liveGroup(group: Set<number>): number[] {
    const e = this.sim.fullState().e;
    const live: number[] = [];
    for (const id of group) {
      if (isAlive(e, id) && e.owner[slotOf(id)] === this.human && e.container[slotOf(id)] === NONE) live.push(id);
    }
    return live;
  }

  private publishControlGroupCounts(): void {
    const next = this.controlGroups.map((group) => this.liveGroup(group).length);
    if (!sameCounts(ui.controlGroupCounts.value, next)) ui.controlGroupCounts.value = next;
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
    if (index < 0 || index >= CONTROL_GROUPS || this.selection.size === 0) return false;
    this.controlGroups[index] = new Set(this.liveGroup(this.selection));
    this.publishControlGroupCounts();
    return this.controlGroups[index]!.size > 0;
  }

  recallControlGroup(index: number, add = false): boolean {
    if (index < 0 || index >= CONTROL_GROUPS) return false;
    const live = this.liveGroup(this.controlGroups[index]!);
    this.controlGroups[index] = new Set(live);
    this.publishControlGroupCounts();
    if (live.length === 0) return false;
    if (!add) this.selection.clear();
    for (const id of live) this.selection.add(id);
    this.clearTargetModes();

    const now = performance.now();
    if (!add && this.lastControlGroup === index && now - this.lastControlGroupT < 450) this.centerOnSelection();
    this.lastControlGroup = index;
    this.lastControlGroupT = now;
    return true;
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
    if (this.human < 0 || !isPlacementArmed(armed)) {
      this.placementGhost = null;
      return;
    }
    const [wx, wy] = this.screenToWorld(sx, sy);
    const e = this.sim.fullState().e;
    const kind = armed.kind;
    const tx = (wx * ONE) | 0;
    const ty = (wy * ONE) | 0;
    if (armed.t === 'land') {
      const building = this.firstSelected((i) => e.kind[i] === kind && isLiftedStructureFlags(e.flags[i]!));
      if (building < 0) {
        this.placementGhost = null;
        return;
      }
      const snapped = snapBuildAnchor(tx, ty);
      const c: Command = { t: 'land', building: eid(e, building), x: snapped.x, y: snapped.y };
      this.placementGhost = { kind, x: snapped.x, y: snapped.y, ok: validateCommand(this.sim.fullState(), this.human, c).ok };
      return;
    }
    const worker = this.firstSelected((i) => (e.flags[i]! & Role.Worker) !== 0);
    if (worker < 0) {
      this.placementGhost = null;
      return;
    }
    const placement = canPlaceStructure(this.sim.fullState(), this.human, worker, kind, tx, ty);
    if (placement.ok) this.placementGhost = { kind, x: placement.x, y: placement.y, ok: true };
    else {
      const snapped = snapBuildAnchor(tx, ty);
      this.placementGhost = { kind, x: snapped.x, y: snapped.y, ok: false };
    }
  }

  commitPlacementGhost(): boolean {
    const ghost = this.placementGhost;
    const e = this.sim.fullState().e;
    const armed = ui.armedCommand.value;
    if (!ghost || !ghost.ok || !isPlacementArmed(armed)) return false;
    if (armed.t === 'land') {
      const building = this.firstSelected((i) => e.kind[i] === ghost.kind && isLiftedStructureFlags(e.flags[i]!));
      if (building < 0) return false;
      this.queued.push({ t: 'land', building: eid(e, building), x: ghost.x, y: ghost.y });
      clearArmedCommand();
      this.placementGhost = null;
      return true;
    }
    const worker = this.firstSelected((i) => (e.flags[i]! & Role.Worker) !== 0);
    if (worker < 0) return false;
    this.queued.push({ t: 'build', unit: eid(e, worker), kind: ghost.kind, x: ghost.x, y: ghost.y });
    clearArmedCommand();
    this.placementGhost = null;
    return true;
  }

  cancelPlacementGhost(): void {
    this.placementGhost = null;
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
    clearSelectionUi();
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
    const p = this.human < 0 ? 0 : this.human;
    ui.minerals.value = s.players.minerals[p]!;
    ui.gas.value = s.players.gas[p]!;
    ui.supplyUsed.value = s.players.supplyUsed[p]!;
    ui.supplyMax.value = s.players.supplyMax[p]!;
    ui.seconds.value = Math.floor(s.tick / FPS);
    ui.over.value = s.result.over;
    ui.winner.value = s.result.winner;
    ui.hasReplay.value = this.mode !== 'replay' && s.result.over && this.sim.frames !== null;
    this.publishControlGroupCounts();

    // selection summary
    const e = s.e;
    let count = 0; let kindName = ''; let primarySlot = -1; let canRally = false;
    let canLoad = false; let canUnload = false; let canHarvest = false; let canRepair = false;
    let canAttackMove = false; let canStop = false;
    let canBurrow = false; let canUnburrow = false; let canMine = false;
    let canLift = false; let canLand = false; let canCancel = false;
    const buildOptions = new Map<number, CommandOption>();
    const addonOptions = new Map<number, CommandOption>();
    const transformOptions = new Map<number, CommandOption>();
    const trainOptions = new Map<number, CommandOption>();
    const abilityOptions = new Map<number, CommandOption>();
    const researchOptions = new Map<number, CommandOption>();
    for (const id of this.selection) {
      if (!isAlive(e, id)) continue;
      const slot = slotOf(id);
      if (e.owner[slot] !== this.human && !this.canSeeEntity(slot)) continue;
      count++;
      const k = e.kind[slot]!;
      const completed = e.built[slot] === 1;
      if (primarySlot < 0) primarySlot = slot;
      kindName = `${illusionPresentation(s, this.human, slot).labelPrefix}${entitySelectionName(s, slot)}`;
      const nonStructure = (e.flags[slot]! & Role.Structure) === 0;
      if (nonStructure && validateCommand(s, this.human, { t: 'amove', unit: id, x: e.x[slot]!, y: e.y[slot]! }).ok) canAttackMove = true;
      if (completed && validateCommand(s, this.human, { t: 'stop', unit: id }).ok) canStop = true;
      if (completed && (e.flags[slot]! & Role.Worker) !== 0) {
        if (e.illusion[slot] !== 1) canHarvest = true;
        for (const build of workerBuildKindsFor(Units[k]!.race)) {
          const starter = canWorkerStartStructure(s, this.human, slot, build);
          if (!starter.ok) {
            if (starter.reason !== 'missing-capability') addOption(buildOptions, build, starter);
          }
          else {
            const def = Units[build]!;
            addOption(buildOptions, build, s.players.minerals[this.human]! < def.minerals || s.players.gas[this.human]! < def.gas
              ? { ok: false, reason: 'not-affordable' }
              : { ok: true });
          }
        }
      }
      if (completed && e.kind[slot] === Kind.SCV && e.illusion[slot] !== 1) canRepair = true;
      if ((e.flags[slot]! & Role.Structure) !== 0 && completed) canRally = true;
      if (completed) {
        for (const addon of ADDON_IDS) {
          if (addonParentKind(addon) !== k) continue;
          const result = validateCommand(s, this.human, { t: 'addon', building: id, kind: addon });
          if (result.ok || result.reason !== 'target-not-allowed') addOption(addonOptions, addon, result);
        }
        for (const train of Units[k]!.produces) {
          const result = validateCommand(s, this.human, { t: 'train', building: id, kind: train });
          if (e.illusion[slot] === 1 && !result.ok && result.reason === 'missing-capability') continue;
          const meta = k === Kind.NuclearSilo && train === Kind.NuclearMissile ? nukeTrainOptionMeta(s, slot) : {};
          addOption(trainOptions, train, result, meta);
        }
        for (const target of transformTargetsFor(k)) {
          addOption(transformOptions, target, validateCommand(s, this.human, { t: 'transform', unit: id, kind: target }));
        }
        for (const ability of Units[k]!.abilities) {
          const result = this.abilityAvailability(s, slot, ability);
          addOption(abilityOptions, ability, result,
            ability === Ability.NuclearStrike && !result.ok && result.reason === 'missing-requirement' ? { detail: 'No Nuke' } : {});
        }
        for (const tech of TECH_IDS) {
          const c: Command = { t: 'research', building: id, tech };
          const def = TechDefs[tech];
          if (!def?.producers.includes(k)) continue;
          const result = validateCommand(s, this.human, c);
          if (result.ok || result.reason !== 'target-not-allowed') addOption(researchOptions, tech, result);
        }
      }
      if (validateCommand(s, this.human, { t: 'burrow', unit: id, active: true }).ok) canBurrow = true;
      if (validateCommand(s, this.human, { t: 'burrow', unit: id, active: false }).ok) canUnburrow = true;
      if (validateCommand(s, this.human, { t: 'mine', unit: id }).ok) canMine = true;
      if (validateCommand(s, this.human, { t: 'lift', building: id }).ok) canLift = true;
      if (isLiftedStructureFlags(e.flags[slot]!)) canLand = true;
      if (validateCommand(s, this.human, { t: 'cancelBuild', building: id }).ok) canCancel = true;
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
    ui.selectionView.value = {
      count,
      kindName: count > 1 ? `${kindName} ×${count}` : kindName,
      status: primarySlot >= 0 ? selectionStatus(s, primarySlot, this.human) : EMPTY_SELECTION_VIEW.status,
      can: {
        build: buildOptions.size > 0,
        rally: canRally,
        load: canLoad,
        unload: canUnload,
        harvest: canHarvest,
        repair: canRepair,
        attackMove: canAttackMove,
        stop: canStop,
        burrow: canBurrow,
        unburrow: canUnburrow,
        mine: canMine,
        lift: canLift,
        land: canLand,
        cancel: canCancel,
      },
      kinds: {
        build: optionKinds(buildOptions),
        addon: optionKinds(addonOptions),
        transform: optionKinds(transformOptions),
        train: optionKinds(trainOptions),
        abilities: optionKinds(abilityOptions),
        research: optionKinds(researchOptions),
      },
      options: {
        build: sortedOptions(buildOptions),
        addon: sortedOptions(addonOptions),
        transform: sortedOptions(transformOptions),
        train: sortedOptions(trainOptions),
        ability: sortedOptions(abilityOptions),
        research: sortedOptions(researchOptions),
      },
    };
  }

  private abilityAvailability(s: State, slot: number, abilityId: number): CommandValidation {
    const e = s.e;
    const ability = Abilities[abilityId];
    if (!ability) return { ok: false, reason: 'invalid-ability' };
    const result = validateCommand(s, this.human, { t: 'ability', unit: eid(e, slot), ability: abilityId });
    if (result.ok) return result;
    if (ability.target !== 'self' && result.reason === 'target-not-found') return { ok: true };
    return result;
  }
}

// re-export a few constants the UI needs
export { Kind };
