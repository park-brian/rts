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

Feasibility review against the current code:

- **Keep the in-place strangler direction.** The repo is already organized around `data/`,
  `entity/`, `mechanics/`, `systems/`, `spatial/`, `io/`, `map/`, and app/AI clients. A parallel
  `world2` rewrite would duplicate determinism, serialization, replay, action masks, and UI
  contracts before proving any behavior. The feasible route is to move one rule owner at a time,
  update callers, delete the old branch/import, and keep replay/hash tests green.
- **Do not chase the external LOC target.** The source already contains deliberately explicit BW
  behavior and performance comments. A smaller file count is only a win when it also removes a
  duplicated rule or makes a hot path easier to audit. Avoid terse DSLs for unit data, ability
  effects, or bot strategy unless they are clearer than the tables they replace.
- **The proposed single behavior loop is not currently feasible.** Movement, attack-move combat,
  harvesting, construction, repair, cargo loading, and production share geometry/validation, but
  they intentionally run in separate deterministic phases. Collapsing them into "go to target, then
  do action" would risk tick-order bugs, replay churn, and worse hot-loop locality. The better
  short-term move is to share approach/range/resource helpers while keeping phase systems explicit.
- **Weapon descriptorization is feasible, but not as one giant `fireWeapon` yet.** The repo already
  has `WeaponMechanicDefs`, shared weapon-hit resolution, Scarab launch ownership, and Interceptor
  capability facts. The next clean slice is to move on-hit/post-fire applicators and container-fire
  policy into mechanics-owned helpers while leaving `systems/combat.ts` as the phase interpreter.
  Carrier, Reaver, Bunker, Lurker, Mutalisk, Devourer, Scourge, and Spider Mine behavior must keep
  focused tests before any merge.
- **Ability descriptorization is partially done and worth continuing carefully.** `AbilityExecution`
  already covers the implemented spell modes, and command-time execution now lives in mechanics
  instead of the ability tick system. Persistent field ticking, channel ticking, cloak drain, energy
  regen, life timers, and status timers should remain explicit phase logic until a smaller shared
  interpreter is proven.
- **Status compression is not an immediate win.** Query ownership now lives in `mechanics/status.ts`,
  but dynamic status state is still many typed-array columns because clone/serialize/hash coverage
  is explicit and benchmarked around stable object shapes. A fixed-width generic status set may be
  worthwhile later, but only after proving it improves readability and does not hide special rules
  such as Matrix HP, Irradiate area damage, cloak drain, Parasite ownership, hallucination lifetime,
  or acid spore stacking.
- **Upgrade tables are already descriptor-like.** `mechanics/upgrades.ts` uses readable rule tables,
  not a large `Kind` switch. Further compression should target repeated lookup shapes only if it
  keeps weapon, armor, range, speed, cooldown, sight, energy, and internal-ammo effects easy to audit.
  Do not replace these tables with a generic stat-modifier DSL unless it remains more readable.
- **Production should remain a small set of explicit modes.** Normal queues, larva/egg production,
  internal ammo, add-ons, structure morphs, Terran construction, Protoss warp-in, Zerg drone morph,
  lift/land, and rally assignment share capability queries, but their timing and side effects differ.
  Migrate capability discovery and placement predicates first; keep completion/timer systems explicit.
- **Command validation is already the public legality gate.** The action mask and smart-command
  surfaces should stay thin validator-backed clients, not be deleted. A one-function `applyCommand`
  is only useful if it removes real duplication without making command family validators harder to
  read. Preserve caller-owned buffers and mask parity tests for RL/app throughput.
- **Pathfinding is already more sophisticated than the outside simplification.** Flow fields,
  16px path cells, unit clearance, line-of-sight shortcuts, local avoidance, movement slots, follow
  plans, worker collision rules, and settle/collision cleanup are current UX/performance features.
  Do not remove them for theoretical simplicity. Any replacement must beat the existing movement
  stress tests, resource-path tests, and benchmarks while preserving the visible movement contract.
- **Entity store registry is intentionally hybrid.** `ENTITY_COLUMNS` correctly drives clone,
  serialize, and hash coverage, but `makeEntities` stays an explicit object literal because dynamic
  construction has measured V8 hidden-class regressions. Do not "simplify" it into a loop unless a
  benchmark proves that old performance finding no longer applies.
- **App simplification must respect the split render/UI architecture.** A single canvas renderer and
  one input handler would conflict with the existing architecture: canvas/WebGL owns the world render
  loop, while Preact/signals owns compact UI chrome. Reduce duplicated command discovery and layout
  waste, but do not collapse UI, input, and rendering into a monolith.
- **Known cross-layer leaks to clean up before broad rewrites:** public barrel exports for system
  helpers should be audited so stable API does not normalize private tick-system ownership. The
  former setup/resource-patch and command-time ability-execution leaks are now closed.

Near-term architecture slices from this review:

1. Move shared resource-patch selection out of `systems/harvest.ts` into a mechanics/resource
   helper so setup, construction, and harvest share the rule without depending on a tick system.
2. Split command-time ability execution from ability ticking: mechanics owns `castAbility` and
   execution applicators; `systems/abilities.ts` owns only energy, cloak drain, effects, channels,
   life timers, status timers, and regeneration ticks. Done.
3. Move weapon on-hit/post-fire applicators and Bunker contained-fire policy behind mechanics
   helpers while keeping combat as the phase interpreter. Done.
4. Continue capability ownership slices only when they delete a duplicated UI/AI/action-mask/
   command rule. Do not add descriptor tables that merely mirror existing data without removing a
   caller-side branch.
5. Delay any shared child-actor interpreter until Scarab, Interceptor, and Spider Mine policy facts
   are complete and focused tests prove the common loop is smaller, faster or neutral, and easier to
   audit than the explicit systems.

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
    `creep.ts`, `addons.ts`, `transforms.ts`, `internal-products.ts`, `actors.ts`,
    `capabilities.ts` if actor facets outgrow one file.
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

### Actor And Tactical Behavior Kernel

The deeper architecture goal is that units, buildings, mines, scarabs, interceptors, spell fields,
transport endpoints, and other temporary objects are all world actors with different capabilities,
not separate engine species. `stepWorld` should remain an explicit deterministic phase scheduler,
but phases should be named after verbs and state transitions rather than unit-specific quirks. A new
system should be added only when it owns a general phase of the world, not because one Brood War
object is awkward.

Principles:

- A dense entity slot is the universal actor representation. A building is an actor with structure,
  footprint, producer, container, add-on, lift, power, or creep capabilities; a mobile unit is an
  actor with movement, weapons, cargo, spells, or production capabilities; a child actor is an actor
  with home/target/lifetime/return/impact policy. The distinction should be data and capabilities,
  not separate control paths.
- `stepWorld` stays as the deterministic ordering contract for replay and performance. The smell is
  not that mines, scarabs, or interceptors appear in the tick pipeline; the smell is when their
  behavior lives as isolated unit-specific systems instead of descriptor-driven actor lifecycle,
  steering, impact, return, and ammo semantics.
- Sim core should execute declared orders and actor policies deterministically. Smarter strategy and
  micro should normally live in controller layers that emit ordinary validated commands, so bot,
  assistive player AI, replay, and future RL can share it. Only low-level BW reflexes that truly
  belong to the game rules, such as target acquisition, weapon cooldowns, interceptor sorties, mine
  wakeup, or scarab impact, belong inside sim phases.
- The hot loop must stay typed-array and grid friendly. Descriptors may choose behavior, but per-tick
  execution should avoid allocation-heavy polymorphism, closures inside entity loops, or controller
  logic hidden in the sim.

Target representation:

- Use **faceted composition**, not inheritance and not one mega optional-field actor object. A `Kind`
  opts into small static facets such as core actor facts, structure facts, producer facts, cargo
  facts, trigger facts, projectile/sortie facts, caster facts, rally facts, and presentation facts.
  Entities remain dense typed-array slots; facets are immutable per-kind rule data.
- Keep readable source rows, then compile them at module load into indexed by-kind facts for hot
  loops. The readable rows are for review; the runtime path should use integer bit flags, small
  numeric arrays, or direct by-kind tables rather than repeated `.find()` calls, object allocation,
  closures, or per-entity polymorphism.
- `ActorCore`: commandable, selectable, normal-combat participant, presentation role, steering owner,
  and internal/projectile flags. This owns generic actor eligibility used by UI, commands, combat,
  render, AI, replay/API validation, and action masks.
- `TriggerFacet`: stationary sensor actors such as Spider Mines. It owns trigger range, target
  policy, wake order, and any future wake cooldown/state. The tick interpreter may stay explicit,
  but it reads policy from the facet.
- `ProjectileFacet` / `SortieFacet`: Scarabs, Interceptors, future spell/projectile markers, and
  other home/target/lifetime actors. It owns lifetime/leash/return/impact policy names and constants,
  while timing-heavy interpreters stay explicit until a shared loop is demonstrably clearer.
- `StructureCapabilityFacet`: footprint actor, producer, add-on parent/child, lift/land, cargo,
  Nydus endpoint, detector/static weapon, power provider, creep provider, resource depot, rally, and
  gather-rally facts. Buildings should become actors by capability, not by building-only branches.
- `ProducerFacet`: products, queue kind, larva/egg/normal/internal product mode, rally policy,
  tech/research producer capability, and busy-state semantics. It should reduce UI/AI/action-mask
  duplication without hiding production timing.
- `ContainerFacet`: capacity, accepted cargo policy, load range, unload range, death behavior,
  contained-fire provider behavior, and Nydus/team transport policy.
- `CasterFacet`: ability list, energy policy, default autocast/AI policy hooks, and research gates
  where those can be represented as facts without duplicating command validation.
- `ActorPresentationFacet`: renderer-neutral math hull links, visible hull/art scaling, health and
  progress bar policy, cloak/illusion opacity, selected/status labels, projectile readability, and
  debug overlays. Math mode remains the oracle for the same actor body that combat, pathing, and
  interaction use.
- `ActorActionFacet`: only after facts have stabilized, name reusable action policies such as weapon
  fire, launch child, apply impact weapon, provide contained fire, produce internal ammo,
  gather/return resources, repair/build, cast, transform, load/unload, and passive aura/field
  effects. Do not introduce this as a generic executor until it deletes real duplication.

Faceted composition requirements and ramifications:

- **No inheritance:** no `Unit`, `Building`, `Projectile`, or race subclasses. Composition is
  per-kind static facts plus dense entity columns. Adding a unit means adding rows/facets, not
  adding a class hierarchy or overriding methods.
- **No optional-field soup:** if a fact family grows beyond a handful of fields, split it into its
  own facet table. `ActorDef` should stay core identity/eligibility, not become the dumping ground
  for production, cargo, spells, rendering, and pathing.
- **One query owner per rule:** command cards, smart-click/desktop controls, AI, action masks,
  replay/API validation, observations, and renderers should call shared facet/validator queries
  instead of rediscovering "can this actor do X?" in their own files.
- **Determinism stays structural:** facet tables are immutable, indexed deterministically, and never
  mutate per tick. Gameplay-affecting dynamic state remains in entity/effect/player typed arrays so
  clone, serialize, hash, and replay do not gain hidden object state.
- **Runtime stays cheap:** hot paths use by-kind numbers and bit tests. Any descriptor-to-index
  compilation happens once at module load. Systems should not allocate policy objects or call
  closures inside per-entity loops.
- **Systems stay verb/phase based:** `stepWorld` remains an explicit deterministic scheduler.
  Facets answer what an actor is and what policies apply; systems still execute movement, combat,
  production, harvest, cargo, abilities, and effects in fixed order.
- **Generic interpreters are earned, not assumed:** merge Scarab/Interceptor/Mine/etc. interpreters
  only when facts have moved out and the merged loop is smaller, faster or neutral, and easier to
  audit against focused tests. Readability beats theoretical unification.
- **BW fidelity has veto power:** if a mechanic has awkward exact rules, represent the awkwardness
  explicitly with a named policy or small interpreter. Do not smooth over carrier bays, scarab dud
  behavior, mine wake/detection rules, larva, add-ons, or Nydus semantics for abstraction symmetry.
- **AI/RL compatibility:** observations and action masks should expose capability facts needed for
  policies without forcing trainers to infer them from kind ids. The same validators remain the final
  legality gate.
- **UI compatibility:** command-card option discovery should flow from facets plus shared command
  validation so every build/train/research/spell/transform/load/rally command the sim supports can
  be discovered and rendered without app-only tables.
- **Math/debug renderer compatibility:** the fallback/math renderer should read presentation and
  footprint facts from the same facet owners used by pathing, selection, command targeting, and
  combat range checks.
- **Reviewability:** every facet migration slice needs a before/after audit showing which duplicate
  rule moved, which callers now share it, and which old branch or shim disappeared. A slice that only
  adds a table without deleting duplicated interpretation is incomplete unless it names the next
  deletion step.

Acceptance criteria for this architecture:

- A new actor-like mechanic can be reviewed from a small number of rows/facets plus, at most, one
  named interpreter policy. The reviewer should not need to chase command cards, AI kind ladders,
  render branches, and validation branches to understand whether it is commandable, selectable,
  targetable, visible, renderable, or legal.
- Existing awkward actors remain faithful: Spider Mines wake and attack only under their BW-like
  target rules; Scarabs keep lifetime, dud, pathing, impact, and splash semantics; Interceptors keep
  launch cadence, leash, orbit, return, bay/ammo restoration, and carrier death behavior; building
  liftoff/landing keeps the "building as actor" model without special UI paths.
- UI discovery improves rather than regresses. If a unit can train, build, research, cast, load,
  unload, rally, gather-rally, lift, land, morph, merge, burrow, cloak, siege, or transform, the
  command surface should be able to discover that through shared capability queries and final
  validators.
- Desktop and mobile controls remain clients of the same command model. Actor facets can inform
  defaults and enabled states, but they must not create separate legality semantics for pointer,
  hotkey, replay, AI, or RL callers.
- The fallback/math renderer remains a correctness tool. Selection circles, footprints, projectile
  bodies, cloaked/illusion presentation, health/progress bars, creep, power, range, and targeting
  overlays should come from canonical sim facts, not app approximations.
- Headless performance does not regress. Any facet query used in movement, combat, visibility,
  harvesting, production, or AI observation must compile to by-kind numeric lookups, bit tests, or
  caller-owned buffers; no per-tick descriptor allocation or dynamic dispatch belongs in hot loops.
- Determinism stays easy to audit. Static facets may change rules, but all dynamic gameplay state
  still lives in typed arrays/effect tables that snapshot, restore, serialize, deserialize, hash, and
  replay can cover directly.
- AI and future RL gain information, not hidden behavior. Bots may use the same capability facts to
  reason about producers, counters, transports, detectors, static defenses, resource depots, and
  casters, but any strategic or micro decision still emits ordinary validated commands.
- Folder organization improves ownership. A slice that moves actor facts should leave imports
  pointing toward the stable concept owner, not create a maze of barrels, compatibility aliases, or
  cyclic dependencies.

Risks to watch during migration:

- A too-general `ActorActionFacet` could become a tiny scripting language that is harder to debug
  than the explicit systems it replaces. Delay it until multiple action interpreters have already
  collapsed naturally.
- A too-wide `ActorCore` could become another optional-field dump. Split facts early when a field
  is only meaningful for structures, production, cargo, spells, triggers, sorties, or presentation.
- A renderer-driven presentation shortcut could desync math mode from interaction math. Presentation
  is allowed to describe visible art, but footprints, ranges, and target bodies remain sim-owned.
- A UI-only or AI-only capability cache could drift from validation. If a convenience cache exists,
  it must be derived from the same facet owners and command validators.
- Over-collapsing systems can hide exact BW behavior. Prefer three short explicit interpreters over
  one opaque generic loop when the generic loop makes Mine/Scarab/Interceptor quirks harder to see.

Migration plan:

- Audit `systems/mines.ts`, `systems/scarabs.ts`, `systems/interceptors.ts`,
  `systems/combat.ts`, `systems/production/*`, `systems/abilities.ts`, and structure mobility for
  common actor lifecycle and action shapes. Do this before rewriting; the goal is to collapse only
  proven duplication.
- First faceted composition pass should split `mechanics/actors.ts` into core actor facts plus
  indexed runtime tables. Preserve readable rows, but expose hot queries through bit flags/direct
  arrays. This should be behavior-preserving and covered by actor commandability, render
  presentation, and command validation tests.
  - First indexed actor pass is done: `ActorDefs` remains the readable review surface, while
    commandability, normal-combat participation, external steering, projectile presentation,
    min-readable radius, trigger lookup, and `ActorDefByKind` now come from compiled by-kind
    arrays/bit flags. No file split was introduced yet because the current actor owner is still
    small; split into `capabilities.ts` only when structure/producer/cargo/caster facets make the
    single file harder to scan.
- Second pass should move Trigger and Projectile/Sortie constants out of isolated systems where it
  improves ownership: Spider Mine trigger facts, Scarab lifetime/impact policy, and Interceptor
  leash/orbit/return policy. Keep the systems as interpreters unless shared execution becomes
  visibly simpler.
  - Projectile/sortie policy slice is done: Scarab lifetime/target/impact policy and Interceptor
    orbit radius, leash range, return range, and orbit offsets now live in actor facets. The Scarab
    and Interceptor systems still own timing-heavy interpretation, target validation, movement, dud,
    splash, bay return, and ammo restoration semantics.
  - Projectile actor solidity slice is done: local avoidance now reads projectile-actor identity
    from `mechanics/actors.ts` instead of hard-coding Scarabs as non-solid ground bodies. Collision
    still consumes the same local-avoidance solidity query, so future projectile actors have one
    actor-metadata owner for this pathing/collision exclusion.
  - Scarab launch ownership slice is done: combat now calls `mechanics/scarab.ts` for Scarab actor
    creation and launch initialization instead of importing from the Scarab tick system. The tick
    system remains the interpreter for travel, dud, impact, and splash behavior.
- Third pass should add `StructureCapabilityFacet` and migrate building facts by category:
  production/rally, cargo/Nydus, power/creep, add-ons/lift, resource depots, static weapons, and
  detectors. Each category should delete at least one duplicated UI/AI/validator/system rule.
  - First producer/rally capability slice is done: `mechanics/capabilities.ts` now owns indexed
    product lists, producer/product legality, worker-rally support, and worker-only producer facts.
    Train validation, command-card train discovery, action-mask train candidates, rally helpers, and
    the macro bot worker-production loop consume the same capability owner instead of reading
    `Units[kind].produces` independently.
  - Research producer capability slice is done: the same capability owner now indexes producer tech
    lists and research producer legality. Research validation, command-card discovery, action-mask
    candidates, and macro research all share that owner instead of independently scanning
    `TechDefs[tech].producers`.
  - Caster capability slice is done: `mechanics/capabilities.ts` now owns per-kind ability lists,
    ability legality, and "has abilities" facts. Ability validation, command-card discovery,
    action-mask candidates, bot caster fact collection, and tactical ability policy checks consume
    that owner instead of reading `Units[kind].abilities` independently.
  - Add-on candidate slice is done: `mechanics/addons.ts` now owns parent-to-add-on candidate lists
    and parent/add-on legality. Add-on validation, command-card discovery, and action-mask
    candidates use that owner instead of maintaining local add-on scans or maps.
  - Worker-build capability slice is done: `mechanics/capabilities.ts` now owns worker-kind build
    candidate lists and worker/structure build legality. Build validation, command-card discovery,
    and action-mask candidates consume that owner instead of reaching into race build lists
    independently.
  - Detector identity slice is done: `mechanics/detection.ts` now owns detector-kind identity.
    Detection rules, tactical AI risk maps, tactical responder scoring, and spell target scoring use
    that owner instead of reading raw detector traits independently.
  - Cargo-capability AI slice is done: tactical threat classification and Nydus shortcut planning
    now consume `mechanics/cargo.ts` transport capacity and cargo acceptance rules instead of
    re-reading raw cargo capacity or rebuilding partial loadability checks in AI code.
  - Product-mode capability slice is done: `mechanics/capabilities.ts` now owns build-method lookup
    and larva-product classification. Macro scheduling, train failure reporting, and supply/army
    production decisions use that owner instead of reading raw product build methods in AI code.
  - Small-static-defense capability slice is done: `mechanics/capabilities.ts` now owns the
    small-static-defense classification used by macro placement, so harvest-corridor placement
    penalties no longer depend on an AI-local turret/cannon/spore kind set.
  - Direct-weapon capability slice is done: `mechanics/capabilities.ts` now owns direct weapon
    identity. Combat participation prechecks, smart travel attack-move fallback, bot army fact
    collection, tactical ability scoring, and targeted attack validation use that owner instead of
    re-reading `weapon || airWeapon` in caller code. Carrier remains the explicit non-direct weapon
    attacker and is validated through ready Interceptor/internal-product mechanics.
  - Base-depot capability slice is done: `mechanics/capabilities.ts` now owns normal base depot
    identity for bot expansion and visible enemy-base tracking, preserving the distinction that
    Infested Command Centers are not ordinary expansion depots.
  - Resource patch selection slice is done: `mechanics/resources.ts` now owns resource docking,
    mineral saturation, explicit-target spreading, and auto-mining patch selection. Setup,
    construction worker release, harvest retargeting, and production gather-rally now share the
    same resource mechanic instead of importing the harvest tick system.
  - Ability execution ownership slice is done: `mechanics/ability-execution.ts` now owns
    command-time `AbilityExecution` interpretation, status/restore/marker/buffer applicators,
    point drains, Recall placement, target conversion/spawn/transform, effect spawning, nuke
    consumption, and cast cost/facing. `systems/abilities.ts` now owns only ticking behavior:
    persistent effects, target channels, DOTs, hallucination/life timers, cloak drain, energy
    regeneration, status timers, regeneration, and aura refresh.
- Fourth pass should make command option discovery and command-card rendering consume facets plus
  shared validators, closing gaps where the sim can perform actions the UI cannot discover.
- Fifth pass should expose relevant capability facts to AI/RL observations and masks so bots and
  policies can reason about producers, transporters, static defenses, detectors, and spellcasters
  without hard-coded kind ladders.
- Sixth pass, only after facts stabilize, should evaluate whether any explicit systems can merge.
  Candidate merges must be proven with replay/hash tests, focused mechanic tests, and benchmarks;
  otherwise leave the small systems alone.
- First descriptor ownership slice is done: `mechanics/actors.ts` now owns Scarab and Interceptor
  actor metadata for commandability, normal combat participation, lifecycle, steering,
  external-system steering, presentation, and readable projectile radius. Existing Scarab and
  Interceptor systems remain the interpreters until a shared actor lifecycle interpreter is proven
  smaller and easier to audit. The follow-up alias cleanup is also done: app, tests, renderers, and
  the package barrel now use actor terminology directly, with no retired compatibility exports left
  in the actor owner.
- Fold Scarab and Interceptor steering only if the shared interpreter is smaller and easier to audit
  than two tiny systems. It must preserve Scarab dud/impact behavior, pathing around terrain, splash
  falloff, Interceptor launch cadence, orbit motion, leash, return-to-bay, ammo restoration, and
  serialization/hash determinism.
- Fold Spider Mine wakeup into the same actor-lifecycle vocabulary only after proving the trigger
  phase can express "stationary burrowed sensor becomes normal attacker" without hiding the BW rules
  for detection, air exclusion, target validity, wake range, and splash.
  - Descriptor proof slice is done: Spider Mine now has actor metadata for non-commandability,
    stationary-trigger lifecycle, normal post-wake combat participation, trigger range, target
    policy, and wake order. The explicit mine tick remains the interpreter until a shared actor
    lifecycle loop is demonstrably clearer than the current short deterministic scan.
- Treat buildings as actors with capabilities: production, add-ons, lift/land movement, cargo,
  Nydus transport, detector/static weapon, power/creep provider, resource depot, and rally/gather
  policy. Avoid building-only special cases when the same capability could be read from data.
- Keep command validation as the public legality gate. Actor descriptors may answer "can this actor
  ever do X?", but concrete legality still flows through `validateCommand` so UI, AI, replay, and
  action masks cannot drift.
  - Actor commandability gate slice is done: shared receive-order validation and Stop validation now
    reject non-commandable actors from `mechanics/actors.ts`, with coverage across move,
    attack-move, patrol, attack, hold, and stop commands. The stale per-command Spider Mine guards
    in move, patrol, and hold validation have been deleted, leaving actor commandability as the
    single owner for non-commandable actor rejection.
- Add actor lifecycle tests before deleting existing systems: descriptor coverage, replay/hash,
  snapshot/restore, render presentation, action-mask/observation visibility where relevant, and
  focused behavior tests for each old quirk.
- After actor descriptors are stable, reorganize folders so actor lifecycle lives under
  `mechanics/actors.ts` or `entity/actors.ts`, while tick interpreters live under verb systems such
  as `systems/actors/child.ts`, `systems/combat`, `systems/production`, and `systems/effects`.

Tactical micro roadmap:

- Smart army behavior should be a controller/micro layer over ordinary commands, not hidden magic
  inside `stepWorld`. The same code should be usable by the built-in bot, optional player assist,
  scripted benchmarks, and future RL baselines.
- Add a `MicroDirector` after the intent/scheduler layer. It consumes `BotFacts`, risk fields,
  terrain/choke analysis, unit capabilities, cooldowns, ranges, current orders, and squad
  reservations, then emits validated move/attack/hold/patrol/spell/load/unload commands.
- Ranged micro should be expressed as reusable policies: focus fire by time-to-kill and overkill
  budget; stutter/kite when weapon cooldown, speed, and range advantage allow it; fall back to a
  choke or friendly static field when local risk is too high; clump only when surrounded or when
  splash risk is low; spread when enemy splash/area spells dominate; hold position when rooted fire
  and body blocking are advantageous.
- Melee micro should be expressed as surround and flow policies: assign deterministic surround slots
  around target bodies, route around occupied slots, peel excess units toward secondary targets,
  avoid over-clumping through chokes, and preserve pressure when the perfect surround is impossible.
- Terrain-aware decisions should consume shared spatial fields: choke width, high/low ground,
  threat ranges, static fields, friendly coverage, retreat vectors, route congestion, and unknown
  fog. The micro layer should choose between engage, kite, hold, flank, surround, retreat,
  counterattack, load/unload, or spell support without writing unit-name ladders.
- Attack-move remains the simple sim order. Smart attack-move behavior is a controller policy that
  may retask a squad over several ticks, so player commands, bot commands, replay, and RL all see the
  same explicit command stream. If a future optional "smart command assist" is added for players, it
  should use the same MicroDirector and be visible in replay inputs rather than mutating units
  invisibly inside combat.
- Benchmark micro separately from sim stepping: scenario lanes for marine-vs-zergling kiting,
  ranged concave/focus fire, melee surround, choke hold, retreat under superior range, drop response,
  minefield avoidance/clearing, and mixed army spell support. Metrics should include commands
  emitted, unit survival, damage dealt, overkill, pathing pressure, and ticks/sec.

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
    acid spores, and suicide attackers now dispatch through mechanic-id applicator maps owned by
    `mechanics/weapons.ts` instead of combat-local helpers.
  - Contained-fire policy slice is done: Bunker/provider target eligibility, nearest contained-fire
    target selection, dark-swarm checks, contained-unit cooldowns, and contained weapon hits now
    live behind mechanics-owned helpers. Combat still owns the deterministic engagement phase and
    only delegates provider-specific firing policy.
    Remaining work: consider whether delivery modes (scarab launch and interceptor launch) can
    share an equally small dispatch shape without hiding their timing and target-acquisition
    differences.
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
      - Pressure-scheduler result slice is done: `schedulePressureOffense` now returns its decision,
        focus, issued flag, and builder state, so later harass/counterattack directors can compose
        with forced pressure instead of rediscovering or ignoring it.
      - Memory ownership slice is done: `packages/ai/src/macro-memory.ts` owns controller memory
        state and initialization, so commitment pressure, tactical incidents, and the live bot share
        one deterministic memory contract instead of routing memory through fact collection.
      - Aggressive-baseline test slice is done: `packages/ai/test-support/aggressive-bot.ts`
        provides a deliberately simple four-Barracks Terran pressure controller that keeps SCVs and
        Marines queued, builds Depots ahead of cap pressure, grows toward four owned-or-pending
        Barracks, streams Marines at the enemy depot, and shares normal command validation. The live
        bot now has a deterministic multi-tick regression test proving it keeps producing combat
        responses against that baseline instead of freezing while pressure arrives.
      - Four-rax baseline hardening slice is done: the pressure bot no longer considers actively
        building or repairing SCVs available for new structures, and the multi-tick pressure
        regression now proves the opponent actually reaches four Barracks instead of only issuing
        opening build commands.
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
      - Combat-reserve seam slice is done: tactical defense now returns a named `CombatReserve`
        instead of attack-wave-specific candidates, and pressure scheduling consumes that reserve
        with an explicit commitment force. Lower-priority harass, scout, and counterattack directors
        should spend this same reserve shape as they become real intent executors.
      Remaining reservation work: expose leftover force to lower-priority harass, scout, and
      counterattack directors as those directors become first-class intents.
    - Tactical scheduler extraction slice is done: deriving remembered incidents, selecting
      defenders, pulling emergency workers, casting defensive abilities, and emitting defense
      engagements now live in `packages/ai/src/macro-tactics.ts`, leaving the live controller to
      schedule the returned incident plus leftover attack candidates.
    - Incident ownership slice is done: tactical incident types, severity derivation, remembered
      incident expiry, response budgeting, responder ranking, and responder commitment now live in
      `packages/ai/src/macro-incidents.ts`; `macro.ts` keeps the fact/risk collection surface.
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
    - Risk ownership slice is done: `packages/ai/src/macro-risk.ts` now owns the risk-map type,
      risk-map construction, and layer read helpers; facts choose whether to build the full map or
      cheap omitted map, while incidents and pressure consume risk through the shared risk module.
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
    - Memory ownership slice is done: `packages/ai/src/macro-memory.ts` owns `BotMemory` and
      `createBotMemory`; facts, incidents, pressure, tactics, offense, and the live controller now
      import that contract directly.
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
    `defend-base`, `get-detection`, `clear-site`, `evacuate-workers`, `rebuild-tech`,
    `add-production`, `expand`, `spend-larva`, `train-counter`, `research-upgrade`, `scout`,
    `attack-wave`, `harass`, `contain`, `counterattack`, and `retreat`.
    - Intent-vocabulary registry slice is done: `BOT_INTENT_KINDS` now owns the runtime vocabulary
      for reflex and proactive directors, including scout, contain, counterattack, and worker
      evacuation. Remaining work: make directors emit these intents instead of scheduling directly.
    - Pressure-intent result slice is done: pressure scheduling now reports the intent it satisfied,
      classifying normal waves as `attack-wave`, forced under-threshold pressure as `harass`, and
      defense-time leftover pressure as `counterattack` while preserving the existing command output.
    - Pressure director/executor split slice is done: pressure now has a proposal step that chooses
      intent/focus without emitting commands and an executor step that consumes the proposal to issue
      validator-backed combat commands. The old scheduler remains as a thin wrapper while the live
      bot migrates one director family at a time.
    - Live pressure-director migration slice is done: the built-in bot now calls the pressure
      proposal and executor phases directly, making pressure the first live path with the intended
      director/executor shape while preserving the wrapper for tests and external callers.
    - Tactical-defense director/executor split slice is done: incident choice now has a proposal
      phase and responder command emission has an executor phase. The live bot consumes that boundary
      directly, so defense and pressure now share the same top-level controller shape.
    - Tactical-defense intent slice is done: defense proposals now translate incidents into shared
      `BotIntent` rows (`defend-base`, `get-detection`, or `clear-site`) before execution spends
      responders, giving the scheduler-visible vocabulary a second live producer after pressure.
    - Macro intent-surface slice is done: the macro scheduler now returns shared `BotIntent` rows
      derived from the macro commands it emitted (`expand`, `add-production`, `rebuild-tech`,
      `research-upgrade`, `spend-larva`, and `train-counter`), giving future arbitration a live
      macro vocabulary without changing command ordering yet.
    - Live planner-intent seam slice is done: `createBotPlanner` now returns both commands and a
      sorted director-intent list while `createBot` remains the command-only controller. Macro,
      tactical defense, and pressure intents can now be inspected together without changing current
      command ordering or introducing a parallel scheduler.
    - Live intent-outcome slice is done: planner turns now also return sorted `{ intent, result }`
      records, marking macro intents done when command emission created them and marking tactical or
      pressure intents done only when their executor emitted commands. This gives the future
      scheduler a regression surface for "proposed but no actor moved" failures.
    - Waiting-pressure outcome slice is done: below-threshold pressure now produces a visible
      `attack-wave` / `counterattack` intent with a `waiting: insufficient-force` result instead of
      vanishing until the commitment timer fires, while committed pressure that cannot issue is
      classified as blocked for the future scheduler.
    - Tactical-outcome reason slice is done: tactical defense outcome classification now lives with
      the tactical executor, so `get-detection` waits report `missing-detection` while ordinary
      `defend-base` / `clear-site` no-command outcomes remain `insufficient-force`.
    - Intent-outcome memory slice is done: planner outcomes now feed deterministic `BotMemory`
      bookkeeping for suspected invisible threats and blocked map locations. Remaining work:
      expansion and route executors still need to emit real blocked/unsafe/occupied outcomes and
      directors need to consume those remembered locations when choosing follow-up intents.
    - Expansion blocked-site consumer slice is done: macro expansion and lifted island landing now
      skip sites remembered as blocked in `BotMemory`, while keeping the same shared placement
      validator for the selected fallback site. Remaining work: expansion executors still need to
      report blocked/unsafe/occupied outcomes when placement or routes fail live.
    - Expansion blocked-outcome slice is done: failed live expansion placement now surfaces a blocked
      `expand` intent result instead of disappearing as "no macro command", and the planner feeds
      that outcome into the same intent-memory path. Remaining work: route/path failures and truly
      unsafe expansion sites still need their own outcome sources.
    - Expansion no-builder outcome slice is done: expansion attempts now use a generic optional
      outcome record and report `waiting: no-builder` when the bot wants a base, has a viable site
      and bank, but no available worker builder. Remaining work: macro directors still need explicit
      outcomes for resource starvation, supply blocks, and occupied producers where those states are
      genuinely actionable.
    - Army-training outcome slice is done: failed army production now reports `train-counter` /
      `spend-larva` waiting outcomes for resource starvation, supply blocks, missing producers, and
      occupied production capacity after the normal validator-backed training path fails. Remaining
      work: worker, research, add-on, morph, and tech-structure directors still need similarly
      explicit outcomes where they are actionable.
    - Worker-training outcome slice is done: successful worker production now surfaces a
      `train-worker` intent, and failed worker production reuses the shared train-failure classifier
      for resource starvation, supply blocks, and occupied producer capacity. Remaining work:
      supply/build, research, add-on, morph, and tech-structure directors still need explicit
      outcomes where they are actionable.
    - Research-outcome slice is done: research intents now carry `targetTech`, and the research macro
      reports waiting outcomes for missing prerequisite producers, resource starvation, and occupied
      research capacity when it cannot queue any upgrade/spell research. Remaining work: supply/build,
      add-on, morph, and tech-structure directors still need explicit outcomes where actionable.
    - Add-on outcome slice is done: Terran add-on macro now reports `add-production` outcomes
      for missing prerequisites/parents, resource starvation, occupied add-on slots, and blocked
      add-on placement after the normal validator-backed add-on queueing path fails. Remaining work:
      supply/build, morph, and tech-structure directors still need explicit outcomes where actionable.
    - Supply/build outcome slice is done: supply structures, first army production structures,
      Protoss/Zerg tech structures, Terran/Protoss anti-float capacity, and Zerg macro Hatcheries
      now use the richer shared structure-queue result so resource starvation, missing builders,
      missing prerequisites, and placement availability are visible to intent results.
    - Morph-outcome slice is done: Zerg unique tech morphs and Hydralisk-to-Lurker morph attempts
      now return validator-backed intent results for missing prerequisites/tech, resource starvation,
      supply blocks, and busy morph sources. Non-actionable "no source unit exists yet" cases stay
      quiet so earlier macro/tech directors can own the prerequisite work.
  - A reservation/scheduler pass owns minerals, gas, supply, producers, larvae, builders, army
    squads, spell casters, and locations for the current command batch. Lower-priority intents see
    only the remaining budget, so emergency defense/rebuilds cannot be starved by upgrades, and
    one producer/builder cannot be overbooked before the sim applies commands.
  - Executors are the only layer that emits `Command`s. They must use `validateCommand` and shared
    command helpers so AI, UI, replay, and future RL masks keep one legality surface.
  - Intent outcomes should be explicit: `done`, `waiting`, `blocked`, or `failed`. Avoid encoding
    every weird case directly; classify failures as `unsafe-location`, `occupied-location`,
    `missing-detection`, `missing-prerequisite`, `insufficient-force`, `no-builder`, `no-producer`,
    `no-production-capacity`, `placement-unavailable`, `supply-blocked`, `resource-starved`, or
    `path-blocked`, then let directors react with follow-up intents.
  - Macro placement is an optimization problem, not a blocked-site generator. Placement search should
    enumerate legal grid anchors first, then score them deterministically: preserve passable rings
    around production/tech buildings, leave worker and army lanes open, keep macro/tech/production
    buildings out of the depot-to-mineral and depot-to-gas harvesting corridors, maintain add-on
    clearance, prefer compact bases, intentionally wall at chosen choke points, keep defensive ground
    structures covering ramps/resources/approach vectors, avoid trapping future expansions, and
    optionally use the risk matrix to bias builders away from dangerous routes. Small static defenses
    such as Missile Turrets, Photon Cannons, and Spore Colonies may sit between a mineral field and the
    depot only when their footprint is small enough that the pathing/cadence model says worker travel is
    unaffected or acceptably unchanged; otherwise they should tuck beside or behind the mineral line.
    A failed generic macro spot search
    reports `waiting: placement-unavailable`; only exact-target lifecycle intents such as expansion
    sites should emit blocked location memory.
    - First macro-placement scoring slice is done: generic spot search now enumerates all legal
      nearby anchors and picks the best deterministic score instead of returning the first legal ring
      tile. The scorer penalizes base resource reservations and depot-to-resource harvest corridors,
      with smaller penalties for compact static defenses, while all build legality still flows
      through the shared sim placement validator. Remaining placement work: score passable building
      rings, add-on clearance, wall/choke intent, defensive coverage, route risk, and cadence-aware
      exceptions for mineral-line static defenses.
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
  - First fact/risk slice is done: `packages/ai/src/macro.ts` now owns the deterministic bot memory
    shape, `BotFacts`, fog-aware visible enemy collection, completed-or-pending structure summaries
    for rebuild planning, and a compact weapon-risk tile matrix that covers visible map state or the
    whole map in god-vision mode.
  - Intent-vocabulary ownership slice is done: `packages/ai/src/macro-intents.ts` now owns bot
    intent kinds, failure reasons, intent rows, and intent results, giving future directors a pure
    type home instead of packing future scheduler language into the facts/risk module.
  - Incident ownership slice is done: `packages/ai/src/macro-incidents.ts` now owns tactical
    incident derivation, memory expiry, response budgeting, responder ranking, and responder
    commitment, leaving `macro.ts` focused on facts/risk and controller memory.
  - Risk ownership slice is done: `packages/ai/src/macro-risk.ts` now owns the risk-map type,
    construction, and read helpers, leaving `macro.ts` to collect facts and opt into full or omitted
    risk per caller.
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
- Moved the bot intent/failure vocabulary into `packages/ai/src/macro-intents.ts`, leaving
  `macro.ts` focused on facts, memory, risk, and tactical incidents.
- Moved tactical incident derivation, memory, response scoring, response budgeting, and responder
  commitment into `packages/ai/src/macro-incidents.ts`, leaving `macro.ts` focused on facts/risk and
  controller memory.
- Moved bot risk-map type, construction, and read helpers into `packages/ai/src/macro-risk.ts`,
  leaving fact collection to choose full versus omitted risk without owning the risk algorithm.
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
- Moved shared weapon-hit resolution and splash falloff geometry under `mechanics/weapon-hit.ts`,
  deleting the tick-system-shaped helper so combat, abilities, Scarab impact, and focused tests read
  the real mechanic owner.
- Split reusable status queries into `mechanics/status.ts`: disabled-state checks and effective
  speed/sight/cooldown now belong to mechanics, while `systems/status.ts` only ticks timers,
  regeneration, and velocity clearing.
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
- Promoted Scarab and Interceptor descriptors from child actor terminology to actor metadata under
  `mechanics/actors.ts`, adding explicit lifecycle and steering fields, deleting the temporary
  old-path module, and migrating app/tests/renderers off the old public names.
- Added Spider Mine to the actor descriptor table with indexed actor lookup, descriptor-owned wake
  range/target/order metadata, and app selection coverage proving non-commandable actors do not
  steal hit tests.
- Routed non-commandable actor metadata through public command validation, so internal actors are
  rejected consistently by UI, replay/API command ingestion, and shared command-family validators.
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
