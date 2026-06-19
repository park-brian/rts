import {
  Kind,
  NONE,
  Units,
  addonParentKind,
  eid,
  hasCompletedKind,
  validateCommand,
  type Command,
  type Faction,
  type State,
} from '@rts/sim';
import type { ResourceBudget } from './macro-build.ts';
import type { BotFailureReason } from './macro-intents.ts';
import { producerReserved, reserveProducer, type ProducerReservations } from './macro-producers.ts';

const TERRAN_ADDON_MACRO = [Kind.ComsatStation, Kind.MachineShop, Kind.ControlTower] as const;

const scienceFacilityAddon = (s: State, player: number): number =>
  hasCompletedKind(s, player, Kind.ControlTower) ? Kind.PhysicsLab : Kind.CovertOps;

const terranAddonMacro = (s: State, player: number): readonly number[] =>
  hasCompletedKind(s, player, Kind.CovertOps)
    ? [Kind.NuclearSilo, Kind.ComsatStation, Kind.MachineShop, Kind.ControlTower]
    : TERRAN_ADDON_MACRO;

export type AddonBlock = {
  kind: number;
  reason: BotFailureReason;
};

const maybeQueueAddon = (
  s: State,
  player: number,
  cmds: Command[],
  budget: ResourceBudget,
  kind: number,
  reserved?: ProducerReservations,
): boolean => {
  const e = s.e;
  const def = Units[kind]!;
  const parentKind = addonParentKind(kind);
  if (budget.minerals < def.minerals || budget.gas < def.gas) return false;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.owner[i] !== player || e.container[i] !== NONE || e.built[i] !== 1) continue;
    if (e.kind[i] !== parentKind) continue;
    if (reserved && producerReserved(s, reserved, i)) continue;
    const command: Command = { t: 'addon', building: eid(e, i), kind };
    if (!validateCommand(s, player, command).ok) continue;
    cmds.push(command);
    if (reserved) reserveProducer(s, reserved, i);
    budget.minerals -= def.minerals;
    budget.gas -= def.gas;
    return true;
  }
  return false;
};

const addonBlockReason = (
  s: State,
  player: number,
  budget: ResourceBudget,
  kind: number,
  reserved?: ProducerReservations,
): AddonBlock | null => {
  const e = s.e;
  const def = Units[kind]!;
  const parentKind = addonParentKind(kind);
  let sawParent = false;
  let sawAvailableParent = false;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.owner[i] !== player || e.container[i] !== NONE || e.kind[i] !== parentKind) continue;
    sawParent = true;
    if (e.built[i] !== 1 || (reserved && producerReserved(s, reserved, i))) continue;
    sawAvailableParent = true;
    if (budget.minerals < def.minerals || budget.gas < def.gas) return { kind, reason: 'resource-starved' };
    const result = validateCommand(s, player, { t: 'addon', building: eid(e, i), kind });
    if (result.ok) return null;
    switch (result.reason) {
      case 'not-affordable': return { kind, reason: 'resource-starved' };
      case 'missing-requirement': return { kind, reason: 'missing-prerequisite' };
      case 'placement-blocked':
      case 'placement-off-map':
        return { kind, reason: 'occupied-location' };
      case 'queue-full':
      case 'capacity-full':
      case 'incomplete-producer':
      case 'missing-capability':
        return { kind, reason: 'no-production-capacity' };
      default:
        break;
    }
  }
  if (!sawParent) return { kind, reason: 'missing-prerequisite' };
  return { kind, reason: sawAvailableParent ? 'missing-prerequisite' : 'no-production-capacity' };
};

export const maybeQueueTerranAddons = (
  s: State,
  player: number,
  faction: Faction,
  cmds: Command[],
  budget: ResourceBudget,
  reserved: ProducerReservations,
): AddonBlock | null => {
  if (faction.name !== 'Terran') return null;
  let firstBlock: AddonBlock | null = null;
  for (const kind of terranAddonMacro(s, player)) {
    if (maybeQueueAddon(s, player, cmds, budget, kind, reserved)) return null;
    firstBlock ??= addonBlockReason(s, player, budget, kind, reserved);
  }
  const scienceAddon = scienceFacilityAddon(s, player);
  if (maybeQueueAddon(s, player, cmds, budget, scienceAddon, reserved)) return null;
  firstBlock ??= addonBlockReason(s, player, budget, scienceAddon, reserved);
  return firstBlock;
};
