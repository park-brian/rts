import { Kind, Units } from '../../data.ts';
import type { State } from '../../entity/world.ts';
import { completeInternalProduct } from '../../internal-products.ts';

export const finishInternalProductQueue = (s: State, producer: number, kind: number): boolean => {
  const e = s.e;
  if (!completeInternalProduct(s, producer, kind)) return false;
  if (e.prodQueued[producer]! > 0) {
    e.prodQueued[producer] = e.prodQueued[producer]! - 1;
    e.prodTimer[producer] = Units[kind]!.buildTime;
  } else {
    e.prodKind[producer] = Kind.None;
    e.prodTimer[producer] = 0;
  }
  return true;
};
