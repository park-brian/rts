import { Kind, Role, Trait, Units, unitTraits } from './data.ts';

export const REPAIR_RATE = 4;

export const isRepairableKind = (kind: number): boolean => {
  const def = Units[kind];
  if (!def) return false;
  return kind === Kind.SCV ||
    (unitTraits(kind) & Trait.Mechanical) !== 0 ||
    (def.race === 'terran' && (def.roles & Role.Structure) !== 0);
};

export const canContinueConstructionKind = (kind: number): boolean => {
  const def = Units[kind];
  return !!def && def.race === 'terran' && (def.roles & Role.Structure) !== 0 && def.buildMethod === 'worker';
};

export const repairCost = (kind: number, hp: number): { minerals: number; gas: number } => {
  const def = Units[kind];
  if (!def || hp <= 0) return { minerals: 0, gas: 0 };
  const denom = Math.max(1, def.hp * 3);
  return {
    minerals: Math.ceil((def.minerals * hp) / denom),
    gas: Math.ceil((def.gas * hp) / denom),
  };
};
