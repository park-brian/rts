// Production: structures with an in-progress unit count down and, on completion,
// spawn it and dequeue the next. Supply is derived by the census system, so this
// system does no supply bookkeeping. Race-agnostic: a produced *worker* (by role)
// auto-mines the nearest *resource* (by role).

import type { State } from '../../entity/world.ts';
import { NONE } from '../../entity/world.ts';
import { Kind } from '../../data.ts';
import { isPowered } from '../../mechanics/power.ts';
import { isLiftedStructureFlags } from '../../terran-mobility.ts';
import { activeAddonParentSlot, isAddonKind } from '../../mechanics/addons.ts';
import { tickLarvae } from './larva.ts';
import { assignRallyMoveSlots, type RallyMove } from './rally.ts';
import { finishInternalProductQueue } from './internal-products.ts';
import { finishEgg, finishProducedUnit } from './completion.ts';

export const production = (s: State): void => {
  const e = s.e;
  const rallyMoves: RallyMove[] = [];
  tickLarvae(s);
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.built[i] !== 1 || e.prodKind[i] === Kind.None) continue;
    if (e.kind[i] !== Kind.Egg && isLiftedStructureFlags(e.flags[i]!)) continue;
    if (isAddonKind(e.kind[i]!) && activeAddonParentSlot(s, i) === NONE) continue;
    if (!isPowered(s, i)) continue;
    if (e.prodTimer[i]! > 0) {
      e.prodTimer[i] = e.prodTimer[i]! - 1;
      if (e.prodTimer[i]! > 0) continue;
    }
    const kind = e.prodKind[i]!;
    if (finishInternalProductQueue(s, i, kind)) continue;
    if (e.kind[i] === Kind.Egg) {
      if (finishEgg(s, i, kind, rallyMoves)) continue;
      continue;
    }
    finishProducedUnit(s, i, kind, rallyMoves);
  }
  assignRallyMoveSlots(s, rallyMoves);
};
