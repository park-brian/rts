import {
  Kind,
  NONE,
  Units,
  eid,
  validateCommand,
  type Command,
  type Faction,
  type State,
} from '@rts/sim';
import type { ResourceBudget } from './macro-build.ts';

const ZERG_UNIQUE_MORPH_MACRO = [
  { from: Kind.Hatchery, to: Kind.Lair, satisfiedBy: [Kind.Lair, Kind.Hive] },
  { from: Kind.Lair, to: Kind.Hive, satisfiedBy: [Kind.Hive] },
  { from: Kind.Spire, to: Kind.GreaterSpire, satisfiedBy: [Kind.GreaterSpire] },
] as const;

const ZERG_REPEATABLE_MORPH_MACRO = [
  { from: Kind.Hydralisk, to: Kind.Lurker },
] as const;

const ALL_ZERG_UNIQUE_MORPHS = (1 << ZERG_UNIQUE_MORPH_MACRO.length) - 1;

const zergUniqueMorphMask = (kind: number): number => {
  let mask = 0;
  for (let i = 0; i < ZERG_UNIQUE_MORPH_MACRO.length; i++) {
    for (const satisfiedKind of ZERG_UNIQUE_MORPH_MACRO[i]!.satisfiedBy) {
      if (kind === satisfiedKind) {
        mask |= 1 << i;
        break;
      }
    }
  }
  return mask;
};

const maybeQueueTransform = (
  s: State,
  player: number,
  cmds: Command[],
  budget: ResourceBudget,
  slot: number,
  kind: number,
): boolean => {
  const def = Units[kind]!;
  if (budget.minerals < def.minerals || budget.gas < def.gas) return false;
  const command: Command = { t: 'transform', unit: eid(s.e, slot), kind };
  if (!validateCommand(s, player, command).ok) return false;
  cmds.push(command);
  budget.minerals -= def.minerals;
  budget.gas -= def.gas;
  return true;
};

export const maybeQueueZergMorphs = (
  s: State,
  player: number,
  faction: Faction,
  cmds: Command[],
  budget: ResourceBudget,
): void => {
  if (faction.name !== 'Zerg') return;
  const e = s.e;
  let uniqueMorphs = 0;
  let repeatableMorphStarted = false;

  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.container[i] !== NONE || e.owner[i] !== player) continue;
    uniqueMorphs |= zergUniqueMorphMask(e.kind[i]!);
  }

  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.container[i] !== NONE || e.owner[i] !== player || e.built[i] !== 1) continue;
    const kind = e.kind[i]!;
    for (let m = 0; m < ZERG_UNIQUE_MORPH_MACRO.length; m++) {
      const morph = ZERG_UNIQUE_MORPH_MACRO[m]!;
      if ((uniqueMorphs & (1 << m)) !== 0 || kind !== morph.from) continue;
      if (maybeQueueTransform(s, player, cmds, budget, i, morph.to)) uniqueMorphs |= zergUniqueMorphMask(morph.to);
      break;
    }
    for (const morph of ZERG_REPEATABLE_MORPH_MACRO) {
      if (repeatableMorphStarted || kind !== morph.from) continue;
      repeatableMorphStarted = maybeQueueTransform(s, player, cmds, budget, i, morph.to);
    }
    if (uniqueMorphs === ALL_ZERG_UNIQUE_MORPHS && repeatableMorphStarted) return;
  }
};
