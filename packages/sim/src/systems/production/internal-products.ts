import type { State } from '../../entity/world.ts';
import { completeInternalProduct } from '../../mechanics/internal-products.ts';
import { finishCurrentProduction } from './queue.ts';

export const finishInternalProductQueue = (s: State, producer: number, kind: number): boolean => {
  if (!completeInternalProduct(s, producer, kind)) return false;
  finishCurrentProduction(s, producer, kind);
  return true;
};
