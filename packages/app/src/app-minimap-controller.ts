import type { CameraController } from './camera-controller.ts';

export type MinimapRect = { ox: number; oy: number; W: number; H: number; scale: number };

export class AppMinimapController {
  private readonly camera: () => CameraController;

  constructor(camera: () => CameraController) {
    this.camera = camera;
  }

  rect(): MinimapRect {
    return this.camera().minimapRect();
  }

  pan(sx: number, sy: number): boolean {
    return this.camera().minimapPan(sx, sy);
  }
}