import type { Game } from './game.ts';
import {
  Abilities, NONE, ONE, Role, attackModeCandidates, canPlayerGatherTarget, isAlive, sameTeam, slotOf, validateCommand,
  type Command, type State,
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
      const rallyTarget = hit >= 0 && (canPlayerGatherTarget(s, g.human, hit) || sameTeam(s, g.human, e.owner[slotOf(hit)]!))
        ? hit
        : undefined;
      for (const id of g.selection) {
        if (isAlive(e, id) && (e.flags[slotOf(id)]! & Role.Structure) !== 0) {
          const targeted: Command | null = rallyTarget !== undefined
            ? { t: 'rally', building: id, x: tx, y: ty, target: rallyTarget }
            : null;
          g.queued.push(targeted && validateCommand(s, g.human, targeted).ok
            ? targeted
            : { t: 'rally', building: id, x: tx, y: ty });
        }
      }
      clearArmedCommand();
      return;
    }

    if (armed.t === 'attackMove') {
      if (this.queueAttackMode(hit, tx, ty)) clearArmedCommand();
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
    for (const id of candidates) {
      const [command] = smartCommandCandidates(s, g.human, id, { hit, x: tx, y: ty }, 'mobile');
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
      const [command] = smartCommandCandidates(s, g.human, id, { hit, x: tx, y: ty }, 'desktop');
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

  private queueHarvestTarget(target: number): boolean {
    if (target < 0) return false;
    const g = this.game;
    const s = g.sim.fullState();
    const e = s.e;
    let queued = false;
    for (const id of g.selection) {
      const c: Command = { t: 'harvest', unit: id, patch: target };
      if (isAlive(e, id) && validateCommand(s, g.human, c).ok) {
        g.queued.push(c);
        queued = true;
      }
    }
    return queued;
  }

  private queueRepairTarget(target: number): boolean {
    if (target < 0) return false;
    const g = this.game;
    const s = g.sim.fullState();
    const e = s.e;
    const targetSlot = slotOf(target);
    if (e.built[targetSlot] !== 1) {
      let best: Command | null = null;
      let bestD = Infinity;
      for (const id of g.selection) {
        const c: Command = { t: 'repair', unit: id, target };
        if (!isAlive(e, id) || !validateCommand(s, g.human, c).ok) continue;
        const slot = slotOf(id);
        const dx = e.x[slot]! - e.x[targetSlot]!;
        const dy = e.y[slot]! - e.y[targetSlot]!;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = c; }
      }
      if (!best) return false;
      g.queued.push(best);
      return true;
    }
    let queued = false;
    for (const id of g.selection) {
      const c: Command = { t: 'repair', unit: id, target };
      if (isAlive(e, id) && validateCommand(s, g.human, c).ok) {
        g.queued.push(c);
        queued = true;
      }
    }
    return queued;
  }

  private queueAttackMode(hit: number, x: number, y: number): boolean {
    const g = this.game;
    const s = g.sim.fullState();
    const e = s.e;
    let queued = false;
    for (const id of this.mobileSelection(e)) {
      for (const command of attackModeCandidates(s, g.human, id, { hit, x, y })) {
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
