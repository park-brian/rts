import type { Command } from './types.ts';
import { Kind, Units, hasAnyWeapon, weaponForTarget } from '../data.ts';
import { isPowered } from '../power.ts';
import { canUseWeaponNow } from '../burrow.ts';
import { carrierCanAttack } from '../interceptor.ts';
import { hasWeaponMechanicAmmo, weaponMechanicDef } from '../weapon-mechanics.ts';
import type { State } from '../entity/world.ts';
import { isAlive, slotOf } from '../entity/world.ts';
import { canReceiveOrder, canTargetEntity, reject, type CommandValidation } from './shared.ts';

type AttackCommand = Extract<Command, { t: 'attack' }>;

export const validateAttackCommand = (s: State, player: number, command: AttackCommand): CommandValidation => {
  const e = s.e;
  const actor = canReceiveOrder(s, player, command.unit);
  if (!actor.ok) return actor;
  const slot = actor.slot;
  if (!isPowered(s, slot)) return reject('missing-capability');
  if (e.kind[slot] === Kind.SpiderMine) return reject('missing-capability');
  const attacker = Units[e.kind[slot]!]!;
  const mechanic = weaponMechanicDef(e.kind[slot]!);
  const carrierAttack = e.kind[slot] === Kind.Carrier && isAlive(e, command.target) && carrierCanAttack(s, slot, slotOf(command.target));
  if (!hasAnyWeapon(attacker) && !carrierAttack) return reject('missing-capability');
  if (!canUseWeaponNow(s, slot)) return reject('missing-capability');
  if (!hasWeaponMechanicAmmo(s, slot, mechanic)) return reject('target-not-allowed');
  const targetResult = canTargetEntity(s, player, command.target, { team: 'enemy', requireDetection: true });
  if (!targetResult.ok) return targetResult;
  const target = targetResult.slot;
  if (!carrierAttack && !weaponForTarget(attacker, Units[e.kind[target]!]!)) return reject('target-not-allowed');
  return { ok: true };
};
