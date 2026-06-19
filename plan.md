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
- HEAVY ACTIVE-WORK NOTE: no new compatibility shim should be treated as neutral. If a slice
  introduces one to keep public imports stable, the same slice must record when it can be deleted
  and which callers still need migration.

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
    for move / attack-move / patrol, and command masks can ask the shared validator for
    append-vs-replace legality.
  - Desktop Shift slice is done for queued travel: Shift-right-click smart move/follow and
    Shift-armed attack-move point commands set the shared `queue` flag after validator-backed
    command-intent checks, while enemy attacks and other non-travel smart commands keep their
    current immediate semantics.
  - Queued waypoint rendering slice is done for queued travel: selected units expose sim-owned
    queued travel waypoint descriptors, and the shared overlay draws move/follow, attack-move, and
    patrol paths in both WebGL and Math/fallback rendering.
  - Mobile queue-mode slice is done for queued travel: the compact mobile toggle feeds the same
    validator-backed command-intent option as desktop Shift, appends move / follow and attack-move
    point travel, and leaves attack / harvest / repair / load / spells immediate until those command
    families gain first-class queued interruption semantics. Remaining queue work: extend append
    semantics to the other command families with explicit interruption tests.
  - Patrol queue slice is done: Patrol now shares the travel queue's serialized order slots, replay
    and action-mask encoding preserve the `queue` flag, desktop Shift and mobile queue mode emit
    queued Patrol from armed command taps, and queued waypoint descriptors/rendering distinguish
    Patrol from Move and Attack-Move.
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
  - Transition timing provenance slice is done: provisional siege and burrow durations now live in
    `ModeTransitionTimings` with explicit `sourceStatus: 'unsourced'`, tests pin that provenance,
    and `docs/research/bw-transition-timings.md` describes the current timed placeholder behavior
    instead of the old instant-state wording.
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
  - Nuke presentation source affordance slice is done: descriptors now expose launch source
    coordinates only to allied/observer views, and both renderers draw the same target warning plus
    non-leaking source vector.
  - Missile/Valkyrie presentation slice is done: missile-style weapons now carry renderer-only
    projectile descriptors, GL fire events resolve `combatTarget` before command targets, and
    visible missile/projectile weapons draw deterministic travel streaks including Valkyrie volleys
    without adding gameplay travel-time state.
  - Remaining: add true gameplay travel-time missiles only if a sourced BW mechanic needs projectile
    interception, dodge windows, or delayed damage beyond Scarabs/Interceptors.
- Revisit Carrier Interceptor attack-pass cadence if tests or play show visible drift from BW feel.
- Audit remaining weapon-specific or multi-hit upgrade exceptions against the BW references.
  - Terran weapon-increment audit slice is done: Vehicle/Ship weapon upgrades now use the documented
    per-weapon increments for Vulture, Tank, Siege Tank, Battlecruiser, and Goliath/Wraith air
    weapons while keeping their ground weapons at the lower increment.
  - Remaining: only newly discovered non-Terran or special-weapon upgrade exceptions should extend
    this list; prefer spec-backed table rows over kind-wide branches.
- Expand procedural maps beyond the ground-connected presets with later island variants once
  disconnected-ground validity and AI semantics are explicit.
  - Island-expansion generator slice is done: replay-visible `islandExpansions` maps keep starts and
    non-island bases ground-connected, add neutral closed-pocket island expansions, preserve strict
    `mapConnected` semantics for callers that require full ground reachability, and expose explicit
    `mapGroundConnected` / `mapIslandBasesDisconnected` validators. Remaining island work:
    transport-aware AI expansion logic and player/UI affordances for air-only or transport-only base
    access.
  - Lifted-depot island landing slice is done: Terran expansion macro can land an existing idle
    lifted Command Center on an open island expansion through the shared `land` validator, while
    worker-built expansion choices still exclude islands until transport-aware builder logistics are
    explicit.

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
  - Queue-space observation slice is done: own entity rows now expose remaining queued-travel
    capacity in both object and caller-owned buffer observations, hidden enemy rows report zero, and
    the observation schema version was bumped so RL consumers can gate on the new layout.
  - Mode-transition observation slice is done: object and caller-owned status observations expose
    own mode-transition type, target kind/state, remaining timer, and total timer; enemy status rows
    still do not leak, and the status buffer schema now includes the full cloak timer/aura fields.
- Finish race macro paths with validator-backed build, research, upgrade, and spell choices.
  - Terran research macro slice is done for Academy, Machine Shop, Covert Ops, Control Tower,
    Physics Lab, Science Facility, Engineering Bay, and Armory tech/upgrades, using the shared
    research validator instead of bot-private legality rules.
  - Terran producer-reservation slice is done: the bot reserves a Terran add-on parent and its
    attached add-on as one production chain for the current command batch, so same-chain add-on and
    research choices do not compete before the sim applies commands.
  - Protoss and Zerg research macro slice is done: the bot walks every current `TechDefs` research
    and upgrade row for those races through the shared research validator, with table-driven
    producer, prerequisite, duplicate, busy, power, and budget coverage.
  - Zerg Evolution Chamber macro slice is done: the bot now builds the missing ground-upgrade
    producer after Hydralisk Den, and the Zerg build tests use named macro prefixes so Spire,
    Queen's Nest, Nydus, Defiler Mound, and Ultralisk Cavern scenarios cannot silently skip earlier
    tech producers.
  - Macro scheduler extraction slice is done: worker/supply, tech, add-ons, morphs, research, army
    production, production-capacity, expansion, and macro-hatchery scheduling now run through
    `packages/ai/src/macro-scheduler.ts`, leaving the live bot controller to sequence macro,
    tactical defense, and pressure offense.
- Replace the current single-pass scripted bot priority ladder with a small intent/macro engine.
  Real SC2 tournament bots and full-game research agents usually win with hierarchy rather than one
  flat action chooser: directors read game facts, propose macro/tactical intents, a scheduler
  arbitrates scarce resources and actors, and executors emit validated game commands. Use that
  architecture, but keep it deterministic, typed-array friendly where it touches hot sim data, and
  much smaller than a general behavior-tree framework.
  The useful lesson from SC2 bot architecture is not "add a framework"; it is "separate facts,
  proposals, scheduling, and execution." Tournament-style scripted bots usually have map analysis,
  scouting memory, build-order/economy managers, army/combat managers, and micro helpers, while
  research agents often keep the same module boundary and learn only the expensive strategic pieces.
  Our version should stay smaller: one facts pass, several pure directors, one deterministic
  scheduler/reservation pass, and thin validator-backed executors.
  - `BotFacts`: a cheap per-tick summary derived from `State`, not a second sim. It should include
    own bases, workers, larvae, idle production, supply, resources, tech/producers, available army,
    local threats, visible enemy composition, last-known enemy positions, inferred invisible threats,
    unsafe/blocked expansion sites, destroyed prerequisite structures that must be rebuilt, and a
    tile risk matrix over the currently visible map or the whole map when the controller runs with
    god vision.
  - Risk matrix usage must stay advisory, shared, and cheap. It is a tactical cost field, not a
    second pathfinder and not a command validator. Expansion should score site and route risk;
    defense should sum local risk around bases, workers, and production; scouting should prefer
    high-value unknown areas but avoid known lethal paths; harassment should choose exposed
    low-risk targets and retreat paths; combat should use it to select rally/siege/engage areas;
    worker/build intents should avoid sending builders through known kill zones when alternatives
    exist. Unknown fog is not safe: later memory should layer last-seen and suspected invisible risk
    onto the visible matrix with deterministic decay.
    - Treat the risk matrix as a small set of map-space fields, all derived from observed or
      remembered facts: aggregate weapon risk, anti-ground, anti-air, detection, suspected-invisible,
      protected asset value, friendly response coverage, route congestion, and unknown-fog penalty.
      Fields should be tile-aligned, integer-valued, deterministic, and optional per caller; normal
      macro generation can request omitted risk, while expansion, scouting, and tactics opt into
      the layers they consume. Never make field values authoritative legality; they score choices
      that still go through pathing and command validation.
    - Risk is consumed through named questions instead of raw array reads in directors: "is this
      expansion site safe enough to reserve?", "is there a low-risk route for a worker?", "does this
      enemy threaten air, ground, or both?", "is this invisible/suspected threat already covered by
      detection?", "can the local response group arrive before the asset dies?", and "would this
      attack wave cross a stronger field than it projects?" Those helpers keep the bot explainable
      and prevent every director from inventing its own risk arithmetic.
    - Harassment and containment are proactive risk consumers. They should score enemy protected
      regions by exposed value, expected damage, time-to-impact, escape route, and enemy response
      coverage, then choose safe approach vectors around weapon ranges instead of blindly moving
      through the map center. This uses the same fields as defense, but asks the inverse question:
      "where can we damage enemy economy/tech or choke movement while keeping our committed squad
      alive enough to matter?"
      - Enemy-protected-region slice is done: `BotFacts` now exposes visible enemy base and
        mineral-line regions using the same region shape as home defense, and attack waves pressure
        the highest-value exposed enemy region before falling back to nearest enemy structures.
      - Public-start fallback slice is done: when fog hides all enemy regions and visible enemies,
        pressure now targets the nearest public enemy start instead of the farthest one, reducing
        time-to-impact without leaking hidden unit positions.
    - Risk must not become paralysis. Directors should carry a commitment pressure term from
      timing windows, strategy posture, banked resources, enemy scaling, base count, and elapsed
      indecision. If every route is bad or every enemy army looks larger, the scheduler still commits
      to the least-bad attack, expansion, evacuation, sacrifice, or counter-harass once waiting is
      strategically worse. Safety fields rank vectors; they do not forbid long-term strategic gambles.
      The fallback intent should often be "force a response": hit workers, threaten tech, posture at
      a choke, pull the enemy army home, or trade a small squad for scouting and time. This prevents
      the bot from mistaking caution for strategy.
      - First commitment-pressure slice is done: `BotMemory` tracks how long an under-threshold
        offense force has been waiting, and the live bot eventually sends that remaining force once
        waiting is worse than forcing a response. Tactical defense reservations still happen first,
        so this pressure spends only uncommitted units instead of stealing active defenders.
      - Force-scaled commitment slice is done: the pressure wait now shrinks as available
        uncommitted army approaches the configured attack threshold, so an almost-ready force
        commits much sooner than a lone scout while staying deterministic and benchmarkable.
      - Zero-force memory slice is done: once a pressure wait has started, temporary frames with no
        available attack force no longer erase the wait; a later free unit can force a response
        instead of the bot resetting into indecision.
      - Risk-aware pressure focus slice is done: committed pressure asks for full risk facts only
        while choosing among known enemy regions, prefers a non-lethal valuable target over a lethal
        economy dive, and still returns the least-bad focus when every known focus is dangerous.
      - Counter-pressure focus slice is done: when a bounded defense squad is already handling a
        base incident, leftover attack force uses strategic pressure focus and falls back to public
        enemy starts instead of dogpiling the visible intruder under fog.
      - Pressure-decision slice is done: commitment pressure now returns an explicit idle/waiting/
        commit decision with a `forced` marker for under-threshold attacks that have waited long
        enough, making "freezing is worse than forcing a response" a tested bot contract instead of
        a hidden boolean.
  - Spatial response must be emergent from shared fields and incident classes, not a catalog of
    one-off emergencies. Drops, Nydus arrivals, bombing runs, worker harassment, kiting, traps,
    sieged positions, mine fields, lurker lines, cloaked attackers, and transport bypasses all reduce
    to: hostile capability appears or is inferred in a region; a protected asset is threatened; the
    bot estimates time-to-impact, route safety, detection needs, and available response groups; then
    it emits `defend-base`, `intercept`, `evacuate-workers`, `get-detection`, `clear-site`,
    `retreat`, `contain`, or `counterattack` intents.
    - The tactical model should be region-first, not event-name-first. A base, mineral line,
      production cluster, army staging point, expansion site, transport route, and retreat route are
      protected regions with value, owner, response radius, and escape routes. Any enemy weapon,
      detector, spell, transport, burrow/cloak, or static-control capability that intersects those
      regions raises an incident; the incident kind only names the dominant capability so scoring can
      choose detectors, anti-air, fast interceptors, siege breakers, workers, or spell casters.
      - First protected-region slice is done: `BotFacts` now exposes base protected regions and
        derives existing base threats from those regions, preserving behavior while giving later
        mineral-line, production-cluster, staging, route, and expansion-site directors the same
        factual shape.
      - Mineral-line protected-region slice is done: `BotFacts` derives mineral-line regions from
        nearby resource actors, assigns each visible enemy to its highest-value intersected protected
        region for incident purposes, and classifies ordinary threats there as `mineral-line-harass`
        while preserving base-threat compatibility facts.
    - Unexpected spatial patterns should compose from the same fields: a drop is a mobile air route
      plus cargo threat near a protected region; a Nydus breach is an instant transport endpoint plus
      ground threat; a bombing run is high time-to-impact air weapon risk; kiting is friendly
      response coverage falling behind enemy threat projection; a trap is route risk rising faster
      than army value can clear it; sieged units are static long-range fields that favor contain,
      flank, or spell responses over walking directly through the field.
    - Response choice should be a small decision table over the same incident features. If the
      threat is air-carried, prefer anti-air interception before ground defense. If the threat is
      invisible or damage arrives without a visible enemy, reserve detector plus guard. If enemy
      range/control dominates the direct route, contain, flank, or cast instead of walking into it.
      If time-to-impact is shorter than army arrival, evacuate workers or pull local emergency
      defenders. If the enemy overcommits far away and home risk stays bounded, counterattack with
      uncommitted army instead of collapsing every unit home.
    - Unforeseen conditions should become memory entries with expiry rather than permanent
      special cases: an expansion blocked by a burrowed/cloaked unit becomes a suspected blocker
      region that requests detection or clear-site; a failed worker route raises route risk; vanished
      drops decay into last-seen transport risk; repeated harassment increases protected value and
      response coverage around that region. The scheduler can then pick a response based on current
      urgency and reserves, not the one command that happened to fail.
    - The controller should reserve actors by commitment, not merely issue commands. A defender
      committed to a base incident should be unavailable to a harassment or attack-wave director
      until the incident expires, resolves, or is reprioritized. This is the bridge from the current
      single-pass bot to multi-intent behavior without introducing a broad behavior-tree framework.
  - Add a `TacticalIncident` layer after `BotFacts`: incidents should be produced from visible
    enemies, risk-field changes, recent damage/deaths, blocked builders, last-seen memory, and
    protected-zone membership. Incident examples are `base-intrusion`, `mineral-line-harass`,
    `invisible-damage`, `transport-drop`, `nydus-breach`, `siege-containment`, `static-threat-zone`,
    `route-trap`, `expansion-blocked`, and `army-under-kite`. The response should be selected by
    incident severity and response fit, not by hard-coded unit names.
    - Seed slice is done: visible threats near owned bases are grouped into deterministic,
      severity-sorted `base-intrusion` incidents backed by `BotFacts` and the shared risk map.
      Remaining incident work: classify mineral-line harassment, drops, Nydus breaches, siege
      containments, cloaked/invisible damage, route traps, and kiting pressure from the same facts
      and memory instead of adding command-time special cases.
    - Defense-consumer slice is done: the live bot now reads the incident stream for threatened-base
      response, so expansions are protected through the same path as the main base. Normal bot
      generation can request BotFacts without materializing the full risk matrix; route/site
      directors should opt into full risk only when they actually score map tiles.
    - Defense-helper extraction slice is done: incident target resolution and last-resort worker
      responder selection now live in `packages/ai/src/macro-defense.ts`, leaving the live bot
      controller to schedule defense rather than own low-level responder mechanics.
    - Capability-classification slice is done: base incidents now distinguish Nydus breaches,
      transport drops, static threat zones, and long-range siege containments from unit data
      (kind, cargo capacity, roles, and weapon range) before later directors choose the response.
    - Incident-memory slice is done: visible incidents now refresh deterministic `BotMemory`, decay
      for `TACTICAL_INCIDENT_MEMORY_TICKS` after vision drops, and the live bot attack-moves
      retaskable defenders to remembered incident centers when no visible target remains.
    - Response-fit seed slice is done: tactical incidents now rank retaskable responders by target
      compatibility, detector/role fit, mobility, and distance before the live bot emits ordinary
      defense commands. This is intentionally a ranking layer, not a separate command system.
    - Response-budget slice is done: tactical incidents now commit only a deterministic ranked squad
      sized by incident kind and severity, so a small intrusion does not consume the whole army while
      drops, Nydus breaches, siege fields, and high-severity incidents can request larger responses.
    - Commitment-memory slice is done: valid tactical responder assignments now persist for a short,
      deterministic window using entity ids, refresh while the incident stays active or remembered,
      and re-rank only after expiry or when assigned units leave the retaskable candidate set.
    - Leftover-attack slice is done: the live bot now sends only uncommitted retaskable army into
      attack waves while a tactical incident is active, so small base intrusions do not freeze all
      map pressure. Offensive spell casting still stays suppressed during active defense until caster
      reservations are explicit.
      Remaining reservation work: expose leftover force to lower-priority harass, scout, and
      counterattack directors as those directors become first-class intents.
    - Tactical scheduler extraction slice is done: deriving remembered incidents, selecting
      defenders, pulling emergency workers, casting defensive abilities, and emitting defense
      engagements now live in `packages/ai/src/macro-tactics.ts`, leaving the live controller to
      schedule the returned incident plus leftover attack candidates.
  - Maintain layered spatial fields rather than one overloaded number: known weapon risk,
    anti-ground risk, anti-air risk, detection coverage, invisible/suspected risk, protected asset
    value, friendly response coverage, route congestion, and unknown-fog penalty. Keep the first
    implementation as a compact visible/god weapon-risk map, then add layers only when a director
    consumes them and tests prove the behavior.
    - First layered-risk slice is done: `BotRiskMap` now keeps aggregate weapon risk for existing
      severity scoring plus separate anti-ground, anti-air, and detector coverage layers, with cheap
      omitted-risk arrays for normal bot generation and tests proving ground-only, air-only, and
      detector-only threats stay distinct.
    - First risk-consumer slice is done: base incident severity now reads the anti-ground layer, so
      air-only weapons near a base are still visible facts but no longer inflate ground-asset danger.
      `riskAtLayer` is the intended helper shape for future named questions instead of raw array
      reads throughout directors.
      Remaining layers should be added only with consumers: suspected invisible risk from damage
      memory, protected-asset value for defense/evacuation, friendly response coverage for engage
      decisions, route congestion for scouting/retreat, and unknown-fog penalty for expansion and
      harassment planning.
  - Tactical responses should use hysteresis and expiry. A drop or Nydus breach should keep a
    defense intent alive long enough for units to arrive; a vanished threat should decay into
    scout/detection memory rather than instantly pulling every defender home forever. This prevents
    jitter while still reacting to unexpected events.
  - Combat squads should be assigned by role and response fit: fast interceptors for drops and
    kiting, detectors plus guards for invisible/burrowed threats, siege breakers/flankers for static
    range fields, workers only for emergency mineral-line defense or repair, and harassment groups
    only when home-defense reservations leave enough force. Spatial fields decide whether to engage,
    flank, contain, retreat, or counterattack.
    - Emergency worker-pull slice is done: when a protected-region incident cannot fill its response
      budget from retaskable army, the live bot pulls nearby non-building, non-repairing workers as
      last-resort defenders, excluding the worker already reserved for a build command in the same
      batch so emergency reaction does not double-book macro execution.
  - `BotMemory`: tiny deterministic controller memory for facts that cannot be read from the current
    frame alone: failed expansion attempts and reasons, suspected cloaked/burrowed threat zones,
    last-seen enemy tech/composition, reserved expansion sites, scout reports, and ongoing intents.
    Memory must update from observed state and tick order only; replay determinism still comes from
    the command stream.
  - Directors propose intents only; they do not spend resources or emit commands directly. Initial
    directors should be `DefenseDirector`, `EconomyDirector`, `ProductionDirector`, `TechDirector`,
    `ExpansionDirector`, `CombatDirector`, `HarassDirector`, and `CounterDirector`.
  - Strategic posture should be an input to directors, not a separate bot implementation. Aggressive,
    turtle, cheese, proxy, fast-expand, fast-tech, timing-attack, trap-laying, contain/choke, drop,
    and harass styles are different weightings over the same intent vocabulary: where to spend
    minerals, what risks are acceptable, which regions to value, when to move out, and how much army
    must stay reserved. The reflex layer still outranks posture when protected regions are actively
    threatened; a fast-tech bot should not ignore workers dying, and a turtle bot should still
    counterattack when the enemy overcommits and home risk is bounded.
  - Intents are game concepts with urgency, actor needs, costs, and expiry, for example
    `defend-base`, `get-detection`, `clear-site`, `rebuild-tech`, `add-production`, `expand`,
    `spend-larva`, `train-counter`, `research-upgrade`, `attack-wave`, `harass`, and `retreat`.
  - A reservation/scheduler pass owns minerals, gas, supply, producers, larvae, builders, army
    squads, spell casters, and locations for the current command batch. Lower-priority intents see
    only the remaining budget, so emergency defense/rebuilds cannot be starved by upgrades, and
    one producer/builder cannot be overbooked before the sim applies commands.
  - Executors are the only layer that emits `Command`s. They must use `validateCommand` and shared
    command helpers so AI, UI, replay, and future RL masks keep one legality surface.
  - Intent outcomes should be explicit: `done`, `waiting`, `blocked`, or `failed`. Avoid encoding
    every weird case directly; classify failures as `unsafe-location`, `occupied-location`,
    `missing-detection`, `missing-prerequisite`, `insufficient-force`, `no-builder`, `no-producer`,
    `no-production-capacity`, `supply-blocked`, `resource-starved`, or `path-blocked`, then let
    directors react with follow-up intents.
  - Expansion must be a lifecycle, not a one-shot build command: choose site, scout/verify when
    uncertain, reserve builder/resources/site, execute, monitor blocked/path/unsafe outcomes, clear
    or detect if needed, choose another site when better, and retry without command spam.
  - Defense must outrank normal macro. If a base or mineral line is attacked, if workers are dying
    without a visible attacker, or if an expansion builder encounters an invisible/burrowed blocker,
    the bot should create `defend-base`, `get-detection`, `clear-site`, or `retreat-workers`
    intents before spending on optional tech.
  - Race macro should share the same intent machinery while preserving real race differences:
    Terran/Protoss add production structures when income exceeds queue capacity; Zerg adds Hatchery
    capacity and expands because more simultaneous production means more larvae. Tech prerequisites
    should be rebuilt ASAP if destroyed, but unique prerequisite buildings such as Spawning Pool,
    Hydralisk Den, Evolution Chamber, Cybernetics Core, Academy, Engineering Bay, and Armory should
    not be duplicated unless a later strategy explicitly asks for redundancy.
    - First Zerg capacity slice is done: after normal larva spending, a larva-starved Zerg bot with
      a large mineral bank adds bounded repeatable Hatchery capacity through shared build validation,
      while pending Hatcheries and remaining idle larvae suppress the anti-float build.
    - Capacity-policy extraction slice is done: Zerg Hatchery anti-float pressure now lives in
      `packages/ai/src/macro-capacity.ts`, keeping the live bot controller from absorbing the next
      Terran/Protoss production-capacity policies as more inline branching.
    - Core production anti-float slice is done: Terran and Protoss can now add extra Barracks/Gateway
      capacity from the shared capacity-policy module when mineral-banked beyond a positive configured
      target, after higher-priority tech/research/army spending gets first claim on the builder.
    - Fact-driven tech-structure rebuild slice is done: Protoss/Zerg unique tech structure order now
      lives in `packages/ai/src/macro-tech.ts`, consumes `BotFacts.ownedOrPendingStructureKinds`, and
      shares the neutral `macro-build` structure-queue primitive. The live bot no longer carries a
      second owned/pending structure scan for these tech rebuilds, and regression tests cover missing
      Cybernetics Core / Hydralisk Den rebuilds when later tech survived.
    - Ground expansion lifecycle slice is done: mineral-banked bots can now spend surplus on a legal
      town hall at the nearest open same-side base site, using exact `MapDef.bases` depot-footprint
      anchors and the shared build validator. Already occupied or pending friendly/ally expansion
      sites are skipped so the bot does not duplicate a natural. Later slices still need island and
      transport-aware expansion choices.
    - Lifted-depot island landing slice is done: the expansion director treats an idle lifted Terran
      Command Center as an existing expansion asset and lands it on the nearest legal open island
      site through shared validation, without teaching workers to issue impossible island builds.
    - Research-director extraction slice is done: race research ladders and shared producer/budget
      validation now live in `packages/ai/src/macro-research.ts`, while Terran add-on/research
      producer reservations live in `packages/ai/src/macro-producers.ts`. The live bot controller now
      orchestrates one `maybeQueueRaceResearch` director call instead of carrying three inline
      research ladders and a duplicate scan over research producers.
    - Zerg morph macro extraction slice is done: unique and repeatable Zerg morph choices now live
      in `packages/ai/src/macro-morph.ts`, keeping Lair/Hive/Greater Spire and Hydralisk-to-Lurker
      transform budgeting beside the validator-backed transform command rather than inline in the
      live bot controller.
    - Terran add-on macro extraction slice is done: add-on priority, Science Facility add-on choice,
      parent reservation, and validator-backed add-on queueing now live in
      `packages/ai/src/macro-addons.ts` instead of the live bot controller.
    - Macro placement helper extraction slice is done: deterministic ring placement, exact-point
      placement, and pylon-anchor fallback now live in `packages/ai/src/macro-placement.ts`, so the
      live controller passes shared placement policy into build, expansion, Nydus, and capacity
      directors instead of owning it inline.
    - Production queue helper slice is done: worker, supply-larva, and army training now use
      `packages/ai/src/macro-production.ts`, preserving budget/reserved-supply accounting while
      routing train legality through the shared sim validator.
    - Economy-director extraction slice is done: economy roster scanning, desired worker count,
      worker production, supply construction, initial army-structure construction, and
      army-structure rally setup now live in `packages/ai/src/macro-economy.ts`, leaving the live
      bot controller closer to scheduler orchestration instead of embedding economy mechanics
      inline.
  - Anti-float policy should be explicit. Sustained minerals/gas above planned reserves should
    become `add-production`, `expand`, `spend-larva`, `train-army`, `research-upgrade`, `harass`, or
    `attack-wave` intents depending on the current bottleneck; the bot should not sit on money while
    idle producers/larvae exist and safe spending options are available.
  - Migration order: first add the vocabulary and pure fact helpers beside the current bot; next
    migrate defense and destroyed-prerequisite rebuilds; then migrate Zerg larva/Hatchery capacity,
    ground expansion lifecycle, and Terran/Protoss production capacity; then move tech, counters,
    harassment, island expansion, and combat squads into directors. Keep each step locally tested
    and benchmarked, and delete old priority-ladder branches as their intents take over. Do not use
    the roadmap validator subagent for routine continuation; it slows iteration and usually agrees
    with the local code/test evidence anyway.
  - First fact/risk slice is done: `packages/ai/src/macro.ts` now owns the bot intent/failure
    vocabulary, deterministic bot memory shape, `BotFacts`, fog-aware visible enemy collection,
    completed-or-pending structure summaries for rebuild planning, and a compact weapon-risk tile
    matrix that covers visible map state or the whole map in god-vision mode.
  - Pressure-policy extraction slice is done: attack-wave commitment and focus selection now live in
    `packages/ai/src/macro-pressure.ts`, with the explicit rule that freezing is worse than sending a
    usable force to create pressure after a deterministic wait. Under fair fog, pressure uses known
    enemy regions or public enemy start locations instead of hidden enemy slots; under god vision it
    may still use full-state enemy targets for headless scripted play.
  - Lone-force pressure slice is done: the deterministic pressure wait no longer requires two
    combat units. Any positive leftover combat force can eventually attack-move toward the pressure
    focus, while zero available force still emits no pressure command and defense reservations still
    win.
  - Zero-force memory slice is done: no-force openings still avoid starting pressure, but temporary
    no-force windows after a wait has begun no longer reset the commitment timer.
  - Combat-engagement extraction slice is done: defense and pressure command emission now share
    `packages/ai/src/macro-combat.ts` for Stim, Siege/Lurker/Vulture prep, attack-vs-attack-move
    fallback, and same-team Nydus shortcut loading. The live bot controller keeps choosing incidents
    and pressure focus, but no longer carries duplicate tactical command ladders inline.
  - Pressure scheduler extraction slice is done: commitment timing, focus fact refresh, strategic
    counter-pressure selection, offensive Nydus endpoint planning, offensive spell casting, pressure
    engagement emission, and pressure-memory refresh now live in `packages/ai/src/macro-offense.ts`.
  - Pressure commitment now exposes an explicit decision object, so tests can distinguish idle,
    waiting, immediate threshold attacks, and forced least-bad attacks after the deterministic wait.
  - Nydus endpoint macro extraction slice is done: offensive Nydus endpoint construction now lives
    in `packages/ai/src/macro-nydus.ts` as a reusable validator-backed macro primitive; the live bot
    only passes the current pressure focus and legal spot finder.
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
  - Worker expansion town-hall exposure is already guarded: app tap semantics prove SCV, Probe, and
    Drone build cards expose Command Center, Nexus, and Hatchery as armed placement options.
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
- Added a replay-visible `islandExpansions` procedural preset with explicit disconnected-island
  validation while preserving strict full-ground-connectivity checks for older presets.
- Let the Terran bot land an already lifted Command Center on an open island expansion through the
  shared land validator while keeping worker-built expansion orders ground-reachable.
- Extended the faction bot's validator-backed research macro to Terran tech/upgrades across
  Academy, Machine Shop, Covert Ops, Control Tower, Physics Lab, Science Facility, Engineering Bay,
  and Armory, with producer, duplicate, queue, and budget coverage.
- Added Terran bot producer reservations for add-on/research chains so one command batch cannot
  ask the same parent/add-on pair to both build an add-on and research from that chain.
- Extended Protoss and Zerg bot research macros to every current tech/upgrade row and replaced the
  hand-picked cases with table-driven producer, prerequisite, duplicate, busy, power, and budget
  coverage.
- Added Evolution Chamber to the Zerg bot structure macro and named the Zerg macro-prefix fixtures
  so build coverage reflects every current Zerg research producer before later tech structures.
- Moved Protoss/Zerg unique tech-structure macro into `packages/ai/src/macro-tech.ts`, backed by
  `BotFacts.ownedOrPendingStructureKinds`, and added destroyed-prerequisite rebuild coverage for
  missing Cybernetics Core and Hydralisk Den after later tech structures survived.
- Added the first bot intent/facts foundation: bot macro vocabulary, deterministic memory shape,
  fog-aware visible-enemy facts, completed/pending structure summaries, and a compact risk matrix
  for visible-map or god-vision tactical scoring.
- Added the first TacticalIncident derivation layer over BotFacts, grouping visible base threats
  into deterministic, severity-sorted base-intrusion incidents for later defense-director
  scheduling.
- Wired the live bot's defense choice to the TacticalIncident stream, covering threatened
  expansions while keeping full risk-map construction optional for normal command generation.
- Classified first tactical incident capabilities for Nydus, transport, static-defense, and
  long-range containment threats using shared unit/weapon data instead of scenario-specific bot
  branches.
- Added deterministic tactical incident memory and live remembered-defense behavior, so vanished
  drops, Nydus breaches, siege positions, and other base-local threats keep a short defensive
  response alive instead of disappearing the moment fog hides the target.
- Added the first tactical responder ranking helper, letting incidents prefer units that can
  actually solve the spatial problem, such as anti-air responders for transport drops, before later
  squad-reservation work limits how many units commit.
- Recorded the existing app guard for worker-built expansion town halls so the roadmap no longer
  treats Command Center, Nexus, and Hatchery command-card exposure as an unimplemented gap.
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
- Extracted the bot research macro into `packages/ai/src/macro-research.ts` and shared Terran
  parent/add-on producer reservations through `packages/ai/src/macro-producers.ts`, shrinking the
  live bot controller without changing research ordering or legality checks.
- Removed the pressure director's artificial two-unit floor so a lone available combat unit
  eventually commits after the deterministic wait instead of freezing forever.
- Extracted shared bot combat engagement issuing into `packages/ai/src/macro-combat.ts`, reducing
  duplicated defense/offense micro branches in the live bot controller while preserving behavior.
- Extracted offensive Nydus endpoint construction into `packages/ai/src/macro-nydus.ts`, keeping the
  live bot controller focused on scheduling and preserving the existing legal spot search.
- Extracted Zerg unique/repeatable morph macro into `packages/ai/src/macro-morph.ts`, shrinking the
  live bot controller without changing transform ordering or legality checks.
- Extracted Terran add-on macro into `packages/ai/src/macro-addons.ts`, keeping parent reservations
  shared with research while removing another policy table from the live bot controller.
- Extracted bot macro placement helpers into `packages/ai/src/macro-placement.ts`, centralizing the
  shared spot-finding policy used by tech, capacity, expansion, and Nydus macro directors.
- Added `packages/ai/src/macro-production.ts` so bot worker, supply, and army training share
  validator-backed train emission instead of duplicating train prechecks in the live controller.
- Extracted bot economy helpers into `packages/ai/src/macro-economy.ts`, covering economy roster
  scanning, desired worker count, worker production, supply construction, initial army-structure
  construction, and army-structure rally setup.
- Scaled bot pressure commitment by available force, making near-threshold armies commit earlier
  instead of waiting the full under-threshold timeout.
- Changed fog-pressure public-start fallback to choose the nearest enemy-team start on multi-start
  maps, preserving hidden-unit secrecy while forcing faster contact.
- Preserved an already-started bot pressure timer through temporary zero-force windows so defense
  churn cannot indefinitely erase the decision to force a response.
- Made committed pressure focus risk-aware without making risk a normal macro tick cost: known enemy
  regions now avoid visibly lethal economy dives when a safer valuable focus exists, but still return
  a least-bad focus instead of freezing.
- Added strategic counter-pressure focus for active defense incidents, so leftover forces can force a
  response at known/public enemy locations while committed defenders handle the local threat.
- Exposed pressure commitment as an explicit idle/waiting/commit decision with a forced marker for
  waited-out under-threshold attacks, making the no-freeze policy testable for future intent
  scheduling.
- Extracted bot defense targeting and emergency worker responder selection into
  `packages/ai/src/macro-defense.ts`, keeping the live bot controller thinner without changing
  defense behavior.
- Extracted tactical defense scheduling into `packages/ai/src/macro-tactics.ts`, so incident memory,
  defender reservations, emergency worker pulls, defensive spell casting, and defense engagement
  emission are no longer embedded in the live bot controller.
- Extracted pressure offense scheduling into `packages/ai/src/macro-offense.ts`, so commitment
  timing, focus refresh, Nydus endpoint planning, offensive spell casting, pressure engagement
  emission, and pressure-memory refresh no longer live in the live bot controller.
- Extracted the live bot macro ladder into `packages/ai/src/macro-scheduler.ts`, so worker/supply,
  tech, add-ons, morphs, research, army production, capacity, expansion, and macro-hatchery
  scheduling return only the budget, builder, army, and caster context needed by tactics/offense.
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
- Extended queued Patrol through AI/RL observation coverage, proving object and caller-owned buffer
  observations expose the same queued-order entries as move/follow and attack-move.
- Extended queued Patrol through action-mask append legality coverage, proving command-head masks
  allow Patrol while queue space remains and reject it through the same full-queue gate.
- Exposed active own order intent in fair-play object and buffer observations while preserving
  hidden enemy destination/target secrecy.
- Exposed own queued-travel capacity in fair-play entity observations and caller-owned entity
  buffers while preserving hidden enemy queue secrecy.
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
