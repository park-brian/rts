import type { Game } from './game.ts';
import {
  Abilities, NONE, ONE, Role, eid, isAlive, sameTeam, slotOf, validateCommand,
  type Command, type State,
} from './sim.ts';
import { isUserCommandableKind } from './child-actors.ts';
import { boundsIntersectsRect, selectableBounds } from './selection-geometry.ts';
import { smartCommandCandidates } from './smart-command-candidates.ts';
import { clearArmedCommand, isPlacementArmed, ui } from './store.ts';

export type TapOptions = { shift?: boolean; ctrl?: boolean; preferredHit?: number };

export class TapSelectionController {
  private readonly game: Game;

  constructor(game: Game) {
    this.game = game;
  }

  boxSelect(sx0: number, sy0: number, sx1: number, sy1: number): void {
    const g = this.game;
    const [wx0, wy0] = g.screenToWorld(Math.min(sx0, sx1), Math.min(sy0, sy1));
    const [wx1, wy1] = g.screenToWorld(Math.max(sx0, sx1), Math.max(sy0, sy1));
    g.selection.clear();
    if (g.human < 0) return;
    const e = g.sim.fullState().e;
    const buildings: number[] = [];
    for (let i = 0; i < e.hi; i++) {
      if (e.alive[i] !== 1 || e.container[i] !== NONE || e.owner[i] !== g.human) continue;
      if (!isUserCommandableKind(e.kind[i]!)) continue;
      const b = selectableBounds(e.kind[i]!, e.x[i]!, e.y[i]!);
      if (!boundsIntersectsRect(b, wx0, wy0, wx1, wy1)) continue;
      if ((e.flags[i]! & Role.Structure) !== 0) buildings.push(eid(e, i));
      else g.selection.add(eid(e, i));
    }
    if (g.selection.size === 0) for (const id of buildings) g.selection.add(id);
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
      const rallyTarget = hit >= 0 && (((e.flags[slotOf(hit)]! & Role.Resource) !== 0) || sameTeam(s, g.human, e.owner[slotOf(hit)]!))
        ? hit
        : undefined;
      for (const id of g.selection) {
        if (isAlive(e, id) && (e.flags[slotOf(id)]! & Role.Structure) !== 0) {
          g.queued.push(rallyTarget !== undefined
            ? { t: 'rally', building: id, x: tx, y: ty, target: rallyTarget }
            : { t: 'rally', building: id, x: tx, y: ty });
        }
      }
      clearArmedCommand();
      return;
    }

    if (armed.t === 'attackMove') {
      for (const id of this.mobileSelection(e)) g.queued.push({ t: 'amove', unit: id, x: tx, y: ty });
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

    if (this.isOwnedSelectable(e, hit)) {
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
    if (!this.isOwnedSelectable(e, hit)) {
      if (!opts.shift) g.selection.clear();
      return;
    }
    if (opts.ctrl) {
      this.selectVisibleKind(e.kind[slotOf(hit)]!);
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
    if (ui.armedCommand.value.t !== 'none') {
      this.tap(sx, sy, opts);
      return;
    }
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
    this.selectVisibleKind(e.kind[hs]!);
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

  private isOwnedSelectable(e: State['e'], id: number): boolean {
    const g = this.game;
    if (id < 0 || g.human < 0) return false;
    return isAlive(e, id) && e.owner[slotOf(id)] === g.human && isUserCommandableKind(e.kind[slotOf(id)]!);
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

  private resolvePreferredHit(hit: number | undefined): number | undefined {
    const g = this.game;
    if (hit === undefined || hit < 0 || !isAlive(g.sim.fullState().e, hit)) return undefined;
    return g.isHitTestCandidate(slotOf(hit)) ? hit : undefined;
  }

  private selectVisibleKind(kind: number): void {
    const g = this.game;
    if (!isUserCommandableKind(kind)) return;
    const e = g.sim.fullState().e;
    const x0 = g.camX;
    const y0 = g.camY;
    const x1 = g.camX + g.viewW / g.zoom;
    const y1 = g.camY + g.viewH / g.zoom;
    g.selection.clear();
    for (let i = 0; i < e.hi; i++) {
      if (e.alive[i] !== 1 || e.container[i] !== NONE || e.owner[i] !== g.human || e.kind[i] !== kind) continue;
      const b = selectableBounds(kind, e.x[i]!, e.y[i]!);
      if (boundsIntersectsRect(b, x0, y0, x1, y1)) g.selection.add(eid(e, i));
    }
  }
}
