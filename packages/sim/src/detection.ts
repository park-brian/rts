import { CLOAK_AURA_RADIUS, EffectKind, Kind, Role, Trait, Units, tiles, unitTraits } from './data.ts';
import type { State } from './entity/world.ts';
import { effectiveSight } from './systems/status.ts';
import { isPowered } from './mechanics/power.ts';
import { isContained } from './cargo.ts';
import { withinRangeSq } from './spatial/geometry.ts';

export const updateCloakAuras = (s: State): void => {
  const e = s.e;
  e.cloakAura.fill(0, 0, e.hi);
  for (let arbiter = 0; arbiter < e.hi; arbiter++) {
    if (e.alive[arbiter] !== 1 || isContained(s, arbiter) || e.kind[arbiter] !== Kind.Arbiter) continue;
    const owner = e.owner[arbiter]!;
    for (let i = 0; i < e.hi; i++) {
      if (i === arbiter || e.alive[i] !== 1 || isContained(s, i) || e.owner[i] !== owner || e.kind[i] === Kind.Arbiter) continue;
      const def = Units[e.kind[i]!];
      if (!def || (def.roles & Role.Mobile) === 0) continue;
      if (withinRangeSq(e.x[arbiter]!, e.y[arbiter]!, e.x[i]!, e.y[i]!, CLOAK_AURA_RADIUS)) e.cloakAura[i] = 1;
    }
  }
};

export const isCloaked = (s: State, slot: number): boolean => {
  const e = s.e;
  return e.alive[slot] === 1 && (
    (unitTraits(e.kind[slot]!) & Trait.PermanentCloak) !== 0 ||
    e.burrowed[slot] === 1 ||
    e.cloakActive[slot] === 1 ||
    e.cloakAura[slot] === 1
  );
};

const isScanned = (s: State, viewer: number, target: number): boolean => {
  const fx = s.effects;
  const e = s.e;
  for (let i = 0; i < fx.hi; i++) {
    if (fx.alive[i] !== 1 || fx.kind[i] !== EffectKind.ScannerSweep || fx.owner[i] !== viewer) continue;
    if (withinRangeSq(fx.x[i]!, fx.y[i]!, e.x[target]!, e.y[target]!, fx.radius[i]!)) return true;
  }
  return false;
};

export const canDetect = (s: State, viewer: number, target: number): boolean => {
  const e = s.e;
  if (isContained(s, target)) return false;
  if (!isCloaked(s, target)) return true;
  if (viewer === e.owner[target]!) return true;
  if (viewer >= s.teams.length || e.owner[target]! >= s.teams.length) return false;
  if (s.teams[viewer] === s.teams[e.owner[target]!]!) return true;
  if (isScanned(s, viewer, target)) return true;

  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || isContained(s, i) || (e.owner[i] !== viewer && e.parasiteOwner[i] !== viewer)) continue;
    const def = Units[e.kind[i]!];
    if (!def || e.opticalFlare[i] === 1 || (unitTraits(e.kind[i]!) & Trait.Detector) === 0) continue;
    if (!isPowered(s, i)) continue;
    if ((def.roles & (Role.Mobile | Role.Structure)) === 0) continue;
    const sight = tiles(effectiveSight(s, e, i, def.sight));
    if (withinRangeSq(e.x[i]!, e.y[i]!, e.x[target]!, e.y[target]!, sight)) return true;
  }
  return false;
};
