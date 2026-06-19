import type { Command, CommandRejectReason } from './commands.ts';
import { Role, Units } from './data.ts';
import { addonParentKind, addonPosition, isAddonKind } from './addon.ts';
import { canSpawnEntity, isAlive, NONE, slotOf } from './world.ts';
import type { State } from './world.ts';
import { isLiftedStructureFlags } from './terran-mobility.ts';
import { requirementsMet } from './requirements.ts';
import { placementForStructure } from './placement.ts';

type CommandValidation =
  | { ok: true }
  | { ok: false; reason: CommandRejectReason };

type AddonCommand = Extract<Command, { t: 'addon' }>;

const reject = (reason: CommandRejectReason): CommandValidation => ({ ok: false, reason });

const ownedSlot = (s: State, id: number, player: number): number | null => {
  const e = s.e;
  if (!isAlive(e, id)) return null;
  const slot = slotOf(id);
  return e.owner[slot] === player ? slot : null;
};

export const validateAddonCommand = (s: State, player: number, command: AddonCommand): CommandValidation => {
  const e = s.e;
  const slot = ownedSlot(s, command.building, player);
  if (slot === null) return isAlive(e, command.building) ? reject('wrong-owner') : reject('stale-entity');
  if ((e.flags[slot]! & Role.Structure) === 0 || e.built[slot] !== 1) return reject('incomplete-producer');
  if (isLiftedStructureFlags(e.flags[slot]!)) return reject('missing-capability');
  const def = Units[command.kind];
  if (!def || !isAddonKind(command.kind) || addonParentKind(command.kind) !== e.kind[slot]) {
    return reject('target-not-allowed');
  }
  if (e.target[slot] !== NONE && isAlive(e, e.target[slot]!)) return reject('queue-full');
  if (!requirementsMet(s, player, def.requires)) return reject('missing-requirement');
  if (s.players.minerals[player]! < def.minerals || s.players.gas[player]! < def.gas) return reject('not-affordable');
  if (!canSpawnEntity(s)) return reject('capacity-full');
  const pos = addonPosition(s, slot, command.kind);
  const placement = placementForStructure(s, command.kind, pos.x, pos.y, NONE, player);
  return placement.ok ? { ok: true } : reject(placement.reason);
};
