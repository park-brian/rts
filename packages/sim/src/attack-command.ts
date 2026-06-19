import type { Command } from './commands.ts';
import { Kind, Units, hasAnyWeapon, weaponForTarget } from './data.ts';
import { isContained } from './cargo.ts';
import { isPowered } from './power.ts';
import { canDetect } from './detection.ts';
import { canUseWeaponNow } from './burrow.ts';
import { carrierCanAttack } from './interceptor.ts';
import { hasWeaponMechanicAmmo, weaponMechanicDef } from './weapon-mechanics.ts';
import type { State } from './world.ts';
import { isAlive, isEnemy, slotOf } from './world.ts';
import { canReceiveOrder, reject, type CommandValidation } from './command-validation.ts';

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
  if (!isAlive(e, command.target)) return reject('target-not-found');
  const target = slotOf(command.target);
  if (isContained(s, target)) return reject('target-not-allowed');
  if (!isEnemy(s, player, e.owner[target]!)) return reject('target-not-allowed');
  if (!canDetect(s, player, target)) return reject('target-not-allowed');
  if (!carrierAttack && !weaponForTarget(attacker, Units[e.kind[target]!]!)) return reject('target-not-allowed');
  return { ok: true };
};
