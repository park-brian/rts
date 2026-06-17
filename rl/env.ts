// Minimal single-agent RL environment interface, with INVALID-ACTION MASKING as
// a first-class part of the contract (every observation comes with the mask of
// currently-legal actions). This mirrors the Gym-µRTS recipe: masking is not an
// afterthought, it is returned every step and applied at sampling and in the
// loss. The action space is a fixed size `nActions`; the mask says which are
// legal right now.

export type Obs = { obs: number[]; mask: boolean[] };
export type StepOut = { obs: number[]; mask: boolean[]; reward: number; done: boolean };

export interface Env {
  readonly obsDim: number;
  readonly nActions: number;
  reset(): Obs;
  step(action: number): StepOut;
}

// ---------------------------------------------------------------------------
// A tiny synthetic env used to TEST the PPO + masking machinery robustly: a
// one-step contextual bandit. Each episode shows a context (one-hot), a random
// subset of actions is legal, and exactly one legal action is "correct" (reward
// 1, else 0). A correct masked PPO must learn to pick the best LEGAL action and
// must never sample an illegal one.
// ---------------------------------------------------------------------------
export class BanditEnv implements Env {
  readonly obsDim: number;
  readonly nActions: number;
  private seed: number;
  private ctx = 0;
  private legal: boolean[] = [];
  private best = 0;

  constructor(nActions = 4, seed = 1) {
    this.nActions = nActions;
    this.obsDim = nActions; // one-hot context of size nActions
    this.seed = seed >>> 0;
  }

  // deterministic LCG so tests are reproducible
  private rnd(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 0x100000000;
  }

  private gen(): Obs {
    this.ctx = Math.floor(this.rnd() * this.nActions);
    // each action legal with prob 0.6, but ensure >=1 legal
    this.legal = Array.from({ length: this.nActions }, () => this.rnd() < 0.6);
    if (!this.legal.some((x) => x)) this.legal[Math.floor(this.rnd() * this.nActions)] = true;
    // the "best" legal action is a fixed function of context (the first legal
    // action at or after ctx) — learnable from the observation.
    let b = this.ctx;
    for (let i = 0; i < this.nActions; i++) {
      const j = (this.ctx + i) % this.nActions;
      if (this.legal[j]) { b = j; break; }
    }
    this.best = b;
    const obs = new Array(this.nActions).fill(0);
    obs[this.ctx] = 1;
    return { obs, mask: this.legal.slice() };
  }

  reset(): Obs {
    return this.gen();
  }

  step(action: number): StepOut {
    const reward = action === this.best ? 1 : 0;
    const next = this.gen(); // 1-step episodes
    return { obs: next.obs, mask: next.mask, reward, done: true };
  }
}
