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
│        GAME VIEWPORT        │  ← MAP (top-down, north-up; largest zone)
│  (1-finger=select/act ·     │     1-finger drag = box-select · 2-finger = pan
│   2-finger=pan · pinch=zoom)│     pinch = zoom · tap = select/smart-act
│                             │
│                             │
│                             │
│              ┌────────────┐ │  ← MINIMAP floats over a corner of the map,
│              │  minimap   │ │     collapsible; tap/drag to jump camera
├──────────────┴────────────┴─┤
│ [selection portraits/count] │  ← SELECTION TRAY: who/what is selected
├─────────────────────────────┤
│  ▢  ▢  ▢    COMMAND HOTBAR   │  ← ACTION ZONE (thumb arc): context verbs
│  ▢  ▢  ▢  (A-move/Hold/Build…)│     adaptive grid of big buttons + sub-menus
└─────────────────────────────┘
```

Zones, top to bottom:

- **Top status bar** — minerals, gas, supply, game time, and a stack of tappable
  *alerts* ("under attack", "unit ready", "research done"). Slim and translucent so it
  doesn't eat the map. Read-only; tapping an alert jumps the camera.
- **Game viewport** — the dominant zone, rendered **top-down, north-up** (see
  [`maps.md`](./maps.md) for why top-down and how elevation reads). **One-finger drag =
  box-select; two-finger drag = pan; pinch = zoom.** Tap to select / smart-act, double-tap to
  select all of type on screen. This is where selection and command-targeting happen.
- **Minimap** — floats over a bottom corner of the viewport, collapsible to a pip.
  Tap to recenter camera; drag to scrub. Shows fog, units, alerts.
- **Selection tray** — compact representation of the current selection (portrait +
  count, or a grouped icon list for mixed selections). Tap a sub-group to narrow.
- **Command hotbar** — the heart of touch RTS: a prominent bottom row of large,
  context-sensitive **verb** buttons for the current selection (Attack-move, Stop, Hold,
  Patrol, Build, Train, abilities…). Tapping a verb enters target mode (§4). It complements
  the **smart-tap default action** (tap a target to do the obvious thing) — the hotbar is for
  the explicit verbs that aren't the default. Build/train open a sub-grid; smart-cast for
  abilities. This replaces PC hotkeys.

The map zone can expand to (near) full-screen with a tap, collapsing the chrome into
edge handles for an immersive view; controls slide back on demand.

## 4. Interaction grammar (touch gestures)

The core principle resolves the one real conflict on touch: **single-finger = select & command
(you do it constantly); two-finger = navigate.**

| Gesture | Action |
|---|---|
| **One-finger drag on the world** | **Box-select** units in the rectangle (the "highlight" gesture) |
| **Two-finger drag** | Pan camera |
| Pinch / spread | Zoom out / in |
| Tap your own unit / building | Select it |
| Tap with a selection active | **Smart action** at the tap target, unless the target is your own selectable entity (see below) |
| Double-tap your own unit / building | Select all of that type on screen |
| Long-press | Queue the command (shift-equivalent) / radial extras |
| Tap a hotbar verb | Enter **target mode** for that verb |
| Tap / drag the minimap | Jump / scrub the camera |
| Two-finger tap | Ping / alert (teammates) |

**Smart-tap default action** (with a selection active, tap a target — units auto-approach if
out of range, then act):

| Tap target | Default action |
|---|---|
| Own unit / building | **Select** it |
| Empty ground | **Move** |
| Enemy unit / building | **Attack** |
| Mineral patch / geyser (workers selected) | **Harvest** |
| Empty ground / resource (production buildings selected) | Set **rally point** |

The non-negotiable ambiguity rule is: **your own selectable entities are selected in normal
mode, never used as implicit command targets.** Friendly-target actions such as repair, heal,
load, unload-to, spell-on-friendly, and rally-to-friendly are command-card verbs first, then the
next world tap supplies the target. This keeps the common mobile loop cheap: SCVs selected +
tap Command Center selects the Command Center, instead of sending the workers there.

**Target mode** (for explicit verbs from the hotbar — Attack-move, Patrol, Build, Rally,
repair/heal/load, cast, etc.): tapping the verb puts the viewport into a clear one-tap "now tap
where/what" mode, then auto-exits. The target-mode tap is consumed by that verb even if it lands
on your own unit or building. This is how you attack-move a group: tap **A-move** → tap the
destination. It avoids needing two simultaneous inputs. A Cancel affordance exits target mode.

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
- Capture: main game view, unit selected (command hotbar), box-selection in progress,
  build menu open, minimap expanded, "under attack" alert state, immersive full-map mode.
- Compare across iterations to catch layout regressions and reachability problems.
- Screenshots are how we evaluate "elegant on a small vertical screen" — the stated goal.

## 9. Open questions / deferred

- Exact zoom range and whether to support a "tactical" zoom-out view.
- Whether two-finger-pan vs. minimap-jump should be the primary camera move (test both).
- How much of the command hotbar to surface at once vs. progressive disclosure.
- Landscape and tablet layouts (post-MVP).
- Visual style / art direction (separate from layout; TBD).
```
