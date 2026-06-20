import { Order } from '../../data/index.ts';
import { isContained, loadUnitInto, withinLoadRange } from '../../mechanics/cargo.ts';
import type { State } from '../../entity/world.ts';
import { eid, NONE } from '../../entity/world.ts';
import { groupOffset, roundedGroupSpacing, usesGroundMoveSlot } from '../../spatial/movement-slots.ts';
import { issueTravelOrder } from '../../commands/travel.ts';
import { producedUnitRallyIntent } from '../../commands/intent.ts';
import { pickPatch } from '../../mechanics/resources.ts';

export type RallyMove = { slot: number; owner: number; order: number; x: number; y: number };

const rallyMoveKey = (move: Pick<RallyMove, 'owner' | 'order' | 'x' | 'y'>): string =>
  `${move.owner}:${move.order}:${move.x}:${move.y}`;

/** Direct a freshly produced unit per its producer's rally (default worker = auto-mine). */
export const applySpawnRally = (
  s: State,
  producer: number,
  slot: number,
  owner: number,
  speed: number,
  rallyMoves: RallyMove[],
): void => {
  const e = s.e;
  e.settled[slot] = 0;
  const intent = producedUnitRallyIntent(s, producer, slot);
  if (intent.kind === 'gather-target') {
    e.order[slot] = Order.Harvest;
    e.target[slot] = eid(e, intent.target);
  } else if (intent.kind === 'gather-near') {
    const patch = pickPatch(s, slot, owner, speed, intent.x, intent.y);
    if (patch !== NONE) {
      e.order[slot] = Order.Harvest;
      e.target[slot] = eid(e, patch);
    }
  } else if (intent.kind === 'load') {
    if (withinLoadRange(s, intent.transport, slot)) {
      loadUnitInto(s, intent.transport, slot);
      return;
    }
    issueTravelOrder(s, slot, intent.endpoint, 'move');
  } else if (intent.kind === 'travel') {
    const issued = issueTravelOrder(s, slot, intent.endpoint, intent.intent);
    rallyMoves.push({ slot, owner, order: issued.order, x: issued.x, y: issued.y });
  }
};

const matchingGroupRank = (x: number, y: number, cx: number, cy: number, spacing: number, maxRank: number): number => {
  for (let rank = 0; rank <= maxRank; rank++) {
    const offset = groupOffset(rank, spacing);
    if (x === cx + offset.x && y === cy + offset.y) return rank;
  }
  return -1;
};

const reserveExistingRallyRanks = (
  s: State,
  move: RallyMove,
  spacing: number,
  fresh: ReadonlySet<number>,
  reserved: Set<number>,
): void => {
  const e = s.e;
  const maxRank = e.hi + fresh.size + 8;
  for (let i = 0; i < e.hi; i++) {
    if (fresh.has(i) || e.alive[i] !== 1 || e.owner[i] !== move.owner || isContained(s, i)) continue;
    if (e.order[i] !== move.order && e.order[i] !== Order.Idle) continue;
    if (!usesGroundMoveSlot(e.flags[i]!)) continue;
    const rank = matchingGroupRank(e.tx[i]!, e.ty[i]!, move.x, move.y, spacing, maxRank);
    if (rank >= 0) reserved.add(rank);
  }
};

export const assignRallyMoveSlots = (s: State, moves: readonly RallyMove[]): void => {
  if (moves.length === 0) return;
  const e = s.e;
  const groups = new Map<string, number[]>();
  const byKey = new Map<string, RallyMove>();
  for (const move of moves) {
    if (e.alive[move.slot] !== 1 || e.order[move.slot] !== move.order || !usesGroundMoveSlot(e.flags[move.slot]!)) continue;
    const key = rallyMoveKey(move);
    byKey.set(key, move);
    let group = groups.get(key);
    if (!group) {
      group = [];
      groups.set(key, group);
    }
    group.push(move.slot);
  }
  for (const [key, slots] of groups) {
    slots.sort((a, b) => a - b);
    const spacing = roundedGroupSpacing(s, slots);
    const fresh = new Set(slots);
    const reserved = new Set<number>();
    const move = byKey.get(key)!;
    reserveExistingRallyRanks(s, move, spacing, fresh, reserved);
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i]!;
      let rank = 0;
      while (reserved.has(rank)) rank++;
      reserved.add(rank);
      const offset = groupOffset(rank, spacing);
      e.tx[slot] = move.x + offset.x;
      e.ty[slot] = move.y + offset.y;
    }
  }
};
