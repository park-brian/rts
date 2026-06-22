export type RequestFrame = (fn: FrameRequestCallback) => number;
export type CancelFrame = (id: number) => void;

export class RuntimeFrameLoop {
  private frame: number | null = null;
  private running = false;
  private stopped = false;
  private readonly step: FrameRequestCallback;
  private readonly requestFrame: RequestFrame;
  private readonly cancelFrame?: CancelFrame;

  constructor(step: FrameRequestCallback, requestFrame: RequestFrame, cancelFrame?: CancelFrame) {
    this.step = step;
    this.requestFrame = requestFrame;
    this.cancelFrame = cancelFrame;
  }

  start(): void {
    if (this.running || this.stopped) return;
    this.running = true;
    this.schedule();
  }

  stop(): boolean {
    if (this.stopped) return false;
    this.stopped = true;
    this.running = false;
    if (this.frame !== null) this.cancelFrame?.(this.frame);
    this.frame = null;
    return true;
  }

  private schedule(): void {
    if (!this.running) return;
    this.frame = this.requestFrame((now) => {
      this.step(now);
      this.schedule();
    });
  }
}