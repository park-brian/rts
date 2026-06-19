import type { Command, CommandRejectReason } from './commands.ts';
import { Kind, Units, hasAnyWeapon, weaponForTarget } from './data.ts';
import { isContained } from './cargo.ts';
import { isPowered } from './power.ts';
import { canDetect } from './detection.ts';
import { canUseWeaponNow } from './burrow.ts';
import { carrierCanAttack } from './interceptor.ts';
import { isDisabled } from './systems/status.ts';
import { hasWeaponMechanicAmmo, weaponMechanicDef } from './weapon-mechanics.ts';
import type { State } from './world.ts';
import { isAlive, isEnemy, slotOf } from './world.ts';

type CommandValidation =
  | { ok: true }
  | { ok: false; reason: CommandRejectReason };

type AttackCommand = Extract<Command, { t: 'attack' }>;

const reject = (reason: CommandRejectReason): CommandValidation => ({ ok: false, reason });

const ownedSlot = (s: State, id: number, player: number): number | null => {
  const e = s.e;
  if (!isAlive(e, id)) return null;
  const slot = slotOf(id);
  return e.owner[slot] === player ? slot : null;
};

export const validateAttackCommand = (s: State, player: number, command: AttackCommand): CommandValidation => {
  const e = s.e;
  const slot = ownedSlot(s, command.unit, player);
  if (slot === null) return isAlive(e, command.unit) ? reject('wrong-owner') : reject('stale-entity');
  if (isContained(s, slot)) return reject('missing-capability');
  if (isDisabled(e, slot)) return reject('missing-capability');
  if (e.built[slot] !== 1) return reject('missing-capability');
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
