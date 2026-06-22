import { ui } from './store.ts';
import type { PlayerCommands, Replay } from './sim.ts';

export class ReplayController {
  replay: Replay | null = null;
  tick = 0;
  speed = 1;
  paused = false;

  get ended(): boolean {
    return this.tick >= (this.replay?.frames.length ?? 0);
  }

  clear(): void {
    this.replay = null;
    this.tick = 0;
    this.speed = 1;
    this.paused = false;
  }

  start(replay: Replay, speed = 1, paused = false): void {
    this.replay = replay;
    this.tick = 0;
    this.speed = speed;
    this.paused = paused;
    ui.replayTotal.value = replay.frames.length;
    ui.replaySpeed.value = speed;
    ui.paused.value = paused;
    ui.replayTick.value = 0;
  }

  seek(tick: number): { replay: Replay; tick: number } | null {
    const replay = this.replay;
    if (!replay) return null;
    const target = Math.max(0, Math.min(tick, replay.frames.length));
    this.tick = target;
    this.paused = target >= replay.frames.length;
    ui.replayTick.value = target;
    ui.paused.value = this.paused;
    return { replay, tick: target };
  }

  setSpeed(speed: number): void {
    this.speed = speed;
    ui.replaySpeed.value = speed;
  }

  togglePause(): boolean {
    if (!this.replay || this.ended) return false;
    this.paused = !this.paused;
    ui.paused.value = this.paused;
    return true;
  }

  takeStepBatch(): PlayerCommands[] | null {
    const replay = this.replay;
    if (!replay || this.tick >= replay.frames.length) {
      this.paused = true;
      ui.paused.value = true;
      return null;
    }
    const batch = replay.frames[this.tick] ?? [];
    this.tick++;
    ui.replayTick.value = this.tick;
    if (this.tick >= replay.frames.length) {
      this.paused = true;
      ui.paused.value = true;
    }
    return batch;
  }
}