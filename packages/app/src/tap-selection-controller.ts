import type { Game } from './game.ts';
import {
  Abilities, NONE, ONE, Role, attackModeCandidates, harvestModeCandidates, isAlive,
  rallyModeCandidates, repairModeCandidates, slotOf,
  validateCommand,
  type State,
} from './sim.ts';
import { smartCommandCandidates } from './smart-command-candidates.ts';
import { clearArmedCommand, isPlacementArmed, ui } from './store.ts';

export type TapOptions = { shift?: boolean; ctrl?: boolean; preferredHit?: number };

export class TapSelectionController {
  private readonly game: Game;

  constructor(game: Game) {
    this.game = game;
  }

  tap(sx: number, sy: number, opts: TapOptions = {}): void {
    const g = this.game;
    const [wx, wy] = g.screenToWorld(sx, sy);
    if (g.human < 0) return;
    const s = g.sim.fullState();
    const e = s.e;
    const tx = (wx * ONE) | 0;
    const ty = (wy * ONE) | 0;

    if (isPlacementArmed(ui.armedCommand.value)) return;

    const armed = ui.armedCommand.value;
    if (armed.t === 'ability') {
      const ability = Abilities[armed.ability]!;
      const hit = this.resolvePreferredHit(opts.preferredHit) ?? g.hitTest(wx, wy);
      const ok = ability.target === 'point'
        ? g.castSelectedAbility(armed.ability, undefined, tx, ty)
        : hit >= 0 && g.castSelectedAbility(armed.ability, hit);
      if (ok) clearArmedCommand();
      return;
    }

    const hit = this.resolvePreferredHit(opts.preferredHit) ?? g.hitTest(wx, wy);

    if (armed.t === 'rally') {
      this.queueRallyMode(hit, tx, ty);
      clearArmedCommand();
      return;
    }

    if (armed.t === 'attackMove') {
      const queueTravel = opts.shift === true || this.mobileQueueMode();
      if (this.queueAttackMode(hit, tx, ty, queueTravel)) clearArmedCommand();
      return;
    }
    if (armed.t === 'move') {
      const queueTravel = opts.shift === true || this.mobileQueueMode();
      if (this.queueMoveMode(hit, tx, ty, queueTravel)) clearArmedCommand();
      return;
    }
    if (armed.t === 'patrol') {
      if (this.queuePatrolMode(tx, ty)) clearArmedCommand();
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

    if (g.isOwnedSelectable(hit)) {
      g.selection.clear();
      g.selection.add(hit);
      clearArmedCommand();
      return;
    }

    if (g.selection.size === 0) return;

    const mobile = this.mobileSelection(e);
    const candidates = mobile.length === 0 ? g.selection : mobile;
    const queueTravel = this.mobileQueueMode();
    for (const id of candidates) {
      const [command] = smartCommandCandidates(s, g.human, id, { hit, x: tx, y: ty }, 'mobile', { queueTravel });
      if (command) g.queued.push(command);
    }
  }

  desktopSelectTap(sx: number, sy: number, opts: TapOptions = {}): void {
    const g = this.game;
    if (g.human < 0) return;
    const [wx, wy] = g.screenToWorld(sx, sy);
    const e = g.sim.fullState().e;
    const hit = this.resolvePreferredHit(opts.preferredHit) ?? g.hitTest(wx, wy);
    clearArmedCommand();
    if (!g.isOwnedSelectable(hit)) {
      if (!opts.shift) g.selection.clear();
      return;
    }
    if (opts.ctrl) {
      g.selectVisibleKind(e.kind[slotOf(hit)]!);
      return;
    }
    if (opts.shift) {
      if (g.selection.has(hit)) g.selection.delete(hit);
      else g.selection.add(hit);
      return;
    }
    g.selection.clear();
    g.selection.add(hit);
  }

  desktopSmartTap(sx: number, sy: number, opts: TapOptions = {}): void {
    const g = this.game;
    if (g.human < 0 || isPlacementArmed(ui.armedCommand.value) || g.selection.size === 0) return;
    const [wx, wy] = g.screenToWorld(sx, sy);
    const tx = (wx * ONE) | 0;
    const ty = (wy * ONE) | 0;
    const hit = this.resolvePreferredHit(opts.preferredHit) ?? g.hitTest(wx, wy);
    let queued = false;
    const s = g.sim.fullState();
    for (const id of g.selection) {
      const [command] = smartCommandCandidates(s, g.human, id, { hit, x: tx, y: ty }, 'desktop', {
        queueTravel: opts.shift === true,
      });
      if (command) {
        g.queued.push(command);
        queued = true;
      }
    }
    if (queued) clearArmedCommand();
  }

  selectAllByType(sx: number, sy: number, opts: TapOptions = {}): void {
    const g = this.game;
    if (g.human < 0) return;
    const [wx, wy] = g.screenToWorld(sx, sy);
    const e = g.sim.fullState().e;
    const hit = this.resolvePreferredHit(opts.preferredHit) ?? g.hitTest(wx, wy);
    if (hit < 0) return;
    const hs = slotOf(hit);
    if (e.owner[hs] !== g.human) return;
    g.selectVisibleKind(e.kind[hs]!);
    clearArmedCommand();
  }

  private mobileSelection(e: State['e']): number[] {
    const g = this.game;
    const ids: number[] = [];
    for (const id of g.selection) {
      if (!isAlive(e, id)) continue;
      if (e.container[slotOf(id)] !== NONE) continue;
      if ((e.flags[slotOf(id)]! & Role.Structure) === 0) ids.push(id);
    }
    return ids;
  }

  private mobileQueueMode(): boolean {
    return ui.controlScheme.value === 'mobile' && ui.mobileQueueMode.value;
  }

  private queueRallyMode(hit: number, x: number, y: number): void {
    const g = this.game;
    const s = g.sim.fullState();
    for (const command of rallyModeCandidates(s, g.human, g.selection, { hit, x, y })) {
      g.queued.push(command);
    }
  }

  private queueHarvestTarget(target: number): boolean {
    const g = this.game;
    const s = g.sim.fullState();
    let queued = false;
    for (const command of harvestModeCandidates(s, g.human, g.selection, target)) {
      g.queued.push(command);
      queued = true;
    }
    return queued;
  }

  private queueRepairTarget(target: number): boolean {
    const g = this.game;
    const s = g.sim.fullState();
    let queued = false;
    for (const command of repairModeCandidates(s, g.human, g.selection, target)) {
      g.queued.push(command);
      queued = true;
    }
    return queued;
  }

  private queueAttackMode(hit: number, x: number, y: number, queueTravel = false): boolean {
    const g = this.game;
    const s = g.sim.fullState();
    const e = s.e;
    let queued = false;
    for (const id of this.mobileSelection(e)) {
      for (const command of attackModeCandidates(s, g.human, id, { hit, x, y }, { queueTravel })) {
        g.queued.push(command);
        queued = true;
      }
    }
    return queued;
  }

  private queueMoveMode(hit: number, x: number, y: number, queueTravel = false): boolean {
    const g = this.game;
    const s = g.sim.fullState();
    const e = s.e;
    let queued = false;
    for (const id of this.mobileSelection(e)) {
      const targeted = hit >= 0
        ? {
            t: 'move' as const,
            unit: id,
            x,
            y,
            target: hit,
            ...(queueTravel ? { queue: true as const } : {}),
          }
        : null;
      if (targeted && validateCommand(s, g.human, targeted).ok) {
        g.queued.push(targeted);
        queued = true;
        continue;
      }
      const command = {
        t: 'move' as const,
        unit: id,
        x,
        y,
        ...(queueTravel ? { queue: true as const } : {}),
      };
      if (validateCommand(s, g.human, command).ok) {
        g.queued.push(command);
        queued = true;
      }
    }
    return queued;
  }

  private queuePatrolMode(x: number, y: number): boolean {
    const g = this.game;
    const s = g.sim.fullState();
    const e = s.e;
    let queued = false;
    for (const id of this.mobileSelection(e)) {
      const command = { t: 'patrol' as const, unit: id, x, y };
      if (validateCommand(s, g.human, command).ok) {
        g.queued.push(command);
        queued = true;
      }
    }
    return queued;
  }

  private resolvePreferredHit(hit: number | undefined): number | undefined {
    const g = this.game;
    if (hit === undefined || hit < 0 || !isAlive(g.sim.fullState().e, hit)) return undefined;
    return g.isHitTestCandidate(slotOf(hit)) ? hit : undefined;
  }
}
