// A complete hardcoded AI in the spirit of docs/specs/ai-training.md §4: economy
// (workers + supply), tech (army structures), production (pump army), and military
// (attack in waves at the enemy, defend the base when threatened). God-vision,
// deterministic (no RNG), faction-driven. This is both the built-in opponent and
// the demonstrator we'll behavior-clone from later.

import {
  Role, Order, Kind, Units, buildable, tileX, tileY, eid, isEnemy, nearest,
  NONE, TILE, SUPPLY_CAP, type Faction, type State, type Command, type Controller,
} from '@rts/sim';
import { fx, ONE, isqrt } from '@rts/sim';

export type BotConfig = {
  workerTarget?: number; // omit to auto-derive from the base's mineral-patch count
  barracksTarget: number;
  attackThreshold: number; // army size that triggers an attack wave
};

const DEFAULT: Omit<BotConfig, 'workerTarget'> = { barracksTarget: 3, attackThreshold: 12 };
const WORKERS_PER_PATCH = 2; // efficient saturation: patches are continuously mined ~2 deep

const px = (tile: number): number => tile * TILE * ONE + ((TILE * ONE) >> 1);

/** Find a buildable, reasonably clear tile near (bx,by) for a structure. */
const findSpot = (s: State, bx: number, by: number): { x: number; y: number } | null => {
  const m = s.map;
  const btx = tileX(bx);
  const bty = tileY(by);
  for (let r = 3; r <= 14; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // ring only
        const tx = btx + dx;
        const ty = bty + dy;
        if (!buildable(m, tx, ty) || !buildable(m, tx + 1, ty) || !buildable(m, tx, ty + 1)) continue;
        const cx = px(tx);
        const cy = px(ty);
        // keep clear of existing structures
        const near = nearest(s, cx, cy, (sl) => (s.e.flags[sl]! & Role.Structure) !== 0);
        if (near !== NONE) {
          const ddx = s.e.x[near]! - cx;
          const ddy = s.e.y[near]! - cy;
          if (ddx * ddx + ddy * ddy < fx(56) * fx(56)) continue;
        }
        return { x: cx, y: cy };
      }
    }
  }
  return null;
};

export const createBot = (faction: Faction, cfg: Partial<BotConfig> = {}): Controller => {
  const c = { ...DEFAULT, ...cfg };
  const workerDef = Units[faction.worker]!;
  const armyDef = Units[faction.armyUnit]!;
  const depotDef = Units[faction.depot]!;
  const supplyDef = Units[faction.supplyStructure]!;
  const rax = Units[faction.armyStructure]!;

    return (s: State, p: number): Command[] => {
    const e = s.e;
    const cmds: Command[] = [];

    // Single pass to read our economy + army + an enemy near our base.
    let depot = NONE; // first built depot
    let workers = 0;
    let idleDepots: number[] = [];
    let builtBarracks: number[] = [];
    let pendingBarracks = 0;
    let pendingSupply = 0;
    let army = 0;
    const idleArmy: number[] = [];
    let aWorker = NONE; // a worker we can pull to build

    for (let i = 0; i < e.hi; i++) {
      if (e.alive[i] !== 1 || e.owner[i] !== p) continue;
      const k = e.kind[i]!;
      const fl = e.flags[i]!;
      if (k === faction.worker) {
        workers++;
        if (aWorker === NONE && e.order[i] === Order.Harvest) aWorker = i;
        if ((fl & Role.Worker) !== 0 && e.buildKind[i] === faction.supplyStructure) pendingSupply++;
        if ((fl & Role.Worker) !== 0 && e.buildKind[i] === faction.armyStructure) pendingBarracks++;
      } else if (k === faction.armyUnit) {
        army++;
        if (e.order[i] === Order.Idle) idleArmy.push(i);
      } else if (k === faction.depot && e.built[i] === 1) {
        if (depot === NONE) depot = i;
        if (e.prodKind[i] === Kind.None) idleDepots.push(i);
      } else if (k === faction.armyStructure) {
        if (e.built[i] === 1) builtBarracks.push(i);
        else pendingBarracks++;
      } else if (k === faction.supplyStructure && e.built[i] !== 1) {
        pendingSupply++;
      }
    }
    if (depot === NONE) return cmds; // no base: nothing to do

    const minerals = s.players.minerals[p]!;
    const used = s.players.supplyUsed[p]!;
    const cap = s.players.supplyMax[p]!;
    const room = (need: number): boolean => used + need <= cap;

    // Worker target: derived from how many patches this base can mine (income now
    // saturates at ~WORKERS_PER_PATCH each, so over-building workers is wasted supply).
    let patches = 0;
    for (let i = 0; i < e.hi; i++) {
      if (e.alive[i] === 1 && (e.flags[i]! & Role.Resource) !== 0 && withinTiles(s, i, e.x[depot]!, e.y[depot]!, 14)) patches++;
    }
    const workerTarget = c.workerTarget ?? Math.max(8, Math.min(24, patches * WORKERS_PER_PATCH + 2));

    // Rally barracks to a staging point toward the centre so produced units form up
    // in the open instead of jamming the production exit (ground units now collide).
    if (builtBarracks.length) {
      const cxFx = Math.trunc((s.map.w * TILE * ONE) / 2);
      const cyFx = Math.trunc((s.map.h * TILE * ONE) / 2);
      const dx = cxFx - e.x[depot]!; const dy = cyFx - e.y[depot]!;
      const d = isqrt(dx * dx + dy * dy) || 1;
      const stage = 5 * TILE * ONE;
      const sx = e.x[depot]! + Math.trunc((dx * stage) / d);
      const sy = e.y[depot]! + Math.trunc((dy * stage) / d);
      for (const b of builtBarracks) if (e.rallyX[b]! < 0) cmds.push({ t: 'rally', building: eid(e, b), x: sx, y: sy });
    }

    // 1) Workers from idle depots.
    for (const d of idleDepots) {
      if (workers < workerTarget && minerals >= workerDef.minerals && room(workerDef.supply)) {
        cmds.push({ t: 'train', building: eid(e, d), kind: faction.worker });
      }
    }

    // 2) Supply when nearly capped.
    if (cap < SUPPLY_CAP && cap - used <= 2 && pendingSupply === 0 && minerals >= supplyDef.minerals && aWorker !== NONE) {
      const spot = findSpot(s, e.x[depot]!, e.y[depot]!);
      if (spot) cmds.push({ t: 'build', unit: eid(e, aWorker), kind: faction.supplyStructure, x: spot.x, y: spot.y });
    }

    // 3) Army structures.
    else if (builtBarracks.length + pendingBarracks < c.barracksTarget && minerals >= rax.minerals && aWorker !== NONE) {
      const spot = findSpot(s, e.x[depot]!, e.y[depot]!);
      if (spot) cmds.push({ t: 'build', unit: eid(e, aWorker), kind: faction.armyStructure, x: spot.x, y: spot.y });
    }

    // 4) Pump army from idle barracks.
    for (const b of builtBarracks) {
      if (e.prodKind[b] === Kind.None && minerals >= armyDef.minerals && room(armyDef.supply)) {
        cmds.push({ t: 'train', building: eid(e, b), kind: faction.armyUnit });
      }
    }

    // 5) Defense: enemy near our base -> idle army engages the nearest enemy.
    const threat = nearest(s, e.x[depot]!, e.y[depot]!, (sl) => isEnemy(s, p, e.owner[sl]!) && withinTiles(s, sl, e.x[depot]!, e.y[depot]!, 18));
    if (threat !== NONE) {
      for (const a of idleArmy) cmds.push({ t: 'attack', unit: eid(e, a), target: eid(e, threat) });
    } else if (army >= c.attackThreshold) {
      // 6) Offense: send idle army to the nearest enemy structure (else any enemy).
      let tgt = nearest(s, e.x[depot]!, e.y[depot]!, (sl) => isEnemy(s, p, e.owner[sl]!) && (e.flags[sl]! & Role.Structure) !== 0);
      if (tgt === NONE) tgt = nearest(s, e.x[depot]!, e.y[depot]!, (sl) => isEnemy(s, p, e.owner[sl]!));
      if (tgt !== NONE) {
        for (const a of idleArmy) cmds.push({ t: 'amove', unit: eid(e, a), x: e.x[tgt]!, y: e.y[tgt]! });
      }
    }

    return cmds;
  };
};

const withinTiles = (s: State, slot: number, x: number, y: number, t: number): boolean => {
  const dx = s.e.x[slot]! - x;
  const dy = s.e.y[slot]! - y;
  const r = t * TILE * ONE;
  return dx * dx + dy * dy <= r * r;
};
