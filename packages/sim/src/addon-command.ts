import type { Command } from './commands.ts';
import { Role, Units } from './data.ts';
import { addonParentKind, addonPosition, isAddonKind } from './addon.ts';
import { canSpawnEntity, isAlive, NONE } from './world.ts';
import type { State } from './world.ts';
import { requirementsMet } from './requirements.ts';
import { placementForStructure } from './placement.ts';
import { canPay, canUseProducer, reject, type CommandValidation } from './command-validation.ts';

type AddonCommand = Extract<Command, { t: 'addon' }>;

export const validateAddonCommand = (s: State, player: number, command: AddonCommand): CommandValidation => {
  const e = s.e;
  const producer = canUseProducer(s, player, command.building, {
    role: Role.Structure,
    requireBuilt: true,
    rejectLifted: true,
    missingRoleReason: 'incomplete-producer',
  });
  if (!producer.ok) return producer;
  const { slot } = producer;
  const def = Units[command.kind];
  if (!def || !isAddonKind(command.kind) || addonParentKind(command.kind) !== e.kind[slot]) {
    return reject('target-not-allowed');
  }
  if (e.target[slot] !== NONE && isAlive(e, e.target[slot]!)) return reject('queue-full');
  if (!requirementsMet(s, player, def.requires)) return reject('missing-requirement');
  const payment = canPay(s, player, { minerals: def.minerals, gas: def.gas });
  if (!payment.ok) return payment;
  if (!canSpawnEntity(s)) return reject('capacity-full');
  const pos = addonPosition(s, slot, command.kind);
  const placement = placementForStructure(s, command.kind, pos.x, pos.y, NONE, player);
  return placement.ok ? { ok: true } : reject(placement.reason);
};
