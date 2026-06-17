// A complete hardcoded AI in the spirit of docs/specs/ai-training.md §4: economy
// (workers + supply), tech (army structures), production (pump army), and military
// (attack in waves at the enemy, defend the base when threatened). God-vision,
// deterministic (no RNG), faction-driven. This is both the built-in opponent and
// the demonstrator we'll behavior-clone from later.

import {
  Abilities, Ability, Role, Trait, Order, Kind, Tech, Units, canPlaceStructure, tileX, tileY, eid, isEnemy, nearest, unitTraits,
  canDetect, isCloaked, NONE, TILE, SUPPLY_CAP, supply, type Faction, type State, type Command, type Controller,
  LOAD_RANGE, UNLOAD_RANGE, canLoadInto, cargoUsed, getTechLevel, productionCostCount, productionCount,
  activeAddonParentSlot, addonParentKind, hasAnyWeapon, hasReadyNuke, isAddonKind, isLarvaSourceKind, sameTeam, unloadAnchorSlot, unloadPassable, validateCommand, weaponForTarget,
  requiresPower,
} from '@rts/sim';
import { ONE, isqrt } from '@rts/sim';

export type BotConfig = {
  workerTarget?: number; // omit to auto-derive from the base's mineral-patch count
  barracksTarget: number;
  attackThreshold: number; // army size that triggers an attack wave
};

const DEFAULT: Omit<BotConfig, 'workerTarget'> = { barracksTarget: 3, attackThreshold: 12 };
const WORKERS_PER_PATCH = 2; // efficient saturation: patches are continuously mined ~2 deep
const TERRAN_ADDON_MACRO = [Kind.ComsatStation, Kind.MachineShop, Kind.ControlTower] as const;
const PROTOSS_STRUCTURE_MACRO = [Kind.CyberneticsCore, Kind.RoboticsFacility, Kind.Stargate, Kind.CitadelOfAdun] as const;
const ZERG_STRUCTURE_MACRO = [
  Kind.HydraliskDen,
  Kind.Spire,
  Kind.QueensNest,
  Kind.NydusCanal,
  Kind.DefilerMound,
  Kind.UltraliskCavern,
] as const;
const ZERG_UNIQUE_MORPH_MACRO = [
  { from: Kind.Hatchery, to: Kind.Lair, satisfiedBy: [Kind.Lair, Kind.Hive] },
  { from: Kind.Lair, to: Kind.Hive, satisfiedBy: [Kind.Hive] },
  { from: Kind.Spire, to: Kind.GreaterSpire, satisfiedBy: [Kind.GreaterSpire] },
] as const;
const ZERG_REPEATABLE_MORPH_MACRO = [
  { from: Kind.Hydralisk, to: Kind.Lurker },
] as const;
const ALL_ZERG_UNIQUE_MORPHS = (1 << ZERG_UNIQUE_MORPH_MACRO.length) - 1;

type ResourceBudget = { minerals: number; gas: number };

const px = (tile: number): number => tile * TILE * ONE + ((TILE * ONE) >> 1);

/** Find a buildable, reasonably clear tile near (bx,by) for a structure. */
const findSpot = (s: State, player: number, worker: number, kind: number, bx: number, by: number): { x: number; y: number } | null => {
  const btx = tileX(bx);
  const bty = tileY(by);
  for (let r = 3; r <= 14; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // ring only
        const tx = btx + dx;
        const ty = bty + dy;
        const cx = px(tx);
        const cy = px(ty);
        const placement = canPlaceStructure(s, player, worker, kind, cx, cy);
        if (placement.ok) return { x: placement.x, y: placement.y };
      }
    }
  }
  return null;
};

const findMacroSpot = (s: State, player: number, worker: number, kind: number, fallback: number): { x: number; y: number } | null => {
  const e = s.e;
  if (!requiresPower(kind)) return findSpot(s, player, worker, kind, e.x[fallback]!, e.y[fallback]!);

  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.owner[i] !== player || e.built[i] !== 1 || e.kind[i] !== Kind.Pylon) continue;
    const spot = findSpot(s, player, worker, kind, e.x[i]!, e.y[i]!);
    if (spot) return spot;
  }

  return findSpot(s, player, worker, kind, e.x[fallback]!, e.y[fallback]!);
};

const hasCompletedKind = (s: State, player: number, kind: number): boolean => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.owner[i] !== player || e.kind[i] !== kind || e.built[i] !== 1) continue;
    if (isAddonKind(kind) && activeAddonParentSlot(s, i) === NONE) continue;
    return true;
  }
  return false;
};

const hasOwnedOrPendingStructure = (s: State, player: number, kind: number): boolean => {
  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.owner[i] !== player) continue;
    if (e.kind[i] === kind) return true;
    if ((e.flags[i]! & Role.Worker) !== 0 && e.buildKind[i] === kind) return true;
  }
  return false;
};

const zergUniqueMorphMask = (kind: number): number => {
  let mask = 0;
  for (let i = 0; i < ZERG_UNIQUE_MORPH_MACRO.length; i++) {
    for (const satisfiedKind of ZERG_UNIQUE_MORPH_MACRO[i]!.satisfiedBy) {
      if (kind === satisfiedKind) {
        mask |= 1 << i;
        break;
      }
    }
  }
  return mask;
};

const scienceFacilityAddon = (s: State, player: number): number =>
  hasCompletedKind(s, player, Kind.ControlTower) ? Kind.PhysicsLab : Kind.CovertOps;

const terranAddonMacro = (s: State, player: number): readonly number[] =>
  hasCompletedKind(s, player, Kind.CovertOps)
    ? [Kind.NuclearSilo, Kind.ComsatStation, Kind.MachineShop, Kind.ControlTower]
    : TERRAN_ADDON_MACRO;

export const createBot = (faction: Faction, cfg: Partial<BotConfig> = {}): Controller => {
  const c = { ...DEFAULT, ...cfg };
  const workerDef = Units[faction.worker]!;
  const armyDef = Units[faction.armyUnit]!;
  const depotDef = Units[faction.depot]!;
  const supplyDef = Units[faction.supplyStructure]!;
  const rax = Units[faction.armyStructure]!;

  return (s: State, p: number): Command[] => {
    const e = s.e;
    const cmds: Command[] = [];

    // Single pass to read our economy + army + an enemy near our base.
    let depot = NONE; // first built depot
    let workers = 0;
    let idleDepots: number[] = [];
    const idleLarvae: number[] = [];
    let builtBarracks: number[] = [];
    let pendingBarracks = 0;
    let pendingSupply = 0;
    let army = 0;
    const idleArmy: number[] = [];
    const casters: number[] = [];
    let aWorker = NONE; // a worker we can pull to build

    for (let i = 0; i < e.hi; i++) {
      if (e.alive[i] !== 1 || e.container[i] !== NONE || e.owner[i] !== p) continue;
      const k = e.kind[i]!;
      const fl = e.flags[i]!;
      if (Units[k]!.abilities.length > 0) casters.push(i);
      if (e.prodKind[i] === faction.supplyStructure) pendingSupply++;
      if (k === faction.worker) {
        workers++;
        if (aWorker === NONE && e.order[i] === Order.Harvest) aWorker = i;
        if ((fl & Role.Worker) !== 0 && e.buildKind[i] === faction.supplyStructure) pendingSupply++;
        if ((fl & Role.Worker) !== 0 && e.buildKind[i] === faction.armyStructure) pendingBarracks++;
      } else if (k === faction.armyUnit) {
        army++;
        if (e.order[i] === Order.Idle) idleArmy.push(i);
      } else if (k === faction.depot && e.built[i] === 1) {
        if (depot === NONE) depot = i;
        if (e.prodKind[i] === Kind.None) idleDepots.push(i);
      } else if (faction.name === 'Zerg' && isLarvaSourceKind(k) && e.built[i] === 1) {
        if (depot === NONE) depot = i;
      } else if (k === Kind.Larva && e.built[i] === 1) {
        idleLarvae.push(i);
      } else if (k === faction.armyStructure) {
        if (e.built[i] === 1) builtBarracks.push(i);
        else pendingBarracks++;
      } else if (k === faction.supplyStructure && e.built[i] !== 1) {
        pendingSupply++;
      }
      const def = Units[k]!;
      if (k !== faction.armyUnit && (fl & Role.Mobile) !== 0 && hasAnyWeapon(def) && e.order[i] === Order.Idle) idleArmy.push(i);
    }
    if (depot === NONE) return cmds; // no base: nothing to do

    const budget: ResourceBudget = { minerals: s.players.minerals[p]!, gas: s.players.gas[p]! };
    let minerals = budget.minerals;
    const spend = (mineralsAmount: number, gasAmount = 0): void => {
      budget.minerals -= mineralsAmount;
      budget.gas -= gasAmount;
      minerals = budget.minerals;
    };
    let reservedSupply = s.players.supplyUsed[p]!;
    const cap = s.players.supplyMax[p]!;
    const room = (need: number): boolean => reservedSupply + need <= cap;
    const workerProducer = workerDef.buildMethod === 'larva' ? idleLarvae : idleDepots;
    const armyProducer = armyDef.buildMethod === 'larva' ? idleLarvae : builtBarracks;
    const usedProducers = new Set<number>();
    let builderUsed = false;
    const takeLarva = (): number => {
      for (const l of idleLarvae) {
        if (!usedProducers.has(l)) { usedProducers.add(l); return l; }
      }
      return NONE;
    };

    // Worker target: derived from how many patches this base can mine (income now
    // saturates at ~WORKERS_PER_PATCH each, so over-building workers is wasted supply).
    let patches = 0;
    for (let i = 0; i < e.hi; i++) {
      if (e.alive[i] === 1 && (e.flags[i]! & Role.Resource) !== 0 && withinTiles(s, i, e.x[depot]!, e.y[depot]!, 14)) patches++;
    }
    const workerTarget = c.workerTarget ?? Math.max(8, Math.min(24, patches * WORKERS_PER_PATCH + 2));

    // Rally barracks to a staging point toward the centre so produced units form up
    // in the open instead of jamming the production exit (ground units now collide).
    if (builtBarracks.length) {
      const cxFx = Math.trunc((s.map.w * TILE * ONE) / 2);
      const cyFx = Math.trunc((s.map.h * TILE * ONE) / 2);
      const dx = cxFx - e.x[depot]!; const dy = cyFx - e.y[depot]!;
      const d = isqrt(dx * dx + dy * dy) || 1;
      const stage = 5 * TILE * ONE;
      const sx = e.x[depot]! + Math.trunc((dx * stage) / d);
      const sy = e.y[depot]! + Math.trunc((dy * stage) / d);
      for (const b of builtBarracks) if (e.rallyX[b]! < 0) cmds.push({ t: 'rally', building: eid(e, b), x: sx, y: sy });
    }

    // 1) Workers from idle depots.
    for (const d of workerProducer) {
      if (d === NONE || workers >= workerTarget) continue;
      if (usedProducers.has(d)) continue;
      const n = productionCount(faction.worker);
      const cost = workerDef.minerals * productionCostCount(faction.worker);
      if (minerals >= cost && room(workerDef.supply * n)) {
        cmds.push({ t: 'train', building: eid(e, d), kind: faction.worker });
        usedProducers.add(d);
        spend(cost);
        reservedSupply += workerDef.supply * n;
        workers += n;
      }
    }

    // 2) Supply when nearly capped.
    if (cap < SUPPLY_CAP && cap - reservedSupply <= supply(2) && pendingSupply === 0 && minerals >= supplyDef.minerals && supplyDef.buildMethod === 'larva') {
      const larva = takeLarva();
      if (larva !== NONE) {
        cmds.push({ t: 'train', building: eid(e, larva), kind: faction.supplyStructure });
        spend(supplyDef.minerals);
        pendingSupply++;
      }
    } else if (cap < SUPPLY_CAP && cap - reservedSupply <= supply(2) && pendingSupply === 0 && minerals >= supplyDef.minerals && aWorker !== NONE) {
      const spot = findSpot(s, p, aWorker, faction.supplyStructure, e.x[depot]!, e.y[depot]!);
      if (spot) {
        cmds.push({ t: 'build', unit: eid(e, aWorker), kind: faction.supplyStructure, x: spot.x, y: spot.y });
        spend(supplyDef.minerals);
        builderUsed = true;
        pendingSupply++;
      }
    }

    // 3) Army structures.
    else if (rax.buildMethod !== 'larva' && builtBarracks.length + pendingBarracks < c.barracksTarget &&
             minerals >= rax.minerals && budget.gas >= rax.gas && aWorker !== NONE && !builderUsed) {
      const spot = findMacroSpot(s, p, aWorker, faction.armyStructure, depot);
      if (spot) {
        cmds.push({ t: 'build', unit: eid(e, aWorker), kind: faction.armyStructure, x: spot.x, y: spot.y });
        spend(rax.minerals, rax.gas);
        builderUsed = true;
        pendingBarracks++;
      }
    }

    if (!builderUsed) {
      builderUsed = maybeQueueProtossTechStructures(s, p, faction, cmds, budget, aWorker, depot);
      minerals = budget.minerals;
    }

    if (!builderUsed) {
      builderUsed = maybeQueueZergTechStructures(s, p, faction, cmds, budget, aWorker, depot);
      minerals = budget.minerals;
    }

    maybeQueueTerranAddons(s, p, faction, cmds, budget);
    minerals = budget.minerals;

    maybeQueueZergMorphs(s, p, faction, cmds, budget);
    minerals = budget.minerals;

    // 4) Pump army from the faction's real producer.
    for (const b of armyProducer) {
      if (b === NONE || e.prodKind[b] !== Kind.None) continue;
      if (usedProducers.has(b)) continue;
      const n = productionCount(faction.armyUnit);
      const cost = armyDef.minerals * productionCostCount(faction.armyUnit);
      const gasCost = armyDef.gas * productionCostCount(faction.armyUnit);
      if (minerals >= cost && budget.gas >= gasCost && room(armyDef.supply * n)) {
        cmds.push({ t: 'train', building: eid(e, b), kind: faction.armyUnit });
        usedProducers.add(b);
        spend(cost, gasCost);
        reservedSupply += armyDef.supply * n;
      }
    }

    // 5) Defense: enemy near our base -> idle army engages the nearest enemy.
    const threat = nearest(s, e.x[depot]!, e.y[depot]!, (sl) => isEnemy(s, p, e.owner[sl]!) && withinTiles(s, sl, e.x[depot]!, e.y[depot]!, 18));
    if (threat !== NONE) {
      castTacticalAbilities(s, p, cmds, casters, e.x[threat]!, e.y[threat]!);
      for (const a of idleArmy) {
        if (maybeLaySpiderMine(s, cmds, a, threat)) continue;
        if (maybeBurrowForFight(s, cmds, a, threat)) continue;
        if (maybeTransformForFight(s, cmds, a, e.x[threat]!, e.y[threat]!)) continue;
        maybeStim(s, cmds, a);
        if (weaponForTarget(Units[e.kind[a]!]!, Units[e.kind[threat]!]!)) cmds.push({ t: 'attack', unit: eid(e, a), target: eid(e, threat) });
        else cmds.push({ t: 'amove', unit: eid(e, a), x: e.x[threat]!, y: e.y[threat]! });
      }
    } else if (army >= c.attackThreshold) {
      // 6) Offense: send idle army to the nearest enemy structure (else any enemy).
      let tgt = nearest(s, e.x[depot]!, e.y[depot]!, (sl) => isEnemy(s, p, e.owner[sl]!) && (e.flags[sl]! & Role.Structure) !== 0);
      if (tgt === NONE) tgt = nearest(s, e.x[depot]!, e.y[depot]!, (sl) => isEnemy(s, p, e.owner[sl]!));
      if (tgt !== NONE) {
        if (!builderUsed) {
          builderUsed = maybeQueueNydusEndpoint(s, p, cmds, budget, aWorker, e.x[tgt]!, e.y[tgt]!);
          minerals = budget.minerals;
        }
        castTacticalAbilities(s, p, cmds, casters, e.x[tgt]!, e.y[tgt]!);
        for (const a of idleArmy) {
          if (maybeUseNydusNetwork(s, p, cmds, a, e.x[tgt]!, e.y[tgt]!)) continue;
          if (maybeLaySpiderMine(s, cmds, a, tgt)) continue;
          if (maybeBurrowForFight(s, cmds, a, tgt)) continue;
          if (maybeTransformForFight(s, cmds, a, e.x[tgt]!, e.y[tgt]!)) continue;
          maybeStim(s, cmds, a);
          cmds.push({ t: 'amove', unit: eid(e, a), x: e.x[tgt]!, y: e.y[tgt]! });
        }
      }
    }

    return cmds;
  };
};

const maybeQueueTerranAddons = (
  s: State,
  player: number,
  faction: Faction,
  cmds: Command[],
  budget: ResourceBudget,
): void => {
  if (faction.name !== 'Terran') return;
  for (const kind of terranAddonMacro(s, player)) {
    if (maybeQueueAddon(s, player, cmds, budget, kind)) return;
  }
  maybeQueueAddon(s, player, cmds, budget, scienceFacilityAddon(s, player));
};

const maybeQueueProtossTechStructures = (
  s: State,
  player: number,
  faction: Faction,
  cmds: Command[],
  budget: ResourceBudget,
  worker: number,
  anchor: number,
): boolean => {
  if (faction.name !== 'Protoss') return false;
  for (const kind of PROTOSS_STRUCTURE_MACRO) {
    if (maybeQueueStructure(s, player, cmds, budget, worker, anchor, kind)) return true;
  }
  return false;
};

const maybeQueueZergTechStructures = (
  s: State,
  player: number,
  faction: Faction,
  cmds: Command[],
  budget: ResourceBudget,
  worker: number,
  anchor: number,
): boolean => {
  if (faction.name !== 'Zerg') return false;
  for (const kind of ZERG_STRUCTURE_MACRO) {
    if (maybeQueueStructure(s, player, cmds, budget, worker, anchor, kind)) return true;
  }
  return false;
};

const maybeQueueStructure = (
  s: State,
  player: number,
  cmds: Command[],
  budget: ResourceBudget,
  worker: number,
  anchor: number,
  kind: number,
): boolean => {
  if (worker === NONE || hasOwnedOrPendingStructure(s, player, kind)) return false;
  const def = Units[kind]!;
  if (budget.minerals < def.minerals || budget.gas < def.gas) return false;
  const spot = findMacroSpot(s, player, worker, kind, anchor);
  if (!spot) return false;
  const command: Command = { t: 'build', unit: eid(s.e, worker), kind, x: spot.x, y: spot.y };
  if (!validateCommand(s, player, command).ok) return false;
  cmds.push(command);
  budget.minerals -= def.minerals;
  budget.gas -= def.gas;
  return true;
};

const maybeQueueNydusEndpoint = (
  s: State,
  player: number,
  cmds: Command[],
  budget: ResourceBudget,
  worker: number,
  focusX: number,
  focusY: number,
): boolean => {
  if (worker === NONE) return false;
  const def = Units[Kind.NydusCanal]!;
  if (budget.minerals < def.minerals || budget.gas < def.gas) return false;

  const e = s.e;
  let completed = 0;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.owner[i] !== player) continue;
    if (e.kind[i] === Kind.NydusCanal) {
      if (e.built[i] === 1) completed++;
      else return false;
    }
    if ((e.flags[i]! & Role.Worker) !== 0 && e.buildKind[i] === Kind.NydusCanal) return false;
  }
  if (completed !== 1) return false;

  const spot = findSpot(s, player, worker, Kind.NydusCanal, focusX, focusY);
  if (!spot) return false;
  const command: Command = { t: 'build', unit: eid(e, worker), kind: Kind.NydusCanal, x: spot.x, y: spot.y };
  if (!validateCommand(s, player, command).ok) return false;
  cmds.push(command);
  budget.minerals -= def.minerals;
  budget.gas -= def.gas;
  return true;
};

const maybeQueueAddon = (
  s: State,
  player: number,
  cmds: Command[],
  budget: ResourceBudget,
  kind: number,
): boolean => {
  const e = s.e;
  const def = Units[kind]!;
  const parentKind = addonParentKind(kind);
  if (budget.minerals < def.minerals || budget.gas < def.gas) return false;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.owner[i] !== player || e.container[i] !== NONE || e.built[i] !== 1) continue;
    if (e.kind[i] !== parentKind) continue;
    const command: Command = { t: 'addon', building: eid(e, i), kind };
    if (!validateCommand(s, player, command).ok) continue;
    cmds.push(command);
    budget.minerals -= def.minerals;
    budget.gas -= def.gas;
    return true;
  }
  return false;
};

const maybeQueueTransform = (
  s: State,
  player: number,
  cmds: Command[],
  budget: ResourceBudget,
  slot: number,
  kind: number,
): boolean => {
  const def = Units[kind]!;
  if (budget.minerals < def.minerals || budget.gas < def.gas) return false;
  const command: Command = { t: 'transform', unit: eid(s.e, slot), kind };
  if (!validateCommand(s, player, command).ok) return false;
  cmds.push(command);
  budget.minerals -= def.minerals;
  budget.gas -= def.gas;
  return true;
};

const maybeQueueZergMorphs = (
  s: State,
  player: number,
  faction: Faction,
  cmds: Command[],
  budget: ResourceBudget,
): void => {
  if (faction.name !== 'Zerg') return;
  const e = s.e;
  let uniqueMorphs = 0;
  let repeatableMorphStarted = false;

  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.container[i] !== NONE || e.owner[i] !== player) continue;
    uniqueMorphs |= zergUniqueMorphMask(e.kind[i]!);
  }

  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.container[i] !== NONE || e.owner[i] !== player || e.built[i] !== 1) continue;
    const kind = e.kind[i]!;
    for (let m = 0; m < ZERG_UNIQUE_MORPH_MACRO.length; m++) {
      const morph = ZERG_UNIQUE_MORPH_MACRO[m]!;
      if ((uniqueMorphs & (1 << m)) !== 0 || kind !== morph.from) continue;
      if (maybeQueueTransform(s, player, cmds, budget, i, morph.to)) uniqueMorphs |= zergUniqueMorphMask(morph.to);
      break;
    }
    for (const morph of ZERG_REPEATABLE_MORPH_MACRO) {
      if (repeatableMorphStarted || kind !== morph.from) continue;
      repeatableMorphStarted = maybeQueueTransform(s, player, cmds, budget, i, morph.to);
    }
    if (uniqueMorphs === ALL_ZERG_UNIQUE_MORPHS && repeatableMorphStarted) return;
  }
};

const maybeStim = (s: State, cmds: Command[], slot: number): void => {
  const e = s.e;
  const def = Units[e.kind[slot]!]!;
  if (!def.abilities.includes(Ability.StimPack)) return;
  if (!hasTechForAbility(s, e.owner[slot]!, Ability.StimPack)) return;
  if (e.stimTimer[slot]! > 0 || e.hp[slot]! <= 20) return;
  cmds.push({ t: 'ability', unit: eid(e, slot), ability: Ability.StimPack });
};

const maybeTransformForFight = (s: State, cmds: Command[], slot: number, focusX: number, focusY: number): boolean => {
  const e = s.e;
  const kind = e.kind[slot]!;
  if (kind !== Kind.SiegeTank && kind !== Kind.SiegeTankSieged) return false;
  const owner = e.owner[slot]!;
  if (kind === Kind.SiegeTank && getTechLevel(s, owner, Tech.SiegeTech) <= 0) return false;
  const weapon = Units[Kind.SiegeTankSieged]!.weapon!;
  const dx = focusX - e.x[slot]!;
  const dy = focusY - e.y[slot]!;
  const d2 = dx * dx + dy * dy;
  const min = weapon.minRange ?? 0;
  const usefulSiege = d2 >= min * min && d2 <= weapon.range * weapon.range;
  if (kind === Kind.SiegeTank && usefulSiege) {
    cmds.push({ t: 'transform', unit: eid(e, slot), kind: Kind.SiegeTankSieged });
    return true;
  }
  if (kind === Kind.SiegeTankSieged && !usefulSiege) {
    cmds.push({ t: 'transform', unit: eid(e, slot), kind: Kind.SiegeTank });
    return true;
  }
  return false;
};

const maybeBurrowForFight = (s: State, cmds: Command[], slot: number, target: number): boolean => {
  const e = s.e;
  if (e.kind[slot] !== Kind.Lurker || e.burrowed[slot] === 1) return false;
  const weapon = Units[Kind.Lurker]!.weapon!;
  if (!weaponForTarget(Units[Kind.Lurker]!, Units[e.kind[target]!]!)) return false;
  if (distanceSq(e.x[slot]!, e.y[slot]!, e.x[target]!, e.y[target]!) > weapon.range * weapon.range) return false;
  cmds.push({ t: 'burrow', unit: eid(e, slot), active: true });
  return true;
};

const maybeLaySpiderMine = (s: State, cmds: Command[], slot: number, target: number): boolean => {
  const e = s.e;
  if (e.kind[slot] !== Kind.Vulture || e.specialAmmo[slot]! <= 0) return false;
  if (getTechLevel(s, e.owner[slot]!, Tech.SpiderMines) <= 0) return false;
  if ((e.flags[target]! & (Role.Mobile | Role.Air | Role.Structure | Role.Resource)) !== Role.Mobile) return false;
  if (distanceSq(e.x[slot]!, e.y[slot]!, e.x[target]!, e.y[target]!) > (TILE * ONE * 4) ** 2) return false;
  cmds.push({ t: 'mine', unit: eid(e, slot) });
  return true;
};

const maybeUseNydusNetwork = (s: State, player: number, cmds: Command[], unit: number, focusX: number, focusY: number): boolean => {
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
    if (!canLoadInto(s, i, unit) || cargoUsed(s, i) + def.cargoSize > Units[Kind.NydusCanal]!.cargoCapacity) continue;
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
    if (distanceSq(e.x[exit]!, e.y[exit]!, x, y) <= UNLOAD_RANGE * UNLOAD_RANGE && unloadPassable(s, x, y)) {
      return { x, y };
    }
  }
  return null;
};

const hasTechForAbility = (s: State, player: number, abilityId: number): boolean => {
  const ability = Abilities[abilityId];
  return !ability?.tech || getTechLevel(s, player, ability.tech) > 0;
};

const castTacticalAbilities = (s: State, player: number, cmds: Command[], casters: number[], focusX: number, focusY: number): void => {
  const used = new Set<number>();
  for (const caster of casters) {
    if (used.has(caster)) continue;
    const def = Units[s.e.kind[caster]!]!;
    if (def.abilities.includes(Ability.ShieldRecharge) && maybeCastShieldRecharge(s, player, cmds, caster)) { used.add(caster); continue; }
    if (def.abilities.includes(Ability.Restoration) && maybeCastRestoration(s, player, cmds, caster)) { used.add(caster); continue; }
    if (def.abilities.includes(Ability.Heal) && maybeCastHeal(s, player, cmds, caster)) { used.add(caster); continue; }
    if (def.abilities.includes(Ability.ScannerSweep) && maybeCastScanner(s, player, cmds, caster)) { used.add(caster); continue; }
    if (def.abilities.includes(Ability.Consume) && maybeCastConsume(s, player, cmds, caster)) { used.add(caster); continue; }
    if (def.abilities.includes(Ability.Hallucination) && maybeCastHallucination(s, player, cmds, caster, focusX, focusY)) { used.add(caster); continue; }
    if (def.abilities.includes(Ability.Recall) && maybeCastRecall(s, player, cmds, caster, focusX, focusY)) { used.add(caster); continue; }
    if (def.abilities.includes(Ability.MindControl) && maybeCastEntityAbility(s, player, cmds, caster, Ability.MindControl, scoreMindControlTarget)) { used.add(caster); continue; }
    if (def.abilities.includes(Ability.YamatoGun) && maybeCastEntityAbility(s, player, cmds, caster, Ability.YamatoGun, scoreYamatoTarget)) { used.add(caster); continue; }
    if (def.abilities.includes(Ability.NuclearStrike) && maybeCastPointAbility(s, player, cmds, caster, Ability.NuclearStrike, scoreNukeTarget, focusX, focusY)) { used.add(caster); continue; }
    if (def.abilities.includes(Ability.InfestCommandCenter) && maybeCastEntityAbility(s, player, cmds, caster, Ability.InfestCommandCenter, scoreInfestTarget)) { used.add(caster); continue; }
    if (def.abilities.includes(Ability.SpawnBroodling) && maybeCastEntityAbility(s, player, cmds, caster, Ability.SpawnBroodling, scoreBroodlingTarget)) { used.add(caster); continue; }
    if (def.abilities.includes(Ability.Parasite) && maybeCastEntityAbility(s, player, cmds, caster, Ability.Parasite, scoreParasiteTarget)) { used.add(caster); continue; }
    if (def.abilities.includes(Ability.Feedback) && maybeCastEntityAbility(s, player, cmds, caster, Ability.Feedback, scoreFeedbackTarget)) { used.add(caster); continue; }
    if (def.abilities.includes(Ability.OpticalFlare) && maybeCastEntityAbility(s, player, cmds, caster, Ability.OpticalFlare, scoreOpticalFlareTarget)) { used.add(caster); continue; }
    if (def.abilities.includes(Ability.Lockdown) && maybeCastEntityAbility(s, player, cmds, caster, Ability.Lockdown, scoreLockdownTarget)) { used.add(caster); continue; }
    if (def.abilities.includes(Ability.Irradiate) && maybeCastEntityAbility(s, player, cmds, caster, Ability.Irradiate, scoreIrradiateTarget)) { used.add(caster); continue; }
    if (def.abilities.includes(Ability.EMPShockwave) && maybeCastPointAbility(s, player, cmds, caster, Ability.EMPShockwave, scoreEmpTarget)) { used.add(caster); continue; }
    if (def.abilities.includes(Ability.PsionicStorm) && maybeCastPointAbility(s, player, cmds, caster, Ability.PsionicStorm, scoreStormTarget, focusX, focusY)) { used.add(caster); continue; }
    if (def.abilities.includes(Ability.Plague) && maybeCastPointAbility(s, player, cmds, caster, Ability.Plague, scorePlagueTarget, focusX, focusY)) { used.add(caster); continue; }
    if (def.abilities.includes(Ability.Ensnare) && maybeCastPointAbility(s, player, cmds, caster, Ability.Ensnare, scoreEnsnareTarget, focusX, focusY)) { used.add(caster); continue; }
    if (def.abilities.includes(Ability.Maelstrom) && maybeCastPointAbility(s, player, cmds, caster, Ability.Maelstrom, scoreMaelstromTarget, focusX, focusY)) { used.add(caster); continue; }
    if (def.abilities.includes(Ability.StasisField) && maybeCastPointAbility(s, player, cmds, caster, Ability.StasisField, scoreStasisTarget, focusX, focusY)) { used.add(caster); continue; }
    if (def.abilities.includes(Ability.DisruptionWeb) && maybeCastPointAbility(s, player, cmds, caster, Ability.DisruptionWeb, scoreDisruptionWebTarget, focusX, focusY)) { used.add(caster); continue; }
    if (def.abilities.includes(Ability.DefensiveMatrix) && maybeCastMatrix(s, player, cmds, caster, focusX, focusY)) { used.add(caster); continue; }
    if (def.abilities.includes(Ability.PersonnelCloaking) && maybeCastCloak(s, cmds, caster, Ability.PersonnelCloaking, focusX, focusY)) { used.add(caster); continue; }
    if (def.abilities.includes(Ability.CloakingField) && maybeCastCloak(s, cmds, caster, Ability.CloakingField, focusX, focusY)) { used.add(caster); continue; }
    if (def.abilities.includes(Ability.DarkSwarm) && maybeCastPointAbility(s, player, cmds, caster, Ability.DarkSwarm, scoreDarkSwarmTarget, focusX, focusY)) used.add(caster);
  }
};

const abilityThreshold = (abilityId: number): number => {
  switch (abilityId) {
    case Ability.MindControl: return 180;
    case Ability.EMPShockwave: return 100;
    case Ability.PsionicStorm: return 70;
    case Ability.Plague: return 40;
    case Ability.Ensnare: return 80;
    case Ability.Maelstrom: return 90;
    case Ability.StasisField: return 140;
    case Ability.DisruptionWeb: return 70;
    case Ability.DarkSwarm: return 60;
    case Ability.ScannerSweep: return 1;
    case Ability.Parasite: return 220;
    case Ability.OpticalFlare: return 100;
    case Ability.InfestCommandCenter: return 1;
    case Ability.NuclearStrike: return 650;
    default: return 1;
  }
};

const maybeCastHeal = (s: State, player: number, cmds: Command[], caster: number): boolean => {
  const e = s.e;
  const ability = Abilities[Ability.Heal]!;
  if (!hasTechForAbility(s, player, Ability.Heal) || e.energy[caster]! < ability.energyCost) return false;
  let best = NONE;
  let bestMissing = 6;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.container[i] !== NONE || e.owner[i] !== player || (unitTraits(e.kind[i]!) & Trait.Biological) === 0) continue;
    if (distanceSq(e.x[caster]!, e.y[caster]!, e.x[i]!, e.y[i]!) > ability.range * ability.range) continue;
    const missing = Units[e.kind[i]!]!.hp - e.hp[i]!;
    if (missing > bestMissing) { bestMissing = missing; best = i; }
  }
  if (best === NONE) return false;
  cmds.push({ t: 'ability', unit: eid(e, caster), ability: Ability.Heal, target: eid(e, best) });
  return true;
};

const maybeCastShieldRecharge = (s: State, player: number, cmds: Command[], caster: number): boolean => {
  const e = s.e;
  const ability = Abilities[Ability.ShieldRecharge]!;
  if (e.energy[caster]! < ability.energyCost) return false;
  let best = NONE;
  let bestMissing = 8;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.container[i] !== NONE || e.owner[i] !== player || (e.flags[i]! & Role.Mobile) === 0) continue;
    if (distanceSq(e.x[caster]!, e.y[caster]!, e.x[i]!, e.y[i]!) > ability.range * ability.range) continue;
    const missing = Units[e.kind[i]!]!.shields - e.shield[i]!;
    if (missing > bestMissing) { bestMissing = missing; best = i; }
  }
  if (best === NONE) return false;
  cmds.push({ t: 'ability', unit: eid(e, caster), ability: Ability.ShieldRecharge, target: eid(e, best) });
  return true;
};

const maybeCastRestoration = (s: State, player: number, cmds: Command[], caster: number): boolean => {
  const e = s.e;
  const ability = Abilities[Ability.Restoration]!;
  if (!hasTechForAbility(s, player, Ability.Restoration) || e.energy[caster]! < ability.energyCost) return false;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.container[i] !== NONE || e.owner[i] !== player || (unitTraits(e.kind[i]!) & Trait.Biological) === 0) continue;
    if (distanceSq(e.x[caster]!, e.y[caster]!, e.x[i]!, e.y[i]!) > ability.range * ability.range) continue;
    if (hasRestorableStatus(e, i)) {
      cmds.push({ t: 'ability', unit: eid(e, caster), ability: Ability.Restoration, target: eid(e, i) });
      return true;
    }
  }
  return false;
};

const maybeCastPointAbility = (
  s: State,
  player: number,
  cmds: Command[],
  caster: number,
  abilityId: number,
  scoreFn: (s: State, player: number, x: number, y: number) => number,
  focusX = s.e.x[caster]!,
  focusY = s.e.y[caster]!,
): boolean => {
  const e = s.e;
  const ability = Abilities[abilityId]!;
  if (!hasTechForAbility(s, player, abilityId)) return false;
  if (abilityId === Ability.NuclearStrike && !hasReadyNuke(s, player)) return false;
  if (e.energy[caster]! < ability.energyCost) return false;
  let best = NONE;
  let bestScore = abilityThreshold(abilityId);
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.container[i] !== NONE || !isEnemy(s, player, e.owner[i]!)) continue;
    if (distanceSq(e.x[caster]!, e.y[caster]!, e.x[i]!, e.y[i]!) > ability.range * ability.range) continue;
    const focusPenalty = Math.trunc(isqrt(distanceSq(e.x[i]!, e.y[i]!, focusX, focusY)) / (TILE * ONE));
    const score = scoreFn(s, player, e.x[i]!, e.y[i]!) - focusPenalty;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  if (best === NONE) return false;
  cmds.push({ t: 'ability', unit: eid(e, caster), ability: abilityId, x: e.x[best]!, y: e.y[best]! });
  return true;
};

const maybeCastEntityAbility = (
  s: State,
  player: number,
  cmds: Command[],
  caster: number,
  abilityId: number,
  scoreFn: (s: State, player: number, slot: number) => number,
): boolean => {
  const e = s.e;
  const ability = Abilities[abilityId]!;
  if (!hasTechForAbility(s, player, abilityId)) return false;
  if (e.energy[caster]! < ability.energyCost) return false;
  let best = NONE;
  let bestScore = abilityThreshold(abilityId);
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.container[i] !== NONE || !isEnemy(s, player, e.owner[i]!)) continue;
    if (distanceSq(e.x[caster]!, e.y[caster]!, e.x[i]!, e.y[i]!) > ability.range * ability.range) continue;
    const score = scoreFn(s, player, i);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  if (best === NONE) return false;
  cmds.push({ t: 'ability', unit: eid(e, caster), ability: abilityId, target: eid(e, best) });
  return true;
};

const scoreEmpTarget = (s: State, player: number, x: number, y: number): number => {
  const e = s.e;
  const radius = Abilities[Ability.EMPShockwave]!.radius;
  let score = 0;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.container[i] !== NONE || distanceSq(e.x[i]!, e.y[i]!, x, y) > radius * radius) continue;
    const value = e.shield[i]! + e.energy[i]! * 2;
    if (isEnemy(s, player, e.owner[i]!)) score += value;
    else if (e.owner[i] === player) score -= value;
  }
  return score;
};

const scoreStormTarget = (s: State, player: number, x: number, y: number): number => {
  const e = s.e;
  const radius = Abilities[Ability.PsionicStorm]!.radius;
  let score = 0;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.container[i] !== NONE || distanceSq(e.x[i]!, e.y[i]!, x, y) > radius * radius) continue;
    const def = Units[e.kind[i]!]!;
    if ((def.roles & Role.Mobile) === 0) continue;
    const value = Math.min(112, e.hp[i]! + e.shield[i]!);
    if (isEnemy(s, player, e.owner[i]!)) score += value;
    else if (e.owner[i] === player) score -= value * 2;
  }
  return score;
};

const scorePlagueTarget = (s: State, player: number, x: number, y: number): number =>
  scoreArea(s, player, x, y, Abilities[Ability.Plague]!.radius, (slot) => Math.min(300, s.e.hp[slot]! + s.e.shield[slot]!), 2);

const scoreEnsnareTarget = (s: State, player: number, x: number, y: number): number =>
  scoreArea(s, player, x, y, Abilities[Ability.Ensnare]!.radius,
    (slot) => (s.e.flags[slot]! & Role.Mobile) !== 0 && s.e.ensnareTimer[slot]! <= 0 ? 50 + Math.min(100, s.e.hp[slot]!) : 0, 1);

const scoreMaelstromTarget = (s: State, player: number, x: number, y: number): number =>
  scoreArea(s, player, x, y, Abilities[Ability.Maelstrom]!.radius,
    (slot) => (unitTraits(s.e.kind[slot]!) & Trait.Biological) !== 0 && s.e.maelstromTimer[slot]! <= 0 ? 60 + Math.min(120, s.e.hp[slot]!) : 0, 2);

const scoreStasisTarget = (s: State, player: number, x: number, y: number): number =>
  scoreArea(s, player, x, y, Abilities[Ability.StasisField]!.radius,
    (slot) => (s.e.flags[slot]! & Role.Mobile) !== 0 && s.e.stasisTimer[slot]! <= 0 ? Math.min(220, s.e.hp[slot]! + s.e.shield[slot]!) : 0, 2);

const scoreDisruptionWebTarget = (s: State, player: number, x: number, y: number): number =>
  scoreArea(s, player, x, y, Abilities[Ability.DisruptionWeb]!.radius, (slot) => {
    const def = Units[s.e.kind[slot]!]!;
    return (s.e.flags[slot]! & Role.Air) === 0 && def.weapon ? 80 : 0;
  }, 2);

const scoreDarkSwarmTarget = (s: State, player: number, x: number, y: number): number => {
  const e = s.e;
  const radius = Abilities[Ability.DarkSwarm]!.radius;
  let friendlyMelee = 0;
  let enemyRanged = 0;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.container[i] !== NONE || distanceSq(e.x[i]!, e.y[i]!, x, y) > radius * radius) continue;
    const def = Units[e.kind[i]!]!;
    const groundWeapon = def.weapon;
    if (e.owner[i] === player && groundWeapon && groundWeapon.range <= TILE * ONE * 2) friendlyMelee += 60;
    else if (isEnemy(s, player, e.owner[i]!) && groundWeapon && groundWeapon.range > TILE * ONE * 2) enemyRanged += 50;
  }
  return friendlyMelee + enemyRanged;
};

const scoreNukeTarget = (s: State, player: number, x: number, y: number): number =>
  scoreArea(s, player, x, y, Abilities[Ability.NuclearStrike]!.radius, (slot) => {
    if ((s.e.flags[slot]! & Role.Resource) !== 0) return 0;
    const def = Units[s.e.kind[slot]!]!;
    const structure = (s.e.flags[slot]! & Role.Structure) !== 0 ? 160 : 0;
    return structure + Math.min(500, s.e.hp[slot]! + s.e.shield[slot]!) + def.gas;
  }, 3);

const scoreYamatoTarget = (s: State, _player: number, slot: number): number =>
  Math.min(260, s.e.hp[slot]! + s.e.shield[slot]!) + (Units[s.e.kind[slot]!]!.gas > 0 ? 80 : 0);

const scoreMindControlTarget = (s: State, _player: number, slot: number): number =>
  Math.min(500, s.e.hp[slot]! + s.e.shield[slot]!) + Units[s.e.kind[slot]!]!.gas + Units[s.e.kind[slot]!]!.supply * 8;

const scoreBroodlingTarget = (s: State, _player: number, slot: number): number => {
  const traits = unitTraits(s.e.kind[slot]!);
  if ((s.e.flags[slot]! & (Role.Mobile | Role.Air)) !== Role.Mobile) return 0;
  if ((traits & Trait.Biological) === 0 || (traits & Trait.Robotic) !== 0) return 0;
  return Math.min(260, s.e.hp[slot]! + s.e.shield[slot]!);
};

const scoreFeedbackTarget = (s: State, _player: number, slot: number): number =>
  s.e.energy[slot]! > 0 ? s.e.energy[slot]! * 2 : 0;

const scoreParasiteTarget = (s: State, _player: number, slot: number): number => {
  if (s.e.parasiteOwner[slot]! !== 255) return 0;
  const detector = (unitTraits(s.e.kind[slot]!) & Trait.Detector) !== 0 ? 120 : 0;
  return detector + Math.min(160, s.e.hp[slot]! + s.e.shield[slot]!) + (Units[s.e.kind[slot]!]!.sight * 8);
};

const scoreOpticalFlareTarget = (s: State, _player: number, slot: number): number => {
  if (s.e.opticalFlare[slot] === 1) return 0;
  const detector = (unitTraits(s.e.kind[slot]!) & Trait.Detector) !== 0 ? 150 : 0;
  const caster = s.e.energy[slot]! > 0 ? 60 : 0;
  const armed = Units[s.e.kind[slot]!]!.weapon || Units[s.e.kind[slot]!]!.airWeapon ? 40 : 0;
  return detector + caster + armed + Units[s.e.kind[slot]!]!.sight * 4;
};

const scoreLockdownTarget = (s: State, _player: number, slot: number): number => {
  if ((unitTraits(s.e.kind[slot]!) & Trait.Mechanical) === 0 || (s.e.flags[slot]! & Role.Mobile) === 0 || s.e.lockdownTimer[slot]! > 0) return 0;
  return Math.min(220, s.e.hp[slot]! + s.e.shield[slot]!) + (Units[s.e.kind[slot]!]!.weapon ? 60 : 0);
};

const scoreIrradiateTarget = (s: State, player: number, slot: number): number => {
  const e = s.e;
  if ((unitTraits(e.kind[slot]!) & Trait.Biological) === 0 || e.irradiateTimer[slot]! > 0) return 0;
  const radius = Abilities[Ability.Irradiate]!.radius;
  return scoreArea(s, player, e.x[slot]!, e.y[slot]!, radius,
    (target) => (unitTraits(e.kind[target]!) & Trait.Biological) !== 0 && (e.flags[target]! & Role.Mobile) !== 0 ? 70 : 0, 2);
};

const maybeCastMatrix = (s: State, player: number, cmds: Command[], caster: number, focusX: number, focusY: number): boolean => {
  const e = s.e;
  const ability = Abilities[Ability.DefensiveMatrix]!;
  if (!hasTechForAbility(s, player, Ability.DefensiveMatrix)) return false;
  if (e.energy[caster]! < ability.energyCost) return false;
  let best = NONE;
  let bestScore = 90;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.container[i] !== NONE || e.owner[i] !== player || (e.flags[i]! & Role.Mobile) === 0 || e.matrixTimer[i]! > 0) continue;
    if (distanceSq(e.x[caster]!, e.y[caster]!, e.x[i]!, e.y[i]!) > ability.range * ability.range) continue;
    const def = Units[e.kind[i]!]!;
    const missing = Math.max(0, def.hp - e.hp[i]!) + Math.max(0, def.shields - e.shield[i]!);
    const nearFight = distanceSq(e.x[i]!, e.y[i]!, focusX, focusY) <= (TILE * ONE * 7) ** 2 ? 80 : 0;
    const score = missing + nearFight + (def.weapon || def.airWeapon ? 40 : 0);
    if (score > bestScore) { bestScore = score; best = i; }
  }
  if (best === NONE) return false;
  cmds.push({ t: 'ability', unit: eid(e, caster), ability: Ability.DefensiveMatrix, target: eid(e, best) });
  return true;
};

const maybeCastScanner = (s: State, player: number, cmds: Command[], caster: number): boolean => {
  const e = s.e;
  const ability = Abilities[Ability.ScannerSweep]!;
  if (!hasTechForAbility(s, player, Ability.ScannerSweep)) return false;
  if (e.energy[caster]! < ability.energyCost) return false;
  let best = NONE;
  let bestScore = 0;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.container[i] !== NONE || !isEnemy(s, player, e.owner[i]!) || !isCloaked(s, i) || canDetect(s, player, i)) continue;
    const def = Units[e.kind[i]!]!;
    const score = e.hp[i]! + e.shield[i]! + (def.weapon || def.airWeapon ? 60 : 0);
    if (score > bestScore) { bestScore = score; best = i; }
  }
  if (best === NONE) return false;
  cmds.push({ t: 'ability', unit: eid(e, caster), ability: Ability.ScannerSweep, x: e.x[best]!, y: e.y[best]! });
  return true;
};

const maybeCastCloak = (s: State, cmds: Command[], caster: number, abilityId: number, focusX: number, focusY: number): boolean => {
  const e = s.e;
  const ability = Abilities[abilityId]!;
  if (!hasTechForAbility(s, e.owner[caster]!, abilityId)) return false;
  if (e.cloakActive[caster] === 1 || e.energy[caster]! < ability.energyCost + 1) return false;
  if (distanceSq(e.x[caster]!, e.y[caster]!, focusX, focusY) > (TILE * ONE * 10) ** 2) return false;
  cmds.push({ t: 'ability', unit: eid(e, caster), ability: abilityId });
  return true;
};

const maybeCastRecall = (s: State, player: number, cmds: Command[], caster: number, focusX: number, focusY: number): boolean => {
  const e = s.e;
  const ability = Abilities[Ability.Recall]!;
  if (!hasTechForAbility(s, player, Ability.Recall) || e.energy[caster]! < ability.energyCost) return false;
  if (distanceSq(e.x[caster]!, e.y[caster]!, focusX, focusY) > (TILE * ONE * 12) ** 2) return false;
  let best = NONE;
  let bestScore = 180;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.container[i] !== NONE || e.owner[i] !== player || (e.flags[i]! & Role.Mobile) === 0 || i === caster) continue;
    if (distanceSq(e.x[i]!, e.y[i]!, e.x[caster]!, e.y[caster]!) < (TILE * ONE * 8) ** 2) continue;
    const score = scoreFriendlyRecallCluster(s, player, e.x[i]!, e.y[i]!, ability.radius);
    if (score > bestScore) { bestScore = score; best = i; }
  }
  if (best === NONE) return false;
  cmds.push({ t: 'ability', unit: eid(e, caster), ability: Ability.Recall, x: e.x[best]!, y: e.y[best]! });
  return true;
};

const maybeCastHallucination = (s: State, player: number, cmds: Command[], caster: number, focusX: number, focusY: number): boolean => {
  const e = s.e;
  const ability = Abilities[Ability.Hallucination]!;
  if (!hasTechForAbility(s, player, Ability.Hallucination) || e.energy[caster]! < ability.energyCost) return false;
  let best = NONE;
  let bestScore = 120;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.container[i] !== NONE || e.owner[i] !== player || e.illusion[i] === 1 || (e.flags[i]! & Role.Mobile) === 0) continue;
    if (!(Units[e.kind[i]!]!.weapon || Units[e.kind[i]!]!.airWeapon)) continue;
    if (distanceSq(e.x[caster]!, e.y[caster]!, e.x[i]!, e.y[i]!) > ability.range * ability.range) continue;
    const nearFight = distanceSq(e.x[i]!, e.y[i]!, focusX, focusY) <= (TILE * ONE * 10) ** 2 ? 80 : 0;
    const score = nearFight + e.hp[i]! + e.shield[i]! + Units[e.kind[i]!]!.supply * 8;
    if (score > bestScore) { bestScore = score; best = i; }
  }
  if (best === NONE) return false;
  cmds.push({ t: 'ability', unit: eid(e, caster), ability: Ability.Hallucination, target: eid(e, best) });
  return true;
};

const scoreInfestTarget = (s: State, _player: number, slot: number): number =>
  s.e.kind[slot] === Kind.CommandCenter && s.e.hp[slot]! * 2 <= Units[Kind.CommandCenter]!.hp ? 500 : 0;

const scoreFriendlyRecallCluster = (s: State, player: number, x: number, y: number, radius: number): number => {
  const e = s.e;
  let score = 0;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.container[i] !== NONE || e.owner[i] !== player || distanceSq(e.x[i]!, e.y[i]!, x, y) > radius * radius) continue;
    if ((e.flags[i]! & Role.Mobile) === 0 || !(Units[e.kind[i]!]!.weapon || Units[e.kind[i]!]!.airWeapon)) continue;
    score += 70 + Math.min(80, e.hp[i]! + e.shield[i]!);
  }
  return score;
};

const maybeCastConsume = (s: State, player: number, cmds: Command[], caster: number): boolean => {
  const e = s.e;
  const ability = Abilities[Ability.Consume]!;
  if (!hasTechForAbility(s, player, Ability.Consume)) return false;
  if (e.energy[caster]! > e.energyMax[caster]! - ability.damage) return false;
  let best = NONE;
  let bestScore = 80;
  for (let i = 0; i < e.hi; i++) {
    if (i === caster || e.alive[i] !== 1 || e.container[i] !== NONE || e.owner[i] !== player) continue;
    if (distanceSq(e.x[caster]!, e.y[caster]!, e.x[i]!, e.y[i]!) > ability.range * ability.range) continue;
    if ((e.flags[i]! & Role.Mobile) === 0 || (unitTraits(e.kind[i]!) & Trait.Biological) === 0) continue;
    const kind = e.kind[i]!;
    const expendable = kind === Kind.Broodling || kind === Kind.Zergling ? 140 : kind === Kind.Drone ? 60 : 90;
    const score = expendable - Math.min(80, e.hp[i]!);
    if (score > bestScore) { bestScore = score; best = i; }
  }
  if (best === NONE) return false;
  cmds.push({ t: 'ability', unit: eid(e, caster), ability: Ability.Consume, target: eid(e, best) });
  return true;
};

const scoreArea = (
  s: State,
  player: number,
  x: number,
  y: number,
  radius: number,
  value: (slot: number) => number,
  friendlyPenalty: number,
): number => {
  const e = s.e;
  let score = 0;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.container[i] !== NONE || distanceSq(e.x[i]!, e.y[i]!, x, y) > radius * radius) continue;
    const v = value(i);
    if (v <= 0) continue;
    if (isEnemy(s, player, e.owner[i]!)) score += v;
    else if (e.owner[i] === player) score -= v * friendlyPenalty;
  }
  return score;
};

const hasRestorableStatus = (e: State['e'], slot: number): boolean =>
  e.irradiateTimer[slot]! > 0 || e.plagueTimer[slot]! > 0 || e.ensnareTimer[slot]! > 0 ||
  e.lockdownTimer[slot]! > 0 || e.maelstromTimer[slot]! > 0 || e.opticalFlare[slot] === 1 ||
  e.parasiteOwner[slot]! !== 255;

const distanceSq = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
};

const withinTiles = (s: State, slot: number, x: number, y: number, t: number): boolean => {
  const dx = s.e.x[slot]! - x;
  const dy = s.e.y[slot]! - y;
  const r = t * TILE * ONE;
  return dx * dx + dy * dy <= r * r;
};
