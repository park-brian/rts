import type { GameState } from '../microrts/types.ts';
import { Kind } from '../microrts/types.ts';
import { idleUnits, step, winner } from '../microrts/game.ts';
import { makeMap } from '../microrts/setup.ts';
import type { Bot } from '../microrts/bots.ts';
import { economyBot } from '../microrts/bots.ts';
import { decode, unitMask, PER_UNIT_ACTIONS } from './microActions.ts';

// microRTS as a GridNet environment: the observation is a stack of H×W feature
// PLANES, and an action is read off PER CELL. Each decision step the agent
// commands every cell holding one of its idle units, each with that cell's own
// legal-action mask. One CNN forward pass yields all cells' logits at once.

// own unit type (6) | enemy unit type (6) | resource | hp | carrying | my-idle |
// my-stockpile (broadcast) | time (broadcast)
export const GRID_CHANNELS = 18;
const TYPE_CH: Record<number, number> = { [Kind.Base]: 0, [Kind.Barracks]: 1, [Kind.Worker]: 2, [Kind.Light]: 3, [Kind.Heavy]: 4, [Kind.Ranged]: 5 };

export type ActiveCell = { cell: number; unitId: number; mask: boolean[] };
export type GridObs = { planes: Float64Array; active: ActiveCell[] };

export class GridEnv {
  readonly channels = GRID_CHANNELS;
  readonly actions = PER_UNIT_ACTIONS;
  readonly H: number; readonly W: number;
  private me: 0 | 1 = 0;
  private opp: Bot;
  private maxCycles: number;
  private s: GameState;

  constructor(opponent: Bot = economyBot, maxCycles = 150) {
    this.opp = opponent; this.maxCycles = maxCycles;
    this.s = makeMap();
    this.H = this.s.h; this.W = this.s.w;
  }

  private planes(): Float64Array {
    const { H, W } = this; const hw = H * W; const me = this.me; const enemy = me === 0 ? 1 : 0;
    const p = new Float64Array(GRID_CHANNELS * hw);
    const at = (c: number, cell: number, v: number) => { p[c * hw + cell] = v; };
    for (const u of this.s.units) {
      const cell = u.y * W + u.x;
      if (u.kind === Kind.Resource) { at(12, cell, u.carrying / 20); continue; }
      const base = u.owner === me ? 0 : 6;
      at(base + TYPE_CH[u.kind]!, cell, 1);
      at(13, cell, u.hp / 10);
      at(14, cell, u.carrying > 0 ? 1 : 0);
      if (u.owner === me && u.busy === null) at(15, cell, 1);
    }
    const res = this.s.resources[me] / 20; const tm = this.s.time / this.maxCycles;
    for (let cell = 0; cell < hw; cell++) { p[16 * hw + cell] = res; p[17 * hw + cell] = tm; }
    return p;
  }

  private observe(): GridObs {
    const active = idleUnits(this.s, this.me).map((u) => ({ cell: u.y * this.W + u.x, unitId: u.id, mask: unitMask(this.s, u) }));
    return { planes: this.planes(), active };
  }

  reset(): GridObs { this.s = makeMap(); return this.observe(); }

  step(actions: { cell: number; slot: number }[]): { obs: GridObs; reward: number; done: boolean } {
    const before = this.s.resources[this.me];
    const my = actions
      .map(({ cell, slot }) => {
        const u = this.s.units.find((z) => z.y * this.W + z.x === cell && z.owner === this.me && z.busy === null);
        const a = u ? decode(this.s, u, slot) : null;
        return a && u ? { unitId: u.id, action: a } : null;
      })
      .filter((x): x is { unitId: number; action: import('../microrts/types.ts').UnitAction } => x !== null);
    const oppMove = (st: GameState) => this.opp(st, (this.me === 0 ? 1 : 0) as 0 | 1);
    this.s = this.me === 0 ? step(this.s, my, oppMove(this.s)) : step(this.s, oppMove(this.s), my);
    let guard = 0;
    while (winner(this.s, this.maxCycles) === null && idleUnits(this.s, this.me).length === 0 && guard++ < 2000) {
      this.s = this.me === 0 ? step(this.s, [], oppMove(this.s)) : step(this.s, oppMove(this.s), []);
    }
    const done = winner(this.s, this.maxCycles) !== null;
    return { obs: this.observe(), reward: this.s.resources[this.me] - before, done };
  }
}
