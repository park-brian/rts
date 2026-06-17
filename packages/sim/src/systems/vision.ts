// Fog of war: per-player tile visibility, recomputed each tick from unit sight.
// 0 = unseen, 1 = explored (seen before, now fogged), 2 = currently visible.
// Derived state (not hashed): drives observe()/rendering, never the simulation, so
// scripted bots keep their god view and determinism is unaffected. Opt-in per Sim
// (`vision:true`) — headless throughput skips it.
//
// Perf: instead of clearing the whole map each tick (O(players·map)), we track the
// set of tiles each player saw last tick and downgrade just those. The per-State
// lists live in a WeakMap (transient); a fork rebuilds them from its vision grid.

import type { State } from '../world.ts';
import { EffectKind, Units, TILE } from '../data.ts';
import { ONE } from '../fixed.ts';
import { effectiveSight } from './status.ts';
import { isContained } from '../cargo.ts';

const seenByState = new WeakMap<State, number[][]>();

const revealCircle = (s: State, player: number, x: number, y: number, sight: number, list: number[]): void => {
  const m = s.map;
  const W = m.w;
  const v = s.vision[player]!;
  const tx = Math.floor(x / ONE / TILE);
  const ty = Math.floor(y / ONE / TILE);
  const r2 = sight * sight;
  for (let dy = -sight; dy <= sight; dy++) {
    const yy = ty + dy; if (yy < 0 || yy >= m.h) continue;
    for (let dx = -sight; dx <= sight; dx++) {
      const xx = tx + dx; if (xx < 0 || xx >= W) continue;
      if (dx * dx + dy * dy > r2) continue;
      const t = yy * W + xx;
      if (v[t] !== 2) { v[t] = 2; list.push(t); }
    }
  }
};

export const vision = (s: State): void => {
  const e = s.e;
  const np = s.players.minerals.length;

  let lists = seenByState.get(s);
  if (!lists) {
    // First run (or after a clone/restore): seed from the current grid.
    lists = [];
    for (let p = 0; p < np; p++) {
      const v = s.vision[p]!; const l: number[] = [];
      for (let t = 0; t < v.length; t++) if (v[t] === 2) l.push(t);
      lists.push(l);
    }
    seenByState.set(s, lists);
  }

  for (let p = 0; p < np; p++) {
    const v = s.vision[p]!; const l = lists[p]!;
    for (let k = 0; k < l.length; k++) if (v[l[k]!] === 2) v[l[k]!] = 1; // visible → explored
    l.length = 0;
  }

  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || isContained(s, i)) continue;
    const owner = e.owner[i]!;
    if (owner >= np) continue; // neutrals grant no vision
    const sight = effectiveSight(s, e, i, Units[e.kind[i]!]?.sight ?? 0);
    if (sight <= 0) continue;
    revealCircle(s, owner, e.x[i]!, e.y[i]!, sight, lists[owner]!);
  }

  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || isContained(s, i)) continue;
    const owner = e.parasiteOwner[i]!;
    if (owner >= np) continue;
    const sight = effectiveSight(s, e, i, Units[e.kind[i]!]?.sight ?? 0);
    if (sight > 0) revealCircle(s, owner, e.x[i]!, e.y[i]!, sight, lists[owner]!);
  }

  const fx = s.effects;
  for (let i = 0; i < fx.hi; i++) {
    if (fx.alive[i] !== 1 || fx.kind[i] !== EffectKind.ScannerSweep || fx.owner[i] >= np) continue;
    const radiusTiles = Math.ceil(fx.radius[i]! / (TILE * ONE));
    if (radiusTiles > 0) {
      revealCircle(s, fx.owner[i]!, fx.x[i]!, fx.y[i]!, radiusTiles, lists[fx.owner[i]!]!);
    }
  }
};
