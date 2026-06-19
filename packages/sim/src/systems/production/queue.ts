import { Kind, Units } from '../../data.ts';
import type { State } from '../../entity/world.ts';

export const finishCurrentProduction = (s: State, producer: number, kind: number): void => {
  const e = s.e;
  if (e.prodQueued[producer]! > 0) {
    e.prodQueued[producer] = e.prodQueued[producer]! - 1;
    e.prodTimer[producer] = Units[kind]!.buildTime;
  } else {
    e.prodKind[producer] = Kind.None;
    e.prodTimer[producer] = 0;
  }
};
