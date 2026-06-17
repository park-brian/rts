import type { Assignment, GameState, Unit, UnitAction } from './types.ts';
import { ActionType, Kind } from './types.ts';
import { idleUnits, legalActions, livePlayerUnits } from './game.ts';

// Scripted bots: (state, player) -> actions for that player's idle units.
// They build commands via legalActions so they never issue an illegal move.
export type Bot = (s: GameState, player: 0 | 1) => Assignment[];

const enemyOf = (p: 0 | 1): 0 | 1 => (p === 0 ? 1 : 0);
const dist2 = (ax: number, ay: number, bx: number, by: number) => (ax - bx) ** 2 + (ay - by) ** 2;

const enemyTarget = (s: GameState, p: 0 | 1): Unit | null => {
  const foes = livePlayerUnits(s, enemyOf(p));
  return foes.find((f) => f.kind === Kind.Base) ?? foes[0] ?? null;
};

// Best legal Move that reduces distance to (tx,ty); else null.
const moveToward = (s: GameState, u: Unit, tx: number, ty: number): UnitAction | null => {
  let best: UnitAction | null = null;
  let bestD = dist2(u.x, u.y, tx, ty);
  for (const a of legalActions(s, u)) {
    if (a.type !== ActionType.Move) continue;
    const dir = a.dir;
    const nx = u.x + [0, 1, 0, -1][dir]!;
    const ny = u.y + [-1, 0, 1, 0][dir]!;
    const d = dist2(nx, ny, tx, ty);
    if (d < bestD) { bestD = d; best = a; }
  }
  return best;
};

const firstOf = (s: GameState, u: Unit, type: number): UnitAction | null =>
  legalActions(s, u).find((a) => a.type === type) ?? null;

// Worker economy loop: harvest if able, else return if carrying, else walk to the
// nearest resource (or home base) to set up the loop.
const mine = (s: GameState, u: Unit): UnitAction => {
  if (u.carrying > 0) {
    const ret = firstOf(s, u, ActionType.Return);
    if (ret) return ret;
    const base = livePlayerUnits(s, u.owner as 0 | 1).find((z) => z.kind === Kind.Base);
    if (base) return moveToward(s, u, base.x, base.y) ?? { type: ActionType.None };
    return { type: ActionType.None };
  }
  const har = firstOf(s, u, ActionType.Harvest);
  if (har) return har;
  const res = s.units.filter((z) => z.kind === Kind.Resource).sort((a, b) => dist2(u.x, u.y, a.x, a.y) - dist2(u.x, u.y, b.x, b.y))[0];
  if (res) return moveToward(s, u, res.x, res.y) ?? { type: ActionType.None };
  return { type: ActionType.None };
};

// Attack the nearest enemy if in range, else advance on the enemy target.
const fight = (s: GameState, u: Unit, p: 0 | 1): UnitAction => {
  const atk = legalActions(s, u).filter((a) => a.type === ActionType.Attack);
  if (atk.length) {
    // focus the lowest-HP reachable enemy
    atk.sort((a, b) => {
      const ta = s.units.find((z) => z.id === (a as { targetId: number }).targetId)!;
      const tb = s.units.find((z) => z.id === (b as { targetId: number }).targetId)!;
      return ta.hp - tb.hp;
    });
    return atk[0]!;
  }
  const tgt = enemyTarget(s, p);
  return (tgt && moveToward(s, u, tgt.x, tgt.y)) ?? { type: ActionType.None };
};

const produceWorker = (s: GameState, base: Unit): UnitAction =>
  legalActions(s, base).find((a) => a.type === ActionType.Produce && (a as { kind: number }).kind === Kind.Worker) ?? { type: ActionType.None };

// Pure economy, never attacks — a punching bag / lower bound.
export const economyBot: Bot = (s, p) => {
  const out: Assignment[] = [];
  for (const u of idleUnits(s, p)) {
    if (u.kind === Kind.Base) out.push({ unitId: u.id, action: produceWorker(s, u) });
    else if (u.kind === Kind.Worker) out.push({ unitId: u.id, action: mine(s, u) });
    else out.push({ unitId: u.id, action: { type: ActionType.None } });
  }
  return out;
};

// Classic worker rush: keep `econWorkers` mining, pump workers from the base, and
// send every other worker at the enemy.
export const workerRush =
  (econWorkers = 1): Bot =>
  (s, p) => {
    const out: Assignment[] = [];
    const workers = livePlayerUnits(s, p).filter((u) => u.kind === Kind.Worker).sort((a, b) => a.id - b.id);
    const miners = new Set(workers.slice(0, econWorkers).map((u) => u.id));
    for (const u of idleUnits(s, p)) {
      if (u.kind === Kind.Base) out.push({ unitId: u.id, action: produceWorker(s, u) });
      else if (u.kind === Kind.Worker) out.push({ unitId: u.id, action: miners.has(u.id) ? mine(s, u) : fight(s, u, p) });
      else out.push({ unitId: u.id, action: fight(s, u, p) });
    }
    return out;
  };

export const BOTS: { name: string; bot: Bot }[] = [
  { name: 'workerRush', bot: workerRush(1) },
  { name: 'economy', bot: economyBot },
];
