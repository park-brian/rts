import { Units } from '../data.ts';
import type { State } from '../world.ts';

export const setEntityKind = (s: State, slot: number, kind: number): void => {
  const def = Units[kind]!;
  const e = s.e;
  e.kind[slot] = kind;
  e.flags[slot] = def.roles;
  e.hp[slot] = Math.min(e.hp[slot]!, def.hp);
  e.shield[slot] = Math.min(e.shield[slot]!, def.shields);
  e.energyMax[slot] = def.energyMax;
  e.energy[slot] = Math.min(e.energy[slot]!, def.energyMax);
};

export const setEntityKindFull = (s: State, slot: number, kind: number): void => {
  const def = Units[kind]!;
  const e = s.e;
  e.kind[slot] = kind;
  e.flags[slot] = def.roles;
  e.hp[slot] = def.hp;
  e.shield[slot] = def.shields;
  e.energyMax[slot] = def.energyMax;
  e.energy[slot] = def.startEnergy;
};
