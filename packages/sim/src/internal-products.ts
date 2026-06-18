import {
  CARRIER_INTERCEPTOR_CAPACITY, CARRIER_INTERCEPTOR_UPGRADED_CAPACITY, Kind,
  REAVER_SCARAB_CAPACITY, REAVER_SCARAB_UPGRADED_CAPACITY, Tech,
} from './data.ts';
import { getTechLevel } from './tech.ts';
import type { State } from './world.ts';

export type InternalProductDisplay = {
  trainLabel?: string;
  activeLabel?: string;
  optionActiveLabel?: string;
  optionActiveDetail?: string;
  readyLabel?: string;
  readyDetail?: string;
};

export type InternalProductDef = {
  producer: number;
  product: number;
  baseCapacity: number;
  capacityTech?: number;
  upgradedCapacity?: number;
  display?: InternalProductDisplay;
};

export const InternalProductDefs: readonly InternalProductDef[] = [
  {
    producer: Kind.Reaver,
    product: Kind.Scarab,
    baseCapacity: REAVER_SCARAB_CAPACITY,
    capacityTech: Tech.ReaverCapacity,
    upgradedCapacity: REAVER_SCARAB_UPGRADED_CAPACITY,
  },
  {
    producer: Kind.Carrier,
    product: Kind.Interceptor,
    baseCapacity: CARRIER_INTERCEPTOR_CAPACITY,
    capacityTech: Tech.CarrierCapacity,
    upgradedCapacity: CARRIER_INTERCEPTOR_UPGRADED_CAPACITY,
  },
  {
    producer: Kind.NuclearSilo,
    product: Kind.NuclearMissile,
    baseCapacity: 1,
    display: {
      trainLabel: 'Arm Nuke',
      activeLabel: 'Arming',
      optionActiveLabel: 'Arming Nuke',
      optionActiveDetail: 'Arming',
      readyLabel: 'Nuke Ready',
      readyDetail: 'Ready',
    },
  },
] as const;

export const internalProductDef = (producerKind: number, productKind: number): InternalProductDef | undefined =>
  InternalProductDefs.find((def) => def.producer === producerKind && def.product === productKind);

export const internalProductsForProducer = (producerKind: number): readonly InternalProductDef[] =>
  InternalProductDefs.filter((def) => def.producer === producerKind);

export const internalProductCapacity = (s: State, producer: number, productKind: number): number => {
  const def = internalProductDef(s.e.kind[producer]!, productKind);
  if (!def) return 0;
  const owner = s.e.owner[producer]!;
  if (def.capacityTech !== undefined && def.upgradedCapacity !== undefined &&
      owner < s.teams.length && getTechLevel(s, owner, def.capacityTech) > 0) {
    return def.upgradedCapacity;
  }
  return def.baseCapacity;
};
