import { NONE, activeAddonParentSlot, slotOf, type State } from '@rts/sim';

export type ProducerReservations = Set<number>;

const linkedActiveAddonSlot = (s: State, slot: number): number => {
  const e = s.e;
  const target = e.target[slot]!;
  if (target === NONE) return NONE;
  const addon = slotOf(target);
  return addon >= 0 && addon < e.hi && activeAddonParentSlot(s, addon) === slot ? addon : NONE;
};

export const producerReserved = (s: State, reserved: ProducerReservations, slot: number): boolean => {
  if (reserved.has(slot)) return true;
  const parent = activeAddonParentSlot(s, slot);
  if (parent !== NONE && reserved.has(parent)) return true;
  const addon = linkedActiveAddonSlot(s, slot);
  return addon !== NONE && reserved.has(addon);
};

export const reserveProducer = (s: State, reserved: ProducerReservations, slot: number): void => {
  reserved.add(slot);
  const parent = activeAddonParentSlot(s, slot);
  if (parent !== NONE) reserved.add(parent);
  const addon = linkedActiveAddonSlot(s, slot);
  if (addon !== NONE) reserved.add(addon);
};
