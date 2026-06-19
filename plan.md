# SC:BW Spec Completion Plan

This is the active execution plan for turning the current playable RTS slice into a fuller
StarCraft: Brood War-style ruleset while preserving the project's core constraints:
deterministic TypeScript sim, fixed-point integer state, typed-array hot loops, replayable command
streams, mobile-first and desktop-faithful UX, and high headless throughput for AI/RL training.

Historical implementation notes and completed phase detail live in
`docs/archived-plans/scbw-spec-completion-plan-2026-06-19.md`.

## Current Baseline

- Three-race unit/building data exists for most Terran, Protoss, and Zerg roster entries.
- Core economy, construction, production queues, harvesting, movement, collision, fog, replay,
  serialization, deterministic hashing, combat, and scripted AI exist.
- A generic ability framework exists for many major spells, including Stim, EMP, Storm, Matrix,
  Irradiate, Lockdown, Yamato, Feedback, Stasis, Maelstrom, Disruption Web, Spawn Broodling,
  Ensnare, Plague, Consume, Dark Swarm, active cloak, Scanner Sweep, Arbiter cloak aura, and
  related command-card exposure.
- The main remaining gaps are shared-system gaps: representation ownership, command/ability
  descriptors, exact BW timing/spatial fidelity, pathing polish, and UI/AI/RL parity.
- `tmp/` is ignored reference material. It may inform behavior, but reference packages should not
  be committed or imported by production code.

## Execution Rules

- Keep mechanics data-driven first. Add systems only when data cannot express the rule.
- Preserve deterministic replay/hash behavior. Any gameplay-affecting state must be cloned,
  serialized, and hashed.
- Avoid app-only command logic. UI, AI, replay, network, and future RL masks must share command
  validation semantics.
- Keep hot-loop work proportional to local activity. Combat, movement, visibility, and training
  observations must stay grid- or typed-array-friendly.
- Each feature slice ends with focused tests, `npm run typecheck`, `git diff --check`, `npm test`,
  relevant benchmarks, and `npm run build:app` for app-facing slices.
- Commit each clean slice, then continue from this roadmap inline. HEAVY NOTE: do not use a
  subagent for roadmap validation unless the user explicitly asks for outside/adversarial review.
  The subagent validator loop is too slow for normal continuation and usually agrees with the
  obvious next step; make the continuation call directly from the roadmap, tests, and code state.
- Keep `README.md` current as the durable product/architecture summary whenever controls,
  validation semantics, supported mechanics, setup, or major engine constraints change.

## Active Roadmap

### Architecture Compression Guardrails

External rewrite proposals should be treated as idea sources, not direction changes. The useful
thesis is: finish descriptor paths that already exist, then delete the redundant bespoke branch after
tests prove equivalence. The unsafe thesis is: build a parallel `world2` kernel, chase an arbitrary
LOC reduction, or collapse deliberately separated systems before their edge cases are represented.

Keep these constraints:

- Prefer in-place strangler slices behind the existing `Sim` facade. Do not fork a second engine
  unless a tiny prototype proves a specific replacement and can be deleted quickly.
- Do not chase a numeric LOC target. Readability, replay determinism, AI/RL parity, and performance
  matter more than compression.
- Descriptorize abilities, weapon mechanics, upgrades, status effects, production, and command
  queries only where the descriptor makes call sites simpler and removes a real duplicated rule.
- Keep RL/action-mask and app command surfaces as thin shared-query clients, but do not remove their
  caller-owned buffers, parity tests, or performance seams.
- Do not delete pathing scaffolding such as clearance, local avoidance, settle, targeted movement,
  worker phasing, or firing anchors without benchmark counters and behavior tests proving the
  replacement preserves the player-visible movement contract.
- Use the code-simplifier pass on touched files before validation so each slice reduces cognitive
  load rather than adding another clever layer.

### Source Layout Direction

The sim source should move from a flat file collection toward concept folders, but only in small
mechanical slices that do not mix behavior changes with broad import churn. Keep temporary barrel
files where useful so public imports and app/AI/RL callers remain stable during migration.

Target layout:

- `data/`: immutable BW definitions and descriptor tables:
  - `core.ts`, `units.ts`, `weapons.ts`, `abilities.ts`, `tech.ts`, `index.ts`.
- `entity/`: dense entity storage and entity-local helpers:
  - `world.ts` or `store.ts`, `factory.ts`, `lifecycle.ts`, `kind.ts`, `state.ts`,
    `approach.ts`, `work-queue.ts`.
- `commands/`: command types, ingestion, validation, intent, specs, and family validators:
  - `types.ts`, `validate.ts`, `intent.ts`, `specs.ts`, `move.ts`, `attack.ts`, `ability.ts`,
    `build.ts`, `production.ts`, `rally.ts`, `cargo.ts`, `repair.ts`, `harvest.ts`,
    `transform.ts`.
- `systems/`: tick-time systems only, not command validation:
  - `movement/`, `combat/`, `economy/`, `production/`, `abilities/`, `visibility/`,
    `cargo/`, `construction/`, `victory.ts`.
- `spatial/`: fixed-point geometry, footprints, grids, pathing, flow fields, local avoidance,
  movement slots, anchors, terrain, and map diagnostics.
- `mechanics/`: cross-system mechanic helpers that are not tick systems themselves:
  - `damage.ts`, `weapons.ts`, `upgrades.ts`, `requirements.ts`, `placement.ts`, `power.ts`,
    `creep.ts`, `addons.ts`, `transforms.ts`, `internal-products.ts`.
- `io/`: deterministic boundaries:
  - `serialize.ts`, `hash.ts`, `replay.ts`, `observe.ts`, `action-mask.ts`.
- `map/`: map definitions, procedural generation, resource placement, calibration, diagnostics,
  and setup presets.
- `render/`: sim-owned render descriptors and math-renderer geometry contracts, not app canvas
  orchestration.

Migration rules:

- Move one concept folder at a time, preferably immediately after touching that concept for a real
  cleanup.
- Keep behavior changes and pure import moves in separate commits unless the move is tiny.
- Treat compatibility shims as temporary migration scaffolding. Once a folder's callers have been
  migrated to the new stable path, delete the old root shim in the same cleanup track.
- Heavy note: eliminate all compatibility shims eventually. A folder migration is only architecturally
  complete once the shim is deleted, imports point at the real owner, and the stable public barrels are
  intentional API rather than old-path preservation.
- Preserve typed-array hot loops and caller-owned buffers; folder cleanup must not introduce object
  allocation on per-tick paths.
- Prefer `index.ts` barrels only at stable folder boundaries. Avoid deep barrel chains that hide
  dependencies or create cycles.
- Use dependency direction as the sanity check: `data` has no sim imports; `entity` knows storage;
  `commands` validates intent; `systems` mutates per tick; `io` observes/serializes; app/AI/RL
  depend on exported facades rather than private system internals.

### 1. Finish Architecture Compression

Purpose: keep each gameplay concept owned in one place so UI, AI, replay, tests, and RL masks do
not rediscover slightly different rules.

Remaining work:

- Split command ingestion by command family without changing replay semantics.
- Add first-class queued-order representation for desktop Shift and mobile queue mode: explicit
  append-vs-replace rules, deterministic per-entity order queues, replay serialization, command
  cancellation/overwrite behavior, and action-mask exposure. Production queues stay the specialized
  producer version of the same idea, not a separate UI-only concept.
- Split production into named sub-systems for queueing, internal products, larva spawn, spawn rally,
  gather rally, load rally, refunds, and completion placement.
- Route Spider Mines, Scarabs, Interceptors, and Nuclear Missiles through named internal-product
  helpers so `specialAmmo` does not become a hidden multi-purpose protocol.
- Add architecture guard tests for command option discovery, action masks, replay ingestion, and
  UI command-card parity.

Done when:

- `validateCommand` remains the public legality gate, but command-family internals are small enough
  to review independently.
- The app, AI, and RL masks consume shared command/selection capability queries instead of
  reimplementing legality or visibility rules.
- A teammate can answer what an entity is, what it can do, and what it is doing from one helper or
  table chain.

### 2. Normalize Weapons, Abilities, And Effects

Purpose: true BW quirks should be named mechanics with one owner, not scattered `Kind.X` branches.

Remaining work:

- Introduce weapon delivery and on-hit mechanic ids for:
  - Reaver Scarabs;
  - Carrier Interceptors;
  - Bunker contained fire;
  - Lurker line splash;
  - Mutalisk bounce;
  - Devourer acid spores;
  - suicide attackers;
  - future splash/projectile variants.
- Introduce ability execution descriptors:
  - `instant`;
  - `status`;
  - `persistentArea`;
  - `channel`;
  - `windup`;
  - `projectile`.
- Attach AI policy descriptors to abilities so casting logic, target filters, range checks, energy
  thresholds, and tech gates do not live only in a long AI chain.
- Add effect presentation descriptors for Scanner Sweep, Nuclear Strike, Storm, Swarm, Web,
  Plague/Irradiate overlays, detection affordances, and future persistent spell fields.
- Table-drive upgrade effects where clearer than switches, especially range, speed, energy, armor,
  shield, and weapon-specific bonus cases.

Done when:

- Adding a spell or weapon quirk requires editing data/descriptors plus focused tests, not five
  unrelated systems.
- UI, AI, validation, and rendering agree on ability target mode, range shape, required tech,
  energy, duration, caster lock, and presentation.

### 3. Complete BW-Fidelity Mechanics

Purpose: close the remaining gameplay gaps that materially affect player expectation, AI behavior,
or replay correctness.

Remaining work:

- Replace instant siege/unsiege and burrow/unburrow with verified timed transitions and shared
  busy-state validation.
- Add missing core order semantics: Patrol, Hold Position, queued waypoints, and clear interruption
  rules for Stop, attack, transport, spell, gather, repair, rally-spawned orders, and queued orders.
- Audit Yamato and Nuclear Strike as highest-risk timing/presentation examples.
- Audit ability target geometry. Combat, repair, harvest, and scarab reach use top-down edge
  metrics, but spell validation still needs explicit per-ability geometry decisions.
- Polish projectile/travel behavior for missiles, Valkyrie volleys, and nuke presentation.
- Revisit Carrier Interceptor attack-pass cadence if tests or play show visible drift from BW feel.
- Audit remaining weapon-specific or multi-hit upgrade exceptions against the BW references.
- Expand procedural maps beyond the ground-connected presets with later island variants once
  disconnected-ground validity and AI semantics are explicit.

Done when:

- Timed transitions, spell casts, projectiles, upgrades, and generated maps have focused behavior
  tests plus deterministic replay/hash coverage where gameplay state changes.

### 4. Finish Pathing Refinement

Purpose: keep RTS movement smooth while preserving deterministic fixed-point, typed-array,
BW-specific pathing.

Remaining work:

- Continue evaluating the fixed-point reciprocal-avoidance prototype against benchmark counters.
- Replace more of the old candidate scorer only if tests and collision-pressure metrics prove the
  new layer is better.
- Keep the movement architecture layered and documented:
  - route / flow;
  - preferred velocity;
  - reciprocal local constraints;
  - candidate fallback;
  - persisted-velocity integration;
  - collision cleanup;
  - settle.
- Add or extend benchmark gates for collision nudges, max overlap, active movement orders, settled
  count, distinct positions, and throughput.
- Keep resource-route worker phasing narrow: same-team workers on active mineral or gas
  harvest/return routes phase with each other, but not with enemies, combat units, buildings,
  ordinary movers, builders, repairers, scouts, or resources.

Done when:

- Movement remains deterministic, benchmark throughput stays healthy, and collision-pressure
  counters improve or stay flat in deathball/choke/resource-route scenarios.

### 5. Strengthen AI/RL Surfaces

Purpose: make the game a clean training substrate, not just a playable browser app.

Remaining work:

- Keep validator/action-mask parity for every command family and ability target mode.
- Expose active and queued orders, production queues, and queue-append legality in observations and
  action masks so policies can reason about future intent without depending on app-only state.
- Finish race macro paths with validator-backed build, research, upgrade, and spell choices.
- Add ML benchmark lanes for:
  - action masks;
  - object observations;
  - buffer observations;
  - bot command generation;
  - N-env batch stepping.
- Add event-stream benchmark coverage if a public gameplay event stream grows.
- Keep step results caller-owned or immutable so batch training cannot corrupt state between envs.

Done when:

- Headless AI and RL code can enumerate legal actions, observe compact state, and step batches
  without depending on app/UI behavior or allocation-heavy object churn.

### 6. Finish UI, Controls, And Rendering Polish

Purpose: expose the complete ruleset efficiently on mobile and faithfully on desktop without
letting app presentation become a second gameplay engine.

Remaining work:

- Add explicit subgroup handling for large mixed selections.
- Add a command-surface coverage audit proving every player-available sim action is exposed through
  shared selection options and then rendered by the command card. Worker-built expansion town halls
  are the first fixed example: SCV -> Command Center, Probe -> Nexus, Drone -> Hatchery.
- Keep desktop control fidelity: right-click smart commands, `A` plus left-click attack mode,
  hotgroups, remappable hotkeys, edge pan, scroll zoom, middle-click pan, and shift-queued commands
  with visible queued waypoints/orders.
- Keep mobile control grammar simple: normal tap selects, armed command consumes the next tap, and
  command cards stay compact enough not to cover play.
- Continue moving desktop HUD toward the StarCraft layout: minimap left, selected state center,
  hotkey-labeled commands right.
- Keep top and bottom panels separate from the playfield. They reserve layout space and must never
  occlude world rendering, selection boxes, placement ghosts, minimap interaction, edge pan, or
  game-space UI.
- Add app-side spell field, last-known, and fog affordances once effect descriptors exist.
- Keep Math renderer as the exact footprint/body/power/creep reference renderer.
- Audit the full spatial affordance contract for melee, harvest, repair, weapon range, ability
  range, body bounds, visible art, selection bases, and Math renderer overlays. The player should
  never see a unit appear to mine, repair, melee, or shoot from a distance that contradicts the
  visible bodies/range affordances. Math mode is the canonical test oracle here: its hulls and grid
  must match the same interaction rectangles used by combat, entity-target spells, repair, harvest,
  cargo, scarabs, selection, and placement. Mineral harvesting exposed the first symptom: gameplay
  contact used a wider body than the visible crystal art, making workers look too far away on the X
  axis. Treat this as a systemic geometry/presentation audit, not a mineral-only asset fix; remaining
  follow-up should focus on point-area ability radius semantics and any art that visibly disagrees
  with its canonical Math hull.
- Add richer construction, warp-in, repair, and sound cues after the refreshed asset pass.
- Maintain sprite footprint/art placement checks for every imported asset refresh.
- Split `Game` selection, input, HUD, replay, and renderer coordination once command-card growth
  stabilizes.

Done when:

- Every sim command needed to build, upgrade, cast, load/unload, transform, rally, and fight is
  reachable through shared command options, and the UI never needs private legality rules.

## Recently Completed Consolidation Slices

- Extracted cargo command validation.
- Extracted rally command validation.
- Extracted train command validation.
- Extracted research command validation.
- Extracted cancel-build command validation.
- Extracted harvest command validation.
- Extracted repair command validation.
- Moved build command validation into the build module.
- Extracted add-on command validation.
- Extracted Spider Mine command validation.
- Added orientation-aware resource arcs and a side-facing `cornerBases` procedural preset.
- Added a replay-visible `isolatedMains` procedural preset with ground-connected high-ground pockets.
- Added a replay-visible `fortress` procedural preset with validated high-ground expansion pockets.
- Extracted targeted attack command validation.
- Extracted burrow / unburrow command validation.
- Extracted stop command validation.
- Extracted lift / land command validation.
- Extracted move / attack-move command validation.
- Extracted transform / morph / merge command validation.
- Began shared command validation predicates with common actor ownership / stale entity helpers.
- Finished command actor ownership / stale entity gate migration.
- Extracted shared producer preflight for train, research, and add-on validation.
- Extracted shared validation-time affordability checks.
- Began shared direct-order preflight with `canReceiveOrder` for move and attack validation.
- Extended `canReceiveOrder` to ability caster validation while keeping ability-specific gates local.
- Extended `canReceiveOrder` to transform validation while keeping transform, morph, and merge rules local.
- Extended `canReceiveOrder` to harvest, repair, and mine validation while keeping utility-specific rules local.
- Extracted narrow `canTargetEntity` target gates for attack and entity-target ability validation.
- Extracted narrow busy-state predicates for active production, research, and add-on targets.
- Extracted a narrow `isTransitioning` state predicate for unfinished construction, morph, and merge phases.
- Recorded the target sim source folder structure and migration rules for data, entity, commands,
  systems, spatial, mechanics, IO, map, and render ownership.
- Moved Consume and Restoration through ability execution descriptors instead of bespoke cast switch
  branches.
- Moved immutable data definitions under `src/data/` while keeping old root data exports as
  compatibility shims.
- Moved entity helper modules under `src/entity/` while keeping old root entity exports as
  compatibility shims.
- Migrated sim/test callers to `src/entity/*` and deleted the temporary root entity shims.
- Deleted unused legacy `data-*` root shims after confirming callers use `src/data/` or the stable
  `data.ts` barrel.
- Moved the entity store and data-aware entity factory under `src/entity/` while keeping root
  `world.ts` and `factory.ts` as temporary compatibility shims.
- Migrated callers to `src/entity/world.ts` and `src/entity/factory.ts`, then deleted the temporary
  root `world.ts` and `factory.ts` shims.

## Review Checklist

Before calling a roadmap slice done:

- Does the new code preserve deterministic replay/hash behavior?
- Is the gameplay concept represented once, with shared queries for UI/AI/RL?
- Are hot loops still typed-array/grid/scratch based?
- Did tests cover the behavior rather than an implementation accident?
- Did benchmarks show no unacceptable throughput regression?
- Did the slice reduce cognitive load, or did it add another place a teammate must remember?
