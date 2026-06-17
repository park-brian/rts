import type { Force, FightContext } from './fight.ts';
import { resolveFight, forceDamage, forceValue } from './fight.ts';
import { UNITS } from './units.ts';

// The integration step (spec.md s7): economy + production wired on top of the
// deterministic fight resolver, behind the SAME small strategic interface used by
// the macro kernel. This unifies the two halves of the package — timing/economy
// (when) and composition/counters (what) — into one game.
//
// IMPORTANT: this is a forward-simulatable game, NOT exactly oracle-solvable — a
// typed standing army blows up the state space. So ground truth here comes from
// scripted-policy payoff matrices (see econarena/econdemo) and from the
// composition oracle (compose.ts) on the sub-game, not from full backward
// induction. That trade is deliberate and stated, not hidden.

export type EconParams = {
  incomePerWorker: number;
  workerCost: number;
  startWorkers: number;
  maxWorkers: number;
  baseHp: number;
  marchTime: number; // turns an attack spends committed/in-transit
  mineralCap: number;
  horizon: number;
  ctx: FightContext; // terrain of the decisive fight (defender's doorstep)
};

// Tuned (by sweep) to a NON-TRANSITIVE regime: the build orders form a cycle
// (vultureRush > zealotPush > tankTech > vultureRush). The decisive lever is that
// attacking a base funnels your army through a choke (attacker frontage 2 vs the
// defender's wide-open home) — a defender's advantage that makes timing matter,
// so a fast cheap army can win before its hard counter is teched. Widen the
// attacker frontage or raise baseHp and the cycle collapses, exactly as the
// "non-transitivity is a regime you tune into" lesson predicts.
export const ECON: EconParams = {
  incomePerWorker: 6,
  workerCost: 50,
  startWorkers: 6,
  maxWorkers: 20,
  baseHp: 200,
  marchTime: 3,
  mineralCap: 2000,
  horizon: 200,
  ctx: { frontageA: 2, frontageB: 99, dmgMultA: 1, dmgMultB: 1 },
};

export type EconPlayer = {
  minerals: number;
  workers: number;
  army: Force; // standing army at home (also the defenders)
  baseHp: number;
  attack: { army: Force; eta: number } | null; // committed army in transit
};

export type EconState = { turn: number; a: EconPlayer; b: EconPlayer };

// One production action per turn: harvest is automatic; you may EITHER train a
// worker OR a single army unit (a sharp economy-vs-army tradeoff), and you may
// commit your standing army to attack if one isn't already underway.
export type EconAction = { build: 'worker' | 'idle' | string; commit: boolean };

const mkPlayer = (p: EconParams): EconPlayer => ({
  minerals: 0,
  workers: p.startWorkers,
  army: [],
  baseHp: p.baseHp,
  attack: null,
});

export const econInitial = (p: EconParams): EconState => ({ turn: 0, a: mkPlayer(p), b: mkPlayer(p) });

export const econStep = (s: EconState, actA: EconAction, actB: EconAction, p: EconParams): EconState => {
  const a: EconPlayer = { ...s.a, army: s.a.army.slice(), attack: s.a.attack };
  const b: EconPlayer = { ...s.b, army: s.b.army.slice(), attack: s.b.attack };

  // 1. Advance committed attacks; resolve any arriving this turn. BOTH arrivals
  //    fight the defender's START-of-turn home army (snapshotted), so the two
  //    engagements are order-independent and mirror matches draw.
  const arriveA = a.attack && a.attack.eta <= 1 ? a.attack.army : null;
  const arriveB = b.attack && b.attack.eta <= 1 ? b.attack.army : null;
  a.attack = a.attack && a.attack.eta > 1 ? { army: a.attack.army, eta: a.attack.eta - 1 } : null;
  b.attack = b.attack && b.attack.eta > 1 ? { army: b.attack.army, eta: b.attack.eta - 1 } : null;

  const homeA = a.army;
  const homeB = b.army;
  let defenseA = homeA; // A's home army after B's attack
  let defenseB = homeB; // B's home army after A's attack
  let returnA: Force = []; // A's attackers that survive and come home
  let returnB: Force = [];
  if (arriveA) {
    const r = resolveFight(arriveA, homeB, p.ctx); // A attacks B's doorstep
    returnA = r.survivorsA;
    defenseB = r.survivorsB;
    if (r.winner === 'A') b.baseHp = Math.max(0, b.baseHp - forceDamage(r.survivorsA));
  }
  if (arriveB) {
    const r = resolveFight(arriveB, homeA, p.ctx); // B attacks A's doorstep
    returnB = r.survivorsA;
    defenseA = r.survivorsB;
    if (r.winner === 'A') a.baseHp = Math.max(0, a.baseHp - forceDamage(r.survivorsA));
  }
  a.army = [...defenseA, ...returnA];
  b.army = [...defenseB, ...returnB];

  // 2. Income.
  a.minerals = Math.min(p.mineralCap, a.minerals + a.workers * p.incomePerWorker);
  b.minerals = Math.min(p.mineralCap, b.minerals + b.workers * p.incomePerWorker);

  // 3. Production (one action per side).
  applyBuild(a, actA, p);
  applyBuild(b, actB, p);

  // 4. Commit: send the WHOLE standing army (home army empties — the bet).
  if (actA.commit && !a.attack && a.army.length > 0) {
    a.attack = { army: a.army, eta: p.marchTime || 1 };
    a.army = [];
  }
  if (actB.commit && !b.attack && b.army.length > 0) {
    b.attack = { army: b.army, eta: p.marchTime || 1 };
    b.army = [];
  }

  return { turn: s.turn + 1, a, b };
};

const applyBuild = (me: EconPlayer, act: EconAction, p: EconParams): void => {
  if (act.build === 'worker') {
    if (me.minerals >= p.workerCost && me.workers < p.maxWorkers) {
      me.minerals -= p.workerCost;
      me.workers += 1;
    }
    return;
  }
  if (act.build === 'idle') return;
  const type = UNITS[act.build];
  if (type && me.minerals >= type.cost) {
    me.minerals -= type.cost;
    me.army = [...me.army, { type, hp: type.hp }];
  }
};

/** From A's perspective: 1 A wins, -1 B wins, 0 draw, null = still live. */
export const econOutcome = (s: EconState, p: EconParams): 1 | -1 | 0 | null => {
  const aDead = s.a.baseHp <= 0;
  const bDead = s.b.baseHp <= 0;
  if (aDead && bDead) return 0;
  if (bDead) return 1;
  if (aDead) return -1;
  if (s.turn >= p.horizon) {
    // Timeout: decide by who is ahead (army value + economy), else draw.
    const score = (pl: EconPlayer) => forceValue(pl.army) + (pl.attack ? forceValue(pl.attack.army) : 0) + pl.workers * 10 - (p.baseHp - pl.baseHp);
    const sa = score(s.a) - score(s.b);
    return sa > 0 ? 1 : sa < 0 ? -1 : 0;
  }
  return null;
};
