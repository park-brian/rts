import {
  Ability, Abilities, EffectKind, Kind, Order, Role, SplashPx, Trait, Units, sec, unitTraits,
} from '../data/index.ts';
import { applyIndependentDamage, applyNuclearStrikeDamage, applyPlagueDamage } from '../mechanics/damage.ts';
import { inRadius } from '../mechanics/effects.ts';
import { fx } from '../fixed.ts';
import type { State } from '../entity/world.ts';
import { NONE, isAlive, kill, slotOf } from '../entity/world.ts';
import { updateCloakAuras } from '../mechanics/detection.ts';
import { isDisabled } from '../mechanics/status.ts';
import { tickRegeneration, tickStatusTimers } from './status.ts';
import { isContained } from '../mechanics/cargo.ts';
import { activeAddonParentSlot, isAddonKind } from '../mechanics/addons.ts';
import { splashDamagePercentAtEntity } from '../mechanics/weapon-hit.ts';

const NUKE_SPLASH_INNER = fx(SplashPx.NuclearStrike.inner);
const NUKE_SPLASH_MEDIUM = fx(SplashPx.NuclearStrike.medium);
const NUKE_SPLASH_INNER2 = NUKE_SPLASH_INNER * NUKE_SPLASH_INNER;
const NUKE_SPLASH_MEDIUM2 = NUKE_SPLASH_MEDIUM * NUKE_SPLASH_MEDIUM;

const ENERGY_REGEN_TICKS = sec(1.78);

const tickEnergy = (s: State): void => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.energyMax[i]! <= 0 || e.cloakActive[i] === 1 || e.energy[i]! >= e.energyMax[i]!) continue;
    if (isAddonKind(e.kind[i]!) && activeAddonParentSlot(s, i) === NONE) continue;
    if (e.energyTimer[i]! <= 0) e.energyTimer[i] = ENERGY_REGEN_TICKS;
    e.energyTimer[i] = e.energyTimer[i]! - 1;
    if (e.energyTimer[i]! <= 0) e.energy[i] = Math.min(e.energyMax[i]!, e.energy[i]! + 1);
  }
};

const finishCasterChannel = (e: State['e'], slot: number): void => {
  e.order[slot] = Order.Idle;
  e.target[slot] = NONE;
  e.timer[slot] = 0;
};

const tickCloak = (s: State): void => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || isContained(s, i) || e.cloakActive[i] !== 1) continue;
    const ability = e.kind[i] === Kind.Ghost ? Abilities[Ability.PersonnelCloaking] : Abilities[Ability.CloakingField];
    if (!ability || e.energy[i]! <= 0) {
      e.cloakActive[i] = 0;
      e.cloakTimer[i] = 0;
      continue;
    }
    if (e.cloakTimer[i]! <= 0) e.cloakTimer[i] = ability.period;
    e.cloakTimer[i] = e.cloakTimer[i]! - 1;
    if (e.cloakTimer[i]! <= 0) {
      e.energy[i] = Math.max(0, e.energy[i]! - 1);
      if (e.energy[i]! <= 0) e.cloakActive[i] = 0;
    }
  }
};

const tickEntityDots = (s: State): void => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1) continue;
    if (e.plagueTimer[i]! > 0 && e.plagueTimer[i]! % Abilities[Ability.Plague]!.period === 0) {
      applyPlagueDamage(s, i, Abilities[Ability.Plague]!.damage);
    }
    if (e.irradiateTimer[i]! > 0 && e.irradiateTimer[i]! % Abilities[Ability.Irradiate]!.period === 0) {
      const a = Abilities[Ability.Irradiate]!;
      for (let j = 0; j < e.hi; j++) {
        if (e.alive[j] !== 1 || isContained(s, j) || !inRadius(s, j, e.x[i]!, e.y[i]!, a.radius)) continue;
        if ((unitTraits(e.kind[j]!) & Trait.Biological) === 0 || (e.flags[j]! & Role.Mobile) === 0) continue;
        applyIndependentDamage(s, j, a.damage);
      }
    }
  }
};

const tickLifeTimers = (s: State): void => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.lifeTimer[i]! <= 0) continue;
    e.lifeTimer[i] = e.lifeTimer[i]! - 1;
    if (e.lifeTimer[i]! <= 0) kill(s, i);
  }
};

const tickEffects = (s: State): void => {
  const fx = s.effects;
  for (let i = 0; i < fx.hi; i++) {
    if (fx.alive[i] !== 1) continue;
    if (fx.kind[i] === EffectKind.NuclearStrike) {
      const source = fx.source[i]!;
      if (!isAlive(s.e, source)) { fx.alive[i] = 0; continue; }
      const caster = slotOf(source);
      if (isDisabled(s.e, caster) || s.e.order[caster] !== Order.Cast ||
          s.e.castAbility[caster] !== Ability.NuclearStrike ||
          s.e.x[caster] !== fx.sourceX[i] || s.e.y[caster] !== fx.sourceY[i]) {
        if (s.e.order[caster] === Order.Cast) s.e.order[caster] = Order.Idle;
        if (s.e.castAbility[caster] === Ability.NuclearStrike) s.e.castAbility[caster] = 0;
        s.e.timer[caster] = 0;
        fx.alive[i] = 0;
        continue;
      }
      fx.timer[i] = fx.timer[i]! - 1;
      s.e.timer[caster] = fx.timer[i]!;
      if (fx.timer[i]! > 0) continue;
      const outer2 = fx.radius[i]! * fx.radius[i]!;
      for (let j = 0; j < s.e.hi; j++) {
        if (s.e.alive[j] !== 1 || isContained(s, j) || (s.e.flags[j]! & Role.Resource) !== 0) continue;
        const pct = splashDamagePercentAtEntity(
          s,
          j,
          fx.x[i]!,
          fx.y[i]!,
          NUKE_SPLASH_INNER2,
          NUKE_SPLASH_MEDIUM2,
          outer2,
        );
        if (pct > 0) applyNuclearStrikeDamage(s, j, fx.damage[i]!, pct);
      }
      if (s.e.alive[caster] === 1 && s.e.order[caster] === Order.Cast) {
        finishCasterChannel(s.e, caster);
      }
      fx.alive[i] = 0;
      continue;
    }
    if (fx.kind[i] === EffectKind.PsionicStorm) {
      if (fx.nextTick[i]! <= 0) {
        const e = s.e;
        for (let j = 0; j < e.hi; j++) {
          if (e.alive[j] !== 1 || isContained(s, j)) continue;
          const def = Units[e.kind[j]!];
          if (!def || (def.roles & Role.Mobile) === 0) continue;
          if (inRadius(s, j, fx.x[i]!, fx.y[i]!, fx.radius[i]!)) applyIndependentDamage(s, j, fx.damage[i]!);
        }
        fx.nextTick[i] = fx.period[i]!;
      }
      fx.nextTick[i] = fx.nextTick[i]! - 1;
    }
    fx.timer[i] = fx.timer[i]! - 1;
    if (fx.timer[i]! <= 0) fx.alive[i] = 0;
  }
};

const clearCasterChannel = (e: State['e'], slot: number, clearTarget = true): void => {
  e.castAbility[slot] = 0;
  e.timer[slot] = 0;
  if (clearTarget) e.target[slot] = NONE;
};

const tickTargetChannels = (s: State): void => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.castAbility[i]! === 0) continue;
    const ability = Abilities[e.castAbility[i]!];
    if (!ability || ability.execution?.mode !== 'target-channel-damage') continue;
    if (e.order[i] !== Order.Cast) {
      clearCasterChannel(e, i, false);
      continue;
    }
    if (isDisabled(e, i) || !isAlive(e, e.target[i]!)) {
      clearCasterChannel(e, i);
      continue;
    }
    const target = slotOf(e.target[i]!);
    if (isContained(s, target)) {
      clearCasterChannel(e, i);
      continue;
    }
    e.timer[i] = e.timer[i]! - 1;
    if (e.timer[i]! > 0) continue;
    applyIndependentDamage(s, target, ability.damage);
    finishCasterChannel(e, i);
  }
};

export const clearFinishedCasterChannels = (s: State): void => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.castAbility[i]! === 0) continue;
    if (e.alive[i] !== 1) clearCasterChannel(e, i);
    else if (e.order[i] !== Order.Cast && e.timer[i]! <= 0) e.castAbility[i] = 0;
  }
};

export const abilities = (s: State): void => {
  updateCloakAuras(s);
  tickEffects(s);
  tickTargetChannels(s);
  tickEntityDots(s);
  tickLifeTimers(s);
  tickCloak(s);
  tickEnergy(s);
  tickStatusTimers(s.e);
  tickRegeneration(s);
  updateCloakAuras(s);
};
