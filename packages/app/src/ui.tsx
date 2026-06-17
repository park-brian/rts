// HUD chrome (Preact + signals). The only framework-managed UI; the game world is
// drawn imperatively on canvas. Touch-first: big targets in the bottom thumb arc.

import { useState } from 'preact/hooks';
import { ui } from './store.ts';
import { Abilities, Kind, TechDefs, Units, shownSupply, type FactionName } from './sim.ts';
import type { Game } from './game.ts';
import type { Mode } from './store.ts';

const bar: Record<string, string> = {
  position: 'absolute', left: '0', right: '0', display: 'flex', gap: '8px',
  alignItems: 'center', padding: '8px 12px',
  background: 'rgba(11,14,19,0.78)', backdropFilter: 'blur(6px)', fontSize: '14px',
};

const btn = (active = false, compact = false): Record<string, string> => ({
  minWidth: compact ? '0' : '58px', maxWidth: compact ? 'none' : '104px', minHeight: compact ? '44px' : '42px',
  padding: compact ? '5px 8px' : '5px 9px', borderRadius: '8px',
  border: active ? '2px solid #ffe14e' : '1px solid #2a3340',
  background: active ? '#34507a' : '#1a2230', color: '#e6edf3', fontSize: compact ? '12px' : '12px',
  fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: compact ? '1 1 0' : '0 0 auto',
});

const Btn = (p: { label: string; onClick: () => void; active?: boolean; compact?: boolean }) => (
  <button style={btn(p.active, p.compact)} onClick={p.onClick}>{p.label}</button>
);

const TopBar = (p: { game: Game }) => (
  <div style={{ ...bar, top: '0', padding: '6px 8px 8px', paddingTop: 'max(6px, env(safe-area-inset-top))',
    flexWrap: 'wrap', alignItems: 'stretch' }}>
    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', width: '100%',
      fontVariantNumeric: 'tabular-nums', minHeight: '24px' }}>
      <b style={{ color: '#49d0c0' }}>⬡ {ui.minerals.value}</b>
      <b style={{ color: '#56d364' }}>◆ {ui.gas.value}</b>
      <span style={{ opacity: 0.85 }}>▦ {fmtSupply(ui.supplyUsed.value)}/{fmtSupply(ui.supplyMax.value)}</span>
      <span style={{ opacity: 0.6, marginLeft: 'auto' }}>⏱ {fmt(ui.seconds.value)}</span>
    </div>
    <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
      <Btn compact label={`${ui.perTeam.value}v${ui.perTeam.value}`} onClick={() => p.game.restart(ui.mode.value, undefined, (ui.perTeam.value % 3) + 1)} />
      <Btn compact label="⚙ Setup" onClick={() => (ui.setupOpen.value = true)} />
      <Btn compact label={ui.mode.value === 'play' ? '▶ Play' : '◎ Watch'} onClick={() => p.game.restart(ui.mode.value === 'play' ? 'spectate' : 'play')} />
      <Btn compact label="⟳ Map" onClick={() => p.game.restart(ui.mode.value === 'replay' ? 'spectate' : ui.mode.value)} />
      <Btn compact label="▭ Load" onClick={() => loadReplay(p.game)} />
      <Btn compact label="▣ Math" active={ui.mathRenderer.value} onClick={() => (ui.mathRenderer.value = !ui.mathRenderer.value)} />
    </div>
  </div>
);

const fmtTick = (t: number): string => fmt(Math.floor(t / 24));

const SPEEDS = [0.5, 1, 2, 4];

const saveReplay = (g: Game): void => {
  const json = g.exportReplay();
  if (!json) return;
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = `replay-${Date.now()}.json`; a.click();
  URL.revokeObjectURL(url);
};

const loadReplay = (g: Game): void => {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'application/json,.json';
  input.onchange = () => {
    const f = input.files?.[0];
    if (!f) return;
    f.text().then((t) => g.loadReplay(t));
  };
  input.click();
};

// Replay scrubber + transport, shown only while watching a replay.
const ReplayBar = (p: { game: Game }) => {
  if (ui.mode.value !== 'replay') return null;
  const g = p.game;
  const tick = ui.replayTick.value;
  const total = ui.replayTotal.value;
  const ended = tick >= total;
  return (
    <div style={{ ...bar, bottom: '0', flexDirection: 'column', gap: '6px',
      paddingBottom: 'max(10px, env(safe-area-inset-bottom))' }}>
      <input type="range" min={0} max={total} value={tick}
        style={{ width: '100%', accentColor: '#49d0c0' }}
        onInput={(e) => g.seekReplay((e.currentTarget as HTMLInputElement).valueAsNumber)} />
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%' }}>
        <Btn label={ended ? '↺' : ui.paused.value ? '▶' : '❚❚'} onClick={() => g.togglePause()} />
        {SPEEDS.map((sp) => (
          <Btn label={`${sp}×`} active={ui.replaySpeed.value === sp} onClick={() => g.setReplaySpeed(sp)} />
        ))}
        <span style={{ flex: '1', textAlign: 'center', opacity: 0.85, fontVariantNumeric: 'tabular-nums' }}>
          {fmtTick(tick)} / {fmtTick(total)}
        </span>
        <Btn label="⬇ Save" onClick={() => saveReplay(g)} />
        <Btn label="✕ Exit" onClick={() => g.restart('spectate')} />
      </div>
    </div>
  );
};

const Hotbar = (p: { game: Game }) => {
  const g = p.game;
  if (ui.mode.value !== 'play') return null;
  const place = ui.placement.value;
  const buttons = [];
  const clearTargets = (): void => {
    ui.placement.value = 0; ui.rally.value = false; ui.amove.value = false; ui.abilityTarget.value = 0; ui.targetMode.value = 'none';
  };
  const placeKind = (kind: number): void => { clearTargets(); ui.placement.value = kind; };
  const toggleRally = (): void => {
    const active = !ui.rally.value;
    clearTargets();
    ui.rally.value = active;
  };
  const toggleAmove = (): void => {
    const active = !ui.amove.value;
    clearTargets();
    ui.amove.value = active;
  };
  const toggleTarget = (mode: 'harvest' | 'repair'): void => {
    const active = ui.targetMode.value !== mode;
    clearTargets();
    ui.targetMode.value = active ? mode : 'none';
  };
  const toggleAbility = (ability: number): void => {
    const active = ui.abilityTarget.value !== ability;
    clearTargets();
    ui.abilityTarget.value = active ? ability : 0;
  };
  if (place !== 0) {
    buttons.push(<span style={{ opacity: 0.8, alignSelf: 'center', flex: '0 0 auto' }}>Place {Kind ? name(place) : ''}</span>);
    buttons.push(<Btn label="Cancel" onClick={clearTargets} />);
  } else if (ui.selCount.value > 0) {
    for (const kind of ui.selTrainKinds.value) {
      buttons.push(<Btn label={`Train ${short(Units[kind]?.name ?? 'Unit')}`} onClick={() => { clearTargets(); g.trainSelected(kind); }} />);
    }
    for (const kind of ui.selTransformKinds.value) {
      const verb = kind === Kind.Archon || kind === Kind.DarkArchon ? 'Merge' : 'Morph';
      buttons.push(<Btn label={`${verb} ${short(Units[kind]?.name ?? 'Unit')}`} onClick={() => { clearTargets(); g.transformSelected(kind); }} />);
    }
    if (ui.selCanBuild.value) {
      for (const kind of ui.selBuildKinds.value) {
        buttons.push(<Btn label={`Build ${short(Units[kind]?.name ?? 'Building')}`} onClick={() => placeKind(kind)} />);
      }
    }
    if (ui.selCanRally.value) {
      buttons.push(<Btn label="Set Rally" active={ui.rally.value} onClick={toggleRally} />);
    }
    if (ui.selCanHarvest.value) {
      buttons.push(<Btn label="Harvest" active={ui.targetMode.value === 'harvest'} onClick={() => toggleTarget('harvest')} />);
    }
    if (ui.selCanRepair.value) {
      buttons.push(<Btn label="Repair" active={ui.targetMode.value === 'repair'} onClick={() => toggleTarget('repair')} />);
    }
    for (const tech of ui.selResearchTechs.value) {
      buttons.push(<Btn label={short(TechDefs[tech]?.name ?? 'Research')} onClick={() => { clearTargets(); g.researchSelected(tech); }} />);
    }
    for (const ability of ui.selAbilities.value) {
      const def = Abilities[ability]!;
      const active = ui.abilityTarget.value === ability;
      const cast = (): void => {
        if (def.target === 'self') {
          g.castSelectedAbility(ability);
          clearTargets();
        }
        else toggleAbility(ability);
      };
      buttons.push(<Btn label={short(def.name)} active={active} onClick={cast} />);
    }
    if (ui.selCanLoad.value) {
      buttons.push(<Btn label="Load" onClick={() => g.loadSelected()} />);
    }
    if (ui.selCanUnload.value) {
      buttons.push(<Btn label="Unload" onClick={() => g.unloadSelected()} />);
    }
    if (ui.selCanBurrow.value) {
      buttons.push(<Btn label="Burrow" onClick={() => g.burrowSelected(true)} />);
    }
    if (ui.selCanUnburrow.value) {
      buttons.push(<Btn label="Unburrow" onClick={() => g.burrowSelected(false)} />);
    }
    if (ui.selCanMine.value) {
      buttons.push(<Btn label="Lay Mine" onClick={() => g.mineSelected()} />);
    }
    if (ui.selCanAttackMove.value) {
      buttons.push(<Btn label="Atk-Move" active={ui.amove.value} onClick={toggleAmove} />);
    }
    if (ui.selCanStop.value) {
      buttons.push(<Btn label="Stop" onClick={() => g.stopSelected()} />);
    }
    buttons.push(<Btn label="Deselect" onClick={() => g.deselect()} />);
  } else {
    buttons.push(<span style={{ opacity: 0.5, alignSelf: 'center' }}>No selection</span>);
  }
  return (
    <div style={{ ...bar, bottom: '0', flexDirection: 'column', gap: '4px', alignItems: 'stretch',
      height: 'calc(88px + env(safe-area-inset-bottom))', overflow: 'hidden',
      padding: '6px 8px', paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
      {ui.selCount.value > 0 && <span style={{ height: '16px', textAlign: 'center', opacity: 0.82, fontSize: '12px',
        lineHeight: '16px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ui.selKindName.value}</span>}
      <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', overflowY: 'hidden', paddingBottom: '3px',
        scrollbarWidth: 'thin', WebkitOverflowScrolling: 'touch' }}>
        {buttons}
      </div>
    </div>
  );
};

const GameOver = (p: { game: Game }) => {
  if (!ui.over.value || ui.mode.value === 'replay') return null; // replay has its own transport
  const won = ui.mode.value === 'play' && ui.winner.value === 0;
  const txt = ui.mode.value === 'play' ? (won ? 'Victory' : 'Defeat') : `Team ${ui.winner.value} wins`;
  return (
    <div style={{ position: 'absolute', inset: '0', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: '16px', background: 'rgba(4,6,10,0.6)' }}>
      <div style={{ fontSize: '34px', fontWeight: '800', color: won ? '#5aff7a' : '#ff7a7a' }}>{txt}</div>
      <div style={{ display: 'flex', gap: '10px' }}>
        {ui.hasReplay.value && <Btn label="▭ Watch replay" onClick={() => p.game.startReplay()} />}
        <Btn label="New game" onClick={() => p.game.restart(ui.mode.value === 'replay' ? 'spectate' : ui.mode.value)} />
      </div>
    </div>
  );
};

const RACES: FactionName[] = ['terran', 'protoss', 'zerg'];
const raceLabel = (race: FactionName): string => race[0]!.toUpperCase() + race.slice(1);
const teamOf = (slot: number): number => slot % 2;
const setupRaces = (races: readonly string[], players: number): FactionName[] =>
  Array.from({ length: players }, (_, i) => {
    const race = races[i];
    return race === 'protoss' || race === 'zerg' ? race : 'terran';
  });

const SetupModal = (p: { game: Game }) => {
  const [mode, setMode] = useState<Mode>(ui.mode.value === 'spectate' ? 'spectate' : 'play');
  const [perTeam, setPerTeamState] = useState(ui.perTeam.value);
  const [human, setHuman] = useState(ui.humanPlayer.value);
  const [races, setRaces] = useState<FactionName[]>(setupRaces(ui.playerRaces.value, ui.perTeam.value * 2));
  if (!ui.setupOpen.value) return null;
  const players = perTeam * 2;
  const setPerTeam = (n: number): void => {
    setPerTeamState(n);
    setHuman(Math.min(human, n * 2 - 1));
    setRaces((old) => setupRaces(old, n * 2));
  };
  const setRace = (slot: number, race: FactionName): void => {
    const next = setupRaces(races, players);
    next[slot] = race;
    setRaces(next);
  };
  const start = (): void => {
    ui.setupOpen.value = false;
    p.game.restart(mode, undefined, perTeam, races, human);
  };

  return (
    <div style={{ position: 'absolute', inset: '0', zIndex: '5', background: 'rgba(4,6,10,0.72)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ width: 'min(560px, 100%)', maxHeight: '88vh', overflowY: 'auto',
        background: '#111923', border: '1px solid #2a3340', borderRadius: '8px', padding: '14px',
        boxShadow: '0 18px 60px rgba(0,0,0,0.35)', color: '#e6edf3' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <b>Match Setup</b>
          <Btn compact label="✕" onClick={() => (ui.setupOpen.value = false)} />
        </div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
          <Btn compact label="Play" active={mode === 'play'} onClick={() => setMode('play')} />
          <Btn compact label="Watch AI" active={mode === 'spectate'} onClick={() => setMode('spectate')} />
        </div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          {[1, 2, 3].map((n) => <Btn compact label={`${n}v${n}`} active={perTeam === n} onClick={() => setPerTeam(n)} />)}
        </div>
        <div style={{ display: 'grid', gap: '8px' }}>
          {Array.from({ length: players }, (_, slot) => (
            <div style={{ display: 'grid', gridTemplateColumns: '76px 1fr', gap: '8px', alignItems: 'center' }}>
              <Btn compact label={`P${slot + 1} T${teamOf(slot) + 1}`} active={mode === 'play' && human === slot}
                onClick={() => setHuman(slot)} />
              <div style={{ display: 'flex', gap: '6px' }}>
                {RACES.map((race) => (
                  <Btn compact label={raceLabel(race)} active={races[slot] === race} onClick={() => setRace(slot, race)} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
          <Btn label="Start Match" onClick={start} />
          <Btn label="Cancel" onClick={() => (ui.setupOpen.value = false)} />
        </div>
      </div>
    </div>
  );
};

export const App = (p: { game: Game }) => (
  <>
    <TopBar game={p.game} />
    <Hotbar game={p.game} />
    <ReplayBar game={p.game} />
    <GameOver game={p.game} />
    <SetupModal game={p.game} />
  </>
);

const fmt = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const fmtSupply = (s: number): string => {
  const v = shownSupply(s);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
};
const name = (k: number): string =>
  Units[k]?.name ?? 'building';
const short = (s: string): string => s
  .replace('Psionic ', '')
  .replace('Shockwave', '')
  .replace('Pack', '')
  .replace('Field', '')
  .replace('Command Center', 'CC')
  .replace('Cybernetics Core', 'Cyber Core')
  .replace('Robotics Facility', 'Robotics')
  .replace('Templar Archives', 'Archives')
  .replace('Evolution Chamber', 'Evo Chamber')
  .replace('Spawning Pool', 'Pool')
  .replace('Ultralisk Cavern', 'Ultra Cavern')
  .replace('Cannon', '')
  .trim();
