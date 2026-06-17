import {
  BUILD_RANGE, Kind, NONE, ONE, Order, Role, TILE, Units,
  eid, isAlive, isRepairableKind, slotOf, structureFootprint, type State,
} from './sim.ts';

export type WorkActivity = {
  worker: number;
  target: number;
  x: number;
  y: number;
  kind: 'build' | 'repair';
};

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

const distSqToRect = (x: number, y: number, x0: number, y0: number, x1: number, y1: number): number => {
  const dx = x < x0 ? x0 - x : x > x1 ? x - x1 : 0;
  const dy = y < y0 ? y0 - y : y > y1 ? y - y1 : 0;
  return dx * dx + dy * dy;
};

const structureWorkPoint = (s: State, worker: number, target: number): { x: number; y: number } => {
  const e = s.e;
  const fp = structureFootprint(e.kind[target]!, e.x[target]!, e.y[target]!);
  const tileFx = TILE * ONE;
  return {
    x: clamp(e.x[worker]!, fp.x0 * tileFx, (fp.x1 + 1) * tileFx),
    y: clamp(e.y[worker]!, fp.y0 * tileFx, (fp.y1 + 1) * tileFx),
  };
};

const unitWorkPoint = (s: State, worker: number, target: number): { x: number; y: number } => {
  const e = s.e;
  const r = Units[e.kind[target]!]!.radius;
  const dx = e.x[worker]! - e.x[target]!;
  const dy = e.y[worker]! - e.y[target]!;
  const len = Math.hypot(dx, dy) || 1;
  return {
    x: e.x[target]! + Math.trunc((dx / len) * r),
    y: e.y[target]! + Math.trunc((dy / len) * r),
  };
};

const nearBuildFootprint = (s: State, worker: number, target: number): boolean => {
  const e = s.e;
  const fp = structureFootprint(e.kind[target]!, e.x[target]!, e.y[target]!);
  const tileFx = TILE * ONE;
  return distSqToRect(
    e.x[worker]!,
    e.y[worker]!,
    fp.x0 * tileFx,
    fp.y0 * tileFx,
    (fp.x1 + 1) * tileFx,
    (fp.y1 + 1) * tileFx,
  ) <= BUILD_RANGE * BUILD_RANGE;
};

const withinRepairRange = (s: State, worker: number, target: number): boolean => {
  const e = s.e;
  const dx = e.x[worker]! - e.x[target]!;
  const dy = e.y[worker]! - e.y[target]!;
  return dx * dx + dy * dy <= BUILD_RANGE * BUILD_RANGE;
};

export const workActivities = (s: State, out: WorkActivity[] = []): WorkActivity[] => {
  const e = s.e;
  out.length = 0;
  for (let worker = 0; worker < e.hi; worker++) {
    if (e.alive[worker] !== 1 || e.container[worker] !== NONE) continue;
    if ((e.flags[worker]! & Role.Worker) === 0) continue;
    const targetId = e.target[worker]!;
    if (!isAlive(e, targetId)) continue;
    const target = slotOf(targetId);
    if (e.container[target] !== NONE) continue;

    if (e.order[worker] === Order.Build && e.buildKind[worker] === Kind.None) {
      if (e.built[target] === 1 || e.ctimer[target]! <= 0 || e.target[target] !== eid(e, worker)) continue;
      if (!nearBuildFootprint(s, worker, target)) continue;
      const p = structureWorkPoint(s, worker, target);
      out.push({ worker, target, x: p.x, y: p.y, kind: 'build' });
    } else if (e.order[worker] === Order.Repair) {
      const def = Units[e.kind[target]!];
      if (!def || e.built[target] !== 1 || !isRepairableKind(e.kind[target]!) || e.hp[target]! >= def.hp) continue;
      if (!withinRepairRange(s, worker, target)) continue;
      const p = (def.roles & Role.Structure) !== 0 ? structureWorkPoint(s, worker, target) : unitWorkPoint(s, worker, target);
      out.push({ worker, target, x: p.x, y: p.y, kind: 'repair' });
    }
  }
  return out;
};
