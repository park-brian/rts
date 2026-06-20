// HUD chrome (Preact + signals). The only framework-managed UI; the game world is
// drawn imperatively on canvas. Touch-first: big targets in the bottom thumb arc.

import { useEffect, useRef, useState } from 'preact/hooks';
import { Fragment, type VNode } from 'preact';
import { clearArmedCommand, isPlacementArmed, OrderOptionId, sameArmedCommand, ui } from './store.ts';
import {
  Abilities, COMMAND_TYPES, FPS, Kind, MAP_PRESETS, NONE, ONE, Role, TILE, TechDefs, Units, entityMinimapVisible,
  shownSupply, type CommandRejectReason, type CommandType, type CountMap, type FactionName,
  type MapPreset, type MapSpec, type MidfieldModule, type PlayerMatchStats,
} from './sim.ts';
import type { Game } from './game.ts';
import type { CommandOption, ControlScheme, Mode } from './store.ts';
import { matchHealthRows, type MatchHealthRow, type MatchHealthStatus } from './match-health.ts';
import {
  HOTKEY_ACTIONS, actionKey, getHotkeys, hotkeyLabelForAction, orderHotkeyAction, resetHotkeys, setHotkey,
  type HotkeyAction,
} from './hotkeys.ts';

const bar: Record<string, string> = {
  position: 'absolute', left: '0', right: '0', display: 'flex', gap: '8px',
  alignItems: 'center', padding: '8px 12px',
  background: '#0b0e13', fontSize: '14px',
  borderColor: '#1e2733',
};

type CommandGroupId = 'placement' | 'production' | 'build' | 'tech' | 'abilities' | 'orders' | 'selection' | 'empty';
type CommandItem = { group: CommandGroupId; key: string; node: VNode };
type CommandLayoutMetrics = {
  columns: number;
  rows: number;
  cellHeight: number;
  minimapWidth: number;
  selectionWidth: number;
  showMinimap: boolean;
  compactSelection: boolean;
};

const COMMAND_GROUP_ORDER: CommandGroupId[] = ['placement', 'production', 'build', 'tech', 'abilities', 'orders', 'selection', 'empty'];
const COMMAND_GROUP_LABEL: Record<CommandGroupId, string> = {
  placement: 'Place',
  production: 'Train',
  build: 'Build Orders',
  tech: 'Tech',
  abilities: 'Cast',
  orders: 'Orders',
  selection: 'Select',
  empty: '',
};

const btn = (active = false, compact = false, disabled = false, dense = false, command = false): Record<string, string> => {
  if (command) {
    return {
      width: '100%', height: '100%', minWidth: '0', maxWidth: 'none', minHeight: '0',
      padding: '3px 4px', borderRadius: '6px', position: 'relative',
      border: active ? '2px solid #ffe14e' : '1px solid #2a3340',
      background: disabled ? '#131923' : active ? '#34507a' : '#1a2230',
      color: disabled ? '#7d8795' : '#e6edf3',
      fontSize: '10.5px', lineHeight: '11px', fontWeight: '700',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      whiteSpace: 'normal', overflow: 'hidden',
      opacity: disabled ? '0.72' : '1', cursor: disabled ? 'default' : 'pointer',
      flex: '1 1 auto',
    };
  }
  const desktop = ui.controlScheme.value === 'desktop';
  return {
    minWidth: dense ? '64px' : compact ? '0' : '58px', maxWidth: dense ? '98px' : compact ? 'none' : '104px',
    minHeight: dense ? '34px' : compact ? '34px' : '40px',
    padding: dense ? '3px 7px' : compact ? '4px 7px' : '5px 9px', borderRadius: '8px',
    border: active ? '2px solid #ffe14e' : '1px solid #2a3340',
    background: disabled ? '#131923' : active ? '#34507a' : '#1a2230',
    color: disabled ? '#7d8795' : '#e6edf3', fontSize: compact ? '12px' : '12px',
    fontWeight: '600', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    opacity: disabled ? '0.72' : '1', cursor: disabled ? 'default' : 'pointer',
    flex: dense ? '0 0 auto' : compact ? '1 1 0' : '0 0 auto',
  };
};

const reasonLabel = (reason: string): string => ({
  'missing-requirement': 'Tech',
  'not-affordable': 'Resources',
  'supply-blocked': 'Supply',
  'queue-full': 'Busy',
  'incomplete-producer': 'Incomplete',
  'not-enough-energy': 'Energy',
  'not-enough-hit-points': 'HP',
  'placement-requires-geyser': 'Geyser',
  'placement-off-map': 'Map',
  'placement-blocked': 'Blocked',
  'target-not-found': 'Target',
  'target-out-of-range': 'Range',
  'target-not-allowed': 'Target',
  'missing-capability': 'Unavailable',
  'invalid-ability': 'Unavailable',
  'wrong-owner': 'Owner',
  'stale-entity': 'Gone',
}[reason] ?? 'Unavailable');

const COMMAND_TYPE_LABEL: Partial<Record<CommandType, string>> = {
  cancelBuild: 'cancel',
  amove: 'a-move',
};

const commandTypeLabel = (type: CommandType): string => COMMAND_TYPE_LABEL[type] ?? type;

const countLine = <K extends string,>(
  counts: CountMap<K>,
  keys: readonly K[],
  label: (key: K) => string,
  limit = 5,
): string => {
  const parts = keys
    .map((key) => ({ key, count: counts[key] ?? 0 }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count || label(a.key).localeCompare(label(b.key)))
    .slice(0, limit)
    .map((entry) => `${label(entry.key)} ${entry.count}`);
  return parts.length > 0 ? parts.join(' · ') : 'none';
};

const rejectLine = (counts: CountMap<CommandRejectReason>): string =>
  countLine(counts, Object.keys(counts) as CommandRejectReason[], reasonLabel);

const resourcePair = (minerals: number, gas: number): string => `${minerals}/${gas}`;

const resourceBreakdownLine = (player: PlayerMatchStats): string => {
  const lost = player.carriedMineralsLost + player.carriedGasLost;
  const parts = [
    `mined ${resourcePair(player.mineralsMined, player.gasMined)}`,
    `returned ${resourcePair(player.mineralsReturned, player.gasReturned)}`,
  ];
  if (lost > 0) parts.push(`lost carried ${resourcePair(player.carriedMineralsLost, player.carriedGasLost)}`);
  return parts.join(' · ');
};

const HEALTH_LABEL: Record<MatchHealthStatus, string> = {
  healthy: 'OK',
  watch: 'Watch',
  failing: 'Fail',
};

const HEALTH_COLOR: Record<MatchHealthStatus, string> = {
  healthy: '#49d0c0',
  watch: '#ffd24e',
  failing: '#ff7a7a',
};

const healthLabel = (row: MatchHealthRow): string =>
  `${row.domain} ${HEALTH_LABEL[row.status]}: ${row.detail}`;

const playerHealthRows = (
  player: number,
  statsHealth: readonly MatchHealthRow[],
  botHealth: readonly MatchHealthRow[],
): MatchHealthRow[] => {
  const expert = botHealth.filter((row) => row.player === player);
  return expert.length > 0 ? expert : statsHealth.filter((row) => row.player === player);
};

const splitHealthRows = (rows: readonly MatchHealthRow[]): { summary?: MatchHealthRow; details: MatchHealthRow[] } => ({
  summary: rows.find((row) => row.domain === 'summary'),
  details: rows.filter((row) => row.domain !== 'summary'),
});

type BotPhaseSummary = ReturnType<Game['botPhaseSummaries']>[number];
type BotPhaseAssessment = ReturnType<Game['botPhaseAssessments']>[number];

const keyedCountLine = <K extends string,>(
  counts: CountMap<K>,
  label: (key: K) => string = (key) => key,
  limit = 4,
): string =>
  countLine(counts, Object.keys(counts) as K[], label, limit);

const phaseRangeLabel = (phase: BotPhaseSummary): string =>
  `${phase.phase} ${fmtTick(phase.fromTick)}-${fmtTick(phase.toTick)}`;

const phaseFactsLine = (phase: BotPhaseSummary): string =>
  `res ${resourcePair(phase.start.minerals, phase.start.gas)}>${resourcePair(phase.end.minerals, phase.end.gas)} · ` +
  `workers ${phase.start.workers}>${phase.end.workers} · army ${phase.start.army}>${phase.end.army} · ` +
  `supply ${fmtSupply(phase.start.supplyUsed)}/${fmtSupply(phase.start.supplyMax)}>` +
  `${fmtSupply(phase.end.supplyUsed)}/${fmtSupply(phase.end.supplyMax)}`;

const phaseAssessmentsFor = (
  phase: BotPhaseSummary,
  assessments: readonly BotPhaseAssessment[],
): BotPhaseAssessment[] =>
  assessments.filter((entry) =>
    entry.player === phase.player &&
    entry.phase === phase.phase &&
    entry.fromTick === phase.fromTick &&
    entry.toTick === phase.toTick);

const phaseAssessmentLine = (assessments: readonly BotPhaseAssessment[]): string => {
  const summary = assessments.find((entry) => entry.domain === 'summary');
  const details = assessments
    .filter((entry) => entry.domain !== 'summary')
    .map((entry) => `${entry.domain} ${HEALTH_LABEL[entry.status]}`)
    .join(' · ');
  return [summary ? `verdict ${HEALTH_LABEL[summary.status]}: ${summary.detail}` : '', details]
    .filter(Boolean)
    .join(' · ');
};

const Btn = (p: {
  label: string;
  onClick: () => void;
  active?: boolean;
  compact?: boolean;
  dense?: boolean;
  disabled?: boolean;
  reason?: string;
  detail?: string;
  hotkeyAction?: HotkeyAction;
  command?: boolean;
}) => (
  <button disabled={p.disabled} title={p.detail ?? (p.reason ? reasonLabel(p.reason) : undefined)}
    style={btn(p.active, p.compact || (ui.controlScheme.value === 'desktop' && !!p.hotkeyAction), p.disabled, p.dense, p.command)}
    onClick={p.disabled ? undefined : p.onClick}>
    <span style={p.command
      ? { width: '100%', maxHeight: '23px', overflow: 'hidden', textAlign: 'center', overflowWrap: 'anywhere' }
      : { width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' }}>
      {p.label}
    </span>
    {(p.detail || p.reason) && <span style={p.command
      ? { position: 'absolute', left: '3px', right: '3px', bottom: '2px', opacity: 0.82, fontSize: '8.5px',
        lineHeight: '9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }
      : { width: '100%', opacity: 0.86, fontSize: '10px', lineHeight: '11px',
        overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' }}>
      {p.detail ?? reasonLabel(p.reason!)}
    </span>}
    {ui.controlScheme.value === 'desktop' && p.hotkeyAction && !p.reason && (
      <span style={p.command
        ? { position: 'absolute', top: '2px', right: '3px', opacity: 0.62, fontSize: '8.5px', lineHeight: '9px',
          maxWidth: '20px', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'right' }
        : { width: '100%', opacity: 0.75, fontSize: '11px', lineHeight: '11px', flex: '0 0 auto',
          overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' }}>
        {hotkeyLabelForAction(p.hotkeyAction)}
      </span>
    )}
  </button>
);

const commandSections = (items: CommandItem[]): Array<{ id: CommandGroupId; items: CommandItem[] }> => {
  const buckets = new Map<CommandGroupId, CommandItem[]>();
  for (const item of items) {
    const bucket = buckets.get(item.group);
    if (bucket) bucket.push(item);
    else buckets.set(item.group, [item]);
  }
  const sections = [];
  for (const id of COMMAND_GROUP_ORDER) {
    const bucket = buckets.get(id);
    if (bucket?.length) sections.push({ id, items: bucket });
  }
  return sections;
};

const viewportWidth = (): number => Math.max(320, Math.floor(globalThis.innerWidth || 1024));
const desktopBottomChrome = (width: number): number => (width < 760 ? 176 : width < 1080 ? 148 : 128);
const mobileBottomChrome = (width: number): number => (width < 370 ? 120 : 124);

const commandLayoutMetrics = (scheme: ControlScheme, width: number): CommandLayoutMetrics => {
  const desktop = scheme === 'desktop';
  const showMinimap = desktop && width >= 680;
  const minimapWidth = showMinimap ? (width < 900 ? 86 : 104) : 0;
  const selectionWidth = desktop
    ? width < 760 ? 122 : width < 1080 ? 172 : 220
    : width < 370 ? 84 : 96;
  const outerPadding = desktop ? 16 : 16;
  const gaps = desktop ? (showMinimap ? 16 : 8) : 8;
  const commandWidth = Math.max(132, width - outerPadding - gaps - minimapWidth - selectionWidth);
  const cellWidth = desktop ? (width < 760 ? 56 : width < 1080 ? 66 : 74) : (width < 370 ? 50 : 58);
  const cellHeight = desktop ? 36 : 42;
  const gap = 4;
  const columns = Math.max(2, Math.floor((commandWidth + gap) / (cellWidth + gap)));
  const rows = desktop ? (width < 760 ? 4 : width < 1080 ? 3 : 2) : 2;
  return {
    columns,
    rows,
    cellHeight,
    minimapWidth,
    selectionWidth,
    showMinimap,
    compactSelection: !desktop || width < 1080,
  };
};

const useViewportWidth = (): number => {
  const [width, setWidth] = useState(viewportWidth());
  useEffect(() => {
    const onResize = (): void => {
      setWidth(viewportWidth());
      applyControlChrome(ui.controlScheme.value);
    };
    globalThis.addEventListener?.('resize', onResize);
    return () => globalThis.removeEventListener?.('resize', onResize);
  }, []);
  return width;
};

const applyControlChrome = (scheme: ControlScheme): void => {
  const root = document.documentElement;
  root.style.setProperty('--top-chrome', scheme === 'desktop' ? '46px' : 'calc(76px + env(safe-area-inset-top))');
  const bottom = scheme === 'desktop' ? `${desktopBottomChrome(viewportWidth())}px` : `calc(${mobileBottomChrome(viewportWidth())}px + env(safe-area-inset-bottom))`;
  root.style.setProperty('--bottom-chrome', bottom);
};

const resizePlayfield = (): void => {
  const fire = (): void => globalThis.dispatchEvent?.(new Event('resize'));
  if (globalThis.requestAnimationFrame) globalThis.requestAnimationFrame(fire);
  else fire();
};

const setControlScheme = (scheme: ControlScheme): void => {
  ui.controlScheme.value = scheme;
  applyControlChrome(scheme);
  resizePlayfield();
  try {
    globalThis.localStorage?.setItem('rts.controlScheme', scheme);
  } catch {
    // Optional persistence only.
  }
};

applyControlChrome(ui.controlScheme.value);

const TopBar = (p: { game: Game }) => {
  const resources = (
    <div style={{ display: 'flex', gap: '12px', alignItems: 'center',
      fontVariantNumeric: 'tabular-nums', minHeight: '24px', flex: '0 0 auto' }}>
      <b style={{ color: '#49d0c0' }}>⬡ {ui.minerals.value}</b>
      <b style={{ color: '#56d364' }}>◆ {ui.gas.value}</b>
      <span style={{ opacity: 0.85 }}>▦ {fmtSupply(ui.supplyUsed.value)}/{fmtSupply(ui.supplyMax.value)}</span>
      <span style={{ opacity: 0.6 }}>⏱ {fmt(ui.seconds.value)}</span>
    </div>
  );
  const buttons = (
    <div style={{ display: 'flex', gap: '6px', minWidth: 0, flex: '1 1 auto' }}>
      <Btn compact label={`${ui.perTeam.value}v${ui.perTeam.value}`} onClick={() => p.game.restart(ui.mode.value, undefined, (ui.perTeam.value % 3) + 1)} />
      <Btn compact label="⚙ Setup" onClick={() => (ui.setupOpen.value = true)} />
      <Btn compact label={ui.mode.value === 'play' ? '▶ Play' : '◎ Watch'} onClick={() => p.game.restart(ui.mode.value === 'play' ? 'spectate' : 'play')} />
      <Btn compact label="⟳ Map" onClick={() => p.game.restart(ui.mode.value === 'replay' ? 'spectate' : ui.mode.value)} />
      <Btn compact label="▭ Load" onClick={() => loadReplay(p.game)} />
      <Btn compact label="▣ Math" active={ui.mathRenderer.value} onClick={() => (ui.mathRenderer.value = !ui.mathRenderer.value)} />
      {ui.controlScheme.value === 'mobile' && (
        <Btn compact label="Queue" active={ui.mobileQueueMode.value} onClick={() => (ui.mobileQueueMode.value = !ui.mobileQueueMode.value)} />
      )}
      <Btn compact label={ui.controlScheme.value === 'desktop' ? '⌨ Desktop' : '☝ Mobile'}
        active={ui.controlScheme.value === 'desktop'}
        onClick={() => setControlScheme(ui.controlScheme.value === 'desktop' ? 'mobile' : 'desktop')} />
    </div>
  );
  if (ui.controlScheme.value === 'desktop') {
    return (
      <div style={{ ...bar, top: '0', height: 'var(--top-chrome)', overflow: 'hidden',
        borderBottom: '1px solid #1e2733',
        padding: '4px 8px', flexWrap: 'nowrap', alignItems: 'center' }}>
        {resources}
        {buttons}
      </div>
    );
  }
  return (
    <div style={{ ...bar, top: '0', padding: '6px 8px 8px', paddingTop: 'max(6px, env(safe-area-inset-top))',
      borderBottom: '1px solid #1e2733',
      flexWrap: 'wrap', alignItems: 'stretch', height: 'var(--top-chrome)', overflow: 'hidden' }}>
      <div style={{ width: '100%' }}>{resources}</div>
      <div style={{ width: '100%' }}>{buttons}</div>
    </div>
  );
};

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

const MinimapPanel = (p: { game: Game }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const draw = (): void => {
    const canvas = ref.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    }
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const g = p.game;
    const m = g.map;
    const scale = Math.min(w / m.w, h / m.h);
    const W = m.w * scale;
    const H = m.h * scale;
    const ox = (w - W) / 2;
    const oy = (h - H) / 2;
    ctx.fillStyle = '#05070b';
    ctx.fillRect(0, 0, w, h);
    for (let ty = 0; ty < m.h; ty += 2) {
      for (let tx = 0; tx < m.w; tx += 2) {
        const v = g.tileVisible(tx, ty);
        if (v === 0) ctx.fillStyle = '#05070b';
        else ctx.fillStyle = m.walk[ty * m.w + tx] === 0 ? '#0a0e16' : m.elev[ty * m.w + tx]! >= 1 ? '#16263a' : '#0f1622';
        ctx.fillRect(ox + tx * scale, oy + ty * scale, scale * 2, scale * 2);
      }
    }
    const e = g.sim.fullState().e;
    for (let i = 0; i < e.hi; i++) {
      if (e.alive[i] !== 1 || e.container[i] !== NONE || !g.canSeeEntity(i)) continue;
      if (!entityMinimapVisible(e.kind[i]!)) continue;
      const tx = Math.floor(e.x[i]! / ONE / TILE);
      const ty = Math.floor(e.y[i]! / ONE / TILE);
      ctx.fillStyle = (Units[e.kind[i]!]!.roles & Role.Resource) !== 0 ? '#49d0c0' : minimapColor(e.owner[i]!);
      ctx.fillRect(ox + tx * scale, oy + ty * scale, 2, 2);
    }
    ctx.strokeStyle = '#ffffff90';
    ctx.lineWidth = 1;
    ctx.strokeRect(ox + (g.camX / TILE) * scale, oy + (g.camY / TILE) * scale,
      (g.viewW / g.zoom / TILE) * scale, (g.viewH / g.zoom / TILE) * scale);
  };
  useEffect(() => {
    let raf = 0;
    const loop = (): void => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [p.game]);
  const pan = (e: PointerEvent): void => {
    const canvas = ref.current;
    if (!canvas) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const m = p.game.map;
    const scale = Math.min(rect.width / m.w, rect.height / m.h);
    const ox = (rect.width - m.w * scale) / 2;
    const oy = (rect.height - m.h * scale) / 2;
    p.game.centerOn(((e.clientX - rect.left - ox) / scale) * TILE, ((e.clientY - rect.top - oy) / scale) * TILE);
  };
  return (
    <canvas ref={ref} onPointerDown={(e) => pan(e as unknown as PointerEvent)}
      onPointerMove={(e) => { if (e.buttons) pan(e as unknown as PointerEvent); }}
      style={{ width: '100%', height: '100%', border: '1px solid #2a3340', background: '#05070b', touchAction: 'none' }} />
  );
};

const ProgressLine = () => {
  const selection = ui.selectionView.value;
  const status = selection.status;
  if (selection.count <= 0 || status.progress <= 0 || status.progress >= 1) return null;
  const pct = Math.round(status.progress * 100);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 34px', gap: '6px', alignItems: 'center',
      marginTop: '5px' }}>
      <div style={{ height: '5px', background: '#05070b', border: '1px solid #2a3340', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: '#49d0c0' }} />
      </div>
      <span style={{ fontSize: '10px', opacity: 0.72, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{pct}%</span>
    </div>
  );
};

const StatChips = (p: { compact?: boolean }) => {
  const selection = ui.selectionView.value;
  const stats = selection.status.stats;
  if (selection.count <= 0 || stats.length === 0) return null;
  const visible = stats.slice(0, p.compact ? 4 : 6);
  const hidden = stats.length - visible.length;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: p.compact ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))',
      gap: '3px', marginTop: '5px', overflow: 'hidden', maxHeight: p.compact ? '33px' : '36px' }}>
      {visible.map((stat) => (
        <span key={stat} style={{ minWidth: 0, border: '1px solid #263241',
          background: '#0b111a', padding: '1px 3px', fontSize: '9.5px', lineHeight: '13px',
          color: '#cdd9e5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {stat}
        </span>
      ))}
      {hidden > 0 && (
        <span style={{ minWidth: 0, border: '1px solid #263241', background: '#0b111a',
          padding: '1px 3px', fontSize: '9.5px', lineHeight: '13px', color: '#9fb1c7', textAlign: 'center' }}>
          +{hidden}
        </span>
      )}
    </div>
  );
};

const groupKeyLabel = (index: number): string => index === 9 ? '0' : String(index + 1);

const ControlGroups = (p: { game: Game; compact?: boolean }) => {
  const counts = ui.controlGroupCounts.value;
  const selected = ui.selectionView.value.count > 0;
  const activate = (index: number, e: MouseEvent): void => {
    if (e.ctrlKey || e.metaKey || (counts[index] === 0 && selected)) p.game.assignControlGroup(index);
    else p.game.recallControlGroup(index, e.shiftKey);
  };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: p.compact ? 'repeat(5, minmax(0, 1fr))' : 'repeat(10, minmax(0, 1fr))',
      gap: '3px', marginTop: '5px', flex: '0 0 auto' }}>
      {counts.map((count, index) => {
        const canUse = count > 0 || selected;
        const title = count > 0
          ? `Group ${groupKeyLabel(index)}: ${count}. Click recall, Shift-click add, Ctrl-click bind.`
          : selected
            ? `Group ${groupKeyLabel(index)} empty. Click to bind current selection.`
            : `Group ${groupKeyLabel(index)} empty. Select units to bind.`;
        return (
          <button key={index} disabled={!canUse} title={title}
            onClick={(e) => activate(index, e as unknown as MouseEvent)}
            style={{ minWidth: 0, height: p.compact ? '14px' : '18px', borderRadius: '4px',
              border: count > 0 ? '1px solid #49d0c0' : '1px solid #263241',
              background: count > 0 ? '#102331' : selected ? '#151d28' : '#0b111a',
              color: canUse ? '#dce8f4' : '#596574', padding: '0 2px',
              fontSize: p.compact ? '8.5px' : '10px', lineHeight: p.compact ? '12px' : '16px', fontVariantNumeric: 'tabular-nums',
              cursor: canUse ? 'pointer' : 'default', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {groupKeyLabel(index)}{count > 0 ? `:${count}` : ''}
          </button>
        );
      })}
    </div>
  );
};

const SelectionPanel = (p: { game: Game; compact?: boolean }) => {
  const selection = ui.selectionView.value;
  const status = selection.status;
  const hasSelection = selection.count > 0;
  return (
    <div style={{ border: '1px solid #2a3340', background: '#111923', padding: p.compact ? '5px 6px' : '7px 8px',
      display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
      <b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        lineHeight: p.compact ? '14px' : '16px', fontSize: p.compact ? '12px' : '14px' }}>
        {hasSelection ? selection.kindName : 'No selection'}
      </b>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginTop: '2px',
        fontSize: '10.5px', lineHeight: '12px', color: '#9fb1c7', minWidth: 0 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {hasSelection ? [status.label, status.detail].filter(Boolean).join(': ') : 'Ctrl+1-0 assigns groups'}
        </span>
        {hasSelection && <span style={{ flex: '0 0 auto', opacity: 0.75 }}>×{selection.count}</span>}
      </div>
      <ProgressLine />
      <StatChips compact={p.compact} />
      <ControlGroups game={p.game} compact={p.compact} />
    </div>
  );
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

const CommandTable = (p: { sections: Array<{ id: CommandGroupId; items: CommandItem[] }>; metrics: CommandLayoutMetrics }) => {
  const items = p.sections.flatMap((section) => section.items);
  const summary = p.sections
    .filter((section) => COMMAND_GROUP_LABEL[section.id])
    .map((section) => `${COMMAND_GROUP_LABEL[section.id]} ${section.items.length}`)
    .join(' · ');
  const capacity = Math.max(1, p.metrics.columns * p.metrics.rows);
  const pageSize = items.length > capacity ? Math.max(1, capacity - 1) : capacity;
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const [page, setPage] = useState(0);
  useEffect(() => {
    if (page >= pageCount) setPage(0);
  }, [page, pageCount]);
  const start = page * pageSize;
  const visible = items.slice(start, start + pageSize);
  const hidden = Math.max(0, items.length - visible.length);
  return (
    <div data-command-table="true" title={summary} aria-label={summary || 'Command table'}
      style={{ minWidth: 0, height: '100%', overflow: 'hidden',
      display: 'grid', gridTemplateColumns: `repeat(${p.metrics.columns}, minmax(0, 1fr))`,
      gridAutoRows: `${p.metrics.cellHeight}px`, gap: '4px', alignContent: 'start' }}>
      {visible.map((item) => (
        <div key={item.key} data-command-cell={item.group} style={{ minWidth: 0, minHeight: 0, display: 'flex' }}>
          {item.node}
        </div>
      ))}
      {pageCount > 1 && (
        <div style={{ minWidth: 0, minHeight: 0, display: 'flex' }}>
          <Btn command label="More" detail={`${page + 1}/${pageCount}`}
            onClick={() => setPage((page + 1) % pageCount)}
            active={hidden > 0} />
        </div>
      )}
    </div>
  );
};

const Hotbar = (p: { game: Game }) => {
  const g = p.game;
  const width = useViewportWidth();
  const metrics = commandLayoutMetrics(ui.controlScheme.value, width);
  if (ui.mode.value !== 'play') return null;
  const armed = ui.armedCommand.value;
  const selection = ui.selectionView.value;
  const place = isPlacementArmed(armed) ? armed.kind : 0;
  const commands: CommandItem[] = [];
  let nextCommandKey = 0;
  const addCommand = (group: CommandGroupId, node: VNode): void => {
    commands.push({ group, key: `${group}-${nextCommandKey++}`, node });
  };
  const clearTargets = (): void => {
    clearArmedCommand();
  };
  const activeArm = (option: CommandOption): boolean =>
    option.arm ? sameArmedCommand(option.arm, ui.armedCommand.value) : false;
  const addOptionButton = (
    group: CommandGroupId,
    option: CommandOption,
    label: string,
    hotkeyAction: HotkeyAction | undefined,
    onClick: () => void,
    active = false,
  ): void => {
    addCommand(group, <Btn command dense={ui.controlScheme.value !== 'desktop'} label={option.label ?? label}
      hotkeyAction={hotkeyAction} active={active} disabled={!option.ok}
      reason={option.ok ? undefined : option.reason} detail={option.detail} onClick={onClick} />);
  };
  const executeOption = (option: CommandOption): void => {
    g.executeOption(option);
  };
  const addOrderButton = (id: number, label: string): void => {
    const option = selection.options.order.find((o) => o.id === id);
    const hotkeyAction = orderHotkeyAction(id);
    if (!option) return;
    addOptionButton('orders', option, label, hotkeyAction ?? undefined, () => executeOption(option), activeArm(option));
  };
  if (place !== 0) {
    addCommand('placement', <span style={{ opacity: 0.8, alignSelf: 'center', flex: '0 0 auto',
      fontSize: '12px', whiteSpace: 'nowrap' }}>{armed.t === 'land' ? 'Land' : 'Place'} {Kind ? name(place) : ''}</span>);
    addCommand('placement', <Btn command dense={ui.controlScheme.value !== 'desktop'} label="Cancel" onClick={clearTargets} />);
  } else if (selection.count > 0) {
    for (const option of selection.options.train) {
      const kind = option.id;
      addOptionButton('production', option, `Train ${short(Units[kind]?.name ?? 'Unit')}`, actionKey.train(kind),
        () => executeOption(option));
    }
    for (const option of selection.options.addon) {
      const kind = option.id;
      addOptionButton('build', option, short(Units[kind]?.name ?? 'Add-on'), actionKey.addon(kind),
        () => executeOption(option));
    }
    for (const option of selection.options.transform) {
      const kind = option.id;
      const verb = kind === Kind.Archon || kind === Kind.DarkArchon ? 'Merge' : 'Morph';
      addOptionButton('production', option, `${verb} ${short(Units[kind]?.name ?? 'Unit')}`, actionKey.transform(kind),
        () => executeOption(option));
    }
    if (selection.can.build) {
      for (const option of selection.options.build) {
        const kind = option.id;
        addOptionButton('build', option, short(Units[kind]?.name ?? 'Building'), actionKey.build(kind),
          () => executeOption(option));
      }
    }
    addOrderButton(OrderOptionId.Rally, 'Set Rally');
    addOrderButton(OrderOptionId.Harvest, 'Harvest');
    addOrderButton(OrderOptionId.Repair, 'Repair');
    for (const option of selection.options.research) {
      const tech = option.id;
      addOptionButton('tech', option, short(TechDefs[tech]?.name ?? 'Research'), actionKey.research(tech),
        () => executeOption(option));
    }
    for (const option of selection.options.ability) {
      const ability = option.id;
      const def = Abilities[ability]!;
      addOptionButton('abilities', option, short(def.name), actionKey.ability(ability), () => executeOption(option), activeArm(option));
    }
    addOrderButton(OrderOptionId.Load, 'Load');
    addOrderButton(OrderOptionId.Unload, 'Unload');
    addOrderButton(OrderOptionId.Burrow, 'Burrow');
    addOrderButton(OrderOptionId.Unburrow, 'Unburrow');
    addOrderButton(OrderOptionId.Mine, 'Lay Mine');
    addOrderButton(OrderOptionId.Lift, 'Lift Off');
    addOrderButton(OrderOptionId.Land, 'Land');
    addOrderButton(OrderOptionId.Cancel, 'Cancel');
    addOrderButton(OrderOptionId.Move, 'Move');
    addOrderButton(OrderOptionId.AttackMove, 'Atk-Move');
    addOrderButton(OrderOptionId.Hold, 'Hold');
    addOrderButton(OrderOptionId.Patrol, 'Patrol');
    addOrderButton(OrderOptionId.Stop, 'Stop');
    addCommand('selection', <Btn command dense={ui.controlScheme.value !== 'desktop'} label="Deselect" hotkeyAction="deselect" onClick={() => g.deselect()} />);
  } else {
    addCommand('empty', <span style={{ opacity: 0.5, alignSelf: 'center' }}>No selection</span>);
  }
  const sections = commandSections(commands);
  if (ui.controlScheme.value === 'desktop') {
    const columns = metrics.showMinimap
      ? `${metrics.minimapWidth}px ${metrics.selectionWidth}px minmax(0, 1fr)`
      : `${metrics.selectionWidth}px minmax(0, 1fr)`;
    return (
      <div style={{ ...bar, bottom: '0', height: 'var(--bottom-chrome)', overflow: 'hidden',
        borderTop: '1px solid #1e2733',
        padding: '6px 8px', paddingBottom: 'max(6px, env(safe-area-inset-bottom))',
        display: 'grid', gridTemplateColumns: columns,
        alignItems: 'stretch', gap: '8px' }}>
        {metrics.showMinimap && <MinimapPanel game={g} />}
        <SelectionPanel game={g} compact={metrics.compactSelection} />
        <CommandTable sections={sections} metrics={metrics} />
      </div>
    );
  }
  return (
    <div style={{ ...bar, bottom: '0', gap: '8px', alignItems: 'stretch',
      height: 'var(--bottom-chrome)', overflow: 'hidden',
      borderTop: '1px solid #1e2733',
      padding: '6px 8px', paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
      display: 'grid', gridTemplateColumns: `${metrics.selectionWidth}px minmax(0, 1fr)` }}>
      <SelectionPanel game={g} compact />
      <CommandTable sections={sections} metrics={metrics} />
    </div>
  );
};

const MatchStatsPanel = (p: { game: Game }) => {
  const stats = p.game.matchStats;
  const duration = Math.max(0, Math.floor((stats.tick - stats.startTick) / FPS));
  const health = matchHealthRows(stats);
  const botHealth = p.game.botExpertHealthRows();
  const botPhases = p.game.botPhaseSummaries();
  const botPhaseAssessments = p.game.botPhaseAssessments();
  return (
    <div style={{ width: 'min(720px, calc(100vw - 32px))', maxHeight: '42vh', overflow: 'auto',
      border: '1px solid #253142', background: '#0b0e13', padding: '10px', fontSize: '12px',
      fontVariantNumeric: 'tabular-nums' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '8px',
        color: '#cdd9e5' }}>
        <b>Match Stats</b>
        <span>{fmt(duration)} elapsed</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, minmax(58px, 1fr))', gap: '4px',
        alignItems: 'center' }}>
        {['P', 'Res', 'Supply', 'Workers', 'Army', 'Bases', 'Made', 'Lost', 'Cmds'].map((h) => (
          <b key={h} style={{ color: '#8ea4bd', borderBottom: '1px solid #253142', paddingBottom: '4px' }}>{h}</b>
        ))}
        {stats.players.map((player) => (
          <Fragment key={player.player}>
            <span>P{player.player + 1}</span>
            <span>{player.minerals}/{player.gas}</span>
            <span>{fmtSupply(player.supplyUsed)}/{fmtSupply(player.supplyMax)}<br />
              <span style={{ opacity: 0.65 }}>pk {fmtSupply(player.peakSupplyUsed)}</span></span>
            <span>{player.workers}<br /><span style={{ opacity: 0.65 }}>pk {player.peakWorkers}</span></span>
            <span>{player.combatUnits}<br /><span style={{ opacity: 0.65 }}>pk {player.peakCombatUnits}</span></span>
            <span>{player.bases}</span>
            <span>{player.unitsCreated + player.structuresCreated}<br />
              <span style={{ opacity: 0.65 }}>{player.mineralValueCreated}/{player.gasValueCreated}</span></span>
            <span>{player.unitsLost + player.structuresLost}<br />
              <span style={{ opacity: 0.65 }}>{player.mineralValueLost}/{player.gasValueLost}</span></span>
            <span>{player.commandsAccepted}/{player.commandsIssued}<br />
              <span style={{ opacity: player.commandsRejected ? 0.9 : 0.55,
                color: player.commandsRejected ? '#ff9b9b' : '#8ea4bd' }}>
                rej {player.commandsRejected}
              </span></span>
          </Fragment>
        ))}
      </div>
      <div style={{ display: 'grid', gap: '4px', marginTop: '10px', borderTop: '1px solid #253142',
        paddingTop: '8px' }}>
        {stats.players.map((player) => (
          <details key={player.player} open={player.commandsRejected > 0}
            style={{ border: '1px solid #1b2533', background: '#0f151e', padding: '5px 7px' }}>
            <summary style={{ cursor: 'pointer', color: '#cdd9e5' }}>
              P{player.player + 1} command mix
            </summary>
            <div style={{ display: 'grid', gap: '3px', marginTop: '5px', color: '#9fb1c7' }}>
              <span>resources {resourceBreakdownLine(player)}</span>
              <span>{countLine(player.commandsByType, COMMAND_TYPES, commandTypeLabel)}</span>
              <span style={{ color: player.commandsRejected ? '#ffb1b1' : '#7f91a8' }}>
                rejects {rejectLine(player.rejectsByReason)}
              </span>
            </div>
          </details>
        ))}
      </div>
      <div style={{ display: 'grid', gap: '4px', marginTop: '10px', borderTop: '1px solid #253142',
        paddingTop: '8px' }}>
        <b style={{ color: '#8ea4bd' }}>Strategic Health</b>
        {stats.players.map((player) => {
          const rows = splitHealthRows(playerHealthRows(player.player, health, botHealth));
          return (
            <div key={player.player} style={{ display: 'grid', gridTemplateColumns: '56px 1fr', gap: '6px',
              alignItems: 'center', color: '#cdd9e5' }}>
              <span>P{player.player + 1}</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '4px' }}>
                {rows.summary && (
                  <span title={healthLabel(rows.summary)}
                    style={{ gridColumn: '1 / -1', minWidth: 0, border: `1px solid ${HEALTH_COLOR[rows.summary.status]}`,
                      background: '#0f151e', color: HEALTH_COLOR[rows.summary.status], padding: '3px 4px',
                      overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    verdict {HEALTH_LABEL[rows.summary.status]}: {rows.summary.detail}
                  </span>
                )}
                {rows.details.map((row) => (
                  <span key={row.domain} title={healthLabel(row)}
                    style={{ minWidth: 0, border: `1px solid ${HEALTH_COLOR[row.status]}`,
                      background: '#0f151e', color: HEALTH_COLOR[row.status], padding: '3px 4px',
                      overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    {row.domain} {HEALTH_LABEL[row.status]}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {botPhases.length > 0 && (
        <div style={{ display: 'grid', gap: '4px', marginTop: '10px', borderTop: '1px solid #253142',
          paddingTop: '8px' }}>
          <b style={{ color: '#8ea4bd' }}>Bot Phases</b>
          {stats.players.map((player) => {
            const phases = botPhases.filter((phase) => phase.player === player.player);
            if (phases.length === 0) return null;
            return (
              <details key={player.player} style={{ border: '1px solid #1b2533',
                background: '#0f151e', padding: '5px 7px' }}>
                <summary style={{ cursor: 'pointer', color: '#cdd9e5' }}>
                  P{player.player + 1} {phases.length} phase{phases.length === 1 ? '' : 's'}
                </summary>
                <div style={{ display: 'grid', gap: '5px', marginTop: '5px', color: '#9fb1c7' }}>
                  {phases.map((phase, i) => {
                    const assessments = phaseAssessmentsFor(phase, botPhaseAssessments);
                    const assessmentLine = phaseAssessmentLine(assessments);
                    return (
                      <div key={`${phase.fromTick}:${phase.phase}:${i}`} title={phase.plan.reasons.join('; ')}
                        style={{ display: 'grid', gap: '2px', borderTop: i ? '1px solid #1b2533' : '0',
                          paddingTop: i ? '5px' : '0' }}>
                        <span style={{ color: '#cdd9e5' }}>
                          {phaseRangeLabel(phase)} · {phase.plan.primaryGoal}/{phase.plan.macroPriority}/{phase.plan.combatStance}
                        </span>
                        {assessmentLine && <span title={assessmentLine} style={{ color: '#cdd9e5' }}>judge {assessmentLine}</span>}
                        <span>{phaseFactsLine(phase)}</span>
                        <span>peaks workers queued {phase.peaks.queuedWorkerProduction} · army queued {phase.peaks.queuedArmyProduction} · idle prod {phase.peaks.idleProducers}</span>
                        <span>cmds {countLine(phase.commandsByType, COMMAND_TYPES, commandTypeLabel, 4)}</span>
                        <span>axes {keyedCountLine(phase.intentAxes, undefined, 4)}</span>
                        <span>intents {keyedCountLine(phase.intentsByKind, undefined, 4)}</span>
                        <span>outcomes {keyedCountLine(phase.outcomesByStatus, undefined, 4)}</span>
                        <span>wait {keyedCountLine(phase.waitsByReason, reasonLabel, 3)} · block {keyedCountLine(phase.blocksByReason, reasonLabel, 3)}</span>
                        <span>alerts {keyedCountLine(phase.alertKinds, undefined, 3)}</span>
                      </div>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </div>
      )}
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
      <MatchStatsPanel game={p.game} />
      <div style={{ display: 'flex', gap: '10px' }}>
        {ui.hasReplay.value && <Btn label="▭ Watch replay" onClick={() => p.game.startReplay()} />}
        <Btn label="New game" onClick={() => p.game.restart(ui.mode.value === 'replay' ? 'spectate' : ui.mode.value)} />
      </div>
    </div>
  );
};

const RACES: FactionName[] = ['terran', 'protoss', 'zerg'];
const MIDFIELD_MODULES: MidfieldModule[] = ['empty', 'blocks', 'dualChoke', 'arena', 'raisedCenter'];
const raceLabel = (race: FactionName): string => race[0]!.toUpperCase() + race.slice(1);
const teamOf = (slot: number): number => slot % 2;
const defaultMapSpec = (perTeam: number, seed: number): Extract<MapSpec, { kind: 'procedural' }> =>
  ({ kind: 'procedural', perTeam, seed, preset: 'teamPlateaus', midfield: 'empty' });
const proceduralMapSpec = (spec: MapSpec, perTeam: number, seed: number): Extract<MapSpec, { kind: 'procedural' }> =>
  spec.kind === 'procedural'
    ? { ...spec, perTeam, seed, preset: spec.preset ?? 'teamPlateaus', midfield: spec.midfield ?? 'empty' }
    : defaultMapSpec(perTeam, seed);
const setupRaces = (races: readonly string[], players: number): FactionName[] =>
  Array.from({ length: players }, (_, i) => {
    const race = races[i];
    return race === 'protoss' || race === 'zerg' ? race : 'terran';
  });
const mapPresetLabel = (preset: MapPreset): string => ({
  teamPlateaus: 'Team Plateaus',
  cornerBases: 'Corner Bases',
  isolatedMains: 'Isolated Mains',
  fortress: 'Fortress',
  islandExpansions: 'Island Expansions',
}[preset]);
const midfieldLabel = (midfield: MidfieldModule): string => ({
  empty: 'Empty',
  blocks: 'Blocks',
  dualChoke: 'Dual Choke',
  arena: 'Arena',
  raisedCenter: 'Raised Center',
}[midfield]);
const readSeed = (text: string, fallback: number): number => {
  const parsed = Number.parseInt(text, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const randomSeed = (): number => Math.floor(Math.random() * 1_000_000_000);

const keyLabel = (code: string): string => code
  .replace(/^Key/, '')
  .replace(/^Digit/, '')
  .replace('Escape', 'Esc')
  .replace('Space', 'Space');

const ControlsPanel = () => {
  const [scheme, setSchemeState] = useState<ControlScheme>(ui.controlScheme.value);
  const [hotkeys, setHotkeysState] = useState(getHotkeys());
  const [capturing, setCapturing] = useState<HotkeyAction | null>(null);
  const pickScheme = (next: ControlScheme): void => {
    setSchemeState(next);
    setControlScheme(next);
  };
  const capture = (action: HotkeyAction, code: string): void => {
    setHotkey(action, code);
    setHotkeysState(getHotkeys());
    setCapturing(null);
  };
  return (
    <div style={{ marginTop: '14px', borderTop: '1px solid #2a3340', paddingTop: '12px', display: 'grid', gap: '10px' }}>
      <b style={{ fontSize: '13px' }}>Controls</b>
      <div style={{ display: 'flex', gap: '8px' }}>
        <Btn compact label="Mobile" active={scheme === 'mobile'} onClick={() => pickScheme('mobile')} />
        <Btn compact label="Desktop" active={scheme === 'desktop'} onClick={() => pickScheme('desktop')} />
      </div>
      <div style={{ display: 'grid', gap: '6px', gridTemplateColumns: 'repeat(auto-fit, minmax(154px, 1fr))' }}>
        {HOTKEY_ACTIONS.map((action) => (
          <button
            style={{ ...btn(capturing === action.id, true), justifyContent: 'space-between', minHeight: '38px' }}
            onClick={() => setCapturing(action.id)}
            onKeyDown={(e) => {
              if (capturing !== action.id) return;
              e.preventDefault();
              capture(action.id, e.code);
            }}
          >
            <span>{action.label}</span>
            <span style={{ opacity: 0.8 }}>{capturing === action.id ? 'Press key' : keyLabel(hotkeys[action.id])}</span>
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <Btn compact label="Reset Hotkeys" onClick={() => setHotkeysState(resetHotkeys())} />
      </div>
    </div>
  );
};

const SetupModal = (p: { game: Game }) => {
  const [mode, setMode] = useState<Mode>(ui.mode.value === 'spectate' ? 'spectate' : 'play');
  const [perTeam, setPerTeamState] = useState(ui.perTeam.value);
  const [human, setHuman] = useState(ui.humanPlayer.value);
  const [races, setRaces] = useState<FactionName[]>(setupRaces(ui.playerRaces.value, ui.perTeam.value * 2));
  const initialMap = proceduralMapSpec(p.game.mapSpec, ui.perTeam.value, p.game.seed);
  const [preset, setPreset] = useState<MapPreset>(initialMap.preset ?? 'teamPlateaus');
  const [midfield, setMidfield] = useState<MidfieldModule>(initialMap.midfield ?? 'empty');
  const [seedText, setSeedText] = useState(String(initialMap.seed));
  if (!ui.setupOpen.value) return null;
  const players = perTeam * 2;
  const seed = readSeed(seedText, p.game.seed);
  const mapSpec: Extract<MapSpec, { kind: 'procedural' }> = { kind: 'procedural', perTeam, seed, preset, midfield };
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
    p.game.restart(mode, seed, perTeam, races, human, mapSpec);
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
        <div style={{ display: 'grid', gap: '10px' }}>
          <details open style={{ border: '1px solid #1b2533', background: '#0f151e', padding: '8px' }}>
            <summary style={{ cursor: 'pointer', color: '#cdd9e5', marginBottom: '8px' }}>Match</summary>
            <div style={{ display: 'grid', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Btn compact label="Play" active={mode === 'play'} onClick={() => setMode('play')} />
                <Btn compact label="Watch AI" active={mode === 'spectate'} onClick={() => setMode('spectate')} />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[1, 2, 3].map((n) => <Btn compact label={`${n}v${n}`} active={perTeam === n} onClick={() => setPerTeam(n)} />)}
              </div>
              <span style={{ color: '#9fb1c7', fontSize: '12px' }}>
                {mapPresetLabel(preset)} · {midfieldLabel(midfield)} · seed {seed}
              </span>
            </div>
          </details>
          <details open style={{ border: '1px solid #1b2533', background: '#0f151e', padding: '8px' }}>
            <summary style={{ cursor: 'pointer', color: '#cdd9e5', marginBottom: '8px' }}>Map</summary>
            <div style={{ display: 'grid', gap: '8px' }}>
              <label style={{ display: 'grid', gap: '4px', color: '#9fb1c7' }}>
                Preset
                <select value={preset} onInput={(e) => setPreset(e.currentTarget.value as MapPreset)}
                  style={{ background: '#111923', color: '#e6edf3', border: '1px solid #2a3340', padding: '6px' }}>
                  {MAP_PRESETS.map((candidate) => (
                    <option value={candidate}>{mapPresetLabel(candidate)}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: '4px', color: '#9fb1c7' }}>
                Midfield
                <select value={midfield} onInput={(e) => setMidfield(e.currentTarget.value as MidfieldModule)}
                  style={{ background: '#111923', color: '#e6edf3', border: '1px solid #2a3340', padding: '6px' }}>
                  {MIDFIELD_MODULES.map((candidate) => (
                    <option value={candidate}>{midfieldLabel(candidate)}</option>
                  ))}
                </select>
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'end' }}>
                <label style={{ display: 'grid', gap: '4px', color: '#9fb1c7' }}>
                  Seed
                  <input value={seedText} inputMode="numeric" onInput={(e) => setSeedText(e.currentTarget.value)}
                    style={{ background: '#111923', color: '#e6edf3', border: '1px solid #2a3340', padding: '6px' }} />
                </label>
                <Btn compact label="Randomize" onClick={() => setSeedText(String(randomSeed()))} />
              </div>
              <span style={{ color: '#8ea4bd', fontSize: '12px' }}>
                Procedural {perTeam}v{perTeam} · {mapPresetLabel(preset)} · {midfieldLabel(midfield)}
              </span>
            </div>
          </details>
          <details open style={{ border: '1px solid #1b2533', background: '#0f151e', padding: '8px' }}>
            <summary style={{ cursor: 'pointer', color: '#cdd9e5', marginBottom: '8px' }}>Players</summary>
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
          </details>
          <details style={{ border: '1px solid #1b2533', background: '#0f151e', padding: '8px' }}>
            <summary style={{ cursor: 'pointer', color: '#cdd9e5' }}>Controls</summary>
            <ControlsPanel />
          </details>
        </div>
        <div style={{ position: 'sticky', bottom: '-14px', display: 'flex', gap: '8px', marginTop: '14px',
          paddingTop: '10px', background: '#111923' }}>
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
const minimapColor = (owner: number): string =>
  ['#4ea1ff', '#ff5a5a', '#ffd24e', '#9b7bff', '#5affa0', '#ff9b4e'][owner] ?? '#49d0c0';
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
