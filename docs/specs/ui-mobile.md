# Mobile-First UI Design

> Status: living design doc. The hardest design problem in this project is making a
> StarCraft-class RTS genuinely playable on a small, vertical touchscreen. This doc
> defines the principles and layout; every iteration is verified with Playwright
> screenshots at real phone resolutions.

## 1. The core problem

Classic RTS UIs assume: a wide landscape monitor, a precise mouse for fast single-pixel
selection, a keyboard for hotkeys/control-groups, and high APM. A phone has **none of
these**: a tall narrow screen, fat-finger touch input (~44–48px min target), no hover,
no keyboard, no chord hotkeys, and a thumb-reachability constraint. We cannot shrink the
PC UI — we must **rethink the interaction model** so an RTS is comfortable one- or
two-thumbed in portrait.

Design targets: **portrait 9:19.5–9:16**, reference devices iPhone SE (375×667),
iPhone 14 (390×844), Pixel 7 (412×915). All screenshots taken at these sizes.

## 2. Guiding principles

1. **Thumb-first.** Primary actions live in the bottom third (the thumb arc). The top is
   for read-only status (resources, alerts) you glance at but rarely tap.
2. **Selection-then-action.** Tap to select, then act — avoid precision drag where
   possible. Big, forgiving touch targets (≥44px). Smart auto-selection reduces taps.
3. **Context over clutter.** The command surface shows only actions valid for the current
   selection (like the SC1 command card, but touch-sized and adaptive).
4. **The map is the canvas.** Maximize the viewport; overlay controls as translucent
   floating layers, not a thick chrome frame that steals vertical space.
5. **Reduce required APM.** Automation and good defaults (rally points, auto-mining new
   workers, control-group memory, smart-cast) let a human compete without 200 APM. This
   also keeps the human/AI action interfaces comparable.
6. **One-handed playable, two-handed optimal.** Nothing critical should require a second
   hand, but power users can use both thumbs.

## 3. Screen layout (portrait)

```
┌─────────────────────────────┐  ← TOP BAR (slim, translucent, read-only)
│ ⛏ 250  ⛽ 100   ▦ 18/26   ⏱  │     minerals · gas · supply · time · alerts
├─────────────────────────────┤
│                             │
│                             │
│        GAME VIEWPORT        │  ← MAP (largest zone; pan/zoom/pinch)
│   (pan · pinch-zoom · tap)  │     selection + command issuing happen here
│                             │
│                             │
│                             │
│              ┌────────────┐ │  ← MINIMAP floats over a corner of the map,
│              │  minimap   │ │     collapsible; tap/drag to jump camera
├──────────────┴────────────┴─┤
│ [selection portraits/count] │  ← SELECTION TRAY: who/what is selected
├─────────────────────────────┤
│  ▢  ▢  ▢      COMMAND CARD   │  ← ACTION ZONE (thumb arc): context actions
│  ▢  ▢  ▢   (Move/Atk/Build…) │     adaptive grid of big buttons + sub-menus
└─────────────────────────────┘
```

Zones, top to bottom:

- **Top status bar** — minerals, gas, supply, game time, and a stack of tappable
  *alerts* ("under attack", "unit ready", "research done"). Slim and translucent so it
  doesn't eat the map. Read-only; tapping an alert jumps the camera.
- **Game viewport** — the dominant zone. Pan with one-finger drag, **pinch to zoom**,
  tap to select, double-tap to select all of type on screen. Long-press for a radial
  context menu. This is where commands are targeted.
- **Minimap** — floats over a bottom corner of the viewport, collapsible to a pip.
  Tap to recenter camera; drag to scrub. Shows fog, units, alerts.
- **Selection tray** — compact representation of the current selection (portrait +
  count, or a grouped icon list for mixed selections). Tap a sub-group to narrow.
- **Command card** — the heart of touch RTS: a grid of large, context-sensitive action
  buttons for the current selection (Move, Attack, Stop, Hold, Patrol, Build, Train,
  abilities…). Build/train open a sub-grid. Smart-cast for abilities. This replaces PC
  hotkeys.

The map zone can expand to (near) full-screen with a tap, collapsing the chrome into
edge handles for an immersive view; controls slide back on demand.

## 4. Interaction grammar (touch gestures)

| Gesture | Action |
|---|---|
| One-finger drag (on map) | Pan camera |
| Pinch / spread | Zoom out / in |
| Tap unit | Select single unit |
| Tap empty ground | Deselect / (after selecting + action) issue command at point |
| Drag a lasso (toggle mode) | Box-select multiple units |
| Double-tap unit | Select all of that type on screen |
| Long-press unit/ground | Radial context menu (Attack-move, Patrol, etc.) |
| Tap command-card button | Issue command or open sub-menu / enter target mode |
| Two-finger tap minimap | Quick-ping / alert teammates |

**Target mode:** tapping an action that needs a target (Move, Attack, Build) puts the
viewport into a one-tap "now tap where" mode with a clear visual cue, then auto-exits.
This avoids needing two simultaneous inputs.

## 5. Control groups & selection without a keyboard

- **Persistent control-group bar** (optional, edge-docked vertical strip of group chips
  1–9): tap to select the group, double-tap to jump camera to it. Long-press a chip to
  assign the current selection.
- **Smart selection** reduces taps: "select all army", "select all idle workers",
  "select all production buildings" as one-tap macros.
- Selection persists across camera moves; the selection tray always shows current state.

## 6. Reducing APM (automation defaults)

To make the game humane on touch *and* keep the human action-space comparable to the AI:

- New workers **auto-return to mining** (toggleable).
- **Rally points** for production buildings (including to a mineral line = auto-mine).
- **Auto-rebind** finished units to the producing building's control group (optional).
- **Smart-cast** abilities (cast at tap target without extra confirm).
- **Queued commands** via long-press / shift-equivalent toggle.
- Idle-worker and "production idle" nudges in the alert stack.

## 7. Accessibility / ergonomics

- All interactive targets ≥44px; primary actions within the bottom thumb arc.
- High-contrast, colorblind-safe player colors and damage/health cues.
- Respect safe-area insets (notch, home indicator, rounded corners).
- Haptic feedback on command issue (where supported).
- Scales across phone sizes; tablet/landscape is a later enhancement, not the target.

## 8. Playwright verification workflow

Every UI iteration is checked by rendering at the reference resolutions and capturing
screenshots, so we *see* the mobile layout rather than guessing:

- Emulate iPhone SE / iPhone 14 / Pixel 7 viewports (portrait).
- Capture: main game view, unit selected (command card), build menu open, minimap
  expanded, "under attack" alert state, immersive full-map mode.
- Compare across iterations to catch layout regressions and reachability problems.
- Screenshots are how we evaluate "elegant on a small vertical screen" — the stated goal.

## 9. Open questions / deferred

- Exact zoom range and whether to support a "tactical" top-down zoom-out view.
- Lasso-select vs. tap-select as the default (likely a toggle in the action zone).
- How much of the SC1 command card to surface at once vs. progressive disclosure.
- Landscape and tablet layouts (post-MVP).
- Visual style / art direction (separate from layout; TBD).
```
