import {
  Ability,
  Kind,
  LOAD_RANGE,
  NONE,
  ONE,
  Role,
  TILE,
  UNLOAD_RANGE,
  Units,
  canAcceptCargo,
  distanceSq,
  eid,
  isqrt,
  sameTeam,
  unloadAnchorSlot,
  unloadPassable,
  validateCommand,
  weaponForTarget,
  withinRangeSq,
  type Command,
  type State,
} from '@rts/sim';

export type CombatFocus = { x: number; y: number; target: number };

const pushValidCommand = (s: State, cmds: Command[], player: number, command: Command): boolean => {
  if (!validateCommand(s, player, command).ok) return false;
  cmds.push(command);
  return true;
};

const maybeStim = (s: State, cmds: Command[], slot: number): void => {
  const e = s.e;
  if (e.stimTimer[slot]! > 0 || e.hp[slot]! <= 20) return;
  pushValidCommand(s, cmds, e.owner[slot]!, { t: 'ability', unit: eid(e, slot), ability: Ability.StimPack });
};

const maybeTransformForFight = (s: State, cmds: Command[], slot: number, focusX: number, focusY: number): boolean => {
  const e = s.e;
  const kind = e.kind[slot]!;
  if (kind !== Kind.SiegeTank && kind !== Kind.SiegeTankSieged) return false;
  const owner = e.owner[slot]!;
  const weapon = Units[Kind.SiegeTankSieged]!.weapon!;
  const d2 = distanceSq(focusX, focusY, e.x[slot]!, e.y[slot]!);
  const min = weapon.minRange ?? 0;
  const usefulSiege = d2 >= min * min && d2 <= weapon.range * weapon.range;
  if (kind === Kind.SiegeTank && usefulSiege) {
    return pushValidCommand(s, cmds, owner, { t: 'transform', unit: eid(e, slot), kind: Kind.SiegeTankSieged });
  }
  if (kind === Kind.SiegeTankSieged && !usefulSiege) {
    return pushValidCommand(s, cmds, owner, { t: 'transform', unit: eid(e, slot), kind: Kind.SiegeTank });
  }
  return false;
};

const maybeBurrowForFight = (s: State, cmds: Command[], slot: number, target: number): boolean => {
  const e = s.e;
  if (e.kind[slot] !== Kind.Lurker || e.burrowed[slot] === 1) return false;
  const weapon = Units[Kind.Lurker]!.weapon!;
  if (!weaponForTarget(Units[Kind.Lurker]!, Units[e.kind[target]!]!)) return false;
  if (!withinRangeSq(e.x[slot]!, e.y[slot]!, e.x[target]!, e.y[target]!, weapon.range)) return false;
  return pushValidCommand(s, cmds, e.owner[slot]!, { t: 'burrow', unit: eid(e, slot), active: true });
};

const maybeLaySpiderMine = (s: State, cmds: Command[], slot: number, target: number): boolean => {
  const e = s.e;
  if (e.kind[slot] !== Kind.Vulture) return false;
  if ((e.flags[target]! & (Role.Mobile | Role.Air | Role.Structure | Role.Resource)) !== Role.Mobile) return false;
  if (!withinRangeSq(e.x[slot]!, e.y[slot]!, e.x[target]!, e.y[target]!, TILE * ONE * 4)) return false;
  return pushValidCommand(s, cmds, e.owner[slot]!, { t: 'mine', unit: eid(e, slot) });
};

export const issueDefenseEngagement = (
  s: State,
  cmds: Command[],
  unit: number,
  focus: CombatFocus,
): void => {
  const e = s.e;
  const target = focus.target;
  if (target !== NONE && maybeLaySpiderMine(s, cmds, unit, target)) return;
  if (target !== NONE && maybeBurrowForFight(s, cmds, unit, target)) return;
  if (maybeTransformForFight(s, cmds, unit, focus.x, focus.y)) return;
  maybeStim(s, cmds, unit);
  if (target !== NONE && weaponForTarget(Units[e.kind[unit]!]!, Units[e.kind[target]!]!)) {
    cmds.push({ t: 'attack', unit: eid(e, unit), target: eid(e, target) });
  } else {
    cmds.push({ t: 'amove', unit: eid(e, unit), x: focus.x, y: focus.y });
  }
};

export const issuePressureEngagement = (
  s: State,
  player: number,
  cmds: Command[],
  unit: number,
  focus: CombatFocus,
): void => {
  if (maybeUseNydusNetwork(s, player, cmds, unit, focus.x, focus.y)) return;
  if (focus.target !== NONE && maybeLaySpiderMine(s, cmds, unit, focus.target)) return;
  if (focus.target !== NONE && maybeBurrowForFight(s, cmds, unit, focus.target)) return;
  if (maybeTransformForFight(s, cmds, unit, focus.x, focus.y)) return;
  maybeStim(s, cmds, unit);
  cmds.push({ t: 'amove', unit: eid(s.e, unit), x: focus.x, y: focus.y });
};

const maybeUseNydusNetwork = (
  s: State,
  player: number,
  cmds: Command[],
  unit: number,
  focusX: number,
  focusY: number,
): boolean => {
  const e = s.e;
  const def = Units[e.kind[unit]!]!;
  if (e.container[unit] !== NONE || def.cargoSize <= 0) return false;
  if ((e.flags[unit]! & (Role.Mobile | Role.Structure | Role.Air | Role.Resource)) !== Role.Mobile) return false;

  let entrance = NONE;
  let exit = NONE;
  let bestD = Infinity;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.kind[i] !== Kind.NydusCanal || e.built[i] !== 1) continue;
    if (!sameTeam(s, player, e.owner[i]!)) continue;
    const candidateExit = unloadAnchorSlot(s, i, focusX, focusY);
    if (candidateExit === NONE) continue;
    if (!canAcceptCargo(s, i, unit)) continue;
    const loadD = distanceSq(e.x[i]!, e.y[i]!, e.x[unit]!, e.y[unit]!);
    if (loadD > LOAD_RANGE * LOAD_RANGE || loadD >= bestD) continue;
    entrance = i;
    exit = candidateExit;
    bestD = loadD;
  }
  if (entrance === NONE || exit === NONE) return false;

  const point = nydusUnloadPoint(s, exit, focusX, focusY);
  if (!point) return false;
  cmds.push({ t: 'load', transport: eid(e, entrance), unit: eid(e, unit) });
  cmds.push({ t: 'unload', transport: eid(e, entrance), unit: eid(e, unit), x: point.x, y: point.y });
  return true;
};

const nydusUnloadPoint = (s: State, exit: number, focusX: number, focusY: number): { x: number; y: number } | null => {
  const e = s.e;
  const dx = focusX - e.x[exit]!;
  const dy = focusY - e.y[exit]!;
  const d = isqrt(dx * dx + dy * dy) || 1;
  const step = Math.min(2 * TILE * ONE, UNLOAD_RANGE);
  const ux = Math.trunc((dx * step) / d);
  const uy = Math.trunc((dy * step) / d);
  const options: ReadonlyArray<readonly [number, number]> = [
    [e.x[exit]! - ux, e.y[exit]! - uy],
    [e.x[exit]! + ux, e.y[exit]! + uy],
    [e.x[exit]! + step, e.y[exit]!],
    [e.x[exit]! - step, e.y[exit]!],
    [e.x[exit]!, e.y[exit]! + step],
    [e.x[exit]!, e.y[exit]! - step],
  ];
  for (const [x, y] of options) {
    if (withinRangeSq(e.x[exit]!, e.y[exit]!, x, y, UNLOAD_RANGE) && unloadPassable(s, x, y)) {
      return { x, y };
    }
  }
  return null;
};
