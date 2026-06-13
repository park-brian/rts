// A minimal scripted controller: keep command centers producing SCVs whenever
// affordable and supply allows. This is the seed of the hardcoded AI (economy
// manager) described in docs/specs/ai-training.md §4, and the demonstrator we'll
// later behavior-clone from. It reads god-view state for now.

import { Kind, Units, eid, type State, type Command } from '@rts/sim';

export const macroBot = (s: State, player: number): Command[] => {
  const cmds: Command[] = [];
  const e = s.e;
  const scv = Units[Kind.SCV]!;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.kind[i] !== Kind.CommandCenter || e.owner[i] !== player) continue;
    if (e.prodKind[i] !== Kind.None) continue;
    if (s.players.minerals[player]! < scv.minerals) continue;
    if (s.players.supplyUsed[player]! + scv.supply > s.players.supplyMax[player]!) continue;
    cmds.push({ t: 'train', building: eid(e, i), kind: Kind.SCV });
  }
  return cmds;
};
