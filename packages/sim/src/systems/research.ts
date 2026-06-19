import type { State } from '../entity/world.ts';
import { NONE } from '../entity/world.ts';
import { Kind, Tech, TechDefs } from '../data.ts';
import { nextTechLevel, setTechLevel } from '../tech.ts';
import { upgradedEnergyMax } from '../derived.ts';
import { isPowered } from '../power.ts';
import { isLiftedStructureFlags } from '../terran-mobility.ts';
import { activeAddonParentSlot, isAddonKind } from '../addon.ts';
import { refillInternalProduct } from '../internal-products.ts';

const refreshEnergyMax = (s: State, player: number): void => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.owner[i] !== player || e.energyMax[i]! <= 0) continue;
    const max = upgradedEnergyMax(s, i, e.energyMax[i]!);
    if (max > e.energyMax[i]!) e.energyMax[i] = max;
  }
};

const refreshSpiderMineAmmo = (s: State, player: number): void => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] === 1 && e.owner[i] === player && e.kind[i] === Kind.Vulture) {
      refillInternalProduct(s, i, Kind.SpiderMine);
    }
  }
};

export const research = (s: State): void => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.built[i] !== 1 || e.researchKind[i] === Kind.None) continue;
    if (isLiftedStructureFlags(e.flags[i]!)) continue;
    if (isAddonKind(e.kind[i]!) && activeAddonParentSlot(s, i) === NONE) continue;
    if (!isPowered(s, i)) continue;
    if (e.researchTimer[i]! > 0) {
      e.researchTimer[i] = e.researchTimer[i]! - 1;
      if (e.researchTimer[i]! > 0) continue;
    }
    const tech = e.researchKind[i]!;
    if (TechDefs[tech]) {
      const owner = e.owner[i]!;
      setTechLevel(s, owner, tech, nextTechLevel(s, owner, tech));
      refreshEnergyMax(s, owner);
      if (tech === Tech.SpiderMines) refreshSpiderMineAmmo(s, owner);
    }
    e.researchKind[i] = Kind.None;
    e.researchTimer[i] = 0;
  }
};
