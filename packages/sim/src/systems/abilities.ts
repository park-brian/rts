import type { Command } from '../commands.ts';
import {
  Ability, Abilities, EffectKind, Kind, Order, Role, Trait, Units, sec, unitTraits,
  type AbilityRestorePool, type AbilityStatusTimer, type AbilityTargetMarker,
} from '../data.ts';
import { applyIndependentDamage, applyPlagueDamage } from '../damage.ts';
import { inRadius } from '../effects.ts';
import { fx } from '../fixed.ts';
import type { State } from '../world.ts';
import { NEUTRAL, NONE, eid, isAlive, kill, slotOf, spawnEffect } from '../world.ts';
import { spawnUnit } from '../factory.ts';
import { updateCloakAuras } from '../detection.ts';
import { faceToward } from './move.ts';
import { isDisabled, tickRegeneration, tickStatusTimers } from './status.ts';
import { isContained } from '../cargo.ts';
import { consumeReadyNuke } from '../nuke.ts';
import { activeAddonParentSlot, isAddonKind } from '../addon.ts';

const ENERGY_REGEN_TICKS = sec(1.78);

const applyEmp = (s: State, x: number, y: number, radius: number): void => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || isContained(s, i) || !inRadius(s, i, x, y, radius)) continue;
    const def = Units[e.kind[i]!];
    if (!def || (def.roles & Role.Resource) !== 0) continue;
    e.shield[i] = 0;
    e.energy[i] = 0;
  }
};

const applyAreaStatus = (
  s: State,
  owner: number,
  x: number,
  y: number,
  radius: number,
  team: 'enemy' | 'any',
  eligible: (slot: number) => boolean,
  apply: (slot: number) => void,
): void => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || isContained(s, i) || !inRadius(s, i, x, y, radius)) continue;
    if (team === 'enemy' && (e.owner[i]! >= s.teams.length || s.teams[e.owner[i]!] === s.teams[owner]!)) continue;
    if (!eligible(i)) continue;
    apply(i);
  }
};

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

const applyStatusTimer = (
  e: State['e'],
  timer: AbilityStatusTimer,
  target: number,
  duration: number,
): void => {
  switch (timer) {
    case 'stim':
      e.stimTimer[target] = Math.max(e.stimTimer[target]!, duration);
      return;
    case 'lockdown':
      e.lockdownTimer[target] = Math.max(e.lockdownTimer[target]!, duration);
      return;
    case 'irradiate':
      e.irradiateTimer[target] = Math.max(e.irradiateTimer[target]!, duration);
      return;
  }
};

const applyTargetMarker = (e: State['e'], marker: AbilityTargetMarker, target: number, owner: number): void => {
  switch (marker) {
    case 'opticalFlare':
      e.opticalFlare[target] = 1;
      return;
    case 'parasiteOwner':
      e.parasiteOwner[target] = owner;
      return;
  }
};

const applyTargetRestore = (e: State['e'], pool: AbilityRestorePool, target: number, amount: number): void => {
  const def = Units[e.kind[target]!]!;
  switch (pool) {
    case 'hp':
      e.hp[target] = Math.min(def.hp, e.hp[target]! + amount);
      return;
    case 'shield':
      e.shield[target] = Math.min(def.shields, e.shield[target]! + amount);
      return;
  }
};

const applyGenericExecution = (s: State, slot: number, c: Extract<Command, { t: 'ability' }>): boolean => {
  const ability = Abilities[c.ability]!;
  const execution = ability.execution;
  if (!execution) return false;
  const e = s.e;
  switch (execution.mode) {
    case 'caster-status': {
      const target = slot;
      applyStatusTimer(e, execution.timer, target, ability.duration);
      break;
    }
    case 'target-status':
      applyStatusTimer(e, execution.timer, slotOf(c.target!), ability.duration);
      break;
    case 'target-marker':
      applyTargetMarker(e, execution.marker, slotOf(c.target!), e.owner[slot]!);
      break;
    case 'target-restore':
      applyTargetRestore(e, execution.pool, slotOf(c.target!), ability.damage);
      break;
    case 'persistent-effect':
      spawnEffect(s, execution.effect, e.owner[slot]!, c.x!, c.y!, ability.radius, ability.duration, ability.period, ability.damage);
      break;
  }
  return true;
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
          s.e.x[caster] !== fx.sourceX[i] || s.e.y[caster] !== fx.sourceY[i]) {
        if (s.e.order[caster] === Order.Cast) s.e.order[caster] = Order.Idle;
        fx.alive[i] = 0;
        continue;
      }
      fx.timer[i] = fx.timer[i]! - 1;
      if (fx.timer[i]! > 0) continue;
      for (let j = 0; j < s.e.hi; j++) {
        if (s.e.alive[j] !== 1 || isContained(s, j) || (s.e.flags[j]! & Role.Resource) !== 0) continue;
        if (inRadius(s, j, fx.x[i]!, fx.y[i]!, fx.radius[i]!)) applyIndependentDamage(s, j, fx.damage[i]!);
      }
      if (s.e.alive[caster] === 1 && s.e.order[caster] === Order.Cast) s.e.order[caster] = Order.Idle;
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

const restoreStatuses = (s: State, target: number): void => {
  const e = s.e;
  e.irradiateTimer[target] = 0;
  e.plagueTimer[target] = 0;
  e.ensnareTimer[target] = 0;
  e.lockdownTimer[target] = 0;
  e.maelstromTimer[target] = 0;
  e.acidSporeCount[target] = 0;
  e.acidSporeTimer[target] = 0;
  e.opticalFlare[target] = 0;
  e.parasiteOwner[target] = NEUTRAL;
};

const recallUnits = (s: State, caster: number, x: number, y: number, radius: number): void => {
  const e = s.e;
  const owner = e.owner[caster]!;
  const offsets = [
    [0, 0], [18, 0], [-18, 0], [0, 18], [0, -18],
    [18, 18], [-18, 18], [18, -18], [-18, -18],
  ];
  let n = 0;
  for (let i = 0; i < e.hi; i++) {
    if (i === caster || e.alive[i] !== 1 || isContained(s, i) || e.owner[i] !== owner || (e.flags[i]! & Role.Mobile) === 0) continue;
    if (!inRadius(s, i, x, y, radius) || e.stasisTimer[i]! > 0) continue;
    const [ox, oy] = offsets[n % offsets.length]!;
    const ring = Math.trunc(n / offsets.length);
    e.x[i] = e.x[caster]! + fx(ox + ring * 24);
    e.y[i] = e.y[caster]! + fx(oy);
    e.order[i] = Order.Idle;
    e.target[i] = NONE;
    n++;
  }
};

export const castAbility = (s: State, slot: number, c: Extract<Command, { t: 'ability' }>): void => {
  const e = s.e;
  const ability = Abilities[c.ability]!;
  const togglingCloakOff = (c.ability === Ability.PersonnelCloaking || c.ability === Ability.CloakingField) && e.cloakActive[slot] === 1;
  if (!togglingCloakOff) {
    e.energy[slot] = e.energy[slot]! - ability.energyCost;
    e.hp[slot] = e.hp[slot]! - ability.hpCost;
  }

  if (ability.target === 'point') faceToward(e, slot, c.x!, c.y!);
  else if (ability.target === 'entity' && c.target !== undefined) {
    const target = slotOf(c.target);
    faceToward(e, slot, e.x[target]!, e.y[target]!);
  }

  if (applyGenericExecution(s, slot, c)) return;

  switch (c.ability) {
    case Ability.EMPShockwave:
      applyEmp(s, c.x!, c.y!, ability.radius);
      break;
    case Ability.PsionicStorm:
      spawnEffect(s, EffectKind.PsionicStorm, e.owner[slot]!, c.x!, c.y!, ability.radius, ability.duration, ability.period, ability.damage);
      break;
    case Ability.DefensiveMatrix: {
      const target = slotOf(c.target!);
      e.matrixHp[target] = Math.max(e.matrixHp[target]!, ability.damage);
      e.matrixTimer[target] = Math.max(e.matrixTimer[target]!, ability.duration);
      break;
    }
    case Ability.YamatoGun:
      applyIndependentDamage(s, slotOf(c.target!), ability.damage);
      break;
    case Ability.Feedback: {
      const target = slotOf(c.target!);
      const drained = e.energy[target]!;
      e.energy[target] = 0;
      applyIndependentDamage(s, target, drained);
      break;
    }
    case Ability.StasisField:
      applyAreaStatus(s, e.owner[slot]!, c.x!, c.y!, ability.radius, 'any',
        (target) => (e.flags[target]! & Role.Mobile) !== 0,
        (target) => { e.stasisTimer[target] = Math.max(e.stasisTimer[target]!, ability.duration); });
      break;
    case Ability.Maelstrom:
      applyAreaStatus(s, e.owner[slot]!, c.x!, c.y!, ability.radius, 'enemy',
        (target) => (unitTraits(e.kind[target]!) & Trait.Biological) !== 0,
        (target) => { e.maelstromTimer[target] = Math.max(e.maelstromTimer[target]!, ability.duration); });
      break;
    case Ability.SpawnBroodling: {
      const target = slotOf(c.target!);
      const owner = e.owner[slot]!;
      const x = e.x[target]!;
      const y = e.y[target]!;
      kill(s, target);
      const a = spawnUnit(s, Kind.Broodling, owner, x - 6, y);
      const b = spawnUnit(s, Kind.Broodling, owner, x + 6, y);
      e.lifeTimer[slotOf(a)] = sec(75.2);
      e.lifeTimer[slotOf(b)] = sec(75.2);
      break;
    }
    case Ability.Ensnare:
      applyAreaStatus(s, e.owner[slot]!, c.x!, c.y!, ability.radius, 'enemy',
        (target) => (e.flags[target]! & Role.Mobile) !== 0,
        (target) => { e.ensnareTimer[target] = Math.max(e.ensnareTimer[target]!, ability.duration); });
      break;
    case Ability.Plague:
      applyAreaStatus(s, e.owner[slot]!, c.x!, c.y!, ability.radius, 'enemy',
        (target) => (e.flags[target]! & (Role.Mobile | Role.Structure)) !== 0,
        (target) => { e.plagueTimer[target] = Math.max(e.plagueTimer[target]!, ability.duration); });
      break;
    case Ability.Consume: {
      const target = slotOf(c.target!);
      kill(s, target);
      e.energy[slot] = Math.min(e.energyMax[slot]!, e.energy[slot]! + ability.damage);
      break;
    }
    case Ability.PersonnelCloaking:
    case Ability.CloakingField:
      e.cloakActive[slot] = togglingCloakOff ? 0 : 1;
      e.cloakTimer[slot] = togglingCloakOff ? 0 : ability.period;
      break;
    case Ability.Restoration:
      restoreStatuses(s, slotOf(c.target!));
      break;
    case Ability.Recall:
      recallUnits(s, slot, c.x!, c.y!, ability.radius);
      break;
    case Ability.MindControl: {
      const target = slotOf(c.target!);
      e.owner[target] = e.owner[slot]!;
      e.order[target] = Order.Idle;
      e.target[target] = NONE;
      e.shield[slot] = 0;
      break;
    }
    case Ability.Hallucination: {
      const target = slotOf(c.target!);
      const owner = e.owner[slot]!;
      for (const dx of [-fx(12), fx(12)]) {
        const id = spawnUnit(s, e.kind[target]!, owner, e.x[target]! + dx, e.y[target]!);
        const copy = slotOf(id);
        e.illusion[copy] = 1;
        e.lifeTimer[copy] = ability.duration;
      }
      break;
    }
    case Ability.InfestCommandCenter: {
      const target = slotOf(c.target!);
      const def = Units[Kind.InfestedCommandCenter]!;
      e.kind[target] = Kind.InfestedCommandCenter;
      e.owner[target] = e.owner[slot]!;
      e.hp[target] = def.hp;
      e.shield[target] = def.shields;
      e.flags[target] = def.roles;
      e.prodKind[target] = Kind.None;
      e.prodTimer[target] = 0;
      e.prodQueued[target] = 0;
      break;
    }
    case Ability.NuclearStrike:
      consumeReadyNuke(s, e.owner[slot]!);
      e.order[slot] = Order.Cast;
      e.target[slot] = NONE;
      spawnEffect(s, EffectKind.NuclearStrike, e.owner[slot]!, c.x!, c.y!, ability.radius, ability.duration, 0, ability.damage,
        eid(e, slot), e.x[slot]!, e.y[slot]!);
      break;
  }
};

export const abilities = (s: State): void => {
  updateCloakAuras(s);
  tickEffects(s);
  tickEntityDots(s);
  tickLifeTimers(s);
  tickCloak(s);
  tickEnergy(s);
  tickStatusTimers(s.e);
  tickRegeneration(s);
  updateCloakAuras(s);
};
