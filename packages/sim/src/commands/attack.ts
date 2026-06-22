import type { Command } from './types.ts';
import { Units, weaponForTarget } from '../data/index.ts';
import { canQueueOrder, currentOrderIsIdle, enqueueAttackOrder, setCurrentAttackOrder } from '../entity/order-queue.ts';
import { isPowered } from '../mechanics/power.ts';
import { canUseWeaponNow } from '../mechanics/burrow.ts';
import { carrierCanAttack } from '../mechanics/interceptor.ts';
import { kindHasDirectWeapon } from '../mechanics/capabilities.ts';
import { hasWeaponMechanicAmmo, weaponMechanicDef } from '../mechanics/weapons.ts';
import type { State } from '../entity/world.ts';
import { isAlive, slotOf } from '../entity/world.ts';
import {
  canReceiveOrder,
  canTargetEntity,
  cancelPendingBeforeOrder,
  clearSettled,
  reject,
  type CommandValidation,
} from './shared.ts';

type AttackCommand = Extract<Command, { t: 'attack' }>;

export const validateAttackCommand = (s: State, player: number, command: AttackCommand): CommandValidation => {
  const e = s.e;
  const actor = canReceiveOrder(s, player, command.unit);
  if (!actor.ok) return actor;
  const slot = actor.slot;
  if (!isPowered(s, slot)) return reject('missing-capability');
  const attackerKind = e.kind[slot]!;
  const attacker = Units[attackerKind]!;
  const mechanic = weaponMechanicDef(attackerKind);
  const carrierAttack = isAlive(e, command.target) && carrierCanAttack(s, slot, slotOf(command.target));
  if (!kindHasDirectWeapon(attackerKind) && !carrierAttack) return reject('missing-capability');
  if (!canUseWeaponNow(s, slot)) return reject('missing-capability');
  if (!hasWeaponMechanicAmmo(s, slot, mechanic)) return reject('target-not-allowed');
  const targetResult = canTargetEntity(s, player, command.target, { team: 'enemy', requireDetection: true });
  if (!targetResult.ok) return targetResult;
  const target = targetResult.slot;
  if (!carrierAttack && !weaponForTarget(attacker, Units[e.kind[target]!]!)) return reject('target-not-allowed');
  if (command.queue === true && !currentOrderIsIdle(e, slot) && !canQueueOrder(e, slot)) return reject('queue-full');
  return { ok: true };
};

export const applyAttackCommand = (s: State, command: AttackCommand): void => {
  const slot = slotOf(command.unit);
  if (!command.queue) cancelPendingBeforeOrder(s, slot);
  clearSettled(s, slot);
  if (command.queue === true && !currentOrderIsIdle(s.e, slot)) {
    enqueueAttackOrder(s, slot, command.target);
    return;
  }
  setCurrentAttackOrder(s, slot, command.target);
};
