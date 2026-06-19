import { TECH_CAP, TechDefs, type TechDef } from './data.ts';
import type { State } from './entity/world.ts';

export const getTechLevel = (s: State, player: number, tech: number): number =>
  s.players.tech[player * TECH_CAP + tech] ?? 0;

export const setTechLevel = (s: State, player: number, tech: number, level: number): void => {
  s.players.tech[player * TECH_CAP + tech] = level;
};

export const nextTechLevel = (s: State, player: number, tech: number): number => getTechLevel(s, player, tech) + 1;

export const techMinerals = (def: TechDef, level: number): number => def.minerals[level - 1] ?? def.minerals[def.minerals.length - 1]!;
export const techGas = (def: TechDef, level: number): number => def.gas[level - 1] ?? def.gas[def.gas.length - 1]!;
export const techTime = (def: TechDef, level: number): number => def.time[level - 1] ?? def.time[def.time.length - 1]!;

export const isTechComplete = (s: State, player: number, tech: number): boolean => getTechLevel(s, player, tech) > 0;

export const isTechInProgress = (s: State, player: number, tech: number): boolean => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.owner[i] === player && e.researchKind[i] === tech) return true;
  }
  return false;
};

export const canResearchNextLevel = (s: State, player: number, tech: number): boolean => {
  const def = TechDefs[tech];
  if (!def) return false;
  return getTechLevel(s, player, tech) < def.maxLevel && !isTechInProgress(s, player, tech);
};

export const queueResearch = (s: State, slot: number, tech: number, player: number): void => {
  const def = TechDefs[tech];
  if (!def) return;
  const level = nextTechLevel(s, player, tech);
  s.players.minerals[player] = s.players.minerals[player]! - techMinerals(def, level);
  s.players.gas[player] = s.players.gas[player]! - techGas(def, level);
  s.e.researchKind[slot] = tech;
  s.e.researchTimer[slot] = techTime(def, level);
};
