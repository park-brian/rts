// Fog-limited observation for one player — the fair-play view a networked human or
// a neural-net policy sees (vs. fullState()'s god view used by scripted bots). The
// sim is deterministic and seeded, so observations are reproducible. This is the
// seam the RL env interface (docs/specs/ai-training.md) builds on.

import type { State } from './world.ts';
import { eid } from './world.ts';
import { Units, TILE } from './data.ts';
import { ONE } from './fixed.ts';
import { canDetect } from './detection.ts';
import { isContained } from './cargo.ts';

export type EntityView = {
  id: number; kind: number; owner: number;
  x: number; y: number; hp: number; built: number; order: number;
};

export type Observation = {
  tick: number;
  player: number;
  minerals: number;
  gas: number;
  supplyUsed: number;
  supplyMax: number;
  vision: Uint8Array; // 0 unseen, 1 explored, 2 visible (per tile)
  entities: EntityView[]; // own units always; others only on currently-visible tiles
};

export const observe = (s: State, player: number): Observation => {
  if (!s.trackVision) throw new Error('observe: vision tracking is disabled for this State');
  const e = s.e; const m = s.map; const W = m.w;
  const v = s.vision[player]!;
  const entities: EntityView[] = [];
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1) continue;
    const own = e.owner[i] === player;
    if (!own) {
      if (isContained(s, i)) continue;
      const tx = Math.floor(e.x[i]! / ONE / TILE);
      const ty = Math.floor(e.y[i]! / ONE / TILE);
      const visible = tx >= 0 && ty >= 0 && tx < W && ty < m.h && v[ty * W + tx] === 2;
      if (!visible) continue; // hidden by fog
      if (!canDetect(s, player, i)) continue; // visible cloak shimmer is not a targetable observation
    }
    entities.push({
      id: eid(e, i), kind: e.kind[i]!, owner: e.owner[i]!,
      x: e.x[i]!, y: e.y[i]!, hp: e.hp[i]!, built: e.built[i]!, order: e.order[i]!,
    });
  }
  return {
    tick: s.tick,
    player,
    minerals: s.players.minerals[player]!,
    gas: s.players.gas[player]!,
    supplyUsed: s.players.supplyUsed[player]!,
    supplyMax: s.players.supplyMax[player]!,
    vision: v.slice(),
    entities,
  };
};
