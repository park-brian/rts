import type { Command } from './commands.ts';
import { Kind, Units } from './data.ts';
import { requirementsMet } from './requirements.ts';
import { getTechLevel } from './tech.ts';
import { mergePartnerFor, transformFor } from './unit-transform.ts';
import type { State } from './world.ts';
import { NONE } from './world.ts';
import { canPay, canReceiveOrder, reject, type CommandValidation } from './command-validation.ts';

type TransformCommand = Extract<Command, { t: 'transform' }>;

export const validateTransformCommand = (s: State, player: number, command: TransformCommand): CommandValidation => {
  const e = s.e;
  const actor = canReceiveOrder(s, player, command.unit, { rejectBurrowed: true, rejectIllusion: true });
  if (!actor.ok) return actor;
  const slot = actor.slot;

  const transform = transformFor(e.kind[slot]!, command.kind);
  if (!transform) return reject('target-not-allowed');
  if (transform.tech !== undefined && getTechLevel(s, player, transform.tech) <= 0) return reject('missing-requirement');

  if (transform.mode === 'merge') {
    if (mergePartnerFor(s, slot, command.kind, command.target ?? NONE) === NONE) return reject('target-not-allowed');
  }
  if (transform.mode === 'morph') {
    const def = Units[command.kind]!;
    const source = Units[e.kind[slot]!]!;
    if (!requirementsMet(s, player, def.requires)) return reject('missing-requirement');
    if (e.prodKind[slot] !== Kind.None || e.researchKind[slot] !== Kind.None) return reject('queue-full');
    const payment = canPay(s, player, { minerals: def.minerals, gas: def.gas });
    if (!payment.ok) return payment;
    const supplyDelta = def.supply - source.supply;
    if (supplyDelta > 0 && s.players.supplyUsed[player]! + supplyDelta > s.players.supplyMax[player]!) return reject('supply-blocked');
  }
  return { ok: true };
};
