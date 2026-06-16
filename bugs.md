# Bugs And Footguns

This file tracks correctness, UX, and maintainability issues found while reviewing the engine against the README goals: SC1-like RTS behavior, mobile-first controls, deterministic replay/netcode/RL, and a small cognitive surface for future work.

Each finding heading includes its current status. "Fixed" means the concrete bug has a targeted test. "Partial" means the immediate bug is handled but the broader design work remains.

## Implementation Progress

### 2026-06-16

- Implemented the first command-boundary slice:
  - Added `packages/sim/src/validation.ts` for authoritative command validation.
  - Added `packages/sim/src/footprint.ts` and explicit `footprintW`/`footprintH` data so placement/pathing use build-tile footprints instead of sprite radius.
  - Converted command ingestion to validate before mutation.
  - Added same-tick supply reservation for production commands.
  - Rechecked placement when a worker reaches the construction site, preventing delayed overlap if the site changes.
  - Updated app build placement to prevalidate and keep placement mode active on invalid taps.
  - Updated the scripted bot to use shared placement validation and local mineral/supply reservations.
  - Added validation tests for invalid command no-ops, occupied/resource placement rejection, refinery geyser snapping, and same-tick supply reservation.
- Implemented part of the replay/observation/hash hardening slice:
  - Vision-enabled sims compute initial fog immediately.
  - `observe()` now requires vision tracking and returns a defensive copy of the vision buffer.
  - Byte serialization now preserves `trackVision` and per-player vision grids.
  - State hashes now include teams and allocation state, reducing hidden future-divergence risk.
  - Recording no longer appends no-op replay frames after game over.
  - Added tests for observation safety, vision-preserving serialization, allocation-sensitive hashes, and post-game replay length.
- Implemented the immediate multi-touch gesture leak fix:
  - Two-finger camera gestures now suppress remaining-finger tap/box behavior until all pointers are lifted.
  - Added fake-canvas input tests for tap, box-select, and multi-touch suppression.
- Implemented the build lifecycle/refund slice:
  - Added an explicit pending/foundation build-cost ledger on entities.
  - Added `cancelBuild` for unfinished foundations with a 75% refund.
  - Stopping, moving, attacking, harvesting, retargeting, or killing a worker before foundation placement now refunds the pending build cost in full.
  - Build costs transfer from worker to foundation when construction starts.
  - Pending build footprints reserve space before the foundation exists, preventing same-tick overlapping reservations.
  - Serialization/hash coverage now includes build-cost ledger columns.
  - Added tests for full pre-foundation refunds, retarget refunds, worker-death refunds, 75% foundation cancel, and pending footprint reservation.
- Implemented the first deterministic command-results slice:
  - `applyCommands`, `stepWorld`, and `Sim.step()` now return deterministic per-command receipts.
  - Rejected commands include the validator's reject reason; accepted commands include player, command index, and command type.
  - `Sim.lastCommandResults` stores the most recent receipts for hosts that do not want to thread the return value.
  - Added a public sim test covering accepted and rejected command receipts.
- Self-review fixes after the build/refund and command-result slices:
  - Foundation cancellation now refunds and then uses the central `kill()` path instead of manually duplicating free-list/generation logic.
  - Duplicate foundation cancel commands in the same batch are covered by receipts: first accepted, second rejected as stale.
  - Spawned structures now default to no rally point (`-1`) instead of `(0, 0)`, matching production/render/bot semantics and preventing new producers from rallying units to map origin.
  - Added a production regression for new Barracks with no rally point.
- Fixed sparse-team victory handling:
  - Victory now tracks alive teams with a set instead of indexing by team id.
  - Added a regression for teams `[2, 2, 7, 7]` reporting winner team `2`.
- Fixed replay JSON loading guard:
  - Added `validateReplay()` and `parseReplay()` with version, map spec, player count, frame, player-command, and command-shape checks.
  - Replay playback/hash helpers now validate their inputs.
  - App replay loading now uses `parseReplay()` instead of casting raw JSON.
  - Added parser regressions for unsupported versions, unknown command types, and invalid JSON.
- Performance audit and hot-path cleanup:
  - Command ingestion now returns a shared empty result for no-command ticks, avoiding per-tick result-array allocation during idle gameplay.
  - Same-tick supply reservation is now allocated lazily only when a train command is actually present.
  - Replay recording now stores idle ticks as compact empty frames instead of cloning empty command bundles for every player.
  - Added a regression for compact idle replay frames.
  - `npm run demo` benchmark: 12,139 ticks in 502ms, about 24.2k ticks/s, with replay reproduction exact.
- Validation after this slice:
  - `npm run typecheck` passes.
  - `npm test` passes, 60/60.
  - `npm run build:app` passes when esbuild is allowed to spawn outside the sandbox.

Remaining major open areas:

- Richer deterministic gameplay events beyond command acceptance/rejection.
- Full placement preview rendering and richer invalid-placement feedback.
- Selection summary/control groups/mixed command-card model.
- Edge-distance combat ranges.
- Terrain/elevation combat and vision semantics.
- Ability/spell/research/upgrade command model.
- Public trusted/unsafe state API migration.
- UI chrome simplification and screenshot verification.
- Larger `Game`/renderer decomposition.

## High Priority

### 1. Build placement accepts illegal occupied footprints — Fixed

- Evidence: `packages/sim/src/systems/ingest.ts:36` only validates the target tile with `buildable(...)` for normal buildings, or snaps refineries to a geyser. `packages/sim/src/systems/construction.ts:26` later spawns the structure at that point without checking the full footprint against terrain, existing structures, resources, or units.
- Why it matters: the README now claims building footprints are solid and route around structures, but placement can still create overlaps. On mobile this is especially bad because a tap can look accepted even when it should be rejected.
- Suggested fix: add a shared `canPlaceStructure(state, kind, x, y)` validator that checks full footprint, bounds, terrain, geyser/refinery rules, and blocking entities. Use it in sim ingestion, app preview, bot spot finding, and tests.
- Validation: a sim test should reject a Supply Depot placed on a Command Center, mineral patch, geyser, blocked terrain, and map edge.

### 2. Build resources can be lost before a building exists — Fixed

- Evidence: `packages/sim/src/systems/ingest.ts:49` deducts minerals/gas immediately and only records a worker `Order.Build`. The structure is not spawned until `packages/sim/src/systems/construction.ts:23-26`, once the worker reaches the site. `packages/sim/src/commands.ts:9` has no cancel command. `docs/specs/sc1-spec.md:62` says cancelling refunds 75%.
- Why it matters: if the worker dies, is stopped, receives another command, or becomes unable to reach the site before the structure is placed, the player permanently loses the resources with no building and no cancellation/refund path.
- Suggested fix: model build state explicitly. Before the foundation is placed, cancelling or interruption should refund 100%. After the foundation exists, cancel should refund 75% per spec. If the game keeps SC1-style immediate spend, the spend must be paired with a recoverable pending-build record.
- Validation: tests for stop-before-foundation, worker-death-before-foundation, cancel-after-foundation, and refinery cancellation.

### 3. Same-tick production can bypass supply cap — Fixed

- Evidence: `packages/sim/src/tick.ts:21-22` runs `census(s)` before `applyCommands(s, batch)`. `packages/sim/src/systems/ingest.ts:25` checks `supplyUsed + def.supply <= supplyMax`, but accepted train commands in the same tick do not reserve supply.
- Why it matters: multiple idle producers can accept train commands against the same stale supply value and overqueue units past the cap. This breaks RTS expectations and pollutes replay/RL data with states that should be impossible.
- Suggested fix: reserve supply while accepting production commands, or recompute a local `pendingSupplyUsed[player]` inside command ingestion.
- Validation: create two Barracks at one free supply, issue two `train Marine` commands in one tick, and assert only one is accepted.

### 4. Command validation still mutates invalid recipients — Fixed

- Evidence: `packages/sim/src/systems/ingest.ts:76-103` applies `move`, `attack`, and `amove` to any owned live entity, including structures. `packages/sim/src/systems/ingest.ts:104-110` applies `harvest` to any owned live entity and any live target. The file header says invalid commands are ignored.
- Why it matters: a non-worker given `harvest` enters an order that only the harvest system understands for workers, effectively freezing it. Structures can receive movement or attack-move orders that later systems mostly skip. This makes the universal command boundary less trustworthy for UI, netcode, bots, and RL.
- Suggested fix: centralize per-command validators around roles/capabilities: movable, worker, producer, armed, structure, resource target, enemy target, completed building, etc. Ingestion should be the single source of truth.
- Validation: tests should assert Marines ignore harvest, Command Centers ignore move/amove/attack/stop variants that do not apply, and workers can harvest only resource nodes/refineries.

### 5. Mobile build placement exits even when sim rejects the command — Partial

- Evidence: `packages/app/src/game.ts:273-280` always clears `ui.placement` after queuing a build command, before the sim can accept or reject it. The current UI has no placement validity preview.
- Why it matters: a single misplaced tap silently drops the player back to normal mode. That is the same kind of inefficient tap loop the new mobile interaction spec is trying to remove.
- Suggested fix: use the shared placement validator in the app. Show valid/invalid preview while placing, keep placement mode active after invalid taps, and only clear it after a command is accepted or explicitly cancelled.
- Validation: app-level test for invalid placement preserving placement mode and valid placement clearing it.

## Medium Priority

### 6. Combat range is center-to-center instead of edge-to-edge — Open

- Evidence: `packages/sim/src/systems/combat.ts:49-58` checks weapon range with `within(e, attacker, targetCenter, range)`. `packages/sim/src/systems/move.ts` uses center distance. `docs/specs/sc1-spec.md:50` says ranges are expressed in pixels/tiles, but SC-style RTS combat normally resolves unit reach against collision/footprint edges.
- Why it matters: melee against large units/buildings and ranged attacks against big targets feel wrong. This also affects balance data if the goal is SC1-faithful behavior.
- Suggested fix: add an edge-distance helper that subtracts attacker/target radii or uses footprint bounds for structures. Use it for combat range, build range, smart targeting, and perhaps acquisition.
- Validation: tests for Marine vs building, SCV melee vs building, and unit-vs-unit edge cases.

### 7. `observe()` exposes mutable fog buffers — Fixed

- Evidence: `packages/sim/src/observe.ts:29` takes `const v = s.vision[player]!` and `packages/sim/src/observe.ts:52` returns it directly.
- Why it matters: a consumer can mutate the simulation's fog-of-war state through the observation object. That violates the strict `observe -> commands` boundary needed for network/RL and makes debugging harder.
- Suggested fix: return a copy or a read-only view contract that is impossible to mutate accidentally. For throughput, consider caller-owned output buffers later, but do not expose internal state.
- Validation: mutate `observe(s, p).vision[0]` and assert a second observation/state render is unchanged.

### 8. `observe()` depends on opt-in vision and can silently give stale/empty enemy views — Fixed

- Evidence: `packages/sim/src/tick.ts:31` updates vision only when `s.trackVision` is true. `packages/sim/src/observe.ts:37` uses the vision buffer to decide which enemies exist in the observation.
- Why it matters: the README describes `observe(player)` as the fair-play view for network/RL, but callers can get misleading observations if they did not construct the sim with vision tracking.
- Suggested fix: make `observe()` either require `trackVision` and throw/assert when absent, or compute/update vision for that call through an explicit API.
- Validation: construct a sim without vision tracking and assert `observe()` fails loudly or returns a documented full-own-only observation.

### 9. Mixed selections have lossy command-card state — Open

- Evidence: `packages/app/src/game.ts:453-467` stores only the last selected kind name and last selected producer kind in `ui.selKindName`/`ui.selProducer`. `packages/app/src/ui.tsx:99-111` renders the command card from that single producer.
- Why it matters: mixed building selections can hide valid commands or present a misleading label. Multiple selected Command Centers/Barracks are also ambiguous because the card does not explain which producer type is active.
- Suggested fix: keep the current simple UX rule, but make it explicit in the model: either disallow mixed structure command cards by choosing a primary subgroup, or expose a small set of aggregate booleans/counts such as `canTrainScv`, `canTrainMarine`, `canSetRally`, `canBuild`.
- Validation: app tests for selecting CC+Barracks, multiple CCs, worker+building, and units+buildings.

### 10. Top chrome is not yet thumb-first or robust on narrow phones — Open

- Evidence: `packages/app/src/ui.tsx:25-35` puts resources, timer, team size, Play/Watch, Map, and Load all into the top bar. In phone screenshots, the right-side controls can clip or crowd.
- Why it matters: README goal is a mobile-first vertical touchscreen RTS, not a desktop HUD squeezed onto a phone. Important controls should stay reachable and not steal space from game inspection.
- Suggested fix: keep only critical resources at the top. Move mode/map/load/replay-management to a compact menu or out-of-match overlay, and reserve bottom controls for active commands.
- Validation: Playwright screenshot checks at 390x844 and a narrower viewport should assert no clipped text/buttons.

### 11. Victory assumes team ids are dense small indexes — Fixed

- Evidence: `packages/sim/src/systems/victory.ts:10-20` allocates `alive = new Uint8Array(s.teams.length)` and indexes it by `team = s.teams[owner]`.
- Why it matters: generated setups currently use dense ids, but custom maps/network lobbies can easily use sparse team ids. A sparse id like team 7 with four players will index past the array and break winner accounting.
- Suggested fix: either normalize teams at setup time or use a `Set<number>`/max-team-sized array with validation.
- Validation: construct players with teams `[2, 2, 7, 7]` and assert victory reports the surviving actual team.

### 12. Production bots emit commands against stale local resources/supply — Fixed

- Evidence: `packages/ai/src/bot.ts:126-129` loops idle depots while checking the same `minerals`/supply snapshot for each train command. `packages/ai/src/bot.ts:145-148` does the same for Barracks.
- Why it matters: ingestion rejects unaffordable overflow, so this does not always corrupt sim state, but it creates noisy command streams and hides true planner capacity. It also amplifies the same-tick supply bug above.
- Suggested fix: have bot planners locally reserve minerals, gas, and supply as they emit commands, or expose a command-planning helper shared with the UI.
- Validation: snapshot a multi-producer bot tick and assert it does not emit commands that cannot all be accepted.

## Lower Priority / Maintainability

### 13. `Game` owns too many responsibilities — Open

- Evidence: `packages/app/src/game.ts` handles loop timing, replay control, camera, fog mirroring, input-to-command translation, selection, command queuing, minimap, and HUD publishing.
- Why it matters: the mobile interaction model is now one of the product's core design assets. Keeping all of selection, target modes, hotbar state, replay, and rendering glue in one class raises the cost of every UX change.
- Suggested fix: split along behavior boundaries: `SelectionModel`, `HumanInputController`, `CommandIntentQueue`, and `HudPresenter`. Keep the outer `Game` as orchestration.
- Validation: no behavior change required at first; move logic with existing tap/selection tests as guardrails.

### 14. Entity column changes are easy to make inconsistently — Partial

- Evidence: adding a field requires updating `Entities`, `ENTITY_COLUMNS`, `spawn`, serialization/hash behavior, and often renderer assumptions in separate files. Recent facing support touched several of these paths.
- Why it matters: the entity-column coverage test helps, but semantic defaults and derived-state decisions can still drift. This is a common maintenance trap in typed-array SoA engines.
- Suggested fix: keep the SoA design, but add a single column registry with default values, hash/serialize flags, and copy/resize behavior. Generate repetitive loops from that registry.
- Validation: add a test-only column to prove registry-driven spawn/hash/serialize coverage.

### 15. Command schema has no acceptance feedback — Partial

- Evidence: `packages/sim/src/commands.ts:9-17` defines commands as fire-and-forget data, and `applyCommands` returns `void`.
- Why it matters: this is fine for early scripted bots, but mobile UX needs immediate feedback for invalid placements and future spells. Network/RL tooling also benefits from knowing which actions were rejected and why.
- Suggested fix: keep deterministic command application, but optionally emit deterministic command results/events: accepted, rejected reason, spawned id, spent resources, queue index.
- Validation: a command result test should show rejected invalid placement without mutating state.

### 16. Replay frames can keep recording no-op steps after game over — Fixed

- Evidence: `packages/sim/src/sim.ts:47` records the command batch before `stepWorld(...)` runs, while `packages/sim/src/tick.ts:20` freezes the world after game over.
- Why it matters: this is not a gameplay bug, but it can bloat saved replays and make replay UI ranges confusing if hosts keep stepping after victory.
- Suggested fix: do not append frames once `s.result.over` is true, or append exactly one terminal frame and document that behavior.
- Validation: step a finished game ten more times and assert replay length stays stable.

## Additional Architectural Review Findings

### 17. Public sim state is live and mutable — Open

- Evidence: `packages/sim/src/sim.ts:51-54` returns the live `State` from `fullState()`. `packages/app/src/game.ts:211-214` passes that live state to controllers before applying their returned commands.
- Why it matters: this is fine for trusted built-in bots, but it weakens the "players are an interface" goal. Any controller can mutate minerals, entity columns, RNG, result state, or command targets outside the command validator. That is a major footgun for network play, RL evaluation, replay debugging, and third-party bots.
- Suggested fix: split the API into explicit trust levels: `fullStateUnsafe()` for renderer/debug/trusted scripts, `observe(player)` plus action masks for real players/policies, and perhaps a read-only facade for scripted bots. Do not pass live mutable state across an untrusted player boundary.
- Validation: add a test controller that mutates `fullState()` and document/guard whether that is intentionally allowed. For network/RL paths, assert policies only receive observations.

### 18. Hashes do not cover allocation state, so equal hashes can diverge later — Fixed

- Evidence: `packages/sim/src/world.ts:280-320` hashes only live entities and selected scalar fields. Dead-slot generations, `freeTop`, and the free-slot stack are not included, even though `packages/sim/src/world.ts:86-92` uses generation and slot allocation to validate future `EntityId`s.
- Why it matters: two states can have the same live units and same hash but different dead-slot generations/free lists. A future spawn can receive a different id, or a future stale command can be accepted in one state and rejected in another. That makes replay/desync hashes less trustworthy than they look.
- Suggested fix: either include allocation state in `hashState`, or maintain a separate "visual/gameplay hash" and "strict deterministic hash" with the replay/desync checks using the strict one.
- Validation: construct two states with identical live entities but different killed-slot histories, assert their strict hashes differ, and assert a later stale-id command cannot be hidden by equal hashes.

### 19. Byte serialization drops `trackVision` — Fixed

- Evidence: `packages/sim/src/serialize.ts:72-101` writes state data but not `trackVision`; `packages/sim/src/serialize.ts:124` reconstructs through `makeState(...)`, whose default in `packages/sim/src/world.ts:161` is `trackVision: false`.
- Why it matters: a `Sim` created with `vision:true` can serialize/deserialize into a state that no longer updates fog. The README positions serialization as the disk/Worker-transfer snapshot path, so losing this option creates surprising host behavior.
- Suggested fix: serialize `trackVision`, or make it an explicit restore option in `Sim.deserialize(buf, { vision })`.
- Validation: create a vision-enabled sim, serialize/deserialize, step once, and assert vision still updates or fails loudly by design.

### 20. Initial fog is not computed until the first tick — Fixed

- Evidence: `packages/sim/src/sim.ts:26-31` enables `trackVision` but does not run the vision system. `packages/sim/src/tick.ts:31` computes vision only after the first `stepWorld(...)`.
- Why it matters: `observe()` and the app's first rendered frames can start with empty fog even though starting units should reveal the base immediately. This is small visually, but it is a bad default for the observation boundary.
- Suggested fix: when `vision:true`, compute vision once after setup, or expose an explicit `refreshVision()` called by hosts before first observe/render.
- Validation: `new Sim({ vision:true }).observe(0).vision` should include visible tiles around the starting depot before any steps.

### 21. Two-finger gestures can leak into stale one-finger taps or drag boxes — Fixed

- Evidence: `packages/app/src/input.ts:31-57` enters pinch/pan mode with two pointers, but `packages/app/src/input.ts:62-79` only handles tap/box cleanup when the pointer count was one before deletion. When one finger remains after a pinch, the old `start`, `moved`, and `onMinimap` state can still drive a later tap or box select.
- Why it matters: mobile RTS input must be non-ambiguous. A camera gesture should never issue a command or selection after the user lifts one finger.
- Suggested fix: track a `gestureSuppressed` or `multiTouchActive` flag. Once a second pointer appears, suppress all tap/box behavior until all pointers are lifted and the one-finger gesture state is reset.
- Validation: pointer-event test for pinch/pan followed by lifting one finger, moving/releasing the other, and asserting no `tap`/`boxSelect` call occurs.

### 22. Pathing solid-cache signatures can miss same-slot replacement shape changes — Fixed

- Evidence: `packages/sim/src/flow.ts:34-41` hashes only live blocking slots and their positions. It omits generation, kind, radius, and built/footprint-relevant properties. `packages/sim/src/flow.ts:62-63` only rebuilds the solid grid when that signature changes.
- Why it matters: if a structure dies and another blocking structure appears in the same slot at the same position with a different footprint, the cached solid grid can remain stale. Current gameplay may rarely hit this, but the cache invariant is weaker than the code comments imply.
- Suggested fix: include generation and footprint identity in `buildSig`: at least slot, gen, kind, x, y, and a footprint/radius value.
- Validation: force same-slot replacement with different building radii and assert `navSolid` changes.

### 23. Replay JSON loading has no schema/version guard — Fixed

- Evidence: `packages/app/src/game.ts:132-134` parses arbitrary JSON and casts it to `Replay`. `packages/sim/src/replay.ts:22-28` has a `version` field, but playback does not validate it before using frame/map/player data.
- Why it matters: a malformed or older replay can crash the app or produce misleading playback. This is low risk now, but replay files are a user-facing artifact and eventually a debugging/training artifact.
- Suggested fix: add `parseReplay(json): Replay` with version, map spec, player count, and command-shape validation.
- Validation: tests for bad JSON, wrong version, invalid map spec, and malformed command frames.

## Suggested Next Fix Order

1. Shared command/placement validators: fixes illegal buildings, invalid order mutation, app preview, and future action masks.
2. Build lifecycle and cancel/refund: fixes the resource-loss bug and aligns with the SC1 spec.
3. Same-tick reservation accounting: fixes supply cap and makes bots/UI command emission predictable.
4. Observation boundary hardening: copy/read-only vision and assert vision tracking semantics.
5. Mixed-selection command-card model: keep the UI simple, but make the state explicit and testable.
6. Public API cleanup: separate live debug state from observation/command interfaces before adding network or RL policies.

## Comprehensive Remediation Plan

This plan is ordered by dependency and blast radius. The goal is not to polish isolated symptoms, but to tighten the engine around three stable contracts:

1. The sim accepts only legal commands, mutates state only through deterministic systems, and can explain command rejection when a host needs UX feedback.
2. The app turns touch gestures into clear command intents without hidden state leaks or ambiguous mixed-selection behavior.
3. Replay, serialization, observation, bots, and future network/RL code all sit on explicit APIs instead of relying on live mutable internals.

Roadmap review note: this plan is intentionally broader than the currently playable Terran slice. The immediate remediation path should still stay slice-sized, but the architecture we choose now must not block control groups, command results, spells/research/upgrades, precise building footprints, fog-memory snapshots, or future race mechanics.

### Phase 0: Lock Down Review Tests Before Refactors

Purpose: add failing tests for the most important findings before changing architecture. This keeps the plan honest and gives us a rollback point for each fix.

Files to touch:

- `packages/sim/test/commands.test.ts` or a new `packages/sim/test/validation.test.ts`
- `packages/sim/test/building.test.ts`
- `packages/sim/test/observe.test.ts`
- `packages/sim/test/replay.test.ts`
- `packages/app/test/tap-semantics.test.ts`
- A new `packages/app/test/input.test.ts` if pointer events can be tested without a browser, otherwise a Playwright-driven input test later

Tests to add first:

- Illegal build placement is rejected on occupied structure footprints, resources, blocked terrain, map edge, and non-geyser refinery placement.
- Invalid commands leave state unchanged: Marine harvest, Command Center move/amove/attack, worker harvest on non-resource, attack own unit, train from incomplete/non-producer.
- Same-tick train commands cannot reserve more supply than available.
- Cancelling/interruption before foundation placement does not permanently burn resources.
- `observe()` does not expose mutable vision buffers.
- A vision-enabled serialized sim stays vision-enabled after deserialize, or the API requires an explicit restore option.
- Initial vision is non-empty immediately after constructing a vision-enabled `Sim`.
- Strict replay hash catches allocation-state divergence.
- Two-finger pan/pinch does not call `tap()` or `boxSelect()` after one finger remains.

Acceptance criteria:

- The tests should initially fail where the bug is real.
- Each later phase turns its corresponding tests green without weakening existing deterministic replay tests.
- `npm test`, `npm run typecheck`, and app build remain the standard gate after each phase.

### Phase 1: Central Command Validation And Placement Rules

Purpose: make the command boundary trustworthy. This is the foundation for placement UX, bots, action masks, network play, and RL.

New or changed modules:

- Add `packages/sim/src/validation.ts`
- Update `packages/sim/src/systems/ingest.ts`
- Update `packages/sim/src/commands.ts`
- Update `packages/sim/src/data.ts` only if new role flags or footprint metadata are needed
- Update `packages/sim/src/flow.ts` only if placement validation reuses the solid footprint logic
- Update `packages/app/src/sim.ts` exports so the app can use placement validation
- Update bot spot-finding in `packages/ai/src/bot.ts`

Core API shape:

- `validateCommand(s, player, command): CommandValidation`
- `canIssueCommand(s, player, command): boolean`
- `canPlaceStructure(s, player, workerSlot, kind, x, y): PlacementResult`
- `structureFootprint(kind, x, y): Footprint`
- `isCommandTargetAllowed(s, player, command): boolean`

Suggested result shape:

```ts
type CommandValidation =
  | { ok: true }
  | { ok: false; reason: CommandRejectReason };

type CommandRejectReason =
  | 'stale-entity'
  | 'wrong-owner'
  | 'missing-capability'
  | 'target-not-found'
  | 'target-not-allowed'
  | 'not-affordable'
  | 'supply-blocked'
  | 'queue-full'
  | 'placement-blocked'
  | 'placement-off-map'
  | 'placement-requires-geyser'
  | 'incomplete-producer';
```

Implementation details:

- Ingestion should become mostly "validate, then apply." It should not repeat ownership/capability logic ad hoc in every case.
- Movement commands should require `Role.Mobile`, speed > 0, and not `Role.Structure`.
- Harvest should require `Role.Worker` and a target with `Role.Resource`; gas should be harvested from a built refinery, not a raw geyser.
- Attack and attack-move should require a weapon or intentionally allow unarmed attack-move only if the UX wants workers to move aggressively. If SCV attacks are supported, their weapon already exists.
- Train should require an owned built producer whose `produces` includes the kind, queue room, resources, and reserved supply.
- Build should require an owned worker, legal structure kind, resources, and valid placement.
- Rally should require an owned structure; target snapping should use the same resource-target helper.
- Stop should probably apply to mobile units and workers. Decide whether stopping structures should clear production/rally, and if not, reject it.

Placement rules:

- Convert fixed-point center to build tiles consistently.
- Validate full footprint, not just center tile.
- Do not derive building footprints from sprite radius. Add explicit build-footprint metadata, ideally width/height in build tiles plus an origin/anchor convention. Radius can remain an interaction/rendering concept, but placement and pathing solidity need discrete footprint data.
- Check map bounds.
- Check buildable terrain for every occupied build tile.
- Check existing blocking structures and resources.
- For refineries, require a geyser within snap range and place exactly on that geyser.
- For normal buildings, reject placement on minerals/geysers/refineries.
- Decide whether workers/units block foundation placement. For SC-style behavior, units should not permanently block placement if they can move away, but existing units under the foundation need a displacement/evacuation policy. Until that exists, rejecting unit-occupied placement is acceptable as an interim simplification, but it should be documented as not-final SC behavior.
- Pathing solidity, placement legality, minimap/build preview drawing, and renderer selection bounds should all use the same footprint source where practical. If they intentionally differ, the reason should be written down.

Tests:

- Unit tests for every command variant and reject reason.
- Property-style table tests for roles/capabilities.
- Placement matrix tests on terrain, resources, structures, and map bounds.
- Regression test for "selected workers tapping Command Center selects it instead of ordering them."

Risks:

- Over-validating may reject commands the UI currently relies on, especially `stop` on selected buildings or attack-move with workers. Resolve by writing the desired command matrix explicitly.
- Placement footprint math must match pathing solid stamping and renderer footprint intuition. If these diverge, players will see "valid" placements that pathing treats differently.
- Future Terran lift/land, Protoss power, Zerg creep, and add-ons all affect placement legality. The first validator should be small, but its API should leave room for race-specific placement constraints without scattering race branches through ingestion.

Acceptance criteria:

- `applyCommands` ignores invalid commands without mutating state.
- App, bot, and sim tests all use the same placement predicate.
- The command validator can later power action masks without reading app/UI code.

### Phase 1A: Deterministic Command Results And Events

Purpose: let hosts know what happened without making the app guess from state diffs. This is needed for invalid-placement UX, construction feedback, replay debugging, future audio/visual events, and action-mask training data.

Files to touch:

- `packages/sim/src/commands.ts`
- `packages/sim/src/systems/ingest.ts`
- `packages/sim/src/sim.ts`
- `packages/sim/src/replay.ts` if command results become replay metadata
- `packages/app/src/game.ts`
- `packages/app/src/store.ts`
- Tests in `packages/sim/test/validation.test.ts` and `packages/app/test/tap-semantics.test.ts`

Design:

- Keep commands as deterministic inputs.
- Add optional deterministic outputs from a step:
  - command accepted/rejected result
  - reject reason
  - resource spend/refund
  - production queued
  - foundation placed
  - unit spawned
  - entity died
  - game ended
- Do not let events become a second source of truth. Events are derived from the same state transition and should be replayable/debuggable.
- Keep the first version small: command acceptance/rejection plus spawned/died/game-over is enough.

Potential API shape:

```ts
type StepResult = {
  commandResults: CommandResult[];
  events: SimEvent[];
};

type CommandResult =
  | { ok: true; player: number; commandIndex: number }
  | { ok: false; player: number; commandIndex: number; reason: CommandRejectReason };
```

Tests:

- Invalid placement returns `placement-blocked` and does not mutate state.
- Valid train returns accepted and changes queue/resources.
- Replay simulation can ignore events and still reproduce hashes.

Risks:

- Event collection can allocate in the hot loop. Make it optional or caller-owned for headless throughput.

Acceptance criteria:

- The app no longer has to infer command acceptance solely from later state.
- Command results are deterministic and optional for high-throughput stepping.

### Phase 2: Production Reservation Accounting

Purpose: fix same-tick overqueue and make planners honest.

Files to touch:

- `packages/sim/src/systems/ingest.ts`
- `packages/sim/src/systems/census.ts`
- `packages/sim/src/systems/production.ts` only if queue semantics change
- `packages/ai/src/bot.ts`
- `packages/app/src/game.ts` if train UX needs rejection feedback
- `packages/sim/test/economy.test.ts`

Implementation details:

- At the start of `applyCommands`, create per-player local counters:
  - `reservedMinerals`
  - `reservedGas`
  - `reservedSupply`
- Seed `reservedSupply` from current `s.players.supplyUsed`, which already includes in-progress production from `census`.
- As each train/build command is accepted, increment reservations before processing later commands in the same batch.
- Deduct resources immediately only after validation passes.
- Make command order deterministic and documented: iterate players in batch order, then commands in array order. If network lockstep requires canonical ordering later, sort or normalize outside ingestion.
- Update bots to reserve locally while emitting commands so they stop producing noisy rejected commands.

Tests:

- Two producers, one free supply, two train commands in one tick -> one accepted.
- Two producers, enough supply but minerals for one -> one accepted.
- Bot with multiple idle producers emits only affordable/supply-legal commands.
- Existing single-producer production tests still pass.

Risks:

- `census` currently says in-progress production reserves supply. Keep that model; do not double count newly accepted commands across ticks.
- If command results are not implemented yet, tests must inspect state deltas to infer acceptance.

Acceptance criteria:

- No same-tick command batch can push queued supply, minerals, or gas below valid bounds.
- Bots and UI can emit multiple commands without relying on ingestion to silently clean up obvious overflows.

### Phase 3: Build Lifecycle, Cancel, Refunds, And Foundations

Purpose: fix resource loss and align construction with RTS expectations.

Files to touch:

- `packages/sim/src/commands.ts`
- `packages/sim/src/world.ts`
- `packages/sim/src/systems/ingest.ts`
- `packages/sim/src/systems/construction.ts`
- `packages/sim/src/systems/census.ts`
- `packages/sim/src/systems/victory.ts` if incomplete structures should count for elimination
- `packages/sim/src/serialize.ts`
- `packages/app/src/ui.tsx`
- `packages/app/src/game.ts`
- Tests in `packages/sim/test/building.test.ts` and `packages/app/test/tap-semantics.test.ts`

Design decision:

- Use a two-stage construction model:
  - Pending build: worker has a build order and resources are reserved/spent, but no foundation exists yet.
  - Foundation: structure entity exists with `built = 0`, `ctimer > 0`, and can be cancelled/refunded at 75%.

State additions to consider:

- `buildCostMinerals`
- `buildCostGas`
- `builder` or `buildWorker` if we need link-back
- `buildStarted` or a richer build phase enum
- A command result/event for "foundation placed" if the UI needs feedback

Command additions:

- `{ t: 'cancelBuild'; building: number }`
- Possibly `{ t: 'cancelOrder'; unit: number }` if cancelling a worker's pending build should differ from `stop`

Rules:

- Pick and document the pre-foundation economy semantics explicitly. The plan currently prefers "deduct immediately, record refundable pending cost, refund 100% if the worker never starts the foundation." That is player-friendly and avoids resource loss, but it should be treated as a deliberate mobile/clarity choice unless we verify exact SC1 behavior.
- If a worker's pending build is stopped before foundation placement, refund according to that chosen pre-foundation rule.
- If the worker dies before foundation placement, refund according to that chosen pre-foundation rule.
- Once the foundation entity exists, cancel refunds 75% per spec.
- Destroyed foundations should refund 0%.
- Incomplete structures should be targetable and block pathing.
- Incomplete supply providers should not provide supply until built, as today.
- Decide whether incomplete structures count for victory. SC-like behavior usually treats buildings under construction as buildings for elimination once foundation exists; pending worker orders should not count.

Tests:

- Worker stopped en route refunds full amount.
- Worker killed en route refunds full amount.
- Worker retargeted en route refunds or explicitly cancels the pending build.
- Foundation cancel refunds 75%.
- Foundation destroyed refunds nothing.
- Foundation blocks pathing and placement.
- Incomplete supply does not increase supply cap.
- Replay/serialize roundtrip with pending build and incomplete foundation.

Risks:

- The current `buildKind` on workers is too small to encode refund data unless costs are recomputed from `Units`. Recomputing is okay while costs are static, but stored costs are safer if upgrades/discounts ever exist.
- If resources are "reserved but not deducted" for pending builds, every affordability check needs to account for reserved resources. If resources are deducted immediately, pending-build state must store enough data to refund correctly. Pick one ledger model and use it everywhere.
- Adding columns requires hash/serialize coverage and default resets.

Acceptance criteria:

- There is no path where legal build commands spend resources and then vanish without either a foundation or a defined refund outcome.
- The app has a visible cancel path for placement and active construction.

### Phase 4: Mobile Placement UX And Command Feedback

Purpose: make the single-tap mobile flow feel intentional and forgiving.

Files to touch:

- `packages/app/src/game.ts`
- `packages/app/src/ui.tsx`
- `packages/app/src/store.ts`
- `packages/app/src/render2d.ts`
- `packages/app/src/gl/renderer.ts` or overlay renderer if placement preview should be drawn there
- `packages/app/test/tap-semantics.test.ts`
- Screenshot tests via `packages/app/shot.mjs` or a new app test harness

Implementation details:

- Add placement state beyond just `kind`:
  - selected worker id or worker subgroup
  - candidate world x/y under current pointer/tap
  - validity result/reason
- While placement is active:
  - Tapping valid terrain queues a build and exits placement.
  - Tapping invalid terrain stays in placement and surfaces a subtle invalid feedback state.
  - Tapping Cancel exits placement without issuing a command.
  - Panning/zooming should not accidentally place.
- Preview should use shared `canPlaceStructure`.
- Keep UI text minimal; visual cues should carry most of the feedback:
  - valid footprint tint
  - invalid footprint tint
  - blocked tiles indicated if easy
- If command results are available, only clear placement after accepted command result. If not, prevalidation must be strong enough that queued command should be accepted.

Tests:

- Invalid placement keeps placement mode.
- Valid placement queues one build and exits placement.
- Cancel clears placement and queues nothing.
- Two-finger pan in placement does not place.
- Preview validity matches sim acceptance for a test matrix.

Risks:

- App tests may need a fake renderer/input harness to avoid brittle browser-only tests.
- Placement preview in WebGL can add complexity; a simple 2D overlay is likely enough first.

Acceptance criteria:

- The player never loses placement mode because of an invalid tap.
- The app never shows a valid placement that the sim rejects.

### Phase 5: Gesture State Machine Cleanup

Purpose: make pointer input unambiguous and easy to reason about.

Files to touch:

- `packages/app/src/input.ts`
- Possibly introduce `packages/app/src/inputState.ts`
- `packages/app/test/input.test.ts`

Design:

- Replace loose local variables with an explicit state machine:
  - `idle`
  - `oneFingerPendingTap`
  - `oneFingerDraggingBox`
  - `minimapDragging`
  - `twoFingerCamera`
  - `suppressedUntilAllPointersUp`
- Once a second pointer appears, no tap/box command can fire until all active pointers are gone.
- Pointer cancel should reset all gesture state.
- UI buttons and canvas gestures should stay separate; world canvas should not receive UI button taps because `#ui > *` handles pointer events.

Tests:

- Tap calls `tap`.
- Drag calls `boxSelect`.
- Minimap drag calls `minimapPan`, not `boxSelect`.
- Pinch/pan calls camera changes only.
- Pinch then lift one finger then release second finger calls no tap/box.
- Pointer cancel resets state.

Risks:

- Browser PointerEvent support in Node tests may need a small fake event target. Keep input logic pure where possible.

Acceptance criteria:

- Every pointer sequence maps to exactly one gesture class.
- Camera gestures never emit gameplay commands.

### Phase 6: Selection And Command Card Model

Purpose: keep the simple UX but make mixed-selection behavior explicit and testable.

Files to touch:

- `packages/app/src/game.ts`
- `packages/app/src/store.ts`
- `packages/app/src/ui.tsx`
- `packages/app/test/tap-semantics.test.ts`
- `docs/specs/ui-mobile.md`

Design recommendation:

- Keep mixed units and buildings out of normal box selection where possible:
  - Box select prefers units.
  - If no units are inside, select buildings.
  - Direct taps select the tapped owned entity.
- Command cards should be capability-driven, not last-kind-driven.
- Replace `selProducer`/`selKindName` with a selection summary:

```ts
type SelectionSummary = {
  count: number;
  primaryKind: number;
  homogeneous: boolean;
  hasMobile: boolean;
  hasWorkers: boolean;
  hasStructures: boolean;
  canBuild: boolean;
  canSetRally: boolean;
  trainable: number[];
};
```

Command card behavior:

- If workers selected: show build commands and mobile commands.
- If only one producer type selected: show its train command and rally.
- If multiple producer types selected: show combined train commands only if we can route each command to an eligible least-busy producer.
- If units and structures are somehow mixed through direct/double selection, mobile commands apply only to mobile units and rally applies only when explicitly armed.
- Avoid drilling: do not add submenus until there are enough commands to require them.
- Control groups are part of the mobile spec and should not be lost in this phase. The first version can be simple: group chips, tap to select, long-press/explicit button to bind current selection, double-tap chip to jump camera. Auto-rebind produced units can be deferred.

Tests:

- Multiple Command Centers show Train SCV and train least-busy CC.
- Multiple Barracks show Train Marine and train least-busy Barracks.
- CC + Barracks selection shows both train actions or a clear primary subgroup rule.
- Worker + Command Center selection shows worker build commands and does not accidentally hide key commands.
- Selected structures ground tap sets rally; selected units ground tap moves; mixed selection applies command to eligible subset only when explicit.
- Bind/select/jump a control group without a keyboard.
- Destroyed units are pruned from control groups without breaking the chip.

Risks:

- Combined command cards can become cluttered when spells/upgrades arrive. The rule should be capability-based now, with grouping later.
- Control groups add persistent selection state that can conflict with direct selection and target modes. Binding/selecting a group should cancel armed target modes unless the UX spec says otherwise.

Acceptance criteria:

- No command card state depends on iteration order through a `Set`.
- The displayed command card matches the commands `Game` can actually emit.
- Control groups have a documented, test-backed mobile binding/selecting flow.

### Phase 7: Observation Boundary And Public Sim API

Purpose: separate trusted debug/render state from player/policy observations.

Files to touch:

- `packages/sim/src/sim.ts`
- `packages/sim/src/observe.ts`
- `packages/sim/src/commands.ts`
- `packages/sim/src/index.ts`
- `packages/app/src/game.ts`
- `packages/ai/src/bot.ts`
- `packages/headless/src/demo.ts`
- Tests in `packages/sim/test/observe.test.ts` and headless tests

API changes:

- Rename `fullState()` to `fullStateUnsafe()` or add the unsafe name first and migrate hosts.
- Keep a trusted path for renderer and built-in bots.
- Make `observe(player)` safe by default:
  - copy vision or return a caller-owned buffer
  - include enough own-unit command/order details for policies
  - hide enemy data through fog
  - assert or compute vision when required
- Add a future action-mask hook:
  - `legalActionsForSelection` for UI is app-side
  - `actionMask(observation)` or `legalCommands(s, player)` for RL/network is sim-side

Initial practical step:

- Add `fullStateUnsafe()` and mark `fullState()` as deprecated in comments, then migrate app/bots/headless. Later remove or restrict `fullState()`.

Tests:

- Mutating observation vision does not mutate sim vision.
- `observe()` before first tick has visible starting area when vision is enabled.
- `observe()` without vision enabled throws or returns a documented error.
- Built-in bots still run through trusted state path.

Risks:

- Copying vision every observe can hurt high-throughput RL. If that matters, add caller-owned output buffers rather than exposing internal arrays.

Acceptance criteria:

- It is obvious at every call site whether the caller is trusted and can mutate state.
- Untrusted player/policy code has no path to mutate state outside commands.

### Phase 8: Serialization, Replay, Hashing, And Derived State

Purpose: make reproducibility guarantees precise.

Files to touch:

- `packages/sim/src/world.ts`
- `packages/sim/src/serialize.ts`
- `packages/sim/src/sim.ts`
- `packages/sim/src/replay.ts`
- `packages/sim/src/systems/vision.ts`
- `packages/sim/src/flow.ts`
- `packages/app/src/game.ts`
- `packages/sim/test/replay.test.ts`
- New `packages/sim/test/hash.test.ts` if useful

Hashing:

- Decide on two hashes:
  - `hashStateStrict`: includes allocation state, RNG, players, teams, result, all live entity state, dead-slot generation/free stack if it can affect future behavior.
  - `hashStateGameplay` or keep current `hashState` only if a visual/live-entity hash is useful.
- Replay/desync tests should use strict hash.
- If vision is derived and not gameplay-affecting, keep it out of strict gameplay hash but test it separately.

Serialization:

- Serialize `trackVision`.
- Decide whether `serializeState` means full save-state or gameplay-only branch-state. If it is a true full state, serialize vision grids and explored memory because fog memory affects fair observations. If it is intentionally gameplay-only, rename or document it so README does not overclaim.
- If vision is omitted, deserialize should either recompute current visibility and explicitly reset explored memory, or require the caller to opt into that reset.
- Validate buffer length/version to avoid partial/corrupt buffer reads.

Replay:

- Validate `Replay.version`.
- Add `parseReplay(json)` and `validateReplay(replay)`.
- Stop recording frames after game over or append one terminal frame only.
- Decide if replay should include final hash/metadata for quick verification.

Derived state:

- `vision` WeakMap lists should rebuild correctly from vision grids after clone/restore.
- `flow` solid signature should include generation/kind/radius.
- Module-level scratch arrays are fine only because stepping is synchronous. Document that `stepWorld` is not reentrant.

Tests:

- Strict hash differs for different dead-slot allocation histories.
- Serialize/deserialize preserves or explicitly resets vision semantics.
- Bad replay JSON fails gracefully.
- Replays with wrong version are rejected.
- Finished game recording length is stable after further steps.
- Pathing solid cache invalidates for same-slot different-footprint replacement.

Risks:

- Including free stack in strict hash may make hashes more sensitive but more honest. That is desirable for desync debugging.
- Changing serialization version requires bumping `VERSION` and updating tests.

Acceptance criteria:

- Replay and serialization claims in README are exactly true under tests.
- There is no hidden state that can affect future simulation while being absent from strict replay/desync hashes.

### Phase 9: Combat Range And Spatial Semantics

Purpose: make combat and interaction distances match RTS expectations.

Files to touch:

- `packages/sim/src/systems/move.ts`
- `packages/sim/src/systems/combat.ts`
- `packages/sim/src/systems/construction.ts`
- `packages/sim/src/data.ts`
- `packages/sim/test/combat.test.ts`
- Possibly placement/pathing tests if footprint helpers are shared

Implementation details:

- Add distance helpers:
  - `centerDistanceSq(e, a, x, y)`
  - `edgeDistanceSqEntityToEntity(e, a, b)`
  - `edgeDistanceSqEntityToPoint(e, a, x, y, targetRadius)`
  - `withinEdgeRange(...)`
- Use edge-distance for weapon range.
- Consider using edge-distance for deposit/build/harvest ranges where target radius matters.
- Keep movement arrival point-based unless unit radius-aware pathing is introduced.

Tests:

- Marine can shoot a large structure when edge distance is within range even if center distance is not.
- SCV melee reaches a building edge properly.
- Unit-vs-unit range still behaves correctly.
- Combat remains deterministic.

Risks:

- Balance changes: fights may resolve faster because units can attack large targets earlier.
- Existing tests with center assumptions may need updating to express intended edge behavior.

Acceptance criteria:

- Combat range behavior matches the documented SC-like model closely enough for the vertical slice.

### Phase 9A: Terrain, Elevation, And Line-Of-Sight Semantics

Purpose: avoid treating combat range as the only spatial correctness issue. The specs already call out ramps, high ground vision, low-to-high miss chance, cliffs, and terrain readability.

Files to touch:

- `packages/sim/src/systems/vision.ts`
- `packages/sim/src/systems/combat.ts`
- `packages/sim/src/pathing.ts`
- `packages/sim/src/map.ts`
- `packages/sim/src/procedural.ts`
- `packages/app/src/gl/renderer.ts`
- `packages/app/src/render2d.ts`
- Tests in `packages/sim/test/pathing.test.ts`, `packages/sim/test/combat.test.ts`, and a new terrain/vision test if useful

Design decisions:

- Decide whether the vertical slice implements high-ground vision/miss now or explicitly defers it.
- If deferred, docs should say maps have visual elevation and ramp pathing but not full SC high-ground combat rules yet.
- Vision should eventually consider terrain/elevation and not just circular tile radius.
- Low-to-high miss chance would require deterministic RNG use in combat. That must be hashed/replayed and tested carefully.

Tests:

- Units on high ground reveal expected low-ground/nearby tiles if implemented.
- Low-to-high attacks use deterministic miss rolls if implemented.
- Ramps remain passable and cliffs remain blocked.
- Replay hashes stay deterministic with terrain combat effects.

Risks:

- Adding RNG to combat changes deterministic traces. Keep the change isolated and add replay-hash coverage.

Acceptance criteria:

- Terrain/elevation mechanics are either implemented with tests or explicitly deferred in the specs/status.

### Phase 10: UI Chrome And Mobile Layout Polish

Purpose: make the playable app match the mobile-first pillar.

Files to touch:

- `packages/app/src/ui.tsx`
- `packages/app/src/store.ts`
- `packages/app/src/game.ts`
- `packages/app/src/render2d.ts` if minimap/HUD overlap changes
- `docs/specs/ui-mobile.md`
- Playwright screenshot scripts or tests

Design:

- Top bar should hold glanceable resources and maybe game time only.
- Move meta controls into a compact menu:
  - team size
  - play/watch toggle
  - new map
  - load replay
  - save replay
- Bottom command area should be reserved for current selection/target mode commands.
- All buttons need stable dimensions and no clipping at narrow phone widths.
- Use symbols/icons where possible, with labels only when clarity requires it.

Tests:

- Screenshots at 390x844, 360x740, and a tablet-ish viewport.
- Assert no clipped `Load`, `Map`, or replay buttons.
- Placement mode and command card remain reachable with thumb.

Risks:

- Avoid turning the app into a landing-page-like UI. This is an operational game surface; dense, predictable controls are better.

Acceptance criteria:

- Phone viewport screenshots show no clipped controls and no overlap with the game-critical command area.

### Phase 10A: Ability, Spell, Research, And Upgrade Command Model

Purpose: ensure the "simple, non-ambiguous, minimal drilling" command-card architecture can grow beyond move/train/build/rally/attack-move.

Files to touch:

- `packages/sim/src/commands.ts`
- `packages/sim/src/data.ts`
- `packages/sim/src/world.ts`
- New ability/research systems only when implemented, likely `packages/sim/src/systems/abilities.ts` and `packages/sim/src/systems/research.ts`
- `packages/sim/src/systems/ingest.ts`
- `packages/app/src/ui.tsx`
- `packages/app/src/store.ts`
- `packages/app/src/game.ts`
- `docs/specs/sc1-spec.md`
- `docs/research/sc1-spells-upgrades.md`

Design:

- Add command taxonomy before adding many buttons:
  - instant ability
  - target-point ability
  - target-entity ability
  - toggled mode
  - research/upgrade
  - morph/transform
- Extend validation with energy, cooldown, tech prerequisites, target filters, range, and ownership/visibility rules.
- Add data fields for energy/max energy/energy regen only when the first caster arrives.
- Add player tech/upgrade state before research commands.
- The command card should stay capability-driven:
  - default smart tap remains simple
  - explicit target modes are armed from the card
  - grouped ability buttons can be added when command count grows
  - no hidden friendly-target smart commands unless armed

Tests:

- A placeholder or first real ability validates target type/range/energy.
- Research command validates producer, resources, prerequisites, and duplicate research.
- Mixed caster selection shows only commands that can be issued by at least one selected caster and routes to an eligible caster.

Risks:

- Building a generic spell framework too early can overfit to imaginary needs. The first implementation should support one concrete ability/research path and leave extension points obvious.

Acceptance criteria:

- Adding the first spell or upgrade does not require redesigning command validation, selection summary, or command-card layout.

### Phase 11: Game/App Decomposition

Purpose: reduce cognitive load so future commands, spells, groups, and mobile gestures do not make `Game` unmaintainable.

Files to touch:

- `packages/app/src/game.ts`
- New `packages/app/src/selection.ts`
- New `packages/app/src/humanInputController.ts`
- New `packages/app/src/commandIntents.ts`
- New `packages/app/src/hudPresenter.ts`
- Possibly new `packages/app/src/replayController.ts`

Target boundaries:

- `Game`: owns sim instance, mode, tick loop, camera, and orchestration.
- `SelectionModel`: owns selected ids, pruning, summaries, box/double-tap selection rules.
- `HumanInputController`: maps world taps/target modes/selection into command intents.
- `CommandIntentQueue`: stores commands and maybe pending command results.
- `HudPresenter`: publishes `State` + `SelectionSummary` into Preact signals.
- `ReplayController`: owns replay JSON, seek/playback speed, and replay stepping.

Migration approach:

- Move behavior without changing tests first.
- Keep public methods (`tap`, `boxSelect`, `trainSelected`, `stopSelected`, etc.) as delegating wrappers during migration.
- Only after tests pass, tighten types and remove duplicated state.

Tests:

- Existing tap semantics should pass unchanged.
- Add tests for `SelectionModel.summary`.
- Add tests for command-intent generation independent of render/camera where possible.

Risks:

- Refactor churn can obscure behavior changes. Keep slices small and avoid visual redesign in the same commit.

Acceptance criteria:

- `Game` is an orchestration class, not the place where every interaction rule lives.
- Adding a new spell/ability has an obvious path through command definition, validator, selection summary, and UI button.

### Phase 12: Renderer Decomposition And Visual State Ownership

Purpose: keep rendering fast while making it easier to modify visuals without touching one giant file.

Files to touch:

- `packages/app/src/gl/renderer.ts`
- New `packages/app/src/gl/terrain.ts`
- New `packages/app/src/gl/spritePass.ts`
- New `packages/app/src/gl/fogPass.ts`
- New `packages/app/src/gl/renderEvents.ts`
- New `packages/app/src/gl/overlayPass.ts` if useful

Target boundaries:

- Terrain baking/cache module.
- Sprite instance builder for bodies/shadows/selection/HP/rally.
- Cosmetic event detector for muzzle/explosion particles.
- Fog texture updater.
- Main renderer only coordinates passes.

Rules:

- Keep all cosmetic randomness out of sim.
- Keep renderer reads of sim state read-only.
- Renderer caches keyed by slot/generation where death/reuse matters.

Tests/validation:

- Existing screenshots still render units, fog, rally lines, and particles.
- Pixel sanity checks for nonblank WebGL scene after renderer split.

Risks:

- Over-splitting too early can make render code harder to profile. Split only along stable pass boundaries.

Acceptance criteria:

- Visual changes like "draw placement preview" or "change HP bars" do not require understanding terrain baking, particles, and fog all at once.

### Phase 13: Bot Planning Cleanup

Purpose: make scripted bots a reliable demonstrator and future imitation-data source.

Files to touch:

- `packages/ai/src/bot.ts`
- `packages/ai/src/macro.ts`
- Possibly shared sim planning helpers from Phase 1/2
- `packages/headless/test/game.test.ts`
- New AI command validity tests

Implementation details:

- Bots should reserve resources/supply locally as they emit commands.
- Bots should use shared `canPlaceStructure`.
- `findSpot` should search legal full footprints, not just approximate centers.
- Bots should consume safe/trusted state intentionally, ideally through a named unsafe API.
- Add optional debug counters for rejected bot commands once command results exist.

Tests:

- Bot emits all-acceptable macro commands for a representative state.
- Bot build spot never overlaps resources or structures.
- Full AI-vs-AI determinism remains green.

Risks:

- Stricter placement may weaken the current bot until `findSpot` improves. Fix spot search in the same slice as placement validation.

Acceptance criteria:

- Rejected bot commands are exceptional, not normal planning noise.

### Phase 13A: Throughput And Performance Gates

Purpose: keep the superhuman-AI/small-budget goal honest while adding validation, events, safer observation, and richer UI.

Files to touch:

- `packages/headless/src/demo.ts`
- `packages/headless/test/game.test.ts`
- `package.json`
- Possibly a new `packages/headless/src/bench.ts`

Design:

- Add a repeatable headless benchmark command separate from the demo.
- Track ticks/second for a fixed seed/map/player count.
- Benchmark with command results/events disabled and, optionally, enabled.
- Benchmark with vision off and vision on, because RL/network/fair-play modes need vision but headless self-play may not.
- Do not make CI brittle with strict perf thresholds at first; record baseline and alert on large regressions.

Tests/validation:

- `npm test` for correctness.
- `npm run typecheck` for type/API drift.
- App build for bundle health.
- Headless benchmark manually or as an optional CI job.

Risks:

- Premature micro-optimization can derail correctness work. Use the benchmark to detect accidental regressions, not to block simple cleanups.

Acceptance criteria:

- Major architecture changes have at least a before/after throughput note.

### Phase 14: Documentation And Spec Alignment

Purpose: make docs tell the truth about implemented behavior and future constraints.

Files to touch:

- `README.md`
- `docs/specs/architecture.md`
- `docs/specs/ui-mobile.md`
- `docs/specs/sc1-spec.md`
- `bugs.md`

Updates:

- Document command validation and rejection semantics.
- Document construction lifecycle and refund rules.
- Document selection/mixed-command-card behavior.
- Document trusted vs untrusted sim APIs.
- Document replay/hash/serialization guarantees precisely.
- Update current status/test count after implementation.

Acceptance criteria:

- README claims are test-backed.
- Architecture docs match actual public APIs.
- UI spec matches mobile behavior in tests and screenshots.

### Cross-Cutting Implementation Rules

- Keep sim deterministic: no wall-clock, DOM, random, floating hot-path logic, or host objects in `packages/sim`.
- Keep command validation in sim, not app. The app can prevalidate for UX, but sim remains authoritative.
- Prefer additive APIs first, then migrate call sites, then remove old APIs.
- Every new entity column needs spawn defaults, clone/serialize/hash coverage, and a test.
- Every user-facing interaction change needs an app-level test or screenshot verification.
- Every new public sim API needs a trust-level decision: safe observation, trusted unsafe state, or host/debug helper.
- Every new command needs validation, command-result behavior, replay coverage, and UI/action-mask implications considered.
- Keep slices small enough that `npm test` tells us what broke.

### Recommended Work Slices

1. Add failing tests for validators, placement, same-tick supply, observation mutability, and two-finger suppression.
2. Implement `validation.ts` and convert `ingest.ts` to use it.
3. Add deterministic command results for acceptance/rejection.
4. Implement explicit building footprint metadata and full-footprint placement; migrate app/bot prevalidation.
5. Add same-tick resource/supply reservations.
6. Implement build pending/foundation/cancel/refund lifecycle with an explicit resource ledger model.
7. Add placement preview and invalid-placement persistence in the app.
8. Replace pointer handling with explicit gesture state.
9. Replace lossy selection signals with `SelectionSummary` and add first-pass control groups.
10. Harden observe/public API and initial vision.
11. Harden serialization/replay/hash/derived-state invalidation, including fog-memory semantics.
12. Fix combat edge range.
13. Decide/implement/defer terrain elevation combat and vision semantics.
14. Simplify top chrome and run screenshot verification.
15. Add the command model for ability/research/upgrade extensibility before the first spell/upgrade lands.
16. Split `Game` along selection/input/HUD/replay boundaries.
17. Split renderer passes only after gameplay/UX behavior is stable.
18. Add throughput benchmark baselines.
19. Update docs and close each `bugs.md` item with test references as it is fixed.

### Definition Of Done For The Whole Remediation

- All 23 findings above are either fixed, explicitly deferred with rationale, or superseded by a better design.
- `npm test`, `npm run typecheck`, and app build pass.
- Mobile screenshots pass at phone widths with no clipped controls.
- `bugs.md` has status updates per item, including the test or commit that closed it.
- The sim exposes a clear trusted/debug API and a clear player/policy API.
- Command validation is centralized and reused by app UX, bots, and future action masks.
- Construction, cancellation, production, replay, observation, and hash behavior are all covered by targeted tests.
- Building footprint semantics are explicit data, not inferred from sprite radius.
- Control groups, ability/research command growth, and fog-memory snapshot semantics are either implemented or explicitly deferred with docs and tests around the current behavior.
