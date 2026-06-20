import {
  Abilities,
  Kind,
  Order,
  Role,
  Units,
  unitTraits,
  type AbilityAreaStatusTimer,
  type AbilityRestorePool,
  type AbilityStatusTimer,
  type AbilityTargetBuffer,
  type AbilityTargetMarker,
} from '../data/index.ts';
import type { State } from '../entity/world.ts';
import { NEUTRAL, NONE, eid, kill, slotOf, trySpawnEffect } from '../entity/world.ts';
import { trySpawnUnit } from '../entity/factory.ts';
import { fx } from '../fixed.ts';
import { applyIndependentDamage } from './damage.ts';
import { inRadius } from './effects.ts';
import { isContained } from './cargo.ts';
import { consumeReadyNuke } from './nuke.ts';
import { faceToward } from '../spatial/motion.ts';
import { abilityCapacityAvailable, isFreeAbilityToggleOff } from './abilities.ts';

export type AbilityCast = {
  ability: number;
  target?: number;
  x?: number;
  y?: number;
};

type StatusTimerColumn = 'stimTimer' | 'lockdownTimer' | 'irradiateTimer';
type AreaStatusTimerColumn = 'stasisTimer' | 'maelstromTimer' | 'ensnareTimer' | 'plagueTimer';
type TimerColumn = StatusTimerColumn | AreaStatusTimerColumn;

const StatusTimerColumns: Record<AbilityStatusTimer, StatusTimerColumn> = {
  stim: 'stimTimer',
  lockdown: 'lockdownTimer',
  irradiate: 'irradiateTimer',
};

const AreaStatusTimerColumns: Record<AbilityAreaStatusTimer, AreaStatusTimerColumn> = {
  stasis: 'stasisTimer',
  maelstrom: 'maelstromTimer',
  ensnare: 'ensnareTimer',
  plague: 'plagueTimer',
};

const TargetMarkerApplicators: Record<AbilityTargetMarker, (e: State['e'], target: number, owner: number) => void> = {
  opticalFlare: (e, target) => { e.opticalFlare[target] = 1; },
  parasiteOwner: (e, target, owner) => { e.parasiteOwner[target] = owner; },
};

const TargetRestoreApplicators: Record<AbilityRestorePool, (e: State['e'], target: number, amount: number) => void> = {
  hp: (e, target, amount) => {
    const def = Units[e.kind[target]!]!;
    e.hp[target] = Math.min(def.hp, e.hp[target]! + amount);
  },
  shield: (e, target, amount) => {
    const def = Units[e.kind[target]!]!;
    e.shield[target] = Math.min(def.shields, e.shield[target]! + amount);
  },
};

const TargetBufferApplicators: Record<AbilityTargetBuffer, (e: State['e'], target: number, amount: number, duration: number) => void> = {
  matrix: (e, target, amount, duration) => {
    e.matrixHp[target] = Math.max(e.matrixHp[target]!, amount);
    e.matrixTimer[target] = Math.max(e.matrixTimer[target]!, duration);
  },
};

const applyTimerColumn = (e: State['e'], column: TimerColumn, target: number, duration: number): void => {
  e[column][target] = Math.max(e[column][target]!, duration);
};

const applyStatusTimer = (
  e: State['e'],
  timer: AbilityStatusTimer,
  target: number,
  duration: number,
): void => {
  applyTimerColumn(e, StatusTimerColumns[timer], target, duration);
};

const applyAreaStatusTimer = (
  e: State['e'],
  timer: AbilityAreaStatusTimer,
  target: number,
  duration: number,
): void => {
  applyTimerColumn(e, AreaStatusTimerColumns[timer], target, duration);
};

const applyTargetMarker = (e: State['e'], marker: AbilityTargetMarker, target: number, owner: number): void => {
  TargetMarkerApplicators[marker](e, target, owner);
};

const applyTargetRestore = (e: State['e'], pool: AbilityRestorePool, target: number, amount: number): void => {
  TargetRestoreApplicators[pool](e, target, amount);
};

const applyTargetBuffer = (e: State['e'], buffer: AbilityTargetBuffer, target: number, amount: number, duration: number): void => {
  TargetBufferApplicators[buffer](e, target, amount, duration);
};

const applyPointAreaDrain = (s: State, x: number, y: number, radius: number): void => {
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

const beginCasterChannel = (e: State['e'], slot: number, ability: number, target: number, duration: number): void => {
  e.order[slot] = Order.Cast;
  e.target[slot] = target;
  e.intentTarget[slot] = NONE;
  e.combatTarget[slot] = NONE;
  e.castAbility[slot] = ability;
  e.timer[slot] = duration;
};

const beginTargetChannel = (s: State, slot: number, c: AbilityCast): void => {
  const e = s.e;
  const ability = Abilities[c.ability]!;
  if (ability.duration <= 0) {
    applyIndependentDamage(s, slotOf(c.target!), ability.damage);
    return;
  }
  beginCasterChannel(e, slot, c.ability, c.target!, ability.duration);
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
    e.intentTarget[i] = NONE;
    e.combatTarget[i] = NONE;
    n++;
  }
};

const applyAbilityExecution = (s: State, slot: number, c: AbilityCast): void => {
  const ability = Abilities[c.ability]!;
  const execution = ability.execution;
  if (!execution) return;
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
    case 'point-area-status':
      applyAreaStatus(s, e.owner[slot]!, c.x!, c.y!, ability.radius, execution.team,
        (target) =>
          (execution.rolesAny === 0 || (e.flags[target]! & execution.rolesAny) !== 0) &&
          (execution.traitsAny === 0 || (unitTraits(e.kind[target]!) & execution.traitsAny) !== 0),
        (target) => { applyAreaStatusTimer(e, execution.timer, target, ability.duration); });
      break;
    case 'point-area-drain':
      applyPointAreaDrain(s, c.x!, c.y!, ability.radius);
      break;
    case 'point-recall':
      recallUnits(s, slot, c.x!, c.y!, ability.radius);
      break;
    case 'target-marker':
      applyTargetMarker(e, execution.marker, slotOf(c.target!), e.owner[slot]!);
      break;
    case 'target-restore':
      applyTargetRestore(e, execution.pool, slotOf(c.target!), ability.damage);
      break;
    case 'target-buffer':
      applyTargetBuffer(e, execution.buffer, slotOf(c.target!), ability.damage, ability.duration);
      break;
    case 'target-channel-damage':
      beginTargetChannel(s, slot, c);
      break;
    case 'target-energy-feedback': {
      const target = slotOf(c.target!);
      const drained = e.energy[target]!;
      e.energy[target] = 0;
      applyIndependentDamage(s, target, drained);
      break;
    }
    case 'target-cleanse':
      restoreStatuses(s, slotOf(c.target!));
      break;
    case 'target-convert': {
      const target = slotOf(c.target!);
      e.owner[target] = e.owner[slot]!;
      e.order[target] = Order.Idle;
      e.target[target] = NONE;
      e.intentTarget[target] = NONE;
      e.combatTarget[target] = NONE;
      if (execution.drainCasterShield === true) e.shield[slot] = 0;
      break;
    }
    case 'target-sacrifice-energy': {
      const target = slotOf(c.target!);
      kill(s, target);
      e.energy[slot] = Math.min(e.energyMax[slot]!, e.energy[slot]! + ability.damage);
      break;
    }
    case 'target-spawn': {
      const target = slotOf(c.target!);
      const owner = e.owner[slot]!;
      const x = e.x[target]!;
      const y = e.y[target]!;
      const kind = execution.kind === 'target' ? e.kind[target]! : execution.kind;
      if (execution.killTarget === true) kill(s, target);
      for (let n = 0; n < execution.count; n++) {
        const offset = (n * 2 - execution.count + 1) * execution.spread;
        const id = trySpawnUnit(s, kind, owner, x + offset, y);
        if (id === NONE) break;
        const child = slotOf(id);
        if (execution.illusion === true) e.illusion[child] = 1;
        e.lifeTimer[child] = execution.life;
      }
      break;
    }
    case 'target-transform': {
      const target = slotOf(c.target!);
      const def = Units[execution.kind]!;
      e.kind[target] = execution.kind;
      if (execution.transferOwner === true) e.owner[target] = e.owner[slot]!;
      e.hp[target] = def.hp;
      e.shield[target] = def.shields;
      e.flags[target] = def.roles;
      if (execution.resetProduction === true) {
        e.prodKind[target] = Kind.None;
        e.prodTimer[target] = 0;
        e.prodQueued[target] = 0;
      }
      break;
    }
    case 'self-toggle': {
      const enabled = e[execution.flag][slot] !== 1;
      e[execution.flag][slot] = enabled ? 1 : 0;
      e.cloakTimer[slot] = enabled ? ability.period : 0;
      break;
    }
    case 'persistent-effect':
      trySpawnEffect(s, execution.effect, e.owner[slot]!, c.x!, c.y!, ability.radius, ability.duration, ability.period, ability.damage);
      break;
    case 'point-channel-effect':
      if (trySpawnEffect(s, execution.effect, e.owner[slot]!, c.x!, c.y!, ability.radius, ability.duration, ability.period, ability.damage,
        eid(e, slot), e.x[slot]!, e.y[slot]!) === NONE) break;
      if (execution.consumes === 'nuke') consumeReadyNuke(s, e.owner[slot]!);
      beginCasterChannel(e, slot, c.ability, NONE, ability.duration);
      break;
  }
};

export const castAbility = (s: State, slot: number, c: AbilityCast): void => {
  const e = s.e;
  const ability = Abilities[c.ability]!;
  if (!abilityCapacityAvailable(s, c.ability)) return;
  if (!isFreeAbilityToggleOff(e, slot, ability)) {
    e.energy[slot] = e.energy[slot]! - ability.energyCost;
    e.hp[slot] = e.hp[slot]! - ability.hpCost;
  }

  if (ability.target === 'point') faceToward(e, slot, c.x!, c.y!);
  else if (ability.target === 'entity' && c.target !== undefined) {
    const target = slotOf(c.target);
    faceToward(e, slot, e.x[target]!, e.y[target]!);
  }

  applyAbilityExecution(s, slot, c);
};
