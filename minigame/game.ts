import type { Action, Params, PlayerState, Raid, State, Outcome, Who } from './types.ts';
import { Target } from './types.ts';

// ---------------------------------------------------------------------------
// Construction & small helpers
// ---------------------------------------------------------------------------

const makePlayer = (p: Params): PlayerState => ({
  minerals: p.startMinerals,
  workers: Array.from({ length: p.startWorkers }, () => p.workerHp),
  baseHp: p.baseHp,
  buildTimer: -1,
  inbound: null,
});

export const initialState = (p: Params): State => ({
  turn: 0,
  a: makePlayer(p),
  b: makePlayer(p),
});

const clonePlayer = (s: PlayerState): PlayerState => ({
  minerals: s.minerals,
  workers: s.workers.slice(),
  baseHp: s.baseHp,
  buildTimer: s.buildTimer,
  inbound: s.inbound ? { hps: s.inbound.hps.slice(), target: s.inbound.target, eta: s.inbound.eta } : null,
});

export const cloneState = (s: State): State => ({
  turn: s.turn,
  a: clonePlayer(s.a),
  b: clonePlayer(s.b),
});

/** Total worker supply (home + marching + one in production). */
const supply = (s: PlayerState): number =>
  s.workers.length + (s.inbound ? s.inbound.hps.length : 0) + (s.buildTimer >= 0 ? 1 : 0);

// ---------------------------------------------------------------------------
// Combat: efficient focus fire.
//
// `total` damage is concentrated to FINISH the lowest-HP units first (no
// overkill waste) — the Lanchester-optimal use of fire, and the reason HP is a
// load-bearing primitive: a half-dead worker still works/fights at full rate,
// so concentrating damage to actually remove units beats spreading it.
// ---------------------------------------------------------------------------

export const focusFire = (hps: number[], total: number): number[] => {
  const sorted = hps.slice().sort((x, y) => x - y);
  let dmg = total;
  const survivors: number[] = [];
  for (const hp of sorted) {
    if (dmg >= hp) {
      dmg -= hp; // unit dies, remainder carries to the next
    } else {
      survivors.push(hp - dmg); // partially damaged (or untouched if dmg===0)
      dmg = 0;
    }
  }
  return survivors;
};

// ---------------------------------------------------------------------------
// Legal actions
// ---------------------------------------------------------------------------

/**
 * Enumerate every distinct legal action for a player. Workers are split into
 * (attack, defend, harvest=rest) with no idle units; attackers additionally
 * choose a target category; the base may queue a worker if it can afford one
 * and is not already building and is under the supply cap.
 *
 * Note targets are NOT pruned by whether the enemy group is currently non-empty:
 * the split is simultaneous, so the attacker cannot know the enemy's realized
 * harvester/defender counts this turn. That uncertainty is exactly what the
 * matrix-game solver in the oracle resolves.
 */
export const legalActions = (s: State, who: Who, p: Params): Action[] => {
  const me = s[who];
  const w = me.workers.length;
  const canBuild = me.buildTimer < 0 && me.minerals >= p.workerCost && supply(me) < p.maxWorkers;
  const buildOpts = canBuild ? [false, true] : [false];
  // Single raid in flight: you cannot launch a new attack while one is marching.
  const maxAttack = me.inbound ? 0 : w;

  const out: Action[] = [];
  for (let attack = 0; attack <= maxAttack; attack++) {
    for (let defend = 0; defend <= w - attack; defend++) {
      const targets = attack > 0 ? [Target.Harvesters, Target.Defenders, Target.Base] : [Target.Base];
      for (const target of targets) {
        for (const build of buildOpts) {
          out.push({ attack, defend, target, build });
        }
      }
    }
  }
  return out;
};

// ---------------------------------------------------------------------------
// Role assignment
//
// The action specifies COUNTS; we deterministically pick which workers fill
// each role. Healthiest units are sent to attack (they must survive the trip
// home), next-healthiest defend, the rest harvest. Deterministic => canonical.
// ---------------------------------------------------------------------------

type Roles = { attackers: number[]; defenders: number[]; harvesters: number[] };

const assignRoles = (me: PlayerState, act: Action): Roles => {
  const sorted = me.workers.slice().sort((x, y) => y - x); // healthiest first
  const attackers = sorted.slice(0, act.attack);
  const defenders = sorted.slice(act.attack, act.attack + act.defend);
  const harvesters = sorted.slice(act.attack + act.defend);
  return { attackers, defenders, harvesters };
};

// One attacker force hitting one defender's home. Uses START-OF-TURN state for
// both sides so the two engagements in a turn are order-independent.
type EngageOut = {
  attackerSurvivors: number[];
  defHarvesters: number[];
  defDefenders: number[];
  defBaseHp: number;
};

const engage = (
  attackers: number[],
  target: Action['target'],
  def: Roles,
  defBaseHp: number,
  p: Params,
): EngageOut => {
  const atkDamage = attackers.length * p.workerDmg;
  const defDamage = def.defenders.length * p.workerDmg;

  // Defenders ALWAYS fire at the incoming attackers (this is the "free hits"
  // the attacker eats whenever it tunnels harvesters or the base).
  const attackerSurvivors = focusFire(attackers, defDamage);

  let defHarvesters = def.harvesters;
  let defDefenders = def.defenders;
  let outBase = defBaseHp;
  if (target === Target.Harvesters) {
    defHarvesters = focusFire(def.harvesters, atkDamage);
  } else if (target === Target.Defenders) {
    defDefenders = focusFire(def.defenders, atkDamage);
  } else {
    outBase = Math.max(0, defBaseHp - atkDamage);
  }
  return { attackerSurvivors, defHarvesters, defDefenders, defBaseHp: outBase };
};

// ---------------------------------------------------------------------------
// Transition
// ---------------------------------------------------------------------------

// Launch / advance a player's raid. Returns the force STRIKING the enemy this
// turn (or null), plus the still-marching raid to carry into next turn. The
// `attackers` are the home workers launched this turn (already removed from the
// home pool by role assignment).
const advanceRaid = (
  prior: Raid | null,
  attackers: number[],
  target: Action['target'],
  p: Params,
): { striking: Raid | null; marching: Raid | null } => {
  // A prior raid arrives when its travel runs out.
  let striking: Raid | null = null;
  let marching: Raid | null = null;
  if (prior) {
    if (prior.eta <= 1) striking = prior;
    else marching = { hps: prior.hps, target: prior.target, eta: prior.eta - 1 };
  }
  // A freshly launched raid (legalActions guarantees prior was null when launching).
  if (attackers.length > 0) {
    const fresh: Raid = { hps: attackers, target, eta: p.marchTime };
    if (p.marchTime === 0) striking = fresh; // instant game: strike the same turn
    else marching = fresh;
  }
  return { striking, marching };
};

/**
 * Advance one turn under SIMULTANEOUS actions. Pure: returns a fresh state.
 * Resolution order: launch/advance raids -> combat (striking raids vs the enemy
 * home, off start-of-turn state) -> income from survivors -> build -> turn++.
 */
export const step = (s: State, actA: Action, actB: Action, p: Params): State => {
  const rolesA = assignRoles(s.a, actA);
  const rolesB = assignRoles(s.b, actB);

  const raidA = advanceRaid(s.a.inbound, rolesA.attackers, actA.target, p);
  const raidB = advanceRaid(s.b.inbound, rolesB.attackers, actB.target, p);

  // Only raids that STRIKE this turn engage. Defenders of the target are the
  // home defenders assigned this turn. Both engagements use start-of-turn state.
  const strikeA = raidA.striking;
  const strikeB = raidB.striking;

  let aWorkers: number[];
  let bWorkers: number[];
  let aBase: number;
  let bBase: number;
  let aHarv: number;
  let bHarv: number;
  if (!strikeA && !strikeB) {
    // Fast path: no combat this turn (the common macro/macro case). Nobody dies;
    // launched attackers are already off in `marching`. Skips both engagements.
    aWorkers = [...rolesA.defenders, ...rolesA.harvesters];
    bWorkers = [...rolesB.defenders, ...rolesB.harvesters];
    aBase = s.a.baseHp;
    bBase = s.b.baseHp;
    aHarv = rolesA.harvesters.length;
    bHarv = rolesB.harvesters.length;
  } else {
    const aOnB = engage(strikeA ? strikeA.hps : [], strikeA ? strikeA.target : Target.Base, rolesB, s.b.baseHp, p);
    const bOnA = engage(strikeB ? strikeB.hps : [], strikeB ? strikeB.target : Target.Base, rolesA, s.a.baseHp, p);
    // Reassemble home pools. Surviving strikers retreat home for free (only the
    // approach costs time in this v1). Cross-wiring:
    //   - A's strikers were shot by B's defenders   -> aOnB.attackerSurvivors
    //   - A's defenders/harvesters were shot by B's strikers -> bOnA.def*
    aWorkers = [...aOnB.attackerSurvivors, ...bOnA.defDefenders, ...bOnA.defHarvesters];
    bWorkers = [...bOnA.attackerSurvivors, ...aOnB.defDefenders, ...aOnB.defHarvesters];
    aBase = bOnA.defBaseHp; // A's base was hit by B's strikers
    bBase = aOnB.defBaseHp;
    aHarv = bOnA.defHarvesters.length;
    bHarv = aOnB.defHarvesters.length;
  }

  const a: PlayerState = {
    minerals: Math.min(p.mineralCap, s.a.minerals + aHarv * p.income),
    workers: aWorkers,
    baseHp: aBase,
    buildTimer: s.a.buildTimer,
    inbound: raidA.marching,
  };
  const b: PlayerState = {
    minerals: Math.min(p.mineralCap, s.b.minerals + bHarv * p.income),
    workers: bWorkers,
    baseHp: bBase,
    buildTimer: s.b.buildTimer,
    inbound: raidB.marching,
  };

  // Production: finish anything in the queue, then optionally start a new one.
  advanceBuild(a, actA, p);
  advanceBuild(b, actB, p);

  return { turn: s.turn + 1, a, b };
};

const advanceBuild = (me: PlayerState, act: Action, p: Params): void => {
  if (me.buildTimer === 0) {
    me.workers.push(p.workerHp);
    me.buildTimer = -1;
  } else if (me.buildTimer > 0) {
    me.buildTimer -= 1;
  }
  if (act.build && me.buildTimer < 0 && me.minerals >= p.workerCost && supply(me) < p.maxWorkers) {
    me.minerals -= p.workerCost;
    if (p.buildTime === 0) {
      me.workers.push(p.workerHp);
    } else {
      me.buildTimer = p.buildTime;
    }
  }
};

// ---------------------------------------------------------------------------
// Terminal test
// ---------------------------------------------------------------------------

/** From A's perspective: 1 A wins, -1 B wins, 0 draw, null = still live. */
export const outcome = (s: State, p: Params): Outcome => {
  const aDead = s.a.baseHp <= 0;
  const bDead = s.b.baseHp <= 0;
  if (aDead && bDead) return 0;
  if (bDead) return 1;
  if (aDead) return -1;
  if (s.turn >= p.horizon) return 0; // survived to the horizon -> draw
  return null;
};

// ---------------------------------------------------------------------------
// Canonical key (for oracle memoization). Workers are unordered, so we encode
// each pool as an HP histogram.
// ---------------------------------------------------------------------------

const hpHist = (hps: number[], maxHp: number): string => {
  const hist = new Array(maxHp + 1).fill(0);
  for (const hp of hps) hist[hp]++;
  return hist.join(',');
};

const poolKey = (ps: PlayerState, p: Params): string => {
  const raid = ps.inbound ? `${ps.inbound.eta}/${ps.inbound.target}/${hpHist(ps.inbound.hps, p.workerHp)}` : '-';
  return `${ps.minerals}:${hpHist(ps.workers, p.workerHp)}:${ps.baseHp}:${ps.buildTimer}:${raid}`;
};

export const stateKey = (s: State, p: Params): string =>
  `${s.turn}|${poolKey(s.a, p)}|${poolKey(s.b, p)}`;
