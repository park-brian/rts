import type { Game } from './game.ts';
import { clearArmedCommand, ui } from './store.ts';
import type { CommandOption } from './store.ts';
import { Abilities, Ability, Kind, Tech } from './sim.ts';

export type GlobalHotkeyAction =
  | 'attackMove'
  | 'stop'
  | 'harvest'
  | 'repair'
  | 'rally'
  | 'load'
  | 'unload'
  | 'burrow'
  | 'unburrow'
  | 'mine'
  | 'lift'
  | 'land'
  | 'deselect';
export type HotkeyAction = GlobalHotkeyAction | string;

export type HotkeyMap = Record<string, string>;

export const HOTKEY_ACTIONS: ReadonlyArray<{ id: GlobalHotkeyAction; label: string }> = [
  { id: 'attackMove', label: 'Attack Move' },
  { id: 'stop', label: 'Stop' },
  { id: 'harvest', label: 'Harvest' },
  { id: 'repair', label: 'Repair' },
  { id: 'rally', label: 'Set Rally' },
  { id: 'load', label: 'Load' },
  { id: 'unload', label: 'Unload' },
  { id: 'burrow', label: 'Burrow' },
  { id: 'unburrow', label: 'Unburrow' },
  { id: 'mine', label: 'Lay Mine' },
  { id: 'lift', label: 'Lift Off' },
  { id: 'land', label: 'Land' },
  { id: 'deselect', label: 'Deselect' },
];

export const DEFAULT_HOTKEYS: HotkeyMap = {
  attackMove: 'KeyA',
  stop: 'KeyS',
  harvest: 'KeyG',
  repair: 'KeyR',
  rally: 'KeyY',
  load: 'KeyL',
  unload: 'KeyU',
  burrow: 'KeyU',
  unburrow: 'KeyU',
  mine: 'KeyI',
  lift: 'KeyL',
  land: 'KeyL',
  deselect: 'Escape',
};

const key = (letter: string): string => `Key${letter.toUpperCase()}`;
export const actionKey = {
  build: (kind: number): string => `build:${kind}`,
  addon: (kind: number): string => `addon:${kind}`,
  train: (kind: number): string => `train:${kind}`,
  transform: (kind: number): string => `transform:${kind}`,
  research: (tech: number): string => `research:${tech}`,
  ability: (ability: number): string => `ability:${ability}`,
};

const unitHotkeys: Record<number, string> = {
  [Kind.CommandCenter]: key('C'),
  [Kind.SCV]: key('S'),
  [Kind.SupplyDepot]: key('S'),
  [Kind.Barracks]: key('B'),
  [Kind.Marine]: key('M'),
  [Kind.Firebat]: key('F'),
  [Kind.Medic]: key('C'),
  [Kind.Ghost]: key('G'),
  [Kind.Vulture]: key('V'),
  [Kind.SiegeTank]: key('T'),
  [Kind.Goliath]: key('G'),
  [Kind.Wraith]: key('W'),
  [Kind.Dropship]: key('D'),
  [Kind.ScienceVessel]: key('V'),
  [Kind.Valkyrie]: key('Y'),
  [Kind.Battlecruiser]: key('B'),
  [Kind.SpiderMine]: key('I'),
  [Kind.NuclearMissile]: key('N'),
  [Kind.EngineeringBay]: key('E'),
  [Kind.Bunker]: key('U'),
  [Kind.Academy]: key('A'),
  [Kind.MissileTurret]: key('T'),
  [Kind.Factory]: key('F'),
  [Kind.MachineShop]: key('M'),
  [Kind.Starport]: key('S'),
  [Kind.ControlTower]: key('C'),
  [Kind.Armory]: key('A'),
  [Kind.ScienceFacility]: key('I'),
  [Kind.PhysicsLab]: key('P'),
  [Kind.CovertOps]: key('C'),
  [Kind.ComsatStation]: key('C'),
  [Kind.NuclearSilo]: key('N'),

  [Kind.Probe]: key('P'),
  [Kind.Zealot]: key('Z'),
  [Kind.Dragoon]: key('D'),
  [Kind.HighTemplar]: key('T'),
  [Kind.DarkTemplar]: key('K'),
  [Kind.Archon]: key('R'),
  [Kind.DarkArchon]: key('R'),
  [Kind.Reaver]: key('V'),
  [Kind.Scarab]: key('R'),
  [Kind.Observer]: key('O'),
  [Kind.Shuttle]: key('S'),
  [Kind.Scout]: key('S'),
  [Kind.Carrier]: key('C'),
  [Kind.Interceptor]: key('I'),
  [Kind.Arbiter]: key('A'),
  [Kind.Corsair]: key('O'),
  [Kind.Nexus]: key('N'),
  [Kind.Pylon]: key('P'),
  [Kind.Assimilator]: key('A'),
  [Kind.Gateway]: key('G'),
  [Kind.Forge]: key('F'),
  [Kind.PhotonCannon]: key('C'),
  [Kind.CyberneticsCore]: key('Y'),
  [Kind.ShieldBattery]: key('B'),
  [Kind.RoboticsFacility]: key('R'),
  [Kind.Stargate]: key('S'),
  [Kind.CitadelOfAdun]: key('C'),
  [Kind.TemplarArchives]: key('T'),
  [Kind.RoboticsSupportBay]: key('B'),
  [Kind.Observatory]: key('O'),
  [Kind.FleetBeacon]: key('F'),
  [Kind.ArbiterTribunal]: key('A'),

  [Kind.Drone]: key('D'),
  [Kind.Overlord]: key('O'),
  [Kind.Zergling]: key('Z'),
  [Kind.Hydralisk]: key('H'),
  [Kind.Lurker]: key('L'),
  [Kind.Mutalisk]: key('M'),
  [Kind.Scourge]: key('S'),
  [Kind.Guardian]: key('G'),
  [Kind.Devourer]: key('D'),
  [Kind.Queen]: key('Q'),
  [Kind.Defiler]: key('F'),
  [Kind.Ultralisk]: key('U'),
  [Kind.InfestedTerran]: key('I'),
  [Kind.Hatchery]: key('H'),
  [Kind.Lair]: key('L'),
  [Kind.Hive]: key('H'),
  [Kind.CreepColony]: key('C'),
  [Kind.SunkenColony]: key('U'),
  [Kind.SporeColony]: key('A'),
  [Kind.SpawningPool]: key('S'),
  [Kind.EvolutionChamber]: key('V'),
  [Kind.HydraliskDen]: key('H'),
  [Kind.Extractor]: key('E'),
  [Kind.Spire]: key('S'),
  [Kind.GreaterSpire]: key('G'),
  [Kind.QueensNest]: key('Q'),
  [Kind.NydusCanal]: key('N'),
  [Kind.DefilerMound]: key('D'),
  [Kind.UltraliskCavern]: key('U'),
  [Kind.InfestedCommandCenter]: key('I'),
};

const abilityHotkeys: Record<number, string> = {
  [Ability.StimPack]: key('T'),
  [Ability.EMPShockwave]: key('E'),
  [Ability.PsionicStorm]: key('T'),
  [Ability.DefensiveMatrix]: key('D'),
  [Ability.Irradiate]: key('R'),
  [Ability.Lockdown]: key('L'),
  [Ability.YamatoGun]: key('Y'),
  [Ability.Feedback]: key('F'),
  [Ability.StasisField]: key('T'),
  [Ability.Maelstrom]: key('E'),
  [Ability.DisruptionWeb]: key('D'),
  [Ability.SpawnBroodling]: key('B'),
  [Ability.Ensnare]: key('E'),
  [Ability.Plague]: key('G'),
  [Ability.Consume]: key('C'),
  [Ability.DarkSwarm]: key('W'),
  [Ability.CloakingField]: key('C'),
  [Ability.PersonnelCloaking]: key('C'),
  [Ability.ScannerSweep]: key('S'),
  [Ability.Heal]: key('E'),
  [Ability.Restoration]: key('R'),
  [Ability.OpticalFlare]: key('F'),
  [Ability.Parasite]: key('R'),
  [Ability.Recall]: key('R'),
  [Ability.MindControl]: key('N'),
  [Ability.Hallucination]: key('L'),
  [Ability.InfestCommandCenter]: key('I'),
  [Ability.NuclearStrike]: key('N'),
  [Ability.ShieldRecharge]: key('R'),
};

const techHotkeys: Record<number, string> = {
  [Tech.StimPack]: key('T'),
  [Tech.U238Shells]: key('U'),
  [Tech.Lockdown]: key('L'),
  [Tech.PersonnelCloaking]: key('C'),
  [Tech.OcularImplants]: key('O'),
  [Tech.MoebiusReactor]: key('M'),
  [Tech.Restoration]: key('R'),
  [Tech.OpticalFlare]: key('F'),
  [Tech.CaduceusReactor]: key('C'),
  [Tech.SpiderMines]: key('M'),
  [Tech.IonThrusters]: key('I'),
  [Tech.SiegeTech]: key('S'),
  [Tech.CharonBoosters]: key('C'),
  [Tech.EMPShockwave]: key('E'),
  [Tech.Irradiate]: key('I'),
  [Tech.TitanReactor]: key('T'),
  [Tech.CloakingField]: key('C'),
  [Tech.ApolloReactor]: key('A'),
  [Tech.YamatoCannon]: key('Y'),
  [Tech.ColossusReactor]: key('C'),
  [Tech.InfantryWeapons]: key('W'),
  [Tech.InfantryArmor]: key('A'),
  [Tech.VehicleWeapons]: key('W'),
  [Tech.VehiclePlating]: key('P'),
  [Tech.ShipWeapons]: key('W'),
  [Tech.ShipPlating]: key('P'),

  [Tech.GroundWeapons]: key('W'),
  [Tech.GroundArmor]: key('A'),
  [Tech.PlasmaShields]: key('S'),
  [Tech.AirWeapons]: key('W'),
  [Tech.AirArmor]: key('A'),
  [Tech.SingularityCharge]: key('S'),
  [Tech.LegEnhancements]: key('L'),
  [Tech.PsionicStorm]: key('T'),
  [Tech.Hallucination]: key('H'),
  [Tech.KhaydarinAmulet]: key('K'),
  [Tech.MindControl]: key('M'),
  [Tech.Maelstrom]: key('E'),
  [Tech.ArgusTalisman]: key('A'),
  [Tech.GraviticDrive]: key('G'),
  [Tech.ReaverCapacity]: key('C'),
  [Tech.ScarabDamage]: key('D'),
  [Tech.GraviticBoosters]: key('B'),
  [Tech.SensorArray]: key('S'),
  [Tech.GraviticThrusters]: key('T'),
  [Tech.ApialSensors]: key('A'),
  [Tech.CarrierCapacity]: key('C'),
  [Tech.DisruptionWeb]: key('D'),
  [Tech.ArgusJewel]: key('A'),
  [Tech.Recall]: key('R'),
  [Tech.StasisField]: key('S'),
  [Tech.KhaydarinCore]: key('K'),

  [Tech.MeleeAttacks]: key('M'),
  [Tech.MissileAttacks]: key('A'),
  [Tech.Carapace]: key('C'),
  [Tech.FlyerAttacks]: key('A'),
  [Tech.FlyerCarapace]: key('C'),
  [Tech.Burrow]: key('B'),
  [Tech.VentralSacs]: key('V'),
  [Tech.Antennae]: key('A'),
  [Tech.PneumatizedCarapace]: key('P'),
  [Tech.MetabolicBoost]: key('M'),
  [Tech.AdrenalGlands]: key('A'),
  [Tech.MuscularAugments]: key('M'),
  [Tech.GroovedSpines]: key('G'),
  [Tech.LurkerAspect]: key('L'),
  [Tech.GameteMeiosis]: key('G'),
  [Tech.Ensnare]: key('E'),
  [Tech.SpawnBroodling]: key('B'),
  [Tech.Plague]: key('G'),
  [Tech.Consume]: key('C'),
  [Tech.MetasynapticNode]: key('M'),
  [Tech.AnabolicSynthesis]: key('A'),
  [Tech.ChitinousPlating]: key('C'),
};

for (const [kind, code] of Object.entries(unitHotkeys)) {
  DEFAULT_HOTKEYS[actionKey.build(Number(kind))] = code;
  DEFAULT_HOTKEYS[actionKey.addon(Number(kind))] = code;
  DEFAULT_HOTKEYS[actionKey.train(Number(kind))] = code;
  DEFAULT_HOTKEYS[actionKey.transform(Number(kind))] = code;
}
for (const [ability, code] of Object.entries(abilityHotkeys)) DEFAULT_HOTKEYS[actionKey.ability(Number(ability))] = code;
for (const [tech, code] of Object.entries(techHotkeys)) DEFAULT_HOTKEYS[actionKey.research(Number(tech))] = code;

const STORAGE_KEY = 'rts.desktopHotkeys.v1';

let hotkeys: HotkeyMap = { ...DEFAULT_HOTKEYS };

const normalize = (raw: unknown): HotkeyMap => {
  const src = raw && typeof raw === 'object' ? raw as Partial<Record<string, unknown>> : {};
  const next = { ...DEFAULT_HOTKEYS };
  for (const id of Object.keys(DEFAULT_HOTKEYS)) {
    const code = src[id];
    if (typeof code === 'string' && code.length > 0) next[id] = code;
  }
  return next;
};

export const loadHotkeys = (): HotkeyMap => {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    hotkeys = normalize(raw ? JSON.parse(raw) : undefined);
  } catch {
    hotkeys = { ...DEFAULT_HOTKEYS };
  }
  return { ...hotkeys };
};

export const getHotkeys = (): HotkeyMap => ({ ...hotkeys });

export const setHotkey = (action: HotkeyAction, code: string): void => {
  hotkeys = { ...hotkeys, [action]: code || DEFAULT_HOTKEYS[action] };
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(hotkeys));
  } catch {
    // Persistence is optional; the in-memory remap still works for this session.
  }
};

export const resetHotkeys = (): HotkeyMap => {
  hotkeys = { ...DEFAULT_HOTKEYS };
  try {
    globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    // Ignore unavailable storage.
  }
  return getHotkeys();
};

export const hotkeyForAction = (action: HotkeyAction): string => hotkeys[action] ?? DEFAULT_HOTKEYS[action] ?? '';

export const hotkeyLabelForAction = (action: HotkeyAction): string =>
  hotkeyForAction(action)
    .replace(/^Key/, '')
    .replace(/^Digit/, '')
    .replace('Escape', 'Esc')
    .replace('Space', 'Space');

const clearTargets = (): void => {
  clearArmedCommand();
};

const toggleTarget = (mode: 'harvest' | 'repair'): void => {
  const active = ui.armedCommand.value.t !== 'target' || ui.armedCommand.value.mode !== mode;
  clearTargets();
  if (active) ui.armedCommand.value = { t: 'target', mode };
};

const executeOption = (game: Game, options: CommandOption[], id: number): boolean => {
  const option = options.find((o) => o.id === id);
  if (!option) return false;
  clearTargets();
  return game.executeOption(option);
};

const fireAction = (game: Game, action: HotkeyAction): boolean => {
  const selection = ui.selectionView.value;
  if (action.startsWith('build:')) {
    clearTargets();
    ui.armedCommand.value = { t: 'place', kind: Number(action.slice('build:'.length)) };
    return true;
  }
  if (action.startsWith('train:')) {
    return executeOption(game, selection.options.train, Number(action.slice('train:'.length)));
  }
  if (action.startsWith('addon:')) {
    return executeOption(game, selection.options.addon, Number(action.slice('addon:'.length)));
  }
  if (action.startsWith('transform:')) {
    return executeOption(game, selection.options.transform, Number(action.slice('transform:'.length)));
  }
  if (action.startsWith('research:')) {
    return executeOption(game, selection.options.research, Number(action.slice('research:'.length)));
  }
  if (action.startsWith('ability:')) {
    const ability = Number(action.slice('ability:'.length));
    const def = Abilities[ability];
    if (!def) return false;
    clearTargets();
    if (def.target === 'self') game.castSelectedAbility(ability);
    else ui.armedCommand.value = { t: 'ability', ability };
    return true;
  }
  switch (action) {
    case 'attackMove': {
      const active = ui.armedCommand.value.t !== 'attackMove';
      clearTargets();
      if (active) ui.armedCommand.value = { t: 'attackMove' };
      return true;
    }
    case 'stop':
      clearTargets();
      game.stopSelected();
      return true;
    case 'harvest':
      toggleTarget('harvest');
      return true;
    case 'repair':
      toggleTarget('repair');
      return true;
    case 'rally': {
      const active = ui.armedCommand.value.t !== 'rally';
      clearTargets();
      if (active) ui.armedCommand.value = { t: 'rally' };
      return true;
    }
    case 'load':
      clearTargets();
      game.loadSelected();
      return true;
    case 'unload':
      clearTargets();
      game.unloadSelected();
      return true;
    case 'burrow':
      clearTargets();
      game.burrowSelected(true);
      return true;
    case 'unburrow':
      clearTargets();
      game.burrowSelected(false);
      return true;
    case 'mine':
      clearTargets();
      game.mineSelected();
      return true;
    case 'lift':
      clearTargets();
      game.liftSelected();
      return true;
    case 'land':
      clearTargets();
      game.armLandSelected();
      return true;
    case 'deselect':
      game.deselect();
      return true;
  }
  return false;
};

const commandCardActions = (): HotkeyAction[] => {
  const selection = ui.selectionView.value;
  return [
    ...selection.kinds.train.map(actionKey.train),
    ...selection.kinds.addon.map(actionKey.addon),
    ...selection.kinds.transform.map(actionKey.transform),
    ...selection.kinds.build.map(actionKey.build),
    ...(selection.can.rally ? ['rally' as const] : []),
    ...(selection.can.harvest ? ['harvest' as const] : []),
    ...(selection.can.repair ? ['repair' as const] : []),
    ...selection.kinds.research.map(actionKey.research),
    ...selection.kinds.abilities.map(actionKey.ability),
    ...(selection.can.load ? ['load' as const] : []),
    ...(selection.can.unload ? ['unload' as const] : []),
    ...(selection.can.burrow ? ['burrow' as const] : []),
    ...(selection.can.unburrow ? ['unburrow' as const] : []),
    ...(selection.can.mine ? ['mine' as const] : []),
    ...(selection.can.lift ? ['lift' as const] : []),
    ...(selection.can.land ? ['land' as const] : []),
    ...(selection.can.attackMove ? ['attackMove' as const] : []),
    ...(selection.can.stop ? ['stop' as const] : []),
    'deselect',
  ];
};

export const dispatchHotkey = (game: Game, code: string): boolean => {
  if (ui.mode.value !== 'play' || ui.controlScheme.value !== 'desktop') return false;
  const action = commandCardActions().find((id) => hotkeyForAction(id) === code);
  if (!action) return false;
  return fireAction(game, action);
};

loadHotkeys();
