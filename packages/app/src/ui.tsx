// HUD chrome (Preact + signals). The only framework-managed UI; the game world is
// drawn imperatively on canvas. Touch-first: big targets in the bottom thumb arc.

import { ui } from './store.ts';
import { Kind } from './sim.ts';
import type { Game } from './game.ts';

const bar: Record<string, string> = {
  position: 'absolute', left: '0', right: '0', display: 'flex', gap: '8px',
  alignItems: 'center', padding: '8px 12px',
  background: 'rgba(11,14,19,0.78)', backdropFilter: 'blur(6px)', fontSize: '14px',
};

const btn = (active = false): Record<string, string> => ({
  minWidth: '64px', minHeight: '52px', padding: '6px 12px', borderRadius: '12px',
  border: active ? '2px solid #ffe14e' : '1px solid #2a3340',
  background: active ? '#34507a' : '#1a2230', color: '#e6edf3', fontSize: '13px',
  fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center',
});

const Btn = (p: { label: string; onClick: () => void; active?: boolean }) => (
  <button style={btn(p.active)} onClick={p.onClick}>{p.label}</button>
);

const TopBar = (p: { game: Game }) => (
  <div style={{ ...bar, top: '0', paddingTop: 'max(8px, env(safe-area-inset-top))' }}>
    <b style={{ color: '#49d0c0' }}>⬡ {ui.minerals.value}</b>
    <b style={{ color: '#56d364' }}>◆ {ui.gas.value}</b>
    <span style={{ opacity: 0.85 }}>▦ {ui.supplyUsed.value}/{ui.supplyMax.value}</span>
    <span style={{ opacity: 0.6 }}>⏱ {fmt(ui.seconds.value)}</span>
    <span style={{ flex: '1' }} />
    <Btn label={`${ui.perTeam.value}v${ui.perTeam.value}`} onClick={() => p.game.restart(ui.mode.value, undefined, (ui.perTeam.value % 3) + 1)} />
    <Btn label={ui.mode.value === 'play' ? '▶ Play' : '◎ Watch'} onClick={() => p.game.restart(ui.mode.value === 'play' ? 'spectate' : 'play')} />
    <Btn label="⟳ Map" onClick={() => p.game.restart(ui.mode.value === 'replay' ? 'spectate' : ui.mode.value)} />
    <Btn label="▭ Load" onClick={() => loadReplay(p.game)} />
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
  if (place !== 0) {
    buttons.push(<span style={{ opacity: 0.8, alignSelf: 'center' }}>Tap to place {Kind ? name(place) : ''}…</span>);
    buttons.push(<Btn label="Cancel" onClick={() => (ui.placement.value = 0)} />);
  } else if (ui.selCount.value > 0) {
    if (ui.selProducer.value === Kind.CommandCenter) buttons.push(<Btn label="Train SCV" onClick={() => g.trainSelected(Kind.SCV)} />);
    if (ui.selProducer.value === Kind.Barracks) buttons.push(<Btn label="Train Marine" onClick={() => g.trainSelected(Kind.Marine)} />);
    if (ui.selCanBuild.value) {
      buttons.push(<Btn label="Build Depot" onClick={() => (ui.placement.value = Kind.SupplyDepot)} />);
      buttons.push(<Btn label="Build Rax" onClick={() => (ui.placement.value = Kind.Barracks)} />);
      buttons.push(<Btn label="Build Gas" onClick={() => (ui.placement.value = Kind.Refinery)} />);
    }
    if (ui.selProducer.value !== 0) {
      buttons.push(<Btn label="Set Rally" active={ui.rally.value} onClick={() => (ui.rally.value = !ui.rally.value)} />);
    }
    buttons.push(<Btn label="Atk-Move" active={ui.amove.value} onClick={() => (ui.amove.value = !ui.amove.value)} />);
    buttons.push(<Btn label="Stop" onClick={() => g.stopSelected()} />);
    buttons.push(<Btn label="Deselect" onClick={() => g.deselect()} />);
  } else {
    buttons.push(<span style={{ opacity: 0.5, alignSelf: 'center' }}>Drag to select · tap to command</span>);
  }
  return (
    <div style={{ ...bar, bottom: '0', flexWrap: 'wrap', justifyContent: 'center',
      paddingBottom: 'max(10px, env(safe-area-inset-bottom))' }}>
      {ui.selCount.value > 0 && <span style={{ width: '100%', textAlign: 'center', opacity: 0.8, fontSize: '12px' }}>{ui.selKindName.value}</span>}
      {buttons}
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

export const App = (p: { game: Game }) => (
  <>
    <TopBar game={p.game} />
    <Hotbar game={p.game} />
    <ReplayBar game={p.game} />
    <GameOver game={p.game} />
  </>
);

const fmt = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const name = (k: number): string =>
  k === Kind.SupplyDepot ? 'Supply Depot' : k === Kind.Barracks ? 'Barracks' : k === Kind.Refinery ? 'Refinery (on a geyser)' : 'building';
