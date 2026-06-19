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
- HEAVY NOTE: eliminate all compatibility shims eventually. Shims are temporary migration
  scaffolding, not architecture. A slice that leaves a shim must name the remaining caller or
  deletion condition in this roadmap so the project does not normalize old paths forever; never
  mark a folder migration complete while an old-path shim still exists for that concept.

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
  intentional API rather than old-path preservation. No shim should be counted as finished
  architecture; it is a named cleanup debt with an owner and an expiry.
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

- Add first-class queued-order representation for desktop Shift and mobile queue mode: explicit
  append-vs-replace rules, deterministic per-entity order queues, replay serialization, command
  cancellation/overwrite behavior, and action-mask exposure. Production queues stay the specialized
  producer version of the same idea, not a separate UI-only concept.
  - First kernel slice is done for move / attack-move / follow travel: queued travel lives in
    typed-array entity columns, participates in clone/serialize/hash, replays through the `queue`
    command flag, dispatches after current travel settles, and clears on replacement or hard unit
    state transitions.
  - AI/RL visibility slice is done for queued travel: object observations and caller-owned
    observation buffers expose own queued travel orders, encoded actions preserve the `queue` flag
    for move / attack-move, and command masks can ask the shared validator for append-vs-replace
    legality.
  - Desktop Shift slice is done for queued travel: Shift-right-click smart move/follow and
    Shift-armed attack-move point commands set the shared `queue` flag after validator-backed
    command-intent checks, while enemy attacks and other non-travel smart commands keep their
    current immediate semantics.
  - Queued waypoint rendering slice is done for queued travel: selected units expose sim-owned
    queued travel waypoint descriptors, and the shared overlay draws move/follow and attack-move
    paths in both WebGL and Math/fallback rendering.
  - Mobile queue-mode slice is done for queued travel: the compact mobile toggle feeds the same
    validator-backed command-intent option as desktop Shift, appends move / follow and attack-move
    point travel, and leaves attack / harvest / repair / load / spells immediate until those command
    families gain first-class queued interruption semantics. Remaining queue work: extend append
    semantics to the other command families with explicit interruption tests.
  - Immediate interruption slice is done: direct spell, worker-build, spider-mine, load, and unload
    commands now discard stale future queued travel for their actor through command-owned helpers,
    matching the existing attack / harvest / repair / stop / transform replacement behavior while
    leaving true Shift-queued non-travel commands as later first-class work.
- Add architecture guard tests for command option discovery, action masks, replay ingestion, and
  UI command-card parity.
  - Command surface guard slice is done: the runtime `COMMAND_TYPES` registry is typechecked
    against the `Command` union, tests compare it to the command spec registry and action-mask
    heads, replay ingestion accepts a fixture covering every command type, action encoding
    round-trips every command type, and the app command card has a static guard proving every
    shared selection option group flows through `executeOption`.
- Eliminate every remaining compatibility shim as folder migrations complete. Shims are allowed only
  as short-lived strangler scaffolding; each migration slice should either delete the old-path shim or
  leave a named follow-up that explains which callers still depend on it.

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
  - On-hit/post-fire routing-map slice is done: Lurker line splash, Mutalisk bounce, Devourer
    acid spores, and suicide attackers now dispatch through mechanic-id applicator maps in combat
    instead of a local switch ladder. Remaining work: consider whether delivery modes
    (scarab launch, interceptor launch, contained fire) can share an equally small dispatch shape
    without hiding their timing and target-acquisition differences.
  - Carrier interceptor descriptor-narrowing slice is done: the complete interceptor launch shape
    is validated by `mechanics/weapons.ts`, and combat reads launch range/cooldown from the
    narrowed descriptor it already owns instead of reaching through carrier-specific wrapper
    helpers. Remaining work: apply the same pattern only where it removes duplicate shape checks
    or makes delivery timing visibly easier to audit.
- Introduce ability execution descriptors:
  - `instant`;
  - `status`;
  - `persistentArea`;
  - `pointChannelArea`;
  - `targetSpawn`;
  - `targetConvert`;
  - `targetTransform`;
  - `pointRecall`;
  - `channel`;
  - `windup`;
  - `projectile`.
  - Interpreter routing-map slice is done: status timers, area status timers, target markers,
    target restore pools, and target buffers now resolve through small descriptor routing maps in
    the ability interpreter instead of local switch ladders, so adding a descriptor variant names
    its state column or applicator in one table.
  - Shared caster-channel setup slice is done: target channels and point-channel effects now enter
    `Order.Cast` through one helper that owns target, intent, combat-target, cast-ability, and timer
    fields. Remaining work: add new channel/windup/projectile modes only when a concrete BW ability
    or weapon needs them, then route completion through descriptor-specific finish handlers.
- Attach AI policy descriptors to abilities so casting logic, target filters, range checks, energy
  thresholds, and tech gates do not live only in a long AI chain.
  - First AI policy ownership slice is done: tactical spell policy descriptors and scoring helpers
    now live in `packages/ai/src/ability-policies.ts`, are exported through the AI barrel, and have a
    guard test tying policy target shape to sim ability target modes. Remaining work: progressively
    name reusable scorer/candidate patterns where that reduces duplication without hiding tactical
    intent in opaque callbacks.
  - Tactical policy row-constructor slice is done: entity-target and point-target policy rows now
    use tiny constructors that make target shape, ability id, threshold, scorer, and optional cast
    gate explicit without repeating object boilerplate or changing priority order.
- Add effect presentation descriptors for Scanner Sweep, Nuclear Strike, Storm, Swarm, Web,
  Plague/Irradiate overlays, detection affordances, and future persistent spell fields.
  - First effect-presentation slice is done: Scanner Sweep and Nuclear Strike affordance visibility
    now comes from sim-owned `EffectPresentationDefs`, preserving the existing scan visible-tile and
    nuke explored-tile policies while giving later Storm/Swarm/Web overlays a single descriptor home.
  - Persistent spell-field slice is done: Psionic Storm, Dark Swarm, and Disruption Web now expose
    descriptor-backed field affordances with sim-owned visibility and color policy, and both the
    Canvas2D math renderer and WebGL renderer consume those descriptors.
  - Entity status presentation slice is done: Burrowed, Cloaked, Detected, Irradiated, and Plagued
    selection labels now come from sim-owned `EntityStatusPresentationDefs`, keeping timer labels
    and detection visibility semantics out of the app selection panel.
- Table-drive upgrade effects where clearer than switches, especially range, speed, energy, armor,
  shield, and weapon-specific bonus cases.
  - First upgrade-effect table slice is done: range, speed, cooldown, sight, and caster-energy-cap
    upgrades now run through local descriptor tables in `mechanics/upgrades.ts`, with focused tests
    covering every table entry and the Goliath air-weapon-only range exception. Remaining work:
    consider weapon and armor race/category bonuses separately, since those still encode broader
    faction rules rather than simple per-kind scalar upgrades.
  - Weapon/armor category slice is done: unit combat upgrades now use explicit BW unit-group
    descriptor tables instead of broad race/air/ground role inference, preventing worker weapon
    upgrades and structure/static-defense weapon or armor upgrade leakage while preserving Protoss
    shield upgrades on buildings and adding Chitinous Plating as an Ultralisk armor bonus.

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
  - Shared mode-transition slice is done: siege/unsiege and burrow/unburrow now enter a serialized,
    hashed, lifecycle-visible busy state, reject other commands through common validation while
    transitioning, and complete deterministically through one tick system.
  - Remaining: source exact BW frame counts for each transition from stronger references than the
    currently available local BWAPI command/order names, then update the named timing constants and
    timing tests if needed.
- Add missing core order semantics: queued waypoints, and clear interruption
  rules for Stop, attack, transport, spell, gather, repair, rally-spawned orders, and queued orders.
  - Hold Position slice is done: `hold` is a first-class command, replay/action-mask encoded, exposed
    through shared selection options and desktop hotkeys, and combat fires at in-range enemies without
    pathing toward out-of-range targets.
  - Patrol slice is done: `patrol` is a first-class point command, replay/action-mask encoded, exposed
    through shared selection options and desktop/mobile armed command flow, stores its return endpoint
    in deterministic entity columns, and uses the normal movement/combat pipeline to alternate legs
    while engaging enemies encountered en route.
- Audit Yamato and Nuclear Strike as highest-risk timing/presentation examples.
  - Nuclear Strike launch descriptor slice is done: the Ghost now spawns the delayed point effect,
    consumes a ready nuke, and enters caster-channel state through a data-backed
    `point-channel-effect` execution path instead of a bespoke cast switch branch.
  - Yamato target-channel slice is done: Yamato now enters through a generic
    `target-channel-damage` execution descriptor, active caster channels store their ability id in
    deterministic entity state/observations/lifecycle, and zero duration preserves the currently
    sourced instant gameplay behavior until exact Brood War windup frames are sourced.
  - Caster-channel action-lock slice is done: resolved target and point channels keep their
    `castAbility` marker through the combat phase, so a unit cannot resolve a spell and also fire a
    normal weapon in the same tick; Nuclear Strike now mirrors its remaining channel timer onto the
    caster state for lifecycle, observation, and debugging.
  - Remaining: source exact Yamato windup/interruption frames from stronger references than the
    currently available local BWAPI order/weapon/range/damage data, then update the descriptor
    duration and timing tests without adding a Yamato-only execution branch.
- Audit ability target geometry. Combat, repair, harvest, and scarab reach use top-down edge
  metrics, but spell validation still needs explicit per-ability geometry decisions.
  - Point-target range slice is done: point abilities now measure target reach from the caster's
    top-down interaction hull to the target point, while entity-target abilities continue using
    entity-to-entity top-down edge distance.
  - Point-area radius slice is done: shared effect/area membership now measures the target
    entity's top-down interaction hull against the spell/effect radius, covering persistent areas
    and descriptor-driven area statuses through one helper.
  - Radial falloff slice is done: weapon splash and Nuclear Strike damage bands now measure the
    target entity's top-down interaction hull against the impact point, sharing one falloff helper
    instead of center-distance branches.
  - Spider Mine wake range slice is done: burrowed mines acquire ground targets by top-down
    entity-to-entity hull distance, with a regression proving body-edge wakeup when the target
    center remains outside the trigger circle.
  - Mutalisk bounce selection slice is done: bounce chaining now picks nearby enemies by top-down
    entity hull distance, with a large-body regression covering targets whose centers are outside
    bounce range.
  - Lurker line-width slice is done: spine splash now measures the target entity's top-down
    interaction rectangle against the line segment from lurker to target, with a regression proving
    body-edge hits when the target center is outside the old one-tile line check.
  - Ability and weapon geometry audit slice is complete for point target reach, point-area
    membership, radial falloff, Spider Mine wake range, Mutalisk bounce selection, and Lurker line
    width. Future geometry work should come from newly discovered mechanics, not the old
    center-distance audit list.
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
  - Active order observation slice is done: object observations and caller-owned entity buffers now
    expose own command target, intent target, combat target, destination point, and Patrol return
    endpoint, while visible enemy rows keep those intent fields hidden to avoid leaking future plans.
  - Mode-transition observation slice is done: object and caller-owned status observations expose
    own mode-transition type, target kind/state, remaining timer, and total timer; enemy status rows
    still do not leak, and the status buffer schema now includes the full cloak timer/aura fields.
- Finish race macro paths with validator-backed build, research, upgrade, and spell choices.
- Add ML benchmark lanes for:
  - action masks;
  - object observations;
  - buffer observations;
  - bot command generation;
  - N-env batch stepping.
  - ML benchmark lane slice is done: the headless benchmark and its stable-output test now cover
    action-mask generation, object observations, caller-owned buffer observations, bot command
    generation, and four-env sequential batch stepping.
- Add event-stream benchmark coverage if a public gameplay event stream grows.
- Keep step results caller-owned or immutable so batch training cannot corrupt state between envs.
  - Step result ownership slice is done: `Sim.step()` returns the raw caller-owned result array from
    the tick, while `sim.lastCommandResults` stores an immutable per-tick snapshot so external
    trainers, app code, or tests cannot mutate the retained command receipt.

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
  - Move command-card slice is done: mobile and desktop command cards expose first-class Move for
    mobile units, `M` arms Move/follow mode in desktop hotkeys, and armed Move taps use shared
    move validation for point movement, friendly follow targets, and queued travel.
  - Order render guard slice is done: the command-card test now parses `OrderOptionId` and proves
    every shared order id is rendered through `addOrderButton`, which caught the missing visible
    Move button after the selection/hotkey path already existed.
  - Command-union surface audit is done: an app test keys off `COMMAND_TYPES` and verifies every sim
    command type has a player-facing selection, command-card, armed-command, or smart-tap path.
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
- Moved command types, public validation, command intent, command specs, family validators, and
  command ingestion under `src/commands/` with no root compatibility shims.
- Moved direct unit-order apply logic for attack, harvest, repair, move/attack-move, and stop next
  to their command-family validators, leaving `commands/specs.ts` as shared dispatch/context glue.
- Moved simple apply logic for add-ons, cancel-build, burrow, build, cargo, Terran lift/land,
  spider mines, research, and transforms into their command-family modules; `commands/specs.ts`
  now mainly retains shared dispatch plus rally/train context handling.
- Moved rally and train apply logic into their command-family modules, leaving `commands/specs.ts`
  as the command registry plus the remaining shared move-destination and supply-reservation context.
- Moved the production tick system to `systems/production/index.ts` as a no-behavior staging step
  for later larva, completion placement, spawn-rally, and internal-product extraction.
- Extracted larva ticking into `systems/production/larva.ts` so the production orchestrator no
  longer owns hatchery timer constants and spawn offsets.
- Extracted produced-unit rally handling and deterministic rally move slot assignment into
  `systems/production/rally.ts`, keeping load, gather, travel, and slot grouping policy together.
- Extracted internal-product production completion into `systems/production/internal-products.ts`.
- Extracted shared production queue advancement and normal/egg product completion placement into
  `systems/production/queue.ts` and `systems/production/completion.ts`.
- Moved build refund ledger math and build/foundation cancellation ownership into
  `mechanics/refund-ledger.ts` and `mechanics/build-cancel.ts`, deleting the old root helper.
- Moved internal-product descriptors and `specialAmmo` mutation helpers under
  `mechanics/internal-products.ts`, migrated production callers to the real owner path, and removed
  the old root helper instead of leaving a compatibility shim.
- Added producer-selected batch reservations for Nuclear Strike so multi-action decoding cannot
  overbook one ready missile while still accepting separate ready Nuclear Silos deterministically.
- Moved Nuclear Strike silo lookup and missile consumption helpers under `mechanics/nuke.ts`,
  deleting the old root helper path while preserving the stable package export.
- Moved weapon mechanic descriptors and ammo helpers under `mechanics/weapons.ts`, deleting the old
  root `weapon-mechanics.ts` helper while preserving the stable package export.
- Moved tech/build prerequisite helpers under `mechanics/requirements.ts`, deleting the old root
  `requirements.ts` helper while preserving the stable package export.
- Moved Zerg creep coverage and placement helpers under `mechanics/creep.ts`, deleting the old root
  `creep.ts` helper while preserving the stable package export.
- Moved Protoss power coverage and producer gating helpers under `mechanics/power.ts`, deleting the
  old root `power.ts` helper while preserving the stable package export.
- Moved Terran add-on parent linkage, placement, and start helpers under `mechanics/addons.ts`,
  deleting the old root `addon.ts` helper while preserving the stable package export.
- Moved shared weapon, spell, plague, matrix, and nuke damage application under
  `mechanics/damage.ts`, deleting the old root `damage.ts` helper.
- Moved transform, morph, and merge descriptors plus application helpers under
  `mechanics/transforms.ts`, deleting the old root `unit-transform.ts` helper while preserving the
  stable package export.
- Moved structure placement validation and resource-depot exclusion geometry under
  `mechanics/placement.ts`, deleting the old root `placement.ts` helper while preserving the public
  `commands/validate.ts` preflight facade.
- Moved upgrade-derived weapon, armor, range, speed, cooldown, sight, energy, and internal-ammo
  helpers under `mechanics/upgrades.ts`, deleting the old root `derived.ts` helper while preserving
  the stable package export.
- Moved deterministic FNV hashing under `io/hash.ts`, deleting the old root `hash.ts` helper while
  preserving the stable package export.
- Moved byte state snapshot serialization under `io/serialize.ts`, deleting the old root
  `serialize.ts` helper while preserving the stable package export.
- Moved replay parsing, validation, map reconstruction, and deterministic replay playback under
  `io/replay.ts`, deleting the old root `replay.ts` helper while preserving the stable package
  export.
- Moved validator-backed action mask encoding and batch decode helpers under `io/action-mask.ts`,
  deleting the old root `action-mask.ts` helper while preserving the stable package export.
- Moved fair-play object and caller-owned buffer observations under `io/observe.ts`, deleting the old
  root `observe.ts` helper while preserving the stable package export and `Sim.observe` facade.
- Moved build-tile footprint snapping and overlap helpers under `spatial/footprint.ts`, deleting the
  old root `footprint.ts` helper while preserving the stable package export.
- Moved top-down geometry, BW body bounds, and range/docking helpers under `spatial/geometry.ts`,
  deleting the old root `spatial.ts` helper while preserving the stable package export.
- Moved the typed-array target-acquisition bucket grid under `spatial/grid.ts`, deleting the old root
  `grid.ts` helper.
- Moved flow-field path passability, clearance, and shared route-field caching under
  `spatial/flow.ts`, deleting the old root `flow.ts` helper.
- Moved deterministic local-avoidance steering and its per-tick spatial index under
  `spatial/local-avoidance.ts`, deleting the old root helper instead of leaving a shim.
- Moved deterministic group movement slot spacing and offsets under `spatial/movement-slots.ts`,
  deleting the old root helper instead of leaving a shim.
- Moved firing-unit pathing anchor detection under `spatial/pathing-anchor.ts`, deleting the old
  root helper instead of leaving a shim.
- Moved worker mineral/gas route collision phasing under `spatial/worker-collision.ts`, deleting
  the old root helper instead of leaving a shim.
- Moved elevation and low-ground/high-ground visibility/combat helpers under `spatial/terrain.ts`,
  deleting the old root helper instead of leaving a shim.
- Moved fixed-point motion primitives (`clearVelocity`, facing, direct movement, acceleration, and
  radius checks) under `spatial/motion.ts`, deleting the old `systems/move.ts` helper so pathing no
  longer depends on a tick-system module.
- Moved shared navigation, route-distance, and tile-coordinate helpers under `spatial/pathing.ts`,
  deleting the old root `pathing.ts` helper while preserving the stable package export.
- Moved the static map definition, base-cluster solver, resource-footprint math, and `sliceMap`
  under `map/core.ts`, deleting the old root `map.ts` helper while preserving the stable package
  export.
- Moved harvest route timing and route-quality calibration under `map/harvest-calibration.ts`,
  deleting the old root helper while preserving the stable package export.
- Moved map diagnostics overlays under `map/diagnostics.ts` so debug geometry sits beside the map
  and harvest-calibration math it validates.
- Moved deterministic procedural map generation under `map/procedural.ts`, keeping the stable package
  export while removing another root-level map concern.
- Moved match setup under `map/setup.ts`, since it is the map-to-initial-state bridge rather than
  a runtime system.
- Moved shared resource/gather-target legality under `mechanics/resources.ts`, giving harvest,
  rally, command validation, worker phasing, and production rally one resource-rule owner.
- Moved shared travel-order issuance under `commands/travel.ts`, so move, attack-move, smart
  travel, follow endpoints, and production rally orders share command-owned semantics.
- Moved sim-owned render presentation descriptors under `render/descriptors.ts`, keeping Math-mode
  hulls, life bars, cloak opacity, work sparks, and effect affordances behind one render contract.
- Merged ability tech/capacity/toggle legality helpers under `mechanics/abilities.ts`; effect and
  child-spawn capacity now follow ability execution descriptors instead of bespoke spawn/nuke
  capacity cases.
- Moved shared cargo, containment, transport capacity, load/unload, and Nydus endpoint rules under
  `mechanics/cargo.ts`, leaving `systems/cargo.ts` as the small per-tick containment synchronizer.
- Moved shared repair eligibility, cost, and construction-resume rules under `mechanics/repair.ts`,
  deleting the old root helper path while preserving the stable package export.
- Moved shared rally endpoint resolution and worker-rally fallback rules under
  `mechanics/rally.ts`, deleting the old root helper path while preserving the stable package export.
- Moved shared Terran lift/land mobility flags, speeds, and state transitions under
  `mechanics/terran-mobility.ts`, deleting the old root helper path while preserving the stable
  package export.
- Moved Scarab and Interceptor child-actor presentation/combat descriptors under
  `mechanics/child-actors.ts`, deleting the old root helper path while preserving the stable package
  export.
- Moved shared active-effect radius and coverage helpers under `mechanics/effects.ts`, deleting the
  old root helper path while preserving the stable package export.
- Collapsed the root production queue helper into `commands/production.ts`, so train validation,
  train application, larva-to-egg queueing, and same-tick supply reservation share one command owner.
- Moved shared larva cap, nearest-source, and count helpers under `mechanics/larva.ts`, leaving
  `systems/production/larva.ts` as the tick-time larva spawner.
- Moved shared tech-state, research-level, cost, and research-queue helpers under
  `mechanics/tech.ts`, deleting the old root helper path while preserving the stable package export.
- Moved Spider Mine placement helpers under `mechanics/spider-mine.ts`, deleting the old root helper
  path while keeping Vulture mine commands pointed at the mechanic owner.
- Moved shared burrow capability, access, weapon-availability, and state transition rules under
  `mechanics/burrow.ts`, deleting the old root helper path while preserving the stable package export.
- Moved Carrier interceptor launch, bay, target, and ammo-readiness rules under
  `mechanics/interceptor.ts`, deleting the old root helper path while leaving orbit/return ticking in
  `systems/interceptors.ts`.
- Moved shared cloak, scan, detector, and Arbiter cloak-aura query/update rules under
  `mechanics/detection.ts`, deleting the old root helper path while keeping fog-of-war ticking in
  `systems/vision.ts`.
- Retired the root `data.ts` compatibility shim: sim internals and sim tests now import the real
  `data/index.ts` owner directly, and the package barrel exports that owner without preserving the
  old root helper path.
- Audited the sim source root after folder migrations: no flat root compatibility shims remain;
  `fixed.ts`, `rng.ts`, `sim.ts`, and `tick.ts` are real root owners, and `index.ts` is the stable
  public package barrel rather than an old-path shim.
- Added the first deterministic queued-order kernel for travel commands: move, follow, and
  attack-move can append to a four-entry per-entity queue, queued orders are serialized/hashed, replay
  JSON preserves the `queue` flag, and normal replacement commands clear queued travel.
- Removed the acquired-combat-target compatibility mirror: transient combat acquisition now stays in
  `combatTarget`, while pathing anchors read that owner directly and `target` remains for
  command-owned entity targets such as harvest, build, repair, direct attack, add-ons, and cargo.
- Added command-surface architecture guards tying the `Command` union to command specs, action-mask
  encode/decode, replay ingestion, and app command-card option consumption.
- Locked down immediate queue interruption for spells, worker builds, spider mines, and transport
  load/unload so non-queued commands cannot leave surprising future travel waypoints behind.
- Added Hold Position as a first-class command/card/hotkey action and combat order that attacks in
  range without chasing.
- Added Patrol as a first-class command/card/hotkey action with serialized route endpoints and
  combat-aware two-point movement.
- Exposed active own order intent in fair-play object and buffer observations while preserving
  hidden enemy destination/target secrecy.
- Locked in the existing ML benchmark lanes for action masks, object observations, buffer
  observations, bot generation, and N-env batch stepping as completed roadmap coverage.
- Exposed first-class Move on the command card and desktop hotkeys, closing the most obvious
  player-available sim command missing from the UI surface.
- Made `Sim.lastCommandResults` an immutable snapshot while preserving caller-owned `Sim.step()`
  receipts for batch trainers and headless loops.
- Added a command-card guard that forces every `OrderOptionId` to be rendered by the UI, and wired
  the missing visible Move order button.
- Added a `COMMAND_TYPES`-backed app command-surface audit so future sim commands cannot be added
  without an explicit player-facing UI path or documented smart-command path.
- Moved Nuclear Strike launch through an ability execution descriptor, including delayed effect
  spawn, ready-missile consumption, and caster channel state; Yamato target-channel/windup remains
  the next high-risk ability timing audit.
- Moved Yamato through a generic `target-channel-damage` ability descriptor with deterministic
  caster-channel state exposed to lifecycle and observations; exact BW windup timing remains a
  sourced-data follow-up instead of an invented constant.
- Kept resolved caster channels locked through the combat phase and mirrored Nuclear Strike channel
  timers onto caster state, preventing same-tick spell-plus-weapon double actions.
- Descriptorized current scan/nuke effect visibility affordances under sim render descriptors, so
  app rendering consumes a small presentation table instead of hard-coded effect-kind branches.
- Added descriptor-backed persistent field affordances for Storm, Swarm, and Web and wired both app
  renderers to consume them from the sim presentation table.
- Moved selected-unit status labels for Burrowed, Cloaked, Detected, Irradiated, and Plagued behind
  sim render descriptors so the app no longer owns those visibility/status policy strings.
- Replaced ability-interpreter switch ladders for status timers, area timers, marker flags, restore
  pools, and target buffers with descriptor routing maps, keeping execution variants data-owned.
- Simplified tactical AI ability policy rows with explicit entity/point policy constructors, so the
  table emphasizes priority and scoring instead of repeated wrapper fields.
- Moved Spawn Broodling and Hallucination through a shared `target-spawn` ability descriptor, so
  target kill/clone source, child kind/count/spread/lifetime, illusion marking, normal command
  capacity, and RL batch capacity all read the same data instead of carrying separate hard-coded
  child-spawn counts.
- Moved Mind Control through a `target-convert` ability descriptor, keeping ownership transfer,
  target order clearing, and caster shield drain in the generic ability execution table.
- Moved Infest Command Center through a `target-transform` ability descriptor, keeping in-place kind
  replacement, ownership transfer, hp/shield/role reset, and production clearing in the generic
  ability execution table.
- Moved Recall through a `point-recall` ability descriptor, so all current ability execution paths
  enter through the ability execution table; Recall's deterministic friendly-unit teleport helper
  remains explicit as the spatial implementation.
- Extracted tactical AI spell policy descriptors and scoring helpers from the giant bot controller
  into `packages/ai/src/ability-policies.ts`, exported them through the AI barrel, and added a guard
  that keeps policy target shapes aligned with sim ability definitions.
- Table-drove scalar upgrade helpers for range, speed, cooldown, sight, and caster energy caps,
  replacing per-kind switches with local upgrade descriptor tables and adding focused coverage for
  every descriptor entry.
- Replaced role-inferred weapon and armor upgrade categories with explicit BW unit-group
  descriptors, fixed upgrade leakage onto workers and static defenses/structures, and added
  Chitinous Plating armor stacking coverage.

## Review Checklist

Before calling a roadmap slice done:

- Does the new code preserve deterministic replay/hash behavior?
- Is the gameplay concept represented once, with shared queries for UI/AI/RL?
- Are hot loops still typed-array/grid/scratch based?
- Did tests cover the behavior rather than an implementation accident?
- Did benchmarks show no unacceptable throughput regression?
- Did the slice reduce cognitive load, or did it add another place a teammate must remember?
