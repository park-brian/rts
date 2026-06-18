import type { Game } from './game.ts';
import { isPlacementArmed, ui } from './store.ts';

const TAP_SLOP = 8;

type Point = { x: number; y: number };

export type InputPointer = Point & {
  pointerId: number;
  clientX: number;
  clientY: number;
  button: number;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
};

export type InputGestureControllerDeps = {
  isDesktop: () => boolean;
  viewportEdgePan: (clientX: number, clientY: number) => void;
  now?: () => number;
};

export class InputGestureController {
  private readonly game: Game;
  private readonly isDesktop: () => boolean;
  private readonly viewportEdgePan: (clientX: number, clientY: number) => void;
  private readonly now: () => number;
  private readonly pts = new Map<number, Point>();
  private readonly buttons = new Map<number, number>();
  private moved = false;
  private start: Point = { x: 0, y: 0 };
  private pinchDist = 0;
  private panMid: Point = { x: 0, y: 0 };
  private onMinimap = false;
  private multiTouch = false;
  private lastTapT = 0;
  private lastTap: Point = { x: 0, y: 0 };
  private placing = false;
  private middlePanId = -1;
  private middlePanLast: Point = { x: 0, y: 0 };
  private pressHit = -1;

  constructor(game: Game, deps: InputGestureControllerDeps) {
    this.game = game;
    this.isDesktop = deps.isDesktop;
    this.viewportEdgePan = deps.viewportEdgePan;
    this.now = deps.now ?? (() => performance.now());
  }

  pointerDown(p: InputPointer): void {
    const desktop = this.isDesktop();
    if (desktop) this.viewportEdgePan(p.clientX, p.clientY);
    this.pts.set(p.pointerId, p);
    this.buttons.set(p.pointerId, p.button);
    if (this.pts.size === 1) {
      this.startPrimaryPointer(p, desktop);
      return;
    }
    if (this.pts.size === 2) this.startTwoPointerGesture();
  }

  pointerMove(p: InputPointer): void {
    if (!this.pts.has(p.pointerId)) return;
    if (this.isDesktop()) this.viewportEdgePan(p.clientX, p.clientY);
    this.pts.set(p.pointerId, p);

    if (this.pts.size === 1) {
      this.moveSinglePointer(p);
      return;
    }
    if (this.pts.size === 2) this.moveTwoPointerGesture();
  }

  pointerEnd(p: InputPointer): void {
    if (!this.pts.has(p.pointerId)) return;
    const wasOne = this.pts.size === 1;
    const button = this.buttons.get(p.pointerId) ?? p.button;
    this.pts.delete(p.pointerId);
    this.buttons.delete(p.pointerId);
    if (wasOne) this.endSinglePointer(p, button);
    else if (this.pts.size === 0) this.cancelGestureState();
  }

  reset(): void {
    this.pts.clear();
    this.buttons.clear();
    this.game.clearEdgePan();
    this.game.box = null;
    this.resetSessionFlags();
  }

  private startPrimaryPointer(p: InputPointer, desktop: boolean): void {
    this.multiTouch = false;
    this.start = p;
    this.moved = false;
    this.game.box = null;
    this.pressHit = -1;
    if (desktop && p.button === 1) {
      this.middlePanId = p.pointerId;
      this.middlePanLast = p;
      this.placing = false;
      this.onMinimap = false;
      this.game.cancelPlacementGhost();
      return;
    }

    this.placing = isPlacementArmed(ui.armedCommand.value);
    if (this.placing) {
      this.onMinimap = false;
      this.game.updatePlacementGhost(p.x, p.y);
    } else if (!desktop || p.button === 0) {
      this.onMinimap = this.game.minimapPan(p.x, p.y);
    } else {
      this.onMinimap = false;
    }

    if (!this.placing && !this.onMinimap && (!desktop || p.button === 0 || p.button === 2)) {
      const [wx, wy] = this.game.screenToWorld(p.x, p.y);
      this.pressHit = this.game.hitTest(wx, wy);
    }
  }

  private startTwoPointerGesture(): void {
    this.multiTouch = true;
    this.pressHit = -1;
    this.placing = false;
    this.game.cancelPlacementGhost();
    this.game.box = null;
    const [a, b] = [...this.pts.values()];
    this.pinchDist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    this.panMid = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
  }

  private moveSinglePointer(p: InputPointer): void {
    if (this.multiTouch) return;
    if (this.middlePanId === p.pointerId) {
      this.game.camX -= (p.x - this.middlePanLast.x) / this.game.zoom;
      this.game.camY -= (p.y - this.middlePanLast.y) / this.game.zoom;
      this.middlePanLast = p;
      this.moved = true;
      this.game.clampCamera();
      return;
    }
    if (this.placing) {
      this.game.updatePlacementGhost(p.x, p.y);
      return;
    }
    if (this.onMinimap) {
      this.game.minimapPan(p.x, p.y);
      return;
    }
    if (this.isDesktop() && (this.buttons.get(p.pointerId) ?? 0) !== 0) return;
    if (Math.hypot(p.x - this.start.x, p.y - this.start.y) > TAP_SLOP) this.moved = true;
    if (this.moved) this.game.box = { x0: this.start.x, y0: this.start.y, x1: p.x, y1: p.y };
  }

  private moveTwoPointerGesture(): void {
    const [a, b] = [...this.pts.values()];
    const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    const mid = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
    this.game.camX -= (mid.x - this.panMid.x) / this.game.zoom;
    this.game.camY -= (mid.y - this.panMid.y) / this.game.zoom;
    if (this.pinchDist > 0) this.zoomAt(mid.x, mid.y, dist / this.pinchDist);
    this.pinchDist = dist;
    this.panMid = mid;
    this.game.clampCamera();
  }

  private endSinglePointer(p: InputPointer, button: number): void {
    if (this.middlePanId === p.pointerId) {
      this.middlePanId = -1;
      this.onMinimap = false;
      this.placing = false;
      this.game.box = null;
    } else if (this.multiTouch) {
      this.multiTouch = false;
      this.onMinimap = false;
      this.placing = false;
      this.game.cancelPlacementGhost();
      this.game.box = null;
    } else if (this.placing) {
      this.game.updatePlacementGhost(p.x, p.y);
      this.game.commitPlacementGhost();
      this.placing = false;
    } else if (this.onMinimap) {
      this.onMinimap = false;
    } else if (!this.moved) {
      this.dispatchTap(p, button);
    } else if (this.game.box) {
      this.game.boxSelect(this.game.box.x0, this.game.box.y0, this.game.box.x1, this.game.box.y1);
    }
    this.pressHit = -1;
    this.game.box = null;
  }

  private dispatchTap(p: InputPointer, button: number): void {
    const now = this.now();
    const dbl = now - this.lastTapT < 300 && Math.hypot(p.x - this.lastTap.x, p.y - this.lastTap.y) < 24;
    this.lastTapT = now;
    this.lastTap = p;
    const hitOpts = { preferredHit: this.pressHit };
    if (this.isDesktop() && button === 2) this.game.desktopSmartTap(p.x, p.y, hitOpts);
    else if (this.isDesktop()) {
      if (dbl) this.game.selectAllByType(p.x, p.y, hitOpts);
      else this.game.desktopSelectTap(p.x, p.y, {
        shift: p.shiftKey,
        ctrl: p.ctrlKey || p.metaKey,
        preferredHit: this.pressHit,
      });
    } else if (dbl) this.game.selectAllByType(p.x, p.y, hitOpts);
    else this.game.tap(p.x, p.y, hitOpts);
  }

  private cancelGestureState(): void {
    this.resetSessionFlags();
    this.game.cancelPlacementGhost();
    this.game.box = null;
  }

  private resetSessionFlags(): void {
    this.multiTouch = false;
    this.middlePanId = -1;
    this.pressHit = -1;
    this.onMinimap = false;
    this.placing = false;
  }

  private zoomAt(sx: number, sy: number, factor: number): void {
    const [wx, wy] = this.game.screenToWorld(sx, sy);
    this.game.zoom = Math.max(0.4, Math.min(4, this.game.zoom * factor));
    this.game.camX = wx - sx / this.game.zoom;
    this.game.camY = wy - sy / this.game.zoom;
  }
}
