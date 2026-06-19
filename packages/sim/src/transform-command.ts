import type { Command } from './commands.ts';
import { Kind, Units } from './data.ts';
import { requirementsMet } from './requirements.ts';
import { getTechLevel } from './tech.ts';
import { isContained } from './cargo.ts';
import { isDisabled } from './systems/status.ts';
import { mergePartnerFor, transformFor } from './unit-transform.ts';
import type { State } from './world.ts';
import { NONE } from './world.ts';
import { reject, rejectMissingOwnedSlot, ownedSlot, type CommandValidation } from './command-validation.ts';

type TransformCommand = Extract<Command, { t: 'transform' }>;

export const validateTransformCommand = (s: State, player: number, command: TransformCommand): CommandValidation => {
  const e = s.e;
  const slot = ownedSlot(s, command.unit, player);
  if (slot === null) return rejectMissingOwnedSlot(s, command.unit);
  if (isContained(s, slot) || e.burrowed[slot] === 1 || e.illusion[slot] === 1) return reject('missing-capability');
  if (isDisabled(e, slot) || e.built[slot] !== 1) return reject('missing-capability');

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
    if (s.players.minerals[player]! < def.minerals || s.players.gas[player]! < def.gas) return reject('not-affordable');
    const supplyDelta = def.supply - source.supply;
    if (supplyDelta > 0 && s.players.supplyUsed[player]! + supplyDelta > s.players.supplyMax[player]!) return reject('supply-blocked');
  }
  return { ok: true };
};
