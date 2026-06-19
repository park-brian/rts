import {
  Tech,
  TechDefs,
  Kind,
  eid,
  getTechLevel,
  nextTechLevel,
  techGas,
  techMinerals,
  validateCommand,
  type Command,
  type Faction,
  type State,
} from '@rts/sim';
import { type ResourceBudget } from './macro-build.ts';
import type { BotFailureReason } from './macro-intents.ts';
import { producerReserved, reserveProducer, type ProducerReservations } from './macro-producers.ts';

const TERRAN_RESEARCH_MACRO = [
  Tech.StimPack,
  Tech.U238Shells,
  Tech.Restoration,
  Tech.OpticalFlare,
  Tech.CaduceusReactor,
  Tech.SpiderMines,
  Tech.SiegeTech,
  Tech.CharonBoosters,
  Tech.IonThrusters,
  Tech.PersonnelCloaking,
  Tech.Lockdown,
  Tech.OcularImplants,
  Tech.MoebiusReactor,
  Tech.CloakingField,
  Tech.ApolloReactor,
  Tech.YamatoCannon,
  Tech.ColossusReactor,
  Tech.EMPShockwave,
  Tech.Irradiate,
  Tech.TitanReactor,
  Tech.InfantryWeapons,
  Tech.InfantryArmor,
  Tech.VehicleWeapons,
  Tech.VehiclePlating,
  Tech.ShipWeapons,
  Tech.ShipPlating,
] as const;

const PROTOSS_RESEARCH_MACRO = [
  Tech.SingularityCharge,
  Tech.GroundWeapons,
  Tech.GroundArmor,
  Tech.PlasmaShields,
  Tech.AirWeapons,
  Tech.AirArmor,
  Tech.LegEnhancements,
  Tech.PsionicStorm,
  Tech.Hallucination,
  Tech.KhaydarinAmulet,
  Tech.Maelstrom,
  Tech.MindControl,
  Tech.ArgusTalisman,
  Tech.StasisField,
  Tech.Recall,
  Tech.KhaydarinCore,
  Tech.GraviticDrive,
  Tech.ReaverCapacity,
  Tech.ScarabDamage,
  Tech.SensorArray,
  Tech.GraviticBoosters,
  Tech.GraviticThrusters,
  Tech.CarrierCapacity,
  Tech.ApialSensors,
  Tech.ArgusJewel,
  Tech.DisruptionWeb,
] as const;

const ZERG_RESEARCH_MACRO = [
  Tech.Burrow,
  Tech.MetabolicBoost,
  Tech.LurkerAspect,
  Tech.GroovedSpines,
  Tech.MuscularAugments,
  Tech.PneumatizedCarapace,
  Tech.VentralSacs,
  Tech.Antennae,
  Tech.MeleeAttacks,
  Tech.MissileAttacks,
  Tech.Carapace,
  Tech.FlyerAttacks,
  Tech.FlyerCarapace,
  Tech.GameteMeiosis,
  Tech.Ensnare,
  Tech.SpawnBroodling,
  Tech.Plague,
  Tech.Consume,
  Tech.MetasynapticNode,
  Tech.AnabolicSynthesis,
  Tech.ChitinousPlating,
  Tech.AdrenalGlands,
] as const;

const researchMacro = (faction: Faction): readonly number[] => {
  if (faction.name === 'Terran') return TERRAN_RESEARCH_MACRO;
  if (faction.name === 'Protoss') return PROTOSS_RESEARCH_MACRO;
  if (faction.name === 'Zerg') return ZERG_RESEARCH_MACRO;
  return [];
};

export type ResearchBlock = {
  tech: number;
  reason: BotFailureReason;
};

export const maybeQueueRaceResearch = (
  s: State,
  player: number,
  faction: Faction,
  cmds: Command[],
  budget: ResourceBudget,
  reserved?: ProducerReservations,
): ResearchBlock | null => {
  const producerReservations = faction.name === 'Terran' ? reserved : undefined;
  let firstBlock: ResearchBlock | null = null;
  for (const tech of researchMacro(faction)) {
    if (maybeQueueResearch(s, player, cmds, budget, tech, producerReservations)) return null;
    const block = researchBlockReason(s, player, budget, tech, producerReservations);
    if (block === null) continue;
    firstBlock ??= block;
  }
  return firstBlock;
};

const maybeQueueResearch = (
  s: State,
  player: number,
  cmds: Command[],
  budget: ResourceBudget,
  tech: number,
  reserved?: ProducerReservations,
): boolean => {
  const def = TechDefs[tech];
  if (!def) return false;
  if (getTechLevel(s, player, tech) >= def.maxLevel) return false;
  const level = nextTechLevel(s, player, tech);
  const minerals = techMinerals(def, level);
  const gas = techGas(def, level);
  if (budget.minerals < minerals || budget.gas < gas) return false;

  const e = s.e;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.owner[i] !== player || !def.producers.includes(e.kind[i]!)) continue;
    if (reserved && producerReserved(s, reserved, i)) continue;
    const command: Command = { t: 'research', building: eid(e, i), tech };
    if (!validateCommand(s, player, command).ok) continue;
    cmds.push(command);
    if (reserved) reserveProducer(s, reserved, i);
    budget.minerals -= minerals;
    budget.gas -= gas;
    return true;
  }
  return false;
};

const researchBlockReason = (
  s: State,
  player: number,
  budget: ResourceBudget,
  tech: number,
  reserved?: ProducerReservations,
): ResearchBlock | null => {
  const def = TechDefs[tech];
  if (!def) return null;
  if (getTechLevel(s, player, tech) >= def.maxLevel) return null;
  const level = nextTechLevel(s, player, tech);
  const minerals = techMinerals(def, level);
  const gas = techGas(def, level);

  const e = s.e;
  let sawProducer = false;
  let sawAvailableProducer = false;
  for (let i = 0; i < e.hi; i++) {
    if (e.alive[i] !== 1 || e.owner[i] !== player || !def.producers.includes(e.kind[i]!)) continue;
    sawProducer = true;
    if ((reserved && producerReserved(s, reserved, i)) || e.researchKind[i] !== Kind.None) continue;
    sawAvailableProducer = true;
    if (budget.minerals < minerals || budget.gas < gas) return { tech, reason: 'resource-starved' };
    const result = validateCommand(s, player, { t: 'research', building: eid(e, i), tech });
    if (result.ok) return null;
    switch (result.reason) {
      case 'not-affordable': return { tech, reason: 'resource-starved' };
      case 'missing-requirement': return { tech, reason: 'missing-prerequisite' };
      case 'queue-full':
      case 'incomplete-producer':
      case 'missing-capability':
        return { tech, reason: 'no-production-capacity' };
      default:
        break;
    }
  }
  if (!sawProducer) return { tech, reason: 'missing-prerequisite' };
  return { tech, reason: sawAvailableProducer ? 'missing-prerequisite' : 'no-production-capacity' };
};
