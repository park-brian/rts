// Authoritative command and placement validation. Hosts may preflight with these
// helpers for UX, but ingestion remains the source of truth.

import type { Command, CommandRejectReason } from './types.ts';
import type { State } from '../entity/world.ts';
import { snapBuildAnchor, structureFootprint, type Footprint } from '../spatial/footprint.ts';
import { validateCommandSpec } from './specs.ts';
import { canPlaceStructure, placementForStructure, type PlacementResult } from '../mechanics/placement.ts';

export type { CommandRejectReason };
export { canPlaceStructure, placementForStructure, snapBuildAnchor, structureFootprint, type Footprint, type PlacementResult };
export { canWorkerStartStructure } from './build.ts';

export type CommandValidation =
  | { ok: true }
  | { ok: false; reason: CommandRejectReason };

export type ValidationContext = {
  reservedSupply?: number;
};

const reject = (reason: CommandRejectReason): CommandValidation => ({ ok: false, reason });
const playerExists = (s: State, player: number): boolean => player >= 0 && player < s.teams.length;

export const validateCommand = (
  s: State,
  player: number,
  c: Command,
  ctx: ValidationContext = {},
): CommandValidation => {
  if (!playerExists(s, player)) return reject('wrong-owner');
  return c.t === 'train'
    ? validateCommandSpec(s, player, c, { reservedSupply: ctx.reservedSupply })
    : validateCommandSpec(s, player, c);
};
