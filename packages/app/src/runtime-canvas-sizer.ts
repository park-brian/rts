export type DevicePixelRatio = () => number;

const defaultDevicePixelRatio = (): number => Math.min(2, globalThis.devicePixelRatio || 1);

export type RuntimeCanvasSize = {
  width: number;
  height: number;
  dpr: number;
};

export class RuntimeCanvasSizer {
  private readonly gameCanvas: HTMLCanvasElement;
  private readonly overlayCanvas: HTMLCanvasElement;
  private readonly devicePixelRatio: DevicePixelRatio;

  constructor(
    gameCanvas: HTMLCanvasElement,
    overlayCanvas: HTMLCanvasElement,
    devicePixelRatio: DevicePixelRatio = defaultDevicePixelRatio,
  ) {
    this.gameCanvas = gameCanvas;
    this.overlayCanvas = overlayCanvas;
    this.devicePixelRatio = devicePixelRatio;
  }

  resize(): RuntimeCanvasSize {
    const dpr = this.devicePixelRatio();
    const rect = this.gameCanvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    for (const canvas of [this.gameCanvas, this.overlayCanvas]) {
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
    }
    return { width, height, dpr };
  }
}