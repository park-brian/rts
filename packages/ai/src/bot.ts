// A complete hardcoded AI in the spirit of docs/specs/ai-training.md §4: economy
// (workers + supply), tech (army structures), production (pump army), and military
// (attack in waves at the enemy, defend the base when threatened). God-vision,
// deterministic (no RNG), faction-driven. This is both the built-in opponent and
// the demonstrator we'll behavior-clone from later.

import {
  Role, Order, Kind, Units, canPlaceStructure, tileX, tileY, eid,
  NONE, TILE, SUPPLY_CAP, supply, type Faction, type State, type Command, type Controller,
  productionCostCount, productionCount,
  addonParentKind, hasCompletedKind, validateCommand,
  requiresPower,
  withinRangeSq,
} from '@rts/sim';
import { ONE, isqrt } from '@rts/sim';
import { castTacticalAbilities } from './ability-policies.ts';
import { type ResourceBudget } from './macro-build.ts';
import { maybeQueueCoreProductionCapacity, maybeQueueZergMacroHatchery } from './macro-capacity.ts';
import { issueDefenseEngagement, issuePressureEngagement } from './macro-combat.ts';
import { emergencyWorkerResponders, incidentTarget } from './macro-defense.ts';
import { maybeQueueExpansion } from './macro-expansion.ts';
import { maybeQueueZergMorphs } from './macro-morph.ts';
import { maybeQueueNydusEndpoint } from './macro-nydus.ts';
import { producerReserved, reserveProducer, type ProducerReservations } from './macro-producers.ts';
import { markPressureCommitted, pressureFocus, shouldCommitPressure } from './macro-pressure.ts';
import { maybeQueueRaceResearch } from './macro-research.ts';
import { maybeQueueRaceTechStructure } from './macro-tech.ts';
import {
  collectBotFacts,
  commitTacticalResponders,
  createBotMemory,
  deriveTacticalIncidents,
  rememberTacticalIncidents,
  type BotMemory,
} from './macro.ts';

export type BotConfig = {
  workerTarget?: number; // omit to auto-derive from the base's mineral-patch count
  barracksTarget: number;
  attackThreshold: number; // army size that triggers an attack wave
};

const DEFAULT: Omit<BotConfig, 'workerTarget'> = { barracksTarget: 3, attackThreshold: 12 };
const WORKERS_PER_PATCH = 2; // efficient saturation: patches are continuously mined ~2 deep
const TERRAN_ADDON_MACRO = [Kind.ComsatStation, Kind.MachineShop, Kind.ControlTower] as const;

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

const findExactSpot = (
  s: State,
  player: number,
  worker: number,
  kind: number,
  x: number,
  y: number,
): { x: number; y: number } | null => {
  const placement = canPlaceStructure(s, player, worker, kind, x, y);
  return placement.ok ? { x: placement.x, y: placement.y } : null;
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
  const supplyDef = Units[faction.supplyStructure]!;
  const rax = Units[faction.armyStructure]!;
  const memories = new Map<number, BotMemory>();
  const memoryFor = (player: number): BotMemory => {
    let memory = memories.get(player);
    if (!memory) {
      memory = createBotMemory();
      memories.set(player, memory);
    }
    return memory;
  };
  const prepareMemory = (player: number, tick: number): BotMemory => {
    let memory = memoryFor(player);
    if (tick < memory.lastTick) {
      memory = createBotMemory();
      memories.set(player, memory);
    }
    memory.lastTick = tick;
    return memory;
  };

  return (s: State, p: number): Command[] => {
    const e = s.e;
    const cmds: Command[] = [];

    const facts = collectBotFacts(s, p, faction, { risk: 'none' });
    const depot = facts.primaryBase;
    if (depot === NONE) return cmds; // no base: nothing to do

    let workers = facts.workers.length;
    let idleDepots: number[] = [];
    const idleLarvae = facts.idleLarvae;
    let builtBarracks: number[] = [];
    let pendingBarracks = 0;
    let pendingSupply = 0;
    const army = facts.army.length;
    const retaskableArmy = facts.retaskableArmy;
    const casters = facts.casters;
    let aWorker = NONE; // a worker we can pull to build

    for (let i = 0; i < e.hi; i++) {
      if (e.alive[i] !== 1 || e.container[i] !== NONE || e.owner[i] !== p) continue;
      const k = e.kind[i]!;
      const fl = e.flags[i]!;
      if (e.prodKind[i] === faction.supplyStructure) pendingSupply++;
      if (k === faction.worker) {
        if (aWorker === NONE && e.order[i] === Order.Harvest) aWorker = i;
        if ((fl & Role.Worker) !== 0 && e.buildKind[i] === faction.supplyStructure) pendingSupply++;
        if ((fl & Role.Worker) !== 0 && e.buildKind[i] === faction.armyStructure) pendingBarracks++;
      } else if (k === faction.depot && e.built[i] === 1) {
        if (e.prodKind[i] === Kind.None) idleDepots.push(i);
      } else if (k === faction.armyStructure) {
        if (e.built[i] === 1) builtBarracks.push(i);
        else pendingBarracks++;
      } else if (k === faction.supplyStructure && e.built[i] !== 1) {
        pendingSupply++;
      }
    }

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
    const reservedTechProducers: ProducerReservations = new Set();
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
      builderUsed = maybeQueueRaceTechStructure(s, p, faction, facts, cmds, budget, aWorker, depot, findMacroSpot);
      minerals = budget.minerals;
    }

    maybeQueueTerranAddons(s, p, faction, cmds, budget, reservedTechProducers);
    minerals = budget.minerals;

    maybeQueueZergMorphs(s, p, faction, cmds, budget);
    minerals = budget.minerals;

    maybeQueueRaceResearch(s, p, faction, cmds, budget, reservedTechProducers);
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

    if (!builderUsed) {
      builderUsed = maybeQueueCoreProductionCapacity(
        s,
        p,
        faction,
        cmds,
        budget,
        aWorker,
        depot,
        c.barracksTarget,
        findMacroSpot,
      );
      minerals = budget.minerals;
    }

    if (!builderUsed) {
      builderUsed = maybeQueueExpansion(s, p, faction, facts, cmds, budget, aWorker, findExactSpot);
      minerals = budget.minerals;
    }

    if (!builderUsed) {
      builderUsed = maybeQueueZergMacroHatchery(
        s,
        p,
        faction,
        cmds,
        budget,
        aWorker,
        depot,
        idleLarvae,
        usedProducers,
        findMacroSpot,
      );
      minerals = budget.minerals;
    }

    // 5) Defense: incidents protect every owned base, not only the initial depot.
    const visibleIncidents = deriveTacticalIncidents(s, facts);
    const memory = prepareMemory(p, s.tick);
    const incident = rememberTacticalIncidents(memory, visibleIncidents, s.tick)[0];
    const threat = incident ? incidentTarget(s, incident) : NONE;
    let attackCandidates = retaskableArmy;
    if (incident) {
      const focusX = threat !== NONE ? e.x[threat]! : incident.x;
      const focusY = threat !== NONE ? e.y[threat]! : incident.y;
      if (threat !== NONE) castTacticalAbilities(s, p, cmds, casters, focusX, focusY);
      const defenders = commitTacticalResponders(s, memory, retaskableArmy, incident, threat, s.tick);
      defenders.push(...emergencyWorkerResponders(s, facts.workers, incident, defenders.length, builderUsed ? aWorker : NONE));
      const defenderSet = new Set(defenders);
      attackCandidates = retaskableArmy.filter((slot) => !defenderSet.has(slot));
      for (const a of defenders) {
        issueDefenseEngagement(s, cmds, a, { x: focusX, y: focusY, target: threat });
      }
    }

    if (shouldCommitPressure(memory, s.tick, incident ? attackCandidates.length : army, c.attackThreshold)) {
      // 6) Offense: pressure the enemy's most valuable exposed region.
      const focus = pressureFocus(s, p, facts, depot);
      if (focus) {
        let issuedOffense = false;
        if (!builderUsed) {
          builderUsed = maybeQueueNydusEndpoint(s, p, cmds, budget, aWorker, focus.x, focus.y, findSpot);
          minerals = budget.minerals;
        }
        if (!incident) castTacticalAbilities(s, p, cmds, casters, focus.x, focus.y);
        for (const a of attackCandidates) {
          issuePressureEngagement(s, p, cmds, a, focus);
          issuedOffense = true;
        }
        if (issuedOffense) markPressureCommitted(memory, s.tick);
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
  reserved: ProducerReservations,
): void => {
  if (faction.name !== 'Terran') return;
  for (const kind of terranAddonMacro(s, player)) {
    if (maybeQueueAddon(s, player, cmds, budget, kind, reserved)) return;
  }
  maybeQueueAddon(s, player, cmds, budget, scienceFacilityAddon(s, player), reserved);
};

const maybeQueueAddon = (
  s: State,
  player: number,
  cmds: Command[],
  budget: ResourceBudget,
  kind: number,
  reserved?: ProducerReservations,
): boolean => {
  const e = s.e;
  const def = Units[kind]!;
  const parentKind = addonParentKind(kind);
  if (budget.minerals < def.minerals || budget.gas < def.gas) return false;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.owner[i] !== player || e.container[i] !== NONE || e.built[i] !== 1) continue;
    if (e.kind[i] !== parentKind) continue;
    if (reserved && producerReserved(s, reserved, i)) continue;
    const command: Command = { t: 'addon', building: eid(e, i), kind };
    if (!validateCommand(s, player, command).ok) continue;
    cmds.push(command);
    if (reserved) reserveProducer(s, reserved, i);
    budget.minerals -= def.minerals;
    budget.gas -= def.gas;
    return true;
  }
  return false;
};

const withinTiles = (s: State, slot: number, x: number, y: number, t: number): boolean => {
  return withinRangeSq(s.e.x[slot]!, s.e.y[slot]!, x, y, t * TILE * ONE);
};
