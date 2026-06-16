import type { Action, Params, State, Who } from './types.ts';
import { legalActions, outcome, step, stateKey } from './game.ts';
import { solveZeroSum } from './matrixgame.ts';

// The ORACLE: exact game-theoretic ground truth for the minimal game.
//
// The game is a finite-horizon, simultaneous-move, zero-sum Markov game, so its
// value obeys a backward-induction recursion (Shapley): the value of a state is
// the value of the one-shot matrix game whose entries are the values of the
// successor states. We compute it exactly by recursing over the reachable tree
// with memoization, solving a matrix game at every internal node.
//
// What this buys us:
//   * a number — the game value from the start (≈0 by symmetry => optimal play
//     is a draw, but the *strategy* that achieves it is generally mixed);
//   * an unexploitable reference policy (the optimal mixed strategy per state);
//   * `exploitability(policy)`: how much a best-responder beats a fixed bot by,
//     i.e. exactly how far that bot is from optimal. This is the metric that
//     tells us a scripted/learned policy is or isn't any good.

export type Solved = {
  value: number;
  rowActions: Action[];
  colActions: Action[];
  row: number[]; // optimal mixed strategy for A over rowActions
  col: number[]; // optimal mixed strategy for B over colActions
};

const swap = (s: State): State => ({ turn: s.turn, a: s.b, b: s.a });

export class Oracle {
  private memo = new Map<string, number>();
  private nodes = 0;
  private p: Params;

  constructor(p: Params) {
    this.p = p;
  }

  get nodeCount(): number {
    return this.nodes;
  }

  /** Exact game value of a state, to player A. Value-only recursion (no strategy
   *  bookkeeping) so it can exploit mirror symmetry: V(swap(s)) = -V(s). */
  value(s: State): number {
    const term = outcome(s, this.p);
    if (term !== null) return term;

    const key = stateKey(s, this.p);
    const hit = this.memo.get(key);
    if (hit !== undefined) return hit;
    const mirror = this.memo.get(stateKey(swap(s), this.p));
    if (mirror !== undefined) return -mirror;

    const rowActions = legalActions(s, 'a', this.p);
    const colActions = legalActions(s, 'b', this.p);
    const M: number[][] = [];
    for (const aA of rowActions) {
      const r: number[] = [];
      for (const aB of colActions) r.push(this.value(step(s, aA, aB, this.p)));
      M.push(r);
    }
    this.nodes++;
    const v = solveZeroSum(M).value;
    this.memo.set(key, v);
    return v;
  }

  /** Full solution (value + optimal mixed strategies) at a given state. */
  solve(s: State): Solved {
    const term = outcome(s, this.p);
    if (term !== null) return { value: term, rowActions: [], colActions: [], row: [], col: [] };

    const rowActions = legalActions(s, 'a', this.p);
    const colActions = legalActions(s, 'b', this.p);
    const M = rowActions.map((aA) => colActions.map((aB) => this.value(step(s, aA, aB, this.p))));
    const sol = solveZeroSum(M);
    return { value: sol.value, rowActions, colActions, row: sol.row, col: sol.col };
  }

  /**
   * Best-response value, from `start`, to a fixed opponent `policy`. `brSide` is
   * the player who best-responds; the other side plays `policy`. The result is
   * always in A-perspective units (+1 good for A): when B best-responds it is
   * the value B can force, so a strong B drives it toward -1.
   *
   * Because the opponent is fixed, this collapses to a single-agent MDP — no
   * matrix game, just a max (brSide a) or min (brSide b) over one side's actions.
   */
  bestResponseValue(start: State, policy: Policy, brSide: Who): number {
    const memo = new Map<string, number>();
    const rec = (s: State): number => {
      const term = outcome(s, this.p);
      if (term !== null) return term;
      const key = stateKey(s, this.p);
      const hit = memo.get(key);
      if (hit !== undefined) return hit;

      let val: number;
      if (brSide === 'a') {
        const oppAct = policy(s, 'b', this.p);
        val = -Infinity;
        for (const aA of legalActions(s, 'a', this.p)) {
          val = Math.max(val, rec(step(s, aA, oppAct, this.p)));
        }
      } else {
        const oppAct = policy(s, 'a', this.p);
        val = Infinity;
        for (const aB of legalActions(s, 'b', this.p)) {
          val = Math.min(val, rec(step(s, oppAct, aB, this.p)));
        }
      }
      memo.set(key, val);
      return val;
    };
    return rec(start);
  }
}

// A policy maps (state, who) to a concrete action. Defined here to avoid a
// circular import with policies.ts (which imports the game, not the oracle).
export type Policy = (s: State, who: Who, p: Params) => Action;
