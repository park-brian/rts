import type { UnitType } from './units.ts';
import { UNITS, effectiveDamage } from './units.ts';

// Deterministic army-vs-army fight resolver. Pure, integer, no RNG. Models the
// effects that decide RTS fights without 2D positions: damage-type x size
// counters, focus fire (=> square-law tipping), an army-scale opening volley for
// the longer-ranged side, and a frontage cap for terrain (chokes/ramps). See
// spec.md sections 2-3.

export type UnitInstance = { type: UnitType; hp: number };
export type Force = UnitInstance[];

export type FightContext = {
  frontageA: number; // max A units attacking per round (Infinity = open field)
  frontageB: number;
  dmgMultA: number; // outgoing-damage multiplier for A (defender/high-ground edge)
  dmgMultB: number;
};

export const OPEN_FIELD: FightContext = { frontageA: Infinity, frontageB: Infinity, dmgMultA: 1, dmgMultB: 1 };

export type FightResult = {
  winner: 'A' | 'B' | 'draw';
  survivorsA: Force;
  survivorsB: Force;
  rounds: number;
};

const ROUND_CAP = 500;
const OPENING_CAP = 3; // max free rounds the longer-ranged side gets

/** Build a force from a composition map { unitName: count }. */
export const makeForce = (comp: Record<string, number>): Force => {
  const f: Force = [];
  for (const name of Object.keys(comp)) {
    const type = UNITS[name];
    if (!type) throw new Error(`unknown unit: ${name}`);
    for (let i = 0; i < comp[name]!; i++) f.push({ type, hp: type.hp });
  }
  return f;
};

export const forceValue = (f: Force): number => f.reduce((s, u) => s + u.type.cost, 0);
export const forceCount = (f: Force): number => f.length;

const maxRange = (f: Force): number => f.reduce((m, u) => Math.max(m, u.type.range), 0);
const maxSpeed = (f: Force): number => f.reduce((m, u) => Math.max(m, u.type.speed), 0);

// Apply one round of `attackers`' fire onto `defenders` and return the surviving
// defenders (fresh instances). Front-line = the first `frontage` attackers; each
// fires once, focusing the highest-threat live defender (ties: lowest HP), so fire
// concentrates to remove units. Damage is read from the passed-in (start-of-round)
// state, so callers can resolve both sides simultaneously.
const applyRound = (attackers: Force, frontage: number, mult: number, defenders: Force): Force => {
  const hp = defenders.map((u) => u.hp);
  // Target priority: most dangerous first (highest damage), break ties by lowest HP.
  const order = defenders
    .map((_, i) => i)
    .sort((x, y) => defenders[y]!.type.damage - defenders[x]!.type.damage || hp[x]! - hp[y]!);
  const front = Math.min(frontage, attackers.length);
  let ti = 0;
  for (let a = 0; a < front; a++) {
    while (ti < order.length && hp[order[ti]!]! <= 0) ti++;
    if (ti >= order.length) break; // everything dead
    const target = defenders[order[ti]!]!;
    const dmg = Math.max(1, Math.trunc(effectiveDamage(attackers[a]!.type, target.type) * mult));
    hp[order[ti]!]! -= dmg;
  }
  const out: Force = [];
  for (let i = 0; i < defenders.length; i++) if (hp[i]! > 0) out.push({ type: defenders[i]!.type, hp: hp[i]! });
  return out;
};

export const resolveFight = (forceA: Force, forceB: Force, ctx: FightContext = OPEN_FIELD): FightResult => {
  let a: Force = forceA.map((u) => ({ type: u.type, hp: u.hp }));
  let b: Force = forceB.map((u) => ({ type: u.type, hp: u.hp }));
  let rounds = 0;

  // Opening volley: the longer-ranged side fires unanswered while the other closes.
  const ra = maxRange(a);
  const rb = maxRange(b);
  if (ra > rb) {
    const opening = Math.min(OPENING_CAP, Math.ceil((ra - rb) / Math.max(1, maxSpeed(b))));
    for (let o = 0; o < opening && a.length > 0 && b.length > 0; o++) {
      b = applyRound(a, ctx.frontageA, ctx.dmgMultA, b);
      rounds++;
    }
  } else if (rb > ra) {
    const opening = Math.min(OPENING_CAP, Math.ceil((rb - ra) / Math.max(1, maxSpeed(a))));
    for (let o = 0; o < opening && a.length > 0 && b.length > 0; o++) {
      a = applyRound(b, ctx.frontageB, ctx.dmgMultB, a);
      rounds++;
    }
  }

  // Main exchange: simultaneous rounds off start-of-round state.
  while (a.length > 0 && b.length > 0 && rounds < ROUND_CAP) {
    const nextB = applyRound(a, ctx.frontageA, ctx.dmgMultA, b);
    const nextA = applyRound(b, ctx.frontageB, ctx.dmgMultB, a);
    a = nextA;
    b = nextB;
    rounds++;
  }

  let winner: FightResult['winner'];
  if (a.length === 0 && b.length === 0) winner = 'draw';
  else if (b.length === 0) winner = 'A';
  else if (a.length === 0) winner = 'B';
  else winner = forceValue(a) > forceValue(b) ? 'A' : forceValue(b) > forceValue(a) ? 'B' : 'draw';

  return { winner, survivorsA: a, survivorsB: b, rounds };
};

/** +1 / -1 / 0 from A's perspective — the strategic payoff of a fight. */
export const fightPayoff = (forceA: Force, forceB: Force, ctx?: FightContext): number => {
  const w = resolveFight(forceA, forceB, ctx).winner;
  return w === 'A' ? 1 : w === 'B' ? -1 : 0;
};
