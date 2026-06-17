import type { Assignment, GameState, Unit, UnitAction } from './types.ts';
import { ActionType, DIRS, Kind, NEUTRAL } from './types.ts';
import { def, HARVEST_AMOUNT } from './units.ts';

// Deterministic microRTS-style engine. Pure-ish: `step` returns a NEW state.
// Model: every frame, idle units may be assigned one durative action; the engine
// reserves cells, advances exactly one frame, and completes any action whose
// completion frame has arrived. No floats, no RNG; resolution order is by unit id
// so two runs of the same inputs are identical.

export const cloneState = (s: GameState): GameState => ({
  w: s.w, h: s.h, time: s.time, nextId: s.nextId,
  resources: [s.resources[0], s.resources[1]],
  units: s.units.map((u) => ({ ...u, busy: u.busy ? { action: u.busy.action, completeAt: u.busy.completeAt } : null })),
});

const inBounds = (s: GameState, x: number, y: number): boolean => x >= 0 && y >= 0 && x < s.w && y < s.h;

export const unitAt = (s: GameState, x: number, y: number): Unit | undefined =>
  s.units.find((u) => u.x === x && u.y === y);

// A cell is free if no unit stands on it AND no in-progress Move/Produce reserves
// it as a destination.
const cellFree = (s: GameState, x: number, y: number): boolean => {
  if (!inBounds(s, x, y)) return false;
  for (const u of s.units) {
    if (u.x === x && u.y === y) return false;
    const b = u.busy;
    if (b && (b.action.type === ActionType.Move || b.action.type === ActionType.Produce)) {
      const d = DIRS[(b.action as { dir: number }).dir]!;
      if (u.x + d.dx === x && u.y + d.dy === y) return false;
    }
  }
  return true;
};

export const idleUnits = (s: GameState, player: number): Unit[] =>
  s.units.filter((u) => u.owner === player && u.busy === null && u.kind !== Kind.Resource);

const dist2 = (a: Unit, b: Unit): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/** Legal actions for one (idle) unit, given the board — used by bots and search. */
export const legalActions = (s: GameState, u: Unit): UnitAction[] => {
  const d = def(u.kind);
  const out: UnitAction[] = [{ type: ActionType.None }];
  // Attacks: any enemy within range.
  if (d.damage > 0) {
    for (const t of s.units) {
      if (t.owner !== u.owner && t.owner !== NEUTRAL && dist2(u, t) <= d.attackRange ** 2) {
        out.push({ type: ActionType.Attack, targetId: t.id });
      }
    }
  }
  for (let dir = 0; dir < 4; dir++) {
    const nx = u.x + DIRS[dir]!.dx;
    const ny = u.y + DIRS[dir]!.dy;
    if (!inBounds(s, nx, ny)) continue;
    const occ = unitAt(s, nx, ny);
    if (d.canMove && cellFree(s, nx, ny)) out.push({ type: ActionType.Move, dir });
    if (d.canHarvest && u.carrying === 0 && occ && occ.kind === Kind.Resource && occ.carrying > 0) {
      out.push({ type: ActionType.Harvest, dir });
    }
    if (d.canHarvest && u.carrying > 0 && occ && occ.owner === u.owner && occ.kind === Kind.Base) {
      out.push({ type: ActionType.Return, dir });
    }
    if (cellFree(s, nx, ny)) {
      for (const kind of d.produces) {
        if (s.resources[u.owner as 0 | 1] >= def(kind).cost) out.push({ type: ActionType.Produce, dir, kind });
      }
    }
  }
  return out;
};

const durationOf = (u: Unit, a: UnitAction): number => {
  const d = def(u.kind);
  switch (a.type) {
    case ActionType.None: return 1;
    case ActionType.Move: return d.moveTime;
    case ActionType.Harvest: return d.harvestTime;
    case ActionType.Return: return d.returnTime;
    case ActionType.Attack: return d.attackTime;
    case ActionType.Produce: return def(a.kind).produceTime;
  }
};

// Assign one action to a unit if it is legal right now. Costs for Produce are
// paid at assignment (microRTS spends resources when production begins).
const assign = (s: GameState, u: Unit, a: UnitAction): boolean => {
  const d = def(u.kind);
  if (a.type === ActionType.Move) {
    if (!d.canMove) return false;
    const t = DIRS[a.dir]!;
    if (!cellFree(s, u.x + t.dx, u.y + t.dy)) return false;
  } else if (a.type === ActionType.Produce) {
    const t = DIRS[a.dir]!;
    if (!d.produces.includes(a.kind)) return false;
    if (!cellFree(s, u.x + t.dx, u.y + t.dy)) return false;
    const owner = u.owner as 0 | 1;
    if (s.resources[owner] < def(a.kind).cost) return false;
    s.resources[owner] -= def(a.kind).cost;
  } else if (a.type === ActionType.Harvest) {
    const t = DIRS[a.dir]!;
    const r = unitAt(s, u.x + t.dx, u.y + t.dy);
    if (!d.canHarvest || u.carrying > 0 || !r || r.kind !== Kind.Resource || r.carrying <= 0) return false;
  } else if (a.type === ActionType.Return) {
    const t = DIRS[a.dir]!;
    const b = unitAt(s, u.x + t.dx, u.y + t.dy);
    if (u.carrying <= 0 || !b || b.owner !== u.owner || b.kind !== Kind.Base) return false;
  } else if (a.type === ActionType.Attack) {
    const tgt = s.units.find((z) => z.id === a.targetId);
    if (d.damage <= 0 || !tgt || tgt.owner === u.owner || dist2(u, tgt) > d.attackRange ** 2) return false;
  }
  u.busy = { action: a, completeAt: s.time + durationOf(u, a) };
  return true;
};

// Complete one unit's NON-ATTACK action (attacks are resolved simultaneously in
// `step` so neither player gets a same-frame ordering advantage).
const completeNonAttack = (s: GameState, u: Unit, a: UnitAction): void => {
  if (a.type === ActionType.Move) {
    const t = DIRS[a.dir]!;
    if (cellFreeIgnoring(s, u.x + t.dx, u.y + t.dy, u.id)) {
      u.x += t.dx;
      u.y += t.dy;
    }
  } else if (a.type === ActionType.Harvest) {
    const t = DIRS[a.dir]!;
    const r = unitAt(s, u.x + t.dx, u.y + t.dy);
    if (r && r.kind === Kind.Resource && r.carrying > 0) {
      r.carrying -= HARVEST_AMOUNT;
      u.carrying += HARVEST_AMOUNT;
      if (r.carrying <= 0) s.units = s.units.filter((z) => z.id !== r.id);
    }
  } else if (a.type === ActionType.Return) {
    const t = DIRS[a.dir]!;
    const b = unitAt(s, u.x + t.dx, u.y + t.dy);
    if (b && b.owner === u.owner && b.kind === Kind.Base) {
      s.resources[u.owner as 0 | 1] += u.carrying;
      u.carrying = 0;
    }
  } else if (a.type === ActionType.Produce) {
    const t = DIRS[a.dir]!;
    const nx = u.x + t.dx;
    const ny = u.y + t.dy;
    if (cellFreeIgnoring(s, nx, ny, u.id)) {
      s.units.push({ id: s.nextId++, kind: a.kind, owner: u.owner, x: nx, y: ny, hp: def(a.kind).hp, carrying: 0, busy: null });
    }
    // (If blocked, the resources were already spent — a real microRTS quirk.)
  }
};

// Like cellFree but ignores a specific unit (the one arriving / producing there).
const cellFreeIgnoring = (s: GameState, x: number, y: number, ignoreId: number): boolean => {
  if (!inBounds(s, x, y)) return false;
  for (const u of s.units) {
    if (u.id === ignoreId) continue;
    if (u.x === x && u.y === y) return false;
  }
  return true;
};

/**
 * Advance one frame under simultaneous assignments. `a0`/`a1` are the action
 * sets for players 0 and 1 (only for their idle units). Returns a fresh state.
 */
export const step = (prev: GameState, a0: Assignment[], a1: Assignment[]): GameState => {
  const s = cloneState(prev);
  // 1. Assign new actions in a deterministic order (by unit id), so reservations
  //    made earlier in the frame are visible to later assignments.
  const all = [...a0, ...a1].sort((x, y) => x.unitId - y.unitId);
  for (const { unitId, action } of all) {
    const u = s.units.find((z) => z.id === unitId);
    if (u && u.busy === null && u.kind !== Kind.Resource) assign(s, u, action);
  }
  // 2. Advance time; complete anything finishing now.
  s.time += 1;
  const finishing = s.units.filter((u) => u.busy && u.busy.completeAt === s.time).sort((x, y) => x.id - y.id);
  // 2a. Accumulate attack damage SIMULTANEOUSLY (off start-of-frame state) so the
  //     resolution order can't favor a side — two units that kill each other this
  //     frame both die.
  const dmg = new Map<number, number>();
  for (const u of finishing) {
    const a = u.busy!.action;
    if (a.type === ActionType.Attack) {
      const tgt = s.units.find((z) => z.id === a.targetId);
      if (tgt) dmg.set(tgt.id, (dmg.get(tgt.id) ?? 0) + def(u.kind).damage);
    }
  }
  // 2b. Clear busy and apply non-attack completions in id order.
  for (const u of finishing) {
    const a = u.busy!.action;
    u.busy = null;
    if (a.type !== ActionType.Attack) completeNonAttack(s, u, a);
  }
  // 2c. Apply damage and remove the dead.
  for (const [tid, d] of dmg) {
    const t = s.units.find((z) => z.id === tid);
    if (t) t.hp -= d;
  }
  s.units = s.units.filter((u) => u.kind === Kind.Resource || u.hp > 0);
  return s;
};

export const livePlayerUnits = (s: GameState, p: number): Unit[] => s.units.filter((u) => u.owner === p);

/** 0 wins => 1, 1 wins => -1, draw/ongoing handled by caller via maxCycles. */
export const winner = (s: GameState, maxCycles: number): 0 | 1 | 'draw' | null => {
  const u0 = livePlayerUnits(s, 0).length;
  const u1 = livePlayerUnits(s, 1).length;
  if (u0 === 0 && u1 === 0) return 'draw';
  if (u1 === 0) return 0;
  if (u0 === 0) return 1;
  if (s.time >= maxCycles) {
    const val = (p: 0 | 1) => livePlayerUnits(s, p).reduce((t, u) => t + def(u.kind).cost, 0) + s.resources[p];
    const d = val(0) - val(1);
    return d > 0 ? 0 : d < 0 ? 1 : 'draw';
  }
  return null;
};

// Order-independent fingerprint of a state (for determinism tests).
export const hashState = (s: GameState): string => {
  const parts = s.units
    .map((u) => `${u.id}:${u.kind}:${u.owner}:${u.x},${u.y}:${u.hp}:${u.carrying}:${u.busy ? u.busy.completeAt : -1}`)
    .sort();
  return `${s.time}|${s.resources[0]},${s.resources[1]}|${parts.join('|')}`;
};
