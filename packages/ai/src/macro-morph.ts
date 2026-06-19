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
import type { BotFailureReason } from './macro-intents.ts';

const ZERG_UNIQUE_MORPH_MACRO = [
  { from: Kind.Hatchery, to: Kind.Lair, satisfiedBy: [Kind.Lair, Kind.Hive] },
  { from: Kind.Lair, to: Kind.Hive, satisfiedBy: [Kind.Hive] },
  { from: Kind.Spire, to: Kind.GreaterSpire, satisfiedBy: [Kind.GreaterSpire] },
] as const;

const ZERG_REPEATABLE_MORPH_MACRO = [
  { from: Kind.Hydralisk, to: Kind.Lurker },
] as const;

const ALL_ZERG_UNIQUE_MORPHS = (1 << ZERG_UNIQUE_MORPH_MACRO.length) - 1;

export type MorphBlock = {
  kind: number;
  reason: BotFailureReason;
};

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
): { queued: boolean; block?: MorphBlock } => {
  const def = Units[kind]!;
  if (budget.minerals < def.minerals || budget.gas < def.gas) {
    return { queued: false, block: { kind, reason: 'resource-starved' } };
  }
  const command: Command = { t: 'transform', unit: eid(s.e, slot), kind };
  const validation = validateCommand(s, player, command);
  if (!validation.ok) {
    switch (validation.reason) {
      case 'not-affordable':
        return { queued: false, block: { kind, reason: 'resource-starved' } };
      case 'missing-requirement':
      case 'target-not-allowed':
        return { queued: false, block: { kind, reason: 'missing-prerequisite' } };
      case 'supply-blocked':
        return { queued: false, block: { kind, reason: 'supply-blocked' } };
      case 'queue-full':
      case 'capacity-full':
      case 'incomplete-producer':
      case 'missing-capability':
        return { queued: false, block: { kind, reason: 'no-production-capacity' } };
      default:
        return { queued: false, block: { kind, reason: 'missing-prerequisite' } };
    }
  }
  cmds.push(command);
  budget.minerals -= def.minerals;
  budget.gas -= def.gas;
  return { queued: true };
};

export const maybeQueueZergMorphs = (
  s: State,
  player: number,
  faction: Faction,
  cmds: Command[],
  budget: ResourceBudget,
): MorphBlock | null => {
  if (faction.name !== 'Zerg') return null;
  const e = s.e;
  let uniqueMorphs = 0;
  let repeatableMorphStarted = false;
  let firstBlock: MorphBlock | null = null;

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
      const result = maybeQueueTransform(s, player, cmds, budget, i, morph.to);
      if (result.queued) uniqueMorphs |= zergUniqueMorphMask(morph.to);
      else firstBlock ??= result.block ?? null;
      break;
    }
    for (const morph of ZERG_REPEATABLE_MORPH_MACRO) {
      if (repeatableMorphStarted || kind !== morph.from) continue;
      const result = maybeQueueTransform(s, player, cmds, budget, i, morph.to);
      repeatableMorphStarted = result.queued;
      if (!result.queued) firstBlock ??= result.block ?? null;
    }
    if (uniqueMorphs === ALL_ZERG_UNIQUE_MORPHS && repeatableMorphStarted) return null;
  }
  return firstBlock;
};
