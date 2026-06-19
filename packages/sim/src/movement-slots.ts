import type { State } from './entity/world.ts';
import { Role, TILE } from './data.ts';
import { ONE } from './fixed.ts';
import { bodyBounds } from './spatial/geometry.ts';

export const GROUP_SLOT_SPACING = TILE * ONE;
const GROUP_SLOT_SPACING_STEP = GROUP_SLOT_SPACING >> 1;

export const usesGroundMoveSlot = (flags: number): boolean =>
  (flags & (Role.Worker | Role.Air)) === 0;

export const groupOffset = (rank: number, spacing: number): { x: number; y: number } => {
  if (rank <= 0) return { x: 0, y: 0 };
  let ring = 1;
  while ((2 * ring + 1) * (2 * ring + 1) <= rank) ring++;
  const side = 2 * ring;
  const pos = rank - (2 * ring - 1) * (2 * ring - 1);
  let gx = 0;
  let gy = 0;
  if (pos < side) {
    gx = -ring + 1 + pos;
    gy = -ring;
  } else if (pos < side * 2) {
    gx = ring;
    gy = -ring + 1 + (pos - side);
  } else if (pos < side * 3) {
    gx = ring - 1 - (pos - side * 2);
    gy = ring;
  } else {
    gx = -ring;
    gy = ring - 1 - (pos - side * 3);
  }
  return { x: gx * spacing, y: gy * spacing };
};

export const roundedGroupSpacing = (s: State, slots: readonly number[]): number => {
  let spacing = GROUP_SLOT_SPACING;
  for (const slot of slots) {
    const b = bodyBounds(s.e.kind[slot]!);
    const body = Math.max(b.left + b.right, b.up + b.down) + (GROUP_SLOT_SPACING_STEP >> 1);
    const rounded = Math.trunc((body + GROUP_SLOT_SPACING_STEP - 1) / GROUP_SLOT_SPACING_STEP) * GROUP_SLOT_SPACING_STEP;
    spacing = Math.max(spacing, rounded);
  }
  return spacing;
};
