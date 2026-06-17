// HUD chrome (Preact + signals). The only framework-managed UI; the game world is
// drawn imperatively on canvas. Touch-first: big targets in the bottom thumb arc.

import { useEffect, useRef, useState } from 'preact/hooks';
import type { VNode } from 'preact';
import { ui } from './store.ts';
import { Abilities, Kind, NONE, ONE, Role, TILE, TechDefs, Units, shownSupply, type FactionName } from './sim.ts';
import type { Game } from './game.ts';
import type { CommandOption, ControlScheme, Mode } from './store.ts';
import {
  HOTKEY_ACTIONS, actionKey, getHotkeys, hotkeyLabelForAction, resetHotkeys, setHotkey, type HotkeyAction,
} from './hotkeys.ts';

const bar: Record<string, string> = {
  position: 'absolute', left: '0', right: '0', display: 'flex', gap: '8px',
  alignItems: 'center', padding: '8px 12px',
  background: 'rgba(11,14,19,0.78)', backdropFilter: 'blur(6px)', fontSize: '14px',
};

type CommandGroupId = 'placement' | 'production' | 'build' | 'tech' | 'abilities' | 'orders' | 'selection' | 'empty';
type CommandItem = { group: CommandGroupId; key: string; node: VNode };

const COMMAND_GROUP_ORDER: CommandGroupId[] = ['placement', 'production', 'build', 'tech', 'abilities', 'orders', 'selection', 'empty'];
const COMMAND_GROUP_LABEL: Record<CommandGroupId, string> = {
  placement: 'Place',
  production: 'Train',
  build: 'Build',
  tech: 'Tech',
  abilities: 'Cast',
  orders: 'Orders',
  selection: 'Select',
  empty: '',
};

const btn = (active = false, compact = false, disabled = false, dense = false): Record<string, string> => {
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
    flex: dense ? '0 0 auto' : compact && !desktop ? '1 1 0' : '0 0 auto',
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

const Btn = (p: {
  label: string;
  onClick: () => void;
  active?: boolean;
  compact?: boolean;
  dense?: boolean;
  disabled?: boolean;
  reason?: string;
  hotkeyAction?: HotkeyAction;
}) => (
  <button disabled={p.disabled} title={p.reason ? reasonLabel(p.reason) : undefined}
    style={btn(p.active, p.compact || (ui.controlScheme.value === 'desktop' && !!p.hotkeyAction), p.disabled, p.dense)}
    onClick={p.disabled ? undefined : p.onClick}>
    <span style={{ width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' }}>{p.label}</span>
    {p.reason && <span style={{ width: '100%', opacity: 0.86, fontSize: '10px', lineHeight: '11px',
      overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' }}>
      {reasonLabel(p.reason)}
    </span>}
    {ui.controlScheme.value === 'desktop' && p.hotkeyAction && !p.reason && (
      <span style={{ width: '100%', opacity: 0.75, fontSize: '11px', lineHeight: '11px', flex: '0 0 auto',
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

const groupLabelStyle: Record<string, string> = {
  height: '10px', lineHeight: '10px', fontSize: '9px', letterSpacing: '0',
  textTransform: 'uppercase', color: '#9fb1c7', opacity: '0.78',
};

const applyControlChrome = (scheme: ControlScheme): void => {
  const root = document.documentElement;
  root.style.setProperty('--top-chrome', scheme === 'desktop' ? '46px' : 'calc(76px + env(safe-area-inset-top))');
  root.style.setProperty('--bottom-chrome', scheme === 'desktop' ? '76px' : 'calc(84px + env(safe-area-inset-bottom))');
};

const setControlScheme = (scheme: ControlScheme): void => {
  ui.controlScheme.value = scheme;
  applyControlChrome(scheme);
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
      <Btn compact label={ui.controlScheme.value === 'desktop' ? '⌨ Desktop' : '☝ Mobile'}
        active={ui.controlScheme.value === 'desktop'}
        onClick={() => setControlScheme(ui.controlScheme.value === 'desktop' ? 'mobile' : 'desktop')} />
    </div>
  );
  if (ui.controlScheme.value === 'desktop') {
    return (
      <div style={{ ...bar, top: '0', height: 'var(--top-chrome)', overflow: 'hidden',
        padding: '4px 8px', flexWrap: 'nowrap', alignItems: 'center' }}>
        {resources}
        {buttons}
      </div>
    );
  }
  return (
    <div style={{ ...bar, top: '0', padding: '6px 8px 8px', paddingTop: 'max(6px, env(safe-area-inset-top))',
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
  const commands: CommandItem[] = [];
  let nextCommandKey = 0;
  const addCommand = (group: CommandGroupId, node: VNode): void => {
    commands.push({ group, key: `${group}-${nextCommandKey++}`, node });
  };
  const clearTargets = (): void => {
    ui.placement.value = 0; ui.land.value = false; ui.rally.value = false; ui.amove.value = false; ui.abilityTarget.value = 0; ui.targetMode.value = 'none';
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
  const addOptionButton = (
    group: CommandGroupId,
    option: CommandOption,
    label: string,
    hotkeyAction: HotkeyAction,
    onClick: () => void,
    active = false,
  ): void => {
    addCommand(group, <Btn dense={ui.controlScheme.value !== 'desktop'} label={label} hotkeyAction={hotkeyAction} active={active}
      disabled={!option.ok} reason={option.ok ? undefined : option.reason} onClick={onClick} />);
  };
  if (place !== 0) {
    addCommand('placement', <span style={{ opacity: 0.8, alignSelf: 'center', flex: '0 0 auto',
      fontSize: '12px', whiteSpace: 'nowrap' }}>{ui.land.value ? 'Land' : 'Place'} {Kind ? name(place) : ''}</span>);
    addCommand('placement', <Btn dense={ui.controlScheme.value !== 'desktop'} label="Cancel" onClick={clearTargets} />);
  } else if (ui.selCount.value > 0) {
    for (const option of ui.selTrainOptions.value) {
      const kind = option.id;
      addOptionButton('production', option, `Train ${short(Units[kind]?.name ?? 'Unit')}`, actionKey.train(kind),
        () => { clearTargets(); g.trainSelected(kind); });
    }
    for (const option of ui.selAddonOptions.value) {
      const kind = option.id;
      addOptionButton('build', option, `Add ${short(Units[kind]?.name ?? 'Add-on')}`, actionKey.addon(kind),
        () => { clearTargets(); g.addonSelected(kind); });
    }
    for (const option of ui.selTransformOptions.value) {
      const kind = option.id;
      const verb = kind === Kind.Archon || kind === Kind.DarkArchon ? 'Merge' : 'Morph';
      addOptionButton('production', option, `${verb} ${short(Units[kind]?.name ?? 'Unit')}`, actionKey.transform(kind),
        () => { clearTargets(); g.transformSelected(kind); });
    }
    if (ui.selCanBuild.value) {
      for (const option of ui.selBuildOptions.value) {
        const kind = option.id;
        addOptionButton('build', option, `Build ${short(Units[kind]?.name ?? 'Building')}`, actionKey.build(kind), () => placeKind(kind));
      }
    }
    if (ui.selCanRally.value) {
      addCommand('orders', <Btn dense={ui.controlScheme.value !== 'desktop'} label="Set Rally" hotkeyAction="rally" active={ui.rally.value} onClick={toggleRally} />);
    }
    if (ui.selCanHarvest.value) {
      addCommand('orders', <Btn dense={ui.controlScheme.value !== 'desktop'} label="Harvest" hotkeyAction="harvest" active={ui.targetMode.value === 'harvest'} onClick={() => toggleTarget('harvest')} />);
    }
    if (ui.selCanRepair.value) {
      addCommand('orders', <Btn dense={ui.controlScheme.value !== 'desktop'} label="Repair" hotkeyAction="repair" active={ui.targetMode.value === 'repair'} onClick={() => toggleTarget('repair')} />);
    }
    for (const option of ui.selResearchOptions.value) {
      const tech = option.id;
      addOptionButton('tech', option, short(TechDefs[tech]?.name ?? 'Research'), actionKey.research(tech),
        () => { clearTargets(); g.researchSelected(tech); });
    }
    for (const option of ui.selAbilityOptions.value) {
      const ability = option.id;
      const def = Abilities[ability]!;
      const active = ui.abilityTarget.value === ability;
      const cast = (): void => {
        if (def.target === 'self') {
          g.castSelectedAbility(ability);
          clearTargets();
        }
        else toggleAbility(ability);
      };
      addOptionButton('abilities', option, short(def.name), actionKey.ability(ability), cast, active);
    }
    if (ui.selCanLoad.value) {
      addCommand('orders', <Btn dense={ui.controlScheme.value !== 'desktop'} label="Load" hotkeyAction="load" onClick={() => g.loadSelected()} />);
    }
    if (ui.selCanUnload.value) {
      addCommand('orders', <Btn dense={ui.controlScheme.value !== 'desktop'} label="Unload" hotkeyAction="unload" onClick={() => g.unloadSelected()} />);
    }
    if (ui.selCanBurrow.value) {
      addCommand('orders', <Btn dense={ui.controlScheme.value !== 'desktop'} label="Burrow" hotkeyAction="burrow" onClick={() => g.burrowSelected(true)} />);
    }
    if (ui.selCanUnburrow.value) {
      addCommand('orders', <Btn dense={ui.controlScheme.value !== 'desktop'} label="Unburrow" hotkeyAction="unburrow" onClick={() => g.burrowSelected(false)} />);
    }
    if (ui.selCanMine.value) {
      addCommand('orders', <Btn dense={ui.controlScheme.value !== 'desktop'} label="Lay Mine" hotkeyAction="mine" onClick={() => g.mineSelected()} />);
    }
    if (ui.selCanLift.value) {
      addCommand('orders', <Btn dense={ui.controlScheme.value !== 'desktop'} label="Lift Off" hotkeyAction="lift" onClick={() => g.liftSelected()} />);
    }
    if (ui.selCanLand.value) {
      addCommand('orders', <Btn dense={ui.controlScheme.value !== 'desktop'} label="Land" hotkeyAction="land" active={ui.land.value} onClick={() => g.armLandSelected()} />);
    }
    if (ui.selCanAttackMove.value) {
      addCommand('orders', <Btn dense={ui.controlScheme.value !== 'desktop'} label="Atk-Move" hotkeyAction="attackMove" active={ui.amove.value} onClick={toggleAmove} />);
    }
    if (ui.selCanStop.value) {
      addCommand('orders', <Btn dense={ui.controlScheme.value !== 'desktop'} label="Stop" hotkeyAction="stop" onClick={() => g.stopSelected()} />);
    }
    addCommand('selection', <Btn dense={ui.controlScheme.value !== 'desktop'} label="Deselect" hotkeyAction="deselect" onClick={() => g.deselect()} />);
  } else {
    addCommand('empty', <span style={{ opacity: 0.5, alignSelf: 'center' }}>No selection</span>);
  }
  const sections = commandSections(commands);
  if (ui.controlScheme.value === 'desktop') {
    return (
      <div style={{ ...bar, bottom: '0', height: 'var(--bottom-chrome)', overflow: 'hidden',
        padding: '6px 8px', paddingBottom: 'max(6px, env(safe-area-inset-bottom))',
        display: 'grid', gridTemplateColumns: '112px 240px minmax(420px, 1fr)',
        alignItems: 'stretch', gap: '8px' }}>
        <MinimapPanel game={g} />
        <div style={{ border: '1px solid #2a3340', background: '#111923', padding: '8px',
          display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
          <b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ui.selCount.value > 0 ? ui.selKindName.value : 'No selection'}
          </b>
          <span style={{ opacity: 0.72, marginTop: '3px', fontSize: '12px' }}>
            {ui.selCount.value > 0 ? `Group ${ui.selCount.value}` : 'Ctrl+1-0 assigns groups'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', overflowY: 'hidden',
          paddingRight: '2px', justifyContent: 'end', alignItems: 'stretch', minWidth: 0 }}>
          {sections.map((section) => (
            <div key={section.id} style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: '0 0 auto' }}>
              {sections.length > 1 && COMMAND_GROUP_LABEL[section.id] && (
                <span style={groupLabelStyle}>{COMMAND_GROUP_LABEL[section.id]}</span>
              )}
              <div style={{ display: 'flex', gap: '5px', alignItems: 'stretch' }}>
                {section.items.map((item) => <div key={item.key} style={{ display: 'flex' }}>{item.node}</div>)}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div style={{ ...bar, bottom: '0', flexDirection: 'column', gap: '4px', alignItems: 'stretch',
      height: 'var(--bottom-chrome)', overflow: 'hidden',
      padding: '6px 8px', paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
      {ui.selCount.value > 0 && <span style={{ height: '16px', textAlign: 'center', opacity: 0.82, fontSize: '12px',
        lineHeight: '16px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ui.selKindName.value}</span>}
      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', overflowY: 'hidden', paddingBottom: '3px',
        scrollbarWidth: 'thin', WebkitOverflowScrolling: 'touch', alignItems: 'stretch' }}>
        {sections.map((section) => (
          <div key={section.id} style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: '0 0 auto',
            minWidth: section.items.length === 1 ? '0' : undefined }}>
            {sections.length > 1 && COMMAND_GROUP_LABEL[section.id] && (
              <span style={groupLabelStyle}>{COMMAND_GROUP_LABEL[section.id]}</span>
            )}
            <div style={{ display: 'flex', gap: '6px', alignItems: 'stretch' }}>
              {section.items.map((item) => <div key={item.key} style={{ display: 'flex' }}>{item.node}</div>)}
            </div>
          </div>
        ))}
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
        <ControlsPanel />
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
