// Census: derive each player's supply used/cap from the entities themselves, so
// there's no incremental bookkeeping to drift. Race-agnostic — it reads `supply`
// and `provides` from defs. In-progress production reserves supply (prevents
// over-queueing past the cap), matching SC1.

import type { State } from '../entity/world.ts';
import { Units, Kind, SUPPLY_CAP, productionCount } from '../data.ts';

export const census = (s: State): void => {
  const p = s.players;
  const e = s.e;
  const n = p.supplyUsed.length;
  p.supplyUsed.fill(0);
  p.supplyMax.fill(0);

  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1) continue;
    const owner = e.owner[i]!;
    if (owner >= n) continue; // neutral
    const d = Units[e.kind[i]!];
    if (!d) continue;
    if (e.illusion[i] !== 1) p.supplyUsed[owner] = p.supplyUsed[owner]! + d.supply;
    if (e.built[i] === 1 && e.illusion[i] !== 1) p.supplyMax[owner] = p.supplyMax[owner]! + d.provides;
    if (e.prodKind[i] !== Kind.None) {
      const pd = Units[e.prodKind[i]!];
      if (pd) p.supplyUsed[owner] = p.supplyUsed[owner]! + pd.supply * productionCount(e.prodKind[i]!) * (1 + e.prodQueued[i]!);
    }
  }
  for (let j = 0; j < n; j++) {
    if (p.supplyMax[j]! > SUPPLY_CAP) p.supplyMax[j] = SUPPLY_CAP;
  }
};
