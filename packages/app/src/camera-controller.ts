import { TILE, type MapDef } from './sim.ts';

const EDGE_PAN_MARGIN = 24;
const EDGE_PAN_SPEED = 560; // screen px/sec; converted to world px by zoom

export class CameraController {
  camX = 0;
  camY = 0;
  zoom = 1;
  viewW = 1;
  viewH = 1;
  private readonly mapOf: () => MapDef;
  private edgePanX = 0;
  private edgePanY = 0;
  private framed = false;

  constructor(mapOf: () => MapDef) {
    this.mapOf = mapOf;
  }

  resetFrame(): void {
    this.framed = false;
  }

  resize(w: number, h: number, human: number): void {
    this.viewW = w;
    this.viewH = h;
    if (!this.framed && w > 1) this.frame(human);
    else this.clamp();
  }

  frame(human: number): void {
    const map = this.mapOf();
    this.zoom = Math.max(0.4, Math.min(2, this.viewW / (26 * TILE)));
    const loc = map.starts[human < 0 ? 0 : human]!;
    this.centerOn(loc.x * TILE + TILE / 2, loc.y * TILE + TILE / 2);
    this.framed = true;
  }

  centerOn(wx: number, wy: number): void {
    this.camX = wx - this.viewW / this.zoom / 2;
    this.camY = wy - this.viewH / this.zoom / 2;
    this.clamp();
  }

  clamp(): void {
    const map = this.mapOf();
    const maxX = map.w * TILE - this.viewW / this.zoom;
    const maxY = map.h * TILE - this.viewH / this.zoom;
    this.camX = Math.max(0, Math.min(this.camX, Math.max(0, maxX)));
    this.camY = Math.max(0, Math.min(this.camY, Math.max(0, maxY)));
  }

  screenToWorld(sx: number, sy: number): [number, number] {
    return [this.camX + sx / this.zoom, this.camY + sy / this.zoom];
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

  applyEdgePan(dt: number, enabled: boolean): void {
    if (!enabled || (this.edgePanX === 0 && this.edgePanY === 0)) return;
    const step = (EDGE_PAN_SPEED * dt) / 1000 / this.zoom;
    this.camX += this.edgePanX * step;
    this.camY += this.edgePanY * step;
    this.clamp();
  }

  minimapRect(): { ox: number; oy: number; W: number; H: number; scale: number } {
    const map = this.mapOf();
    const size = 116;
    const pad = 8;
    const scale = size / Math.max(map.w, map.h);
    const W = map.w * scale;
    const H = map.h * scale;
    return { ox: this.viewW - W - pad, oy: this.viewH - H - pad, W, H, scale };
  }

  minimapPan(sx: number, sy: number): boolean {
    const r = this.minimapRect();
    if (sx < r.ox - 2 || sy < r.oy - 2 || sx > r.ox + r.W + 2 || sy > r.oy + r.H + 2) return false;
    this.centerOn(((sx - r.ox) / r.scale) * TILE, ((sy - r.oy) / r.scale) * TILE);
    return true;
  }
}
