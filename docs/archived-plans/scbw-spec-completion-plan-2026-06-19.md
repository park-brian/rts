# Archived SC:BW Spec Completion Plan

This is the execution plan for turning the current playable RTS slice into a much fuller
StarCraft: Brood War-style ruleset while preserving the project's core constraints:
deterministic TypeScript sim, fixed-point integer state, typed-array hot loops, replayable command
streams, mobile-first UX, and high headless throughput for AI training.

## Current Baseline

- Three-race unit/building data exists for most Terran, Protoss, and Zerg roster entries.
- Core economy, construction, production queues, harvesting, movement, collision, fog, replay,
  serialization, deterministic hashing, combat, and scripted AI exist.
- A generic ability framework exists for several major spells: Stim, EMP, Storm, Matrix,
  Irradiate, Lockdown, Yamato, Feedback, Stasis, Maelstrom, Disruption Web, Spawn Broodling,
  Ensnare, Plague, Consume, Dark Swarm, active cloak, Scanner Sweep, and Arbiter cloak aura.
- Gaps are now mostly shared-system gaps, not just missing data.

## Execution Rules

- Keep mechanics data-driven first. Add systems only when data cannot express the rule.
- Preserve deterministic replay/hash behavior. Any gameplay-affecting state must be cloned,
  serialized, and hashed.
- Avoid app-only command logic. UI, AI, replay, network, and future RL masks must share command
  validation semantics.
- Keep hot-loop work proportional to local activity. Full entity scans are acceptable for rare
  spell/research ticks, but combat/movement/visibility must stay grid- or typed-array-friendly.
- Each slice ends with targeted tests plus `npm run typecheck` and `npm test`; app-facing slices
  also run `npm run build:app` and the repo screenshot flow when relevant.

## Phase 1: Tech, Research, And Upgrade Spine

Status: foundation complete.

Purpose: create one authoritative model for what each player has unlocked. This unblocks
researched spells, weapon/armor upgrades, caster energy upgrades, mobility/range upgrades, AI
action masking, and command-card availability.

Implementation:

- Add a `Tech` enum and `TechDefs` table in `packages/sim/src/data.ts`.
- Represent per-player completed tech levels in a compact typed array on `Players`.
- Add per-producer research queue columns to `Entities`.
- Add a universal `research` command.
- Add a `systems/research.ts` tick that completes research/upgrade work.
- Add validation for producer, affordability, prerequisites, duplicate/in-progress research, max
  level, and incomplete producers.
- Gate abilities through `AbilityDef.tech` where SC requires research.
- Preserve tech/research state in clone/hash/serialize/replay.
- Add tests for successful research, duplicate rejection, ability unlock gating, serialization,
  and deterministic replay.

Done when:

- A researched ability is rejected before research and accepted after completion.
- A multi-level upgrade can progress one level at a time and rejects after max level.
- Snapshot/restore preserves tech levels and in-progress research.

Completed:

- Added the full `Tech`/`TechDefs` catalog from the SC spell/upgrade docs.
- Added per-player completed tech levels and per-producer research queues.
- Added the universal `research` command and deterministic research tick system.
- Added validation for producer, affordability, prerequisites, duplicate/in-progress research,
  max level, and incomplete producers.
- Gated researched abilities through shared validation.
- Updated scripted AI to avoid emitting researched abilities before unlock.
- Preserved tech/research state through clone, hash, byte serialization, and replay parsing.

## Phase 2: Generic Mobile Command Card And Target Modes

Status: first pass complete.

Purpose: make all engine commands usable without drilling, ambiguity, or one-off buttons.

Implementation:

- Replace lossy UI fields such as `selProducer`/`selCanStim` with a capability summary:
  selected count, mobile count, structure count, workers, producers, trainable kinds, buildable
  kinds, castable abilities, researchable tech, and armed target mode.
- Use the same sim validation helpers to decide button enabled/disabled state.
- Add generic ability buttons from `Abilities`, grouped as self, entity-target, point-target, and
  toggle.
- Add generic research/upgrade buttons from `TechDefs`.
- Keep the tap grammar simple:
  - tapping owned selectable entities selects them;
  - explicit target modes consume the next world tap;
  - selected mobile units ground-tap move/attack/harvest;
  - selected structures ground-tap rally only when no mobile command can apply or rally mode is
    explicitly armed.
- Add first-pass control groups as simple chips: tap selects, long press or explicit bind saves,
  double tap jumps camera.

Done when:

- Mixed selections never depend on Set iteration order.
- Multiple selected buildings can train/research through a clear primary or aggregate rule.
- Any implemented spell can be cast by a human player through a command-card target mode.

Completed:

- Replaced last-producer/last-kind command-card state with explicit selection capabilities:
  trainable kinds, castable abilities, researchable tech, worker build availability, and rally
  availability.
- Added generic ability command-card buttons:
  - self abilities fan out to every valid selected caster;
  - point/entity abilities arm one target mode and choose the closest valid selected caster;
  - owned entity taps can be used as spell targets instead of accidentally selecting.
- Added generic research command-card buttons routed through selected producer validation.
- Made build placement, rally, attack-move, and ability target modes mutually exclusive.
- Switched app train/research/ability command emission to use sim validation as the source of
  truth wherever a full command can be formed.
- Added app tests for self abilities, point abilities, entity abilities on owned targets, and
  selected-structure research.
- Added playable match setup for race/team size/human slot selection, race-aware bot creation,
  race-preserving replays, and worker build palettes that expose each race's tech-tree buildings
  from the command card.
- Added generic transform/morph command-card buttons from the shared transform validator, so
  Lair/Hive/Greater Spire/Sunken/Spore/Lurker/Guardian/Devourer only appear when their tech,
  prerequisites, queue state, and resources allow them.
- Normal pointer taps on empty ground now issue plain `move`; attack-move is explicit through the
  command card so mobile-first tap behavior stays unambiguous.
- Armed attack-move taps now share one explicit command grammar: enemy entity taps queue validated
  targeted `attack` commands, ground/neutral taps queue point `amove`, and friendly/allied entity
  taps reject without clearing the armed command. Desktop `A` plus left-click uses the same path,
  while right-click remains the smart-command grammar.
- Structure rally now supports point, unit, building, and resource targets through the shared
  `rally` command/replay path. Rally mode snaps to valid entity targets, production resolves live
  target positions, and invalid entity rallies retarget to the nearest valid rally entity instead
  of collapsing to a stale point.
- Production rally now resolves to command-equivalent default intents: armed units attack-move
  toward point/unit/resource rallies with the same deterministic ground slot spread as direct
  movement batches, workers use resource rallies as gather orders, and loadable structure/unit
  rallies pull eligible produced units into cargo when capacity and range allow it.
- Unit-target rally rendering now uses the same sim rally resolver and draws a yellow target ring
  around the resolved rally target.
- Added a top-bar Math renderer toggle that forces the Canvas2D footprint-reference renderer,
  drawing exact structure/resource tile footprints, unit interaction-radius circles, and BW body
  boxes without depending on SVG art metadata.
- Build placement now uses a pointer-down / drag / pointer-up ghost flow backed by shared
  placement validation, so a build command is only queued on release when the snapped footprint is
  valid.
- The Math renderer draws that placement footprint ghost and dims cloaked entities to 50 percent
  opacity while keeping selection and health affordances readable.
- Worker build and repair activity now renders localized sparks in both the GL renderer and the
  Math renderer, derived from existing worker orders and target state without adding sim state.
- Carriers can now build Interceptors as internal ammo through the shared producer queue, with
  base and Carrier Capacity-upgraded limits enforced by shared validation.
- Added a switchable desktop control scheme beside the mobile grammar: left click selects, right
  click smart-commands, desktop command hotkeys are remappable/persisted locally, and the setup UI
  exposes the bindings without changing the sim command surface.
- UI chrome invariant: top and bottom panels must reserve layout space and never occlude the
  playable game viewport or game-space UI. Selection boxes, placement ghosts, minimap interaction,
  edge pan, and world rendering must all use the unobscured canvas bounds.
- Desktop HUD target: desktop mode should move toward a StarCraft-like command console with
  minimap on the left, selected unit/building state in the center, and hotkey-labeled commands on
  the right. Mobile mode keeps the compact thumb-friendly command rail.
- Selected entity bars: health/progress bars belong above the actual visible selected
  unit/building body in the world render, not in a detached debug panel. Incomplete selected
  buildings use the same bar slot for construction progress; unselected entities do not show bars.
- Control groups are required for desktop fidelity: Ctrl+1-0 assigns current selection, 1-0
  recalls, Shift+1-0 adds the group to the current selection, and a rapid repeat centers the
  camera on the recalled group.
- Full tech-tree UI coverage means every valid sim command needed to build out the tree must be
  reachable from the command card: worker structures, production, research/upgrades, spells,
  morphs/merges, Terran add-ons, and Terran lift/land. Command availability must continue to flow
  through shared validation rather than app-only prerequisites.
- Screenshot review compacted desktop chrome to a 46px top bar and a reserved fixed-height bottom
  console, with fixed command cells on the right so the playable viewport is never occluded.
- Lifted Terran structures now treat `land` as a landing move intent: they stay airborne, fly
  through the normal movement system, re-check the snapped footprint on arrival, then restore
  landed structure roles without per-tick landing scans.
- Build placement now renders shared Creep and Pylon power field overlays from sim helpers,
  including candidate provider rings for Creep-spreading Zerg structures and new Pylons.
- The app screenshot harness now captures dedicated placement-overlay reference shots for Pylon
  power and Zerg creep.
- Command-card options now include unavailable but relevant build/train/research/add-on/transform
  and ability actions, with short disabled reasons derived from shared validation results.
- The screenshot harness now captures a disabled command-card reference state.
- Command-card rendering now groups commands into compact Train/Build/Tech/Cast/Orders/Select
  sections, keeps mobile and desktop panels fixed-height, and uses horizontal capacity instead of
  adding modal drill-down.
- The screenshot harness now captures crowded mobile and desktop command-card reference states.
- Desktop edge panning now uses the visible viewport edges instead of stale canvas-local bounds,
  desktop middle-button drag pans the camera, control-scheme changes resize the playfield, and
  the game canvas is explicitly sized between reserved top and bottom chrome.
- GL and Math renderers now draw selected bases from authoritative gameplay unit radius and
  building/resource footprint metadata, so the fallback renderer remains the exact footprint
  reference instead of following sprite art bounds.
- Selection hit-testing, drag-box selection, and double-click all-by-type selection now use the
  same gameplay hulls shown by Math mode: mobile body bounds for units and exact tile footprints
  for structures/resources. Pointer-up tap dispatch preserves the pointer-down entity hit so moving
  targets cannot outrun a clean click.
- Desktop command chrome now separates minimap, selected-entity status, and commands into fixed
  columns; commands flow through a two-row grid before horizontal scrolling, so control-group text
  and command buttons cannot overlap. Build command labels use the section label for the verb
  instead of repeating `Build` on every building button.
- The HUD publish pass now emits a compact selected-entity status snapshot with current
  construction, production, or research progress plus upgraded HP, armor, weapon, speed, and sight
  stats, derived from the same sim tables and upgrade helpers used by combat, movement, and
  validation.
- Desktop control groups now have visible chips for `1`-`0` in the selected-entity panel. Chips
  show live group counts, click/tap recalls assigned groups, empty chips bind the current
  selection, Shift-click appends, and Ctrl/Cmd-click overwrites through the existing
  `assignControlGroup` and `recallControlGroup` paths.
- Desktop and mobile command chrome now share one responsive fixed-cell command table instead of
  scroll rails. The table reserves exact cells from viewport/chrome metrics, keeps selection
  status compact, pages overflow in-place, and avoids overlapping group chips or command buttons.

Remaining:

- None in the current Phase 2 scope.

## Phase 3: Remaining Spell Families

Status: complete.

Purpose: complete the spell roster with shared primitives instead of bespoke code per spell.

Implementation:

- Terran:
  - Medic Heal autocast/manual support with energy-per-HP accounting.
  - Restoration status cleanse.
  - Optical Flare permanent sight/detector suppression until Restoration.
  - Nuclear Strike as a queued/channelled ability consuming a silo missile.
- Protoss:
  - Hallucination copies with illusion damage/expiry semantics.
  - Recall teleports eligible friendly units around the target point to the Arbiter.
  - Mind Control changes ownership and clears caster shields.
  - Shield Battery shield restore.
- Zerg:
  - Parasite as permanent target vision.
  - Infest Command Center under half HP.
  - Broodling timed life.
- Extend AI tactical casting to use every ability where useful.

Done when:

- Every spell in `docs/research/sc1-spells-upgrades.md` has data, validation, execution, and tests.
- AI emits at least one sensible test-covered use for each tactical spell.

Completed:

- Added Medic Heal, Restoration, and Optical Flare.
- Added Queen Parasite.
- Added Arbiter Recall.
- Added Dark Archon Mind Control.
- Optical Flare now reduces sight and disables detector coverage until Restoration.
- Parasite now grants vision from the target and detector coverage when the parasited target is
  a detector.
- Entity-target "any team" spells now still require detection before targeting cloaked enemies.
- Scripted AI now uses Heal, Restoration, Optical Flare, Parasite, Recall, and Mind Control.
- Added sim and AI tests for the new spell behaviors.
- Added Hallucination, Infest Command Center, and timed Broodling/Hallucination lifetimes.
- Hallucinations no longer consume supply, deal no weapon damage, and expire.
- Scripted AI now uses Hallucination and Infest Command Center.
- Added Nuclear Strike as a delayed channelled Ghost ability that consumes a completed Nuclear
  Missile, creates a warning effect, deals large area damage, and cancels if the Ghost is
  interrupted or killed.
- Added a channel `Cast` order so delayed abilities can suppress normal combat without adding hot
  combat-path scans.
- Added Shield Battery shield recharge with validation, execution, and scripted AI support.
- Fixed hallucination weapon damage so the double-damage rule is applied once, not twice.
- Scripted AI now uses Nuclear Strike when missile ammo is ready and enemy value justifies it, and
  recharges damaged Protoss shields with Shield Batteries.
- Nuclear Silos now build one internal missile ammo through the shared producer/ammo path, Ghost
  Nuclear Strike validation consumes that silo ammo, and the command card surfaces `Arm Nuke`,
  `Arming Nuke`, `Nuke Ready`, and `No Nuke` states without app-only command rules.
- The app screenshot harness now captures a Nuclear Silo ready-missile command-card reference.
- Known own/team/spectator Hallucinations now have shared app presentation: selection labels use
  the Hallucination prefix, GL and Math renderers tint/alpha them consistently, and enemy viewers
  still see ordinary units.
- Hallucinated workers, producers, casters, transports, burrowers, mine layers, and morph/merge
  units now reject real utility, production, or state-changing commands through shared validation,
  while retaining decoy move/attack orders.
- The command card hides worker utility affordances that are impossible because the selected worker
  is a Hallucination, and the screenshot harness captures the selected-Hallucination reference.
- Weapon damage against Hallucinations now uses the shared source-type pipeline: damage type,
  target size, weapon upgrades, multi-shot armor, shields, matrix absorption, and acid spores all
  resolve normally before the Hallucination double-damage rule is applied once per hit.
- Firing ground units now become pathing/collision anchors only during a short active firing
  lockout instead of their full weapon cooldown; sustained fire still blocks and routes movers,
  while a single shot releases before the weapon is ready again.

Remaining:

- None in the current Phase 3 scope.

## Phase 4: Upgrade Effects In Combat, Movement, Vision, And Energy

Status: partial.

Purpose: make completed upgrades actually affect gameplay.

Implementation:

- Weapon upgrades: apply per-race/per-domain damage bonuses before type multipliers.
- Armor/plating/carapace/shield upgrades: apply per-hit reductions and shield armor.
- Range upgrades: U-238, Charon, Singularity, Grooved Spines, Observer/Scout/Overlord sight.
- Speed upgrades: Stim already exists; add Ion, Leg Enhancements, Hydralisk, Overlord, Shuttle,
  Observer, Scout, Ultralisk, and relevant Zergling upgrades.
- Caster energy upgrades: raise max energy to 250 and preserve current energy.
- Capacity upgrades: Reaver scarabs, Reaver capacity, and Carrier Interceptors.

Done when:

- Damage tests cover representative upgrades from all three races.
- Movement/range/sight upgrades change only the intended derived values.
- Existing demo throughput does not materially regress.

Completed:

- Added a centralized derived-stat layer for upgrade effects instead of scattering race/tech logic
  through hot systems.
- Weapon upgrades now feed weapon damage, with representative Terran/Protoss/Zerg grouping.
- Armor and shield upgrades now reduce weapon hits while preserving correct shield-overflow HP
  behavior.
- Range upgrades now affect combat range for U-238, Charon Boosters, Singularity Charge, and
  Grooved Spines.
- Speed upgrades now feed the shared movement helper for Vulture, Zealot, Shuttle, Observer,
  Scout, Zergling, Hydralisk, Overlord, and Ultralisk movement.
- Sight upgrades now affect fog, detection coverage, and combat acquisition.
- Caster energy upgrades now raise existing caster caps on research completion and future caster
  caps at spawn.
- Added focused upgrade tests for damage, armor, shield overflow, range, speed, sight/detection,
  and energy-cap behavior.
- Adrenal Glands now feeds exact Zergling attack cooldown through the shared cooldown derivation.

Remaining:

- Future attack-speed discoveries and per-weapon upgrade increments for multi-hit/special attacks
  stay in the missing-inventory list until those mechanics need deeper fidelity.
- Broader all-race matrix tests once unit-specific combat mechanics are in place.

## Phase 5: Race Macro Identity

Status: partial.

Purpose: make each race's production model feel correct.

Implementation:

- Zerg:
  - Hatchery/Lair/Hive larva generation, max three larvae per hatchery.
  - Larva to Egg to unit production.
  - Pair production for Zerglings and Scourge.
  - Drone morph consumes the Drone and creates the building.
  - Creep field and creep placement requirements.
  - Zerg HP regeneration.
- Protoss:
  - Probe starts warp-in then is freed.
  - Pylon power fields and unpowered building behavior.
  - Protoss shield regeneration.
- Terran:
  - SCV remains committed to construction.
  - Repair command.
  - Lift/land for flying Terran buildings.
  - Add-on attachment rules and one-add-on-per-parent constraints.

Done when:

- Each race can run a small economy loop through its own production identity.
- Shared build validation owns placement/power/creep/add-on legality.

Completed:

- Added passive Zerg HP regeneration and Protoss shield regeneration as deterministic periodic
  status rules without adding serialized per-entity timers.
- Regeneration pauses while units are in Stasis.
- Added focused tests for Zerg HP regen, Protoss shield regen, and Stasis interaction.
- Moved Zerg unit production onto Larva producers instead of direct Hatchery queues.
- Added starting Overlords and starting larvae for Zerg setup.
- Added Hatchery/Lair/Hive larva replenishment with a three-larva cap.
- Added Larva-to-Egg production and Egg hatching into the final unit.
- Added pair hatching for Zerglings and Scourge, with separate cost and output counts so Scourge
  keeps its Brood War pair cost while Zerglings pay for two individuals.
- Updated same-tick supply reservation, census, validation, and scripted bot macro to understand
  pair output and larva producers.
- Added focused Zerg production tests for setup, hatchery rejection, larva eggs, pair hatching,
  and larva cap behavior.
- Added Drone morph construction through the shared build command: Drone en route carries a full
  refundable build ledger, then its own slot becomes the unfinished Zerg building foundation.
- Kept unfinished Zerg building cancellation on the existing 75 percent refund path and added a
  focused morph/cancel test.
- Added derived creep placement: completed Zerg ground structures project creep, and Zerg
  buildings other than Hatchery/Lair/Hive and Extractor must be placed on it.
- Added focused creep placement rejection coverage.
- Added in-place Zerg structure morphs for Hatchery -> Lair, Lair -> Hive, Spire -> Greater Spire,
  and Creep Colony -> Sunken/Spore through the shared `transform` command.
- Morphs pay the target morph cost, become unfinished/inert until their build timer completes,
  preserve a rollback kind, and refund 75 percent of the morph cost on cancel while restoring the
  source structure.
- Added derived Protoss Pylon power: Gateway-and-up buildings require completed own Pylon power
  for placement, and unpowered Protoss structures cannot train, research, cast, attack, or detect.
- Paused unpowered Protoss production/research queues without adding serialized power state.
- Added focused Protoss power tests for placement, production pause/rejection, research rejection,
  Photon Cannon attack disable, and powered detector restoration.
- Added committed Terran SCV construction: worker-built Terran foundations keep their SCV attached,
  construction pauses if the SCV is stopped/killed/pulled away, and the SCV is released when the
  structure completes.
- Added focused committed-SCV tests for builder linkage, paused foundations, release on completion,
  and build-cost cleanup.
- Added an authoritative `repair` command for SCVs with shared validation/replay support.
- Added a repair system that moves into build range, restores repairable mechanical/Terran targets,
  spends resources per repaired chunk, and stops cleanly when targets become full/invalid or
  resources run out.
- Added focused repair tests for successful repair, invalid targets, affordability, and replay
  parsing.
- Added an authoritative Terran `addon` command for parent-built add-ons.
- Added add-on parent compatibility, placement, one-add-on-per-parent linking, build-cost ledgers,
  cancellation cleanup, and replay parsing.
- Added focused add-on tests for construction/linkage, duplicate rejection, parent/prerequisite
  validation, cancellation refunds, and replay parsing.
- Completed add-ons now require a live, bidirectionally linked, landed parent to satisfy tech
  prerequisites, train, research, cast add-on abilities, provide ready nukes, tick production or
  research queues, and regenerate energy; the scripted Terran bot mirrors the same active-add-on
  prerequisite rule.
- Added focused orphaned/lifted parent tests for add-on validation plus production/research pause
  coverage, and updated add-on fixtures to model real parent links.
- Added authoritative Terran `lift` and `land` commands for Command Center, Barracks,
  Engineering Bay, Factory, Starport, and Science Facility.
- Lifted buildings become mobile air structures, stop acting as producers/depots, stop blocking
  ground pathing and placement, move with a fixed lifted-building speed, and restore their
  original flags after legal landing.
- Added focused lift/land tests for movement, production gating, occupied landing rejection,
  non-liftable/add-on-linked rejection, and replay parsing.
- Added shared unfinished-entity presentation for Zerg structure morphs, Protoss warp-ins, Terran
  construction, Zerg combat cocoons, and Protoss merge summons. Selection labels, cancel/stop/rally
  affordances, GL/Math renderer treatment, and the screenshot harness now distinguish those states
  without adding serialized presentation state.
- Incomplete structures now reject `rally` through shared validation, so UI command cards,
  scripted controllers, and future RL action masks agree that rally belongs to completed
  structures only.
- Scripted Zerg AI now recognizes completed Hatchery/Lair/Hive bases through the shared larva
  source helper and emits validation-backed morph commands for Hatchery -> Lair, Lair -> Hive,
  Spire -> Greater Spire, and Hydralisk -> Lurker when tech, resources, queues, and supply allow
  them.

Remaining:

- Fuller Zerg macro flow beyond the first Hydralisk Den and basic Spire hooks, especially richer
  multi-endpoint Nydus placement heuristics beyond the first attack-focused second endpoint.
- Richer construction/warp-in art and sound-effect polish once the refreshed assets define the
  desired visual language.
- Any remaining power-field UI affordances beyond the current placement overlay and powered-state
  validation.

## Phase 6: Unit-Specific Combat Mechanics

Status: partial.

Purpose: add the iconic combat mechanics that cannot be represented as plain weapons.

Implementation:

- Siege mode toggle, immobility, minimum range, and splash/falloff.
- Spider Mines with charge count, burrow, acquire, detonate, and splash.
- Burrow command; Lurker attack only while burrowed with line splash.
- Reaver scarab ammo/projectile/splash.
- Carrier interceptor build, launch, return, leash, and damage loop.
- Transport loading/unloading for Dropship, Shuttle, Overlord, Bunker, and Nydus.
- Mutalisk bounce, Devourer acid spores, Valkyrie multi-missile splash, Corsair splash.
- Suicide units: Scourge and Infested Terran.

Done when:

- Each special mechanic has a deterministic sim test and no app-side special case beyond buttons.

Completed:

- Added a generic `transform` command with replay validation for unit mode changes.
- Added Siege Tank <-> Siege Mode transforms gated by Siege Tech.
- Added weapon-level minimum range and splash-radius metadata.
- Sieged Tanks are immobile, respect minimum range, and apply deterministic ground splash with
  friendly fire while ignoring air targets.
- Scripted AI now transforms tanks into siege mode when a fight focus is in useful siege range and
  unsieges when the focus is too close or too far.
- Added focused sim and AI tests for transform gating, immobility, min range, splash, replay
  parsing, and bot transform use.
- Added a generic contained-unit primitive (`container` entity column) that hides contained units
  from map-space collision, combat, vision, detection, and enemy observations while preserving
  deterministic clone/hash/serialization behavior.
- Added authoritative `load` and `unload` commands with replay parsing, transport capacity
  validation, passable unload checks, and Overlord transport gating through Ventral Sacs.
- Enabled Dropship, Shuttle, and upgraded Overlord transport loading/unloading through this shared
  primitive.
- Added basic app command-card `Load`/`Unload` aggregate buttons for selected transports/cargo.
- Added focused sim/app tests for cargo following transports, capacity, Overlord tech gating,
  enemy visibility/targeting, transport death, serialization, replay parsing, and app command
  emission.
- Added Bunker infantry garrison rules: infantry-only loading, four-slot capacity, hidden contained
  infantry, and contained infantry firing from the Bunker with their own weapons/cooldowns.
- Added Nydus Canal team-network routing: allied units can use teammate endpoints, isolated canals
  reject loading, and unload targets can choose any completed same-team exit through validation
  without storing pair links in entity state.
- Added suicide attack resolution for Scourge and Infested Terran through normal attack commands,
  including Infested Terran ground splash/friendly fire and bot use of Scourge against air threats.
- Added Mutalisk bounce damage through the shared combat hit resolver, with deterministic reduced
  damage to two nearby enemy targets.
- Added plane-aware splash resolution so ground splash stays ground-only while Valkyrie and Corsair
  air weapons splash nearby air units through the same weapon metadata.
- Added Devourer acid spores as a timed stack status that is applied by normal Devourer attacks,
  amplifies later weapon damage, expires through status ticking, and is cleared by Restoration.
- Added authoritative Burrow/Unburrow command support with replay parsing, byte serialization,
  hashing, detection visibility, movement/collision/load gating, and app command-card buttons.
- Added Lurker attack gating so Lurkers can attack only while burrowed, plus deterministic ground
  line splash with friendly fire through the normal weapon resolver.
- Scripted AI now burrows Lurkers when a fight target is in useful range and attacks with already
  burrowed Lurkers.
- Added Spider Mines with researched Vulture charges, authoritative mine-lay commands, burrowed
  autonomous acquisition, ground detonation splash/friendly fire, replay/snapshot coverage, app
  command-card buttons, and scripted AI mine use.
- Added Zerg combat unit morphs for Hydralisk -> Lurker and Mutalisk -> Guardian/Devourer through
  the same transform/morph path, including Lurker Aspect and Greater Spire gating plus inert
  unfinished morph validation.
- Added Archon and Dark Archon merge through the shared `transform` command, with optional partner
  targeting for clean command-card group pairing, nearby-partner validation, partner consumption,
  unfinished merge state, replay parsing, and app command emission tests.
- Added Reaver scarabs as internal ammo built through the shared train/production queue: Reaver
  attacks require and consume scarabs, Reaver Capacity raises the ammo cap, Scarab Damage feeds
  the derived weapon bonus, and scarab splash uses the existing weapon splash metadata.
- Reaver attacks now launch deterministic Scarab child actors with serialized home/target links:
  Scarabs path to ground targets through shared movement, resolve existing splash/damage rules on
  impact, and dud cleanly if the Reaver or target becomes invalid before impact.
- Added general weapon splash falloff metadata and applied Brood War-style Scarab/Reaver
  100/50/25 percent damage bands, including Scarab Damage upgrade scaling and armor.
- Reaver Scarabs now have app-level projectile presentation in both renderers: the WebGL path
  adds a cheap additive glow around visible Scarab actors, and the Math renderer keeps the exact
  gameplay radius while adding a readable glow reference. Scarabs remain fog-safe through normal
  `Game.canSeeEntity` visibility and no longer steal tap or box selection as commandable units.
- Added Carrier Interceptors as launched child combat actors with a serialized home link, attack
  sortie, target orbit, leash/return behavior, ammo restoration, and idle target acquisition.
- Carrier Interceptors now launch from deterministic carrier bay points based on carrier facing,
  dock back into bay points before restoring ammo, and steer through the Interceptor system only
  while generic combat remains responsible for weapon fire. The app treats launched Interceptors
  as visible child actors rather than selectable command units, and the screenshot harness captures
  a focused Carrier sortie reference.
- Zerg combat unit morphs now present as target-sized cocoons in both renderers while keeping the
  authoritative target unit footprint/radius, publish `Morphing <target>` selection labels, and
  expose the shared validated cancel command through the command card.
- Protoss Archon and Dark Archon merge summons now present as unfinished summons rather than
  completed combat units: selection reads `Summoning <target>`, both renderers add a lightweight
  energy-summon affordance, and the command card correctly omits cancel because Brood War does
  not expose Archon merge cancellation.

Remaining:

- Further Carrier Interceptor attack-pass cadence polish only if source references reveal a
  material mismatch beyond the current launch, orbit, return, and bay-docking primitive.
- Richer construction/warp-in visual effects once the refreshed asset pass defines exact art
  direction.

## Phase 7: Visibility, Terrain, And Fog Fidelity

Status: partial.

Purpose: make fair-play visibility and terrain rules match the SC spec closely enough for human
play and RL.

Implementation:

- Scanner Sweep and Parasite should affect the sim vision grids, not only detection.
- Cloaked/burrowed units should appear only when detected and visible.
- Add high-ground vision rules and low-to-high miss chance.
- Add last-known building memory for observations if needed by network/RL.
- Decide whether fog is gameplay-affecting for attack validation beyond detection.

Done when:

- Observation, app rendering, command validation, and AI/action masks agree on visibility.

Completed:

- Parasite already projects target-centered vision for the parasiting player.
- Scanner Sweep now projects effect-centered vision into the player vision grid.
- `observe()` now hides enemy cloaked entities unless they are both currently visible and
  detectable, while Scanner Sweep makes scanned cloaked enemies observable.
- Added observation tests for undetected cloaked enemies and scan-revealed cloaked enemies.
- Burrow now feeds the same cloak/detection predicate, and app hit-testing, Canvas rendering,
  WebGL rendering, and minimap drawing all use a shared visible-and-detectable entity rule.
- Map elevation now affects fair-play vision, and low-ground ground attacks against high-ground
  ground targets use a deterministic serialized-RNG miss roll.
- The app now renders fair scanner-sweep and nuclear-warning affordances from sim effects, using
  shared fog knowledge so hidden enemy scans do not leak.

Remaining:

- Further fog/last-known presentation polish for the new fair-play visibility state.
- Future action masks should consume this same visible-and-detectable observation rule.

## Phase 8: AI And RL Interface Completion

Status: partial.

Purpose: keep the game useful as a training environment while the ruleset grows.

Implementation:

- Add observation planes/scalars for tech, upgrades, energy, statuses, effects, larva, creep,
  power, cargo, production/research queues, and selected/group state where relevant.
- Add invalid-action masks using the shared validator/capability functions.
- Teach scripted AI race-specific macro basics and tactical spell use for the completed roster.
- Keep scripted bots deterministic and cheap enough for behavior-cloning warmstarts.

Completed:

- Added a minimal sim-owned command-head mask API backed directly by `validateCommand`, so UI,
  AI, and future RL clients can ask for core legal actions without duplicating command rules.
- Added validator-backed train/build option masks for macro candidates, covering larva training,
  creep-gated Zerg placement, and power-gated Protoss placement/producer legality without
  duplicating command rules.
- `observe()` now exposes a defensive copy of the observing player's completed tech/upgrade
  levels, keeping RL policy inputs sim-owned while avoiding enemy tech leakage.
- `observe()` now exposes compact own-player active production/research queue records derived
  from owned producers, giving RL clients queue intent without leaking enemy queues or aliasing
  mutable sim state.
- `observe()` now exposes compact own-player cargo records grouped by usable transport/garrison
  (including same-team Nydus), giving RL clients load state without leaking enemy cargo or aliasing
  mutable sim state.
- `observe()` now exposes sparse own-player energy/status records for casters and active status
  effects, giving AI/RL clients tactical cooldown/disable/cloak state without leaking enemy status
  or aliasing mutable sim state.
- `observe()` now exposes fair-play active spatial effect records for spell fields and nuke
  warnings, using sim-side visibility rules without leaking hidden enemy effects or aliasing mutable
  effect state.
- `observe()` now exposes owned larva-source counts/timers plus fair-play creep and Pylon power
  provider coverage, sharing the same creep/power semantics as placement validation.
- Terran scripted macro now queues legal Machine Shops on idle completed Factories through shared
  add-on validation and budget checks, without duplicating add-on rules in AI code.
- Terran scripted macro now prioritizes legal Comsat Stations on idle completed Command Centers,
  respecting Academy prerequisites, existing add-ons, placement, and gas budget through shared
  add-on validation.
- Terran scripted macro now queues legal Control Towers on idle completed Starports through the
  same prioritized add-on path, keeping Starport tech progression validator-backed.
- Protoss scripted macro now searches from completed Pylon power anchors when placing powered
  army structures, so Gateway expansion uses the same placement validation as human commands.
- Terran scripted macro now queues legal Science Facility add-ons through shared add-on
  validation, choosing Physics Lab for the air-tech path and Covert Ops otherwise.
- Terran scripted macro now queues legal Nuclear Silos on Command Centers after Covert Ops,
  keeping late-game nuke tech on the same add-on validation path.
- Protoss scripted macro now queues a legal Cybernetics Core after a completed Gateway, using the
  same Pylon-anchored placement and shared validation path as Gateway expansion.
- Protoss scripted macro now queues a legal Robotics Facility after a completed Cybernetics Core,
  walking an ordered tech-structure list through shared placement validation.
- Protoss scripted macro now queues a legal Robotics Support Bay after Robotics Facility through
  that same powered path, unlocking Reaver/Shuttle upgrade tech while preserving shared
  prerequisite, duplicate, pending, placement, and budget validation.
- Protoss scripted macro now queues a legal Observatory after Robotics Facility through the same
  powered path, unlocking Observer/detector tech while preserving shared prerequisite, duplicate,
  pending, placement, and budget validation.
- Protoss scripted macro now queues a legal Stargate from that same ordered tech-structure path
  after Cybernetics Core, preserving shared power, prerequisite, duplicate, and budget checks.
- Protoss scripted macro now queues a legal Fleet Beacon after Stargate through the same powered
  path, unlocking Carrier/Corsair air tech while preserving shared prerequisite, duplicate,
  pending, placement, and budget validation.
- Protoss scripted macro now queues a legal Citadel of Adun through the ordered tech-structure path,
  unlocking the templar branch while preserving the same validation-backed legality checks.
- Protoss scripted macro now queues a legal Templar Archives after Citadel of Adun through that
  same powered structure path, opening templar tech while preserving prerequisite, duplicate,
  pending, placement, and budget validation.
- Protoss scripted macro now queues a legal Arbiter Tribunal after Stargate and Templar Archives
  through the same powered path, unlocking Arbiter tech while preserving shared prerequisite,
  duplicate, pending, placement, and budget validation.
- Protoss scripted macro now queues Leg Enhancements research from completed powered Citadels
  through shared research validation, respecting producer, power, completed, in-progress, busy
  queue, and budget gates.
- Protoss scripted macro now queues Psionic Storm research from completed powered Templar
  Archives through the same shared research path, unlocking its existing tactical caster logic
  while respecting producer, power, completion, queue, and budget gates.
- Protoss scripted macro now queues Hallucination research from completed powered Templar Archives
  after Storm is complete, using the same shared research path and legality gates.
- Zerg scripted macro now queues a legal Hydralisk Den after a completed Spawning Pool through the
  shared structure placement helper, preserving creep, prerequisite, duplicate, and budget checks.
- Zerg scripted macro now queues a legal Spire after a completed Lair from the same ordered
  structure path, preserving placement, prerequisite, duplicate, and gas-budget validation.
- Zerg scripted macro now queues a legal Queen's Nest after a completed Lair through the same
  structure path, setting up Hive tech while preserving validation-backed legality checks.
- Zerg scripted macro now morphs a legal Hive from a completed Lair after Queen's Nest through the
  shared transform path, preserving prerequisite, duplicate/pending, queue, and gas-budget checks.
- Zerg scripted macro now morphs a legal Greater Spire from a completed Spire after Hive through
  that same unique-tech morph path, preserving prerequisite, duplicate/pending, queue, and budget
  checks.
- Zerg scripted macro now queues a legal Defiler Mound after Hive through the ordered structure
  path, unlocking Defiler production while preserving placement, prerequisite, duplicate, pending,
  and gas-budget checks.
- Zerg scripted macro now queues a legal Ultralisk Cavern after Hive through that same ordered
  structure path, unlocking Ultralisk production and upgrades while preserving placement,
  prerequisite, duplicate, pending, and gas-budget checks.
- Zerg scripted macro now queues a legal Nydus Canal at Lair tier before Hive-only structures,
  preserving placement, prerequisite, duplicate, pending, and mineral-budget checks while leaving
  strategic second-endpoint planning as a separate mobility slice.
- Zerg scripted macro now queues one legal second Nydus endpoint near the current attack focus when
  a completed local Canal already exists and owned creep supports placement, using the shared build
  validator while respecting incomplete, duplicate, pending, and budget states.
- Zerg scripted macro now extends an existing completed Nydus network to later attack fronts when
  the current focus lacks a useful endpoint, still using shared placement validation and suppressing
  duplicate or already-pending endpoint builds.
- Zerg scripted macro now queues Metabolic Boost from completed Spawning Pools through the shared
  research validation path, giving its core Zergling army the existing derived-speed upgrade.
- Zerg scripted macro now queues Lurker Aspect research from completed Hydralisk Dens through the
  shared research validation path, respecting producer completion, duplicate/in-progress research,
  busy queues, and mineral/gas budget gates.
- Zerg scripted macro now queues Grooved Spines from completed Hydralisk Dens only after Lurker
  Aspect is complete, keeping Hydralisk/Lurker range progression ordered while still using shared
  research validation for producer, queue, duplicate, and budget gates.
- Zerg scripted macro now queues Muscular Augments from completed Hydralisk Dens after Lurker
  Aspect and Grooved Spines are complete, finishing the Hydralisk Den upgrade trio through the
  same ordered research macro and shared validation path.

Done when:

- A bot can play each race using its real macro mechanic and tactical abilities without relying on
  impossible commands.

## Phase 9: SC2-Style Movement, Clearance, And Local Avoidance

Status: complete.

Purpose: replace "move into overlap, then shove apart" with a deterministic movement model that
feels closer to StarCraft II: large units respect real body clearance, armies flow around each
other before collision, and groups settle cleanly instead of jostling forever.

Design target:

- Keep the current shared flow-field approach for high-level pathfinding. It is still the right
  macro primitive for many units moving to the same area.
- Add clearance-aware passability so pathing asks "can this unit body fit here?" rather than "is
  this center tile open?"
- Give group commands stable destination slots around the clicked target instead of sending every
  unit to one pixel.
- Choose movement velocities with local avoidance before movement is applied. Collision push
  remains only as an emergency overlap cleanup.
- Preserve the sim constraints: fixed-point integers, deterministic tie-breaking, typed-array hot
  loops, replay/hash reproducibility, no DOM/I/O, and benchmarked throughput.

Implementation:

- Clearance-aware navigation:
  - Introduce an internal pathing lattice finer than build tiles. The map/building data can stay
    32px build-tile based, but navigation should run on derived pathing cells: prefer 16px as the
    first performance-conscious step, and keep the API shaped so it can move to true BW-style 8px
    walk cells if tuning shows the extra precision is needed.
  - Derive the pathing lattice from `MapDef.walk` and stamped building footprints. A blocked
    build tile fills its child pathing cells; an open build tile contributes open child cells.
    Structures continue to stamp from authoritative footprint metadata.
  - Derive a small set of ground movement clearance classes from existing gameplay body data:
    `Units[kind].radius` and/or `bodyBounds(kind)` from `packages/sim/src/spatial.ts`.
  - Build clearance masks on the pathing lattice by testing whether the unit body fits at that
    path-cell center without overlapping blocked path cells. Small infantry can pass through
    narrow gaps; Dragoons, Tanks, Goliaths, Lurkers, Reavers, and Ultralisks cannot pass through
    gaps their bodies do not fit.
  - Key cached fields by `(goalPathCell, clearanceClass, buildingLayoutSignature)`.
  - Update `clearLine`, `flowField`, `downhill`, and movement obstacle checks to use path-cell
    coordinates plus the moving unit's clearance class.
  - Keep build-tile helpers such as placement, resource footprints, and UI footprint rendering on
    the existing build-tile grid. Only routing/clearance needs the finer lattice.
  - Preserve no-corner-cutting at diagonals after dilation.
- Stable group destination slots:
  - During command ingestion, detect same-tick same-player move/attack-move groups that share the
    same command target and assign deterministic final slots around that target.
  - Keep the public command/replay surface as per-unit commands; slot assignment is derived from
    the batch, sorted by stable slot id/distance rules.
  - Prefer compact rings/grids that fit the local clearance mask. Fall back to nearest legal slots
    around the target if the exact clicked point is obstructed.
  - Keep a semantic route goal separate from the final settle slot if needed, so many units can
    still share the same high-level flow field while fanning out near arrival.
- Predictive local avoidance:
  - Add a movement-local neighbor grid for solid ground movers and relevant stationary blockers.
  - For each moving ground unit, compute a preferred velocity toward the next waypoint or final
    slot.
  - Evaluate a tiny deterministic candidate set around that preferred velocity: preferred,
    slower preferred, left/right sidesteps, wider left/right, and stop.
  - Score candidates by forward progress, predicted next-tick body overlap, obstacle clearance,
    turn cost, slot ownership, and priority yielding.
  - Pick the lowest-score candidate with stable tie-breaking. This gives ORCA/RVO-like behavior
    without floats, allocation, or an imported solver.
  - Treat idle, firing, burrowed, and other anchored units as higher-priority blockers; moving
    units should flow around settled/combat units rather than constantly dislodging them.
- Arrival damping and settling:
  - Slow units as they approach their assigned slot.
  - Snap/idle inside a small deterministic epsilon.
  - Add hysteresis so a settled unit does not wake up from tiny residual pushes.
  - Allow meaningful displacement or a new order to wake the unit.
- Collision cleanup:
  - Keep the current symmetric collision pass, but make it the seatbelt, not the steering wheel.
  - Reduce push magnitude once predictive avoidance is in place.
  - Clamp cleanup against the unit's clearance mask, not just the center tile.
- Worker and special-unit rules:
  - Preserve worker mineral behavior and existing worker-collision exemptions unless a focused
    worker pathing slice says otherwise.
  - Keep air units outside ground clearance/local-avoidance logic.
  - Ensure Scarabs, Interceptors, Spider Mines, burrowed units, loaded cargo, and unfinished morphs
    keep their existing commandability/collision semantics.

Tests and proof:

- Clearance tests:
  - A Marine/Zergling can pass a narrow gap that a Dragoon/Tank/Ultralisk cannot.
  - Large units cannot diagonal-corner-cut through a gap created by two blockers.
  - Building footprints and terrain blockers participate in the same clearance mask.
- Group settle tests:
  - A 40-unit Marine group ordered to one point reaches a compact spread and then has near-zero
    motion after a bounded settle window.
  - A mixed Marine/Dragoon/Ultralisk-style group settles without persistent overlap or oscillation.
  - Reissuing the same command stream produces identical hashes.
- Local avoidance tests:
  - Two opposing groups pass around each other without permanent deadlock in open terrain.
  - Movers route around firing/pathing anchors without shoving them out of combat position.
  - Large units approaching a ramp or choke queue smoothly instead of vibrating.
- Regression tests:
  - Harvesting throughput and worker clumping behavior remain within the current intended band.
  - Transport unload, Nydus unload, Reaver Scarab movement, Interceptor movement, burrow, and
    Spider Mine behavior keep their existing focused tests passing.
- Performance tests:
  - Add a headless "deathball settle" benchmark with no vision.
  - Track tick cost for 50, 100, and 200 ground movers in open field, choke, and opposing-flow
    scenarios.
  - Do not accept the slice if local avoidance turns normal combat movement into O(n^2) behavior.

Rollout:

1. Completed: add clearance classes and masks, then wire pathing to them while keeping current collision.
2. Completed: add deterministic group slot assignment for same-target command batches.
3. Completed: add candidate-velocity local avoidance behind the existing movement systems.
4. Completed: add arrival damping/settle hysteresis and reduce collision push to cleanup.
5. Tune with screenshots/replays and benchmark data, then update `docs/specs/architecture.md`.

Done when:

- Large ground units can no longer pass through gaps their bodies should not fit through.
- Large mixed groups ordered to one point settle into stable positions without endless jitter.
- Moving units visibly flow around stationary/firing units before overlap occurs.
- Replay hash determinism, serialization coverage, and headless movement benchmarks all pass.

Completed:

- Added a derived 16px pathing lattice from the 32px build-tile map and stamped structure
  footprints. Build placement, resource footprints, and UI footprint rendering stay on the
  build-tile grid; routing now uses path cells.
- Added path-cell clearance masks from BW body bounds. Small units can use the raw path lattice;
  wider bodies require enough free path-cell space to fit.
- Re-keyed cached flow fields by path-cell goal and clearance size, so different body widths do
  not share invalid passability assumptions.
- Ground navigation now routes on path-cell coordinates, adjusts blocked goals to nearby legal
  cells, and no longer falls back to walking straight through unreachable blocked gaps.
- Units that start inside or against a blocked footprint escape toward the nearest legal path cell
  before normal routing resumes, preserving worker/producible-unit startup behavior.
- Firing pathing anchors now stamp their actual body footprint over path cells, and `downhill`
  can take deterministic local sidesteps around transient blockers instead of shoving through.
- Worker mine/deposit checks now use body-edge distance, so workers can stop outside solid depot
  and refinery footprints without breaking the economy cycle.
- Added focused pathing tests for small-vs-large doorway clearance, diagonal no-corner-cutting,
  rooted firing-unit detours, and deterministic same-target move/attack-move destination spread.
- Same-tick same-player ground combat move and attack-move batches derive deterministic nearby
  destination slots from the public per-unit commands, preserving replay shape while avoiding one
  shared target pixel for whole groups.
- Same-target formation spacing now scales to the largest ground body in the command group, rounded
  to the path-lattice cadence, so mixed groups with Ultralisks/Tanks/Dragoons reserve more room
  than pure infantry groups.
- Added deterministic pre-move local avoidance for solid ground combat bodies. `navigate()` now
  scores a small candidate set around the preferred step using forward progress and predicted
  next-tick body overlap, so units can sidestep nearby bodies before the collision cleanup pass.
- The local-avoidance body grid is prepared once per tick before combat/movement steering, giving
  movers a common deterministic snapshot instead of depending on which unit asks first.
- Local avoidance stays out of worker, air, projectile, burrowed, and contained-unit behavior, and
  keeps firing/pathing anchors as stronger blockers.
- Collision cleanup now clamps pushes against the same path-cell clearance masks as navigation,
  so the final symmetric push pass cannot shove a large unit into a gap only its center point can
  occupy.
- Move and attack-move completion now runs in a post-collision settling pass. Units only go idle
  if they still occupy their reachable final point after overlap cleanup, then keep a serialized
  `settled` bit so tiny nudges are tolerated while larger displacement wakes them to reclaim the
  slot.
- Command ingestion clears stale `settled` claims when a unit receives a new explicit intent, so
  follow-up attack, stop, ability, transport, burrow, and transform commands are not rewritten by
  the settling pass.
- Added a focused test proving a moving Marine sidesteps a nearby body during `navigate()` before
  collision cleanup runs.
- Extended the group movement test to require settled idle units to remain position-stable across
  additional ticks.
- Added movement stress coverage for mixed ground deathball settling, opposing groups crossing a
  shared choke, and ground groups exiting procedural base ramps into the midfield.
- Added a `movement-deathball` case to the headless throughput benchmark. It reports command
  acceptance, unit count, distinct positions, active movement orders, and settled units alongside
  timing/hash data without making wall-clock timing a pass/fail gate.
- Worker collision is now pairwise and order-derived instead of role-wide: workers are solid
  during ordinary move/build/repair/gas behavior, while two workers that are both on mineral
  harvest/return routes may share space for smooth mineral-line routing.
- Swept the `movement-deathball` benchmark across seeds 7, 31, 99, 2026, and 4099.
  All runs accepted 32/32 commands, settled all 32 mixed ground units, left zero active orders,
  and produced 32 distinct final positions. Architecture docs now record the current decision to
  keep the 16px path lattice and revisit 8px only if visual, choke, or resource-route tests expose
  a concrete precision miss.

Remaining:

- None in the current Phase 9 scope; future 8px path cells are a measured tuning option, not an
  active requirement.

## Phase 9B: Top-Down Spatial Semantics And Procedural Map Design

Status: complete for the current shared-plateau generator.

Purpose: preserve StarCraft-equivalent rules, timings, and build-order math while making the
actual motion and contact read correctly in our orthographic top-down game. BWAPI gives us
valuable source constants, but those constants were embedded in an isometric-looking game with
sprite, selection, and approximate-distance affordances. In our top-down view, those affordances
can become visible bugs: a worker can mine a corner mineral while not touching it, or a diagonal
range can read differently from an axial range. The fix is not to abandon BW values; it is to make
the spatial contract explicit.

Core principle:

- **Runtime geometry must be top-down physical geometry.**
- **Balance/timing targets can remain BW-equivalent.**
- **Compatibility with BW approximations must be opt-in and named.**

That means a worker must visibly dock before mining, and a Zealot/Marine range circle should read
as a top-down circle. If exact BW-equivalent economy timing needs calibration, solve the map and
harvest route timing to hit that target; do not let hidden reach ranges fake contact.

Design target:

- Define three separate spatial layers:
  - **Source data layer:** BW pixel constants, footprints, cooldowns, mining amounts, build times,
    and upgrade deltas. These remain data and stay easy to audit against BW references.
  - **Interaction geometry layer:** top-down gameplay hulls used for final reach/contact checks.
    This layer answers "are these two things actually touching or in range in our view?"
  - **Economy placement diagnostics:** per-route or per-layout measurements that tell the map/base
    solver how close it is to the intended top-down saturation distances. Runtime harvesting does
    not wait, stretch range, or alter speed to compensate for a bad layout.
- Lock the coordinate contract before touching more systems:
  - one build tile is 32px, and the canonical BW walk-cell target remains 8px even if the first
    navigation implementation keeps a 16px path lattice for performance;
  - all final interaction checks happen in fixed-point world pixels, never in build-tile units;
  - `ResourceSpawn.x/y` means the resource's initial build-tile footprint, while `px/py` means the
    authored body center used for top-down interaction and route timing;
  - a depot start location is the depot center/build location, not the top-left footprint corner;
  - body bounds are gameplay hulls, not render bounds, and SVG sprite size is never allowed to
    affect reach, harvesting, or placement;
  - if a value is a tile coordinate, a pixel center, a footprint corner, a hull edge, or a route
    timing target, its type/name should say so.
- Replace ambiguous distance helpers with named metrics:
  - `topDownEdgeDistanceSq` / `withinTopDownEdgeRange`: exact deterministic top-down reach checks,
    preferably squared-distance based in hot paths.
  - `topDownEdgeDistance`: scalar integer distance only when a system needs an actual length for
    timing or diagnostics.
  - `bwApproxDistance`: compatibility with BWAPI's approximate distance formula, retained for
    tests, audits, and any mechanic we deliberately choose to keep legacy-shaped.
  - `centerDistanceSq`: broad-phase search and cheap ordering only; never final reach/contact.
- Make interaction hulls explicit:
  - mobile units use top-down collision/selection radii unless a unit needs an authored exception;
  - buildings/resources use footprint/body rectangles for placement and contact;
  - visual SVG bounds remain presentation only and never silently change gameplay reach.
- Harvesting must use top-down docking:
  - workers navigate to deterministic contact/docking points on mineral, gas, and depot hulls;
  - mining/deposit begins only at physical contact or a tiny named docking epsilon;
  - corner/near-corner mineral patches must be physically touched, not harvested through a legacy
    approximate-distance shortcut.
- Preserve economy behavior with the simplest top-down approximation:
  - workers physically dock, mine for BW action frames, travel at normal speed, and deposit
    immediately on depot contact;
  - make dock-to-dock distance the placement target instead of adding hidden wait frames;
  - for three-worker mineral saturation, target the top-down dock distance band where
    `cycle = mineFrames + 2 * distance / speed` is between two and three concurrent workers;
  - for gas, target the shorter three-worker refinery cadence directly instead of using mineral
    layout math;
  - if a route is too long or too asymmetric, the layout is invalid and must move resources or fail
    generation. Do not compensate by making the worker mine before contact, waiting at the depot,
    or silently changing speed.
- Procedural maps should be assembled from explicit, validated terrain components:
  - first preset: full-width shared team main plateaus at the north and south edges;
  - player start sites distributed across each team plateau;
  - ramp exits down from main plateaus to low-ground naturals;
  - natural expansion sites near those ramp exits;
  - default empty midfield for baseline movement/economy testing;
  - optional midfield modules for blockers, dual chokes, arenas, raised centers, center expansions,
    extra ramps, and future island/fortress/corner-base presets.

Implementation:

- Step 0: coordinate invariants and naming.
  - Add small branded types or helper constructors if TypeScript can carry the distinction without
    making hot code noisy: build-tile coordinate, world-pixel coordinate, fixed-world-pixel value,
    footprint rectangle, and interaction hull.
  - Add assertion/test helpers that convert between tile top-left, tile center, footprint rectangle,
    and body center in one place.
  - Document every remaining legacy conversion that must exist while old map code is being
    replaced.
- Step 1: metric taxonomy and call-site audit.
  - Add the top-down edge metric helpers without changing gameplay behavior yet.
  - Rename the current BW-style helper to make its compatibility meaning impossible to miss.
  - Audit each distance use and assign a metric:
    - combat weapon reach: top-down edge range, unless a specific projectile/child system says
      otherwise;
    - minimum range: top-down edge range;
    - harvest mine/deposit: top-down dock/contact;
    - repair/build continuation: top-down edge range;
    - cargo load/unload: top-down edge or explicit unload geometry;
    - detection/sight/fog: probably top-down circular ranges, with separate tests because BW vision
      behavior may still want balance tuning;
    - abilities: case-by-case, but every ability must name whether it is top-down or BW-compatible;
    - nearest-target broad phase: center/grid distance is allowed only as a prefilter.
  - Add tests that fail if newly audited systems accidentally use a generic final-distance helper.
- Step 2: top-down interaction hulls.
  - Introduce an `InteractionShape` helper around existing body/radius data:
    - circles for most mobile units;
    - axis-aligned rectangles for resources and structures;
    - optional per-kind overrides when top-down readability demands it.
  - Keep `structureFootprint()` and build-tile placement unchanged.
  - Use exact integer squared distances for circle-circle and circle-rect checks in hot paths.
  - Use scalar `isqrt` only for route timing, telemetry, or non-hot calibration.
- Harvest docking and timing:
  - Define deterministic docking points for each resource/depot pair:
    - mineral docking point is the nearest legal point on the mineral hull from the depot-side
      route;
    - depot docking point is the nearest legal point on the depot hull from the mineral-side route;
    - gas uses geyser/refinery hull contact and may need a separate three-worker cadence target.
  - Treat BW-equivalent timings as placement diagnostics, not as permission to keep BW's approximate
    visual distance. Source BW distance constants can seed the solver, but the runtime result is
    "top-down path plus BW action frames."
  - Store no per-worker path history beyond deterministic order state.
  - Navigate to the docking point, not the resource center.
  - Start mining/deposit only after docking.
  - Compute actual leg length as path/top-down distance between docking points. For the first
    implementation, straight-line top-down length is acceptable only if pathing is unobstructed;
    once ramps/obstacles affect workers, use the path lattice route cost.
  - Build a route diagnostic table for main-base mineral patches:
    - target route time from the BW-equivalent model;
    - actual top-down route time;
    - positive slack when the route is shorter than the target;
    - invalid flag when actual route exceeds target by more than tolerance.
  - Keep the diagnostics deterministic and visible in tests. They should guide placement, not
    distort movement or deposits.
- Resource/base layout:
  - Introduce `BaseSite` metadata if needed:
    - `kind`: main, natural, third, center, island, fortress;
    - `team` and optional owner slot;
    - depot center;
    - depot build footprint and whole-cluster reservation footprint;
    - resource direction;
    - ramp association;
    - timing profile id.
  - Keep `ResourceSpawn.x/y` as initial build-tile footprint and `px/py` as top-down pixel center.
  - Treat a base/resource cluster as the reusable generator primitive: exact depot anchor, 8-patch
    mineral arc, standard-distance gas, resource footprints, and an enclosing reservation footprint
    so expansions can be placed without overlapping terrain modules, other bases, or future
    generated features.
  - Extend resource solving so every candidate must pass:
    - build-tile footprint in bounds;
    - resource footprint not overlapping any other resource;
    - resource footprint on allowed terrain;
    - resource hull clear of cliffs/blockers by an explicit margin;
    - depot placement legal at the base site;
    - docking point exists for worker/resource and worker/depot;
    - calibrated route timing valid.
  - Make the current "mineral arc" solver a base-resource solver instead of a slice-map special.
    It should work for mains and naturals and be reusable by procedural presets.
- Procedural map architecture:
  - Add a deterministic `MapBuilder` with small primitives:
    - fill low/high terrain rectangles;
    - stamp cliffs/blockers;
    - open ramp rectangles;
    - reserve build-safe areas;
    - mirror north/south and optionally rotate 180 degrees;
    - query whether a footprint has enough walk/build/elevation clearance.
  - Add a `BasePlanner`:
    - first preset creates one north team plateau and one south team plateau;
    - allies share the same plateau;
    - starts are spread horizontally with reserved space for each depot/resource cluster;
    - ramp locations are lane-aligned but can be widened or merged later;
    - naturals are placed on low ground near ramp exits, not on the main plateau.
  - Add a `MidfieldModule` interface:
    - `empty`: no center blockers, baseline movement and economy testing;
    - `blocks`: symmetric obstacle islands;
    - `dualChoke`: two corridors around a center blocker;
    - `arena`: open center with side blockers;
    - `raisedCenter`: high-ground center plateau with ramps;
    - future modules: islands, fortress corners, corner-base FFA, isolated mains.
  - Extend replay map specs carefully:
    - preserve existing `{ kind: 'procedural', perTeam, seed }` defaults;
    - allow optional `preset` and `midfield` fields with deterministic defaults;
    - avoid storing generated map blobs in replays unless/until map editing requires it.

Tests and proof:

- Spatial metric tests:
  - Coordinate-conversion tests prove build-tile, walk-cell, world-pixel, fixed-pixel, footprint,
    and body-center conversions do not drift.
  - Axis-aligned and diagonal top-down ranges are symmetric for circle-circle, circle-rect, and
    rect-rect cases.
  - BW approximate distance remains covered by explicit compatibility tests.
  - Melee range tests prove units must physically touch/overlap the correct top-down shell.
  - Static defense and ranged-unit tests prove top-down edge range is directionally stable.
- Harvest tests:
  - SCVs, Probes, and Drones physically dock before mining/depositing.
  - The second-to-last and outer mineral arc patches are explicitly tested for physical contact.
  - Main-base per-patch round-trip frames match the calibrated timing band.
  - If a patch route is too long to match timing, generation fails instead of using detached
    contact.
  - Mineral saturation behavior remains equivalent to the intended BW-style two-to-three worker
    cadence.
- Map tests:
  - Generated mains, naturals, ramps, and resources remain connected for 1v1, 2v2, and 3v3 across
    representative seeds.
  - Every resource footprint is in bounds, on valid terrain, and clear of cliff/blocker tiles by
    the configured margin.
  - Depot placement is legal at every generated main and natural.
  - Large ground units can path from each shared plateau through ramps to the natural and midfield.
  - `midfield: empty` produces no blockers in the central combat band; other modules must preserve
    connectivity and clearance.
- Visual/debug proof:
  - Add a Math-renderer or headless debug overlay that can draw interaction hulls, docking points,
    route targets, base-site reservations, resource footprints, and timing-valid/invalid markers.
  - Capture at least one reference screenshot for `midfield: empty` and one blocker/choke module
    once implementation begins.

Done when:

- Workers never start mining/depositing while visibly detached from their target in top-down view.
- Main-base mineral timings and saturation remain in the calibrated BW-equivalent band.
- Weapon and interaction ranges read as circular/top-down ranges instead of inherited isometric
  distortions.
- Procedural maps use shared team plateaus, ramp-down naturals, and toggleable midfield modules,
  and generated resource clusters cannot clip into walls or cliffs.
- Replay reconstruction, hash determinism, typecheck, full tests, and movement/economy benchmarks
  pass.

Completed:

- Split BW compatibility distance from runtime top-down distance in `spatial.ts`. BW body bounds
  and approximate distance remain available under explicit `bwApprox*` names; combat, scarabs,
  repair, grid target acquisition, and harvesting now use named top-down edge checks.
- Top-down structure interaction uses build-footprint hulls for contact, so workers and combat
  units read against the same solid footprint that pathing/placement uses instead of a smaller
  isometric BW body rectangle.
- Harvesting now requires visible top-down docking/contact before mine or deposit starts. A worker
  at the old BW-compatible detached mine range moves closer instead of starting the mine timer.
- Added coordinate and spatial regression tests for fixed build-tile centers, footprint hulls,
  BW approximate distance versus top-down physical distance, top-down combat thresholds, and
  detached harvest contact.
- Replaced the procedural generator's per-start mini plateaus with shared north/south team
  plateaus, ramp exits, low-ground natural base-site metadata, empty midfield default, optional
  midfield modules, and generated resource-footprint validation.
- Extended procedural replay specs with optional `preset` and `midfield` fields while preserving
  the existing deterministic defaults.
- Updated `docs/specs/sc1-spec.md` and `docs/specs/maps.md` so the written contract matches the
  code: BW values are source constants; top-down geometry is runtime contact/reach truth.
- Verified with `npm run typecheck` and the full `npm test` suite.
- Added deterministic resource/depot docking targets so workers route to exact mineral, gas, and
  depot contact points instead of center points; inner and outer mineral arc tests now prove mine
  and deposit happen at physical contact.
- Replaced the provisional two-second extraction timer with BW frame timings: minerals mine for
  80 frames and gas mines for 37 frames before travel/deposit timing.
- Added the first route diagnostic table for main-base mineral routes. It exposes BW target trip
  frames, target route frames, actual top-down dock-to-dock route frames, positive slack, and
  invalid-too-long flags without letting diagnostics bypass physical docking.
- Simplified harvest deposit timing: workers returning minerals or gas now deposit immediately at
  physical depot contact. Route slack is diagnostic only; runtime no longer adds hidden depot waits.
- Added main-base mineral route-quality validation and wired procedural generation to reject maps
  with missing, invalid, or overly asymmetric calibrated mineral routes.
- Replaced procedural base-site resource stamping with reusable base-cluster solver results that
  expose exact depot anchors, depot footprints, standard mineral/gas geometry, and whole-cluster
  reservation footprints for mains and naturals.
- Added deterministic local base-anchor retry before procedural resource stamping. Candidate
  clusters must satisfy depot buildability, whole-reservation walkability/overlap, resource
  clearance, and main-base mineral route quality before they are committed to the map.
- Replaced BW-approx base-resource placement scoring with explicit top-down dock-to-dock targets:
  a bounded mineral band around the 97px saturation target and an 89px built-refinery gas target.
  Slice-map tests now verify physical dock arcs and non-overlapping resource footprints instead of
  BW approximate edge-distance arcs.
- Added gas-specific route calibration for base gas placement. The validator measures the built
  Refinery harvest hull, labels the three-worker gas cadence target, rejects invalid refinery
  routes during procedural cluster selection and final map validation, and keeps the rule as
  placement validation rather than hidden runtime timing compensation.
- Base clusters now repair resource-center geometry before rejecting a depot anchor. The solver
  searches a small deterministic front/back adjustment set on the existing mineral/gas arc, rejects
  mineral candidates that exceed the timing target, preserves legal resource footprints, and keeps
  the final cluster reservation explicit for procedural validation.
- Harvest route calibration now uses the same deterministic path lattice as movement for map
  diagnostics and validation. Clear dock-to-dock routes preserve their exact straight distance,
  while terrain/building detours can make mineral and gas routes invalid without adding hidden
  runtime wait compensation.
- Added a headless map diagnostics overlay that emits serializable rect/point/line/marker data for
  resource footprints, base reservations, interaction hulls, dock points, route targets, and
  timing-valid/invalid markers.

Remaining:

- Phase 9B map-resource route validation is complete for the current shared-plateau generator.

## Phase 11: Timed Transitions And Ability Execution Semantics

Status: current timed-transition substrate implemented; broader timing and representation follow-ups
remain tracked in the BW-fidelity inventory.

Purpose: remove the current class of "instant but should take time" mechanics and replace ad hoc
timer meanings with a small, explicit temporal model that stays deterministic, fast, and easy to
reason about from UI, AI, replay, and future networking.

Why this matters:

- The core typed-array architecture is still correct, but several columns now carry multiple
  meanings depending on unit kind: `built`/`ctimer` means construction, Zerg morph, and Archon
  summoning; `timer` means harvest extraction, larva spawn countdown, Scarab lifetime, and
  Interceptor return state; `specialAmmo` means Spider Mines, Scarabs, Interceptors, and Nuclear
  Missiles.
- This is still performant, but it is becoming cognitively expensive. New BW mechanics can pass
  local tests while accidentally violating command masks, collision, AI action legality,
  observations, cancellation, or replay/hash invariants.
- The fix should not be a generic event bus or object-oriented entity model. Keep the SoA hot path.
  Add only the typed columns and helpers needed to make lifecycle state explicit.

Source timing/data already present in local docs and sim tables:

| Mechanic | Source value we have | Current implementation | Fidelity decision |
|---|---:|---|---|
| Factory unit production | Factory 50.4s build; Vulture 12.6s, Tank 31.5s, Goliath 25.2s | `prodKind`/`prodTimer` queue | Keep; production queue is sound. |
| Nuclear Missile production | 200M/200G, 37.8s, held by Nuclear Silo | internal ammo through production | Keep; name internal ammo better. |
| Reaver Scarab production | 15M, 4.0s, capacity 5/10, damage 100/125 | internal ammo through production | Keep; formalize as internal product/ammo. |
| Carrier Interceptor production | 25M, 12.6s, capacity 4/8 | internal ammo through production | Keep; formalize as internal product/ammo. |
| Archon/Dark Archon merge | 12.6s merge, no extra resource cost, consumes two Templars | `built=0` + `ctimer`; partner killed | Behavior is mostly right; move to explicit timed transition/completion. |
| Zerg combat morphs | Lurker 40s, Guardian 40s, Devourer 40s | `built=0` + `ctimer` morph | Behavior is mostly right; move to explicit timed transition/completion. |
| Zerg structure morphs | Lair 100s, Hive 120s, Greater Spire 120s, colonies 20s | `built=0` + `ctimer` morph | Keep cancel/refund behavior; make lifecycle state explicit. |
| Burrow research | 100M/100G, 100.8s | researched, but burrow/unburrow toggles instantly | Add timed burrow/unburrow transition after sourcing frame count. |
| Siege Tech research | 150M/150G, 50.4s | researched, but siege/unsiege toggles instantly | Add timed siege/unsiege transition after sourcing frame count. |
| Stim Pack | 10 HP, 12.6s duration | entity status timer | Keep. |
| Lockdown | 100 energy, range 8, 43.8s status | entity status timer | Keep; verify all systems use `isDisabled`. |
| Stasis Field | 100 energy, range 9, local research doc says about 43.8s | entity status timer | Fixed to sourced duration; disabled/invulnerable/expiry coverage added. |
| Maelstrom | 100 energy, range 10, about 7.48/7.56s | entity status timer | Keep. |
| Psionic Storm | 75 energy, range 9, 2.67s, 8-frame period, 112 total damage | persistent effect | Keep; verify period/damage total. |
| Defensive Matrix | 100 energy, range 10, 250 HP, 56.7s | entity status pool/timer | Keep. |
| Irradiate | 75 energy, range 9, local research doc says 249.9 damage over 25.2s, 32px radius | entity status/dot | Fixed to 25.2s damage window with 250 integer total damage coverage. |
| Ensnare | 75 energy, range 9, 25.2s | entity status timer | Keep. |
| Plague | 150 energy, range 9, 25.2s, periodic damage, cannot kill | entity status/dot | Keep; verify min-1-HP invariant remains covered. |
| Dark Swarm | 100 energy, range 9, 37.8s | persistent effect | Keep. |
| Disruption Web | 125 energy, range 9, local docs say 15.12s | persistent effect | Fixed to sourced duration; expiry/attack-blocking coverage added. |
| Scanner Sweep | 50 energy, global, local docs say about 6.8-11s, sim uses 8.4s | persistent effect | Accept provisional; document exact source when chosen. |
| Nuclear Strike channel | local docs say Ghost channels about 14.5s | `Order.Cast` + effect | Fixed to sourced channel duration; tests cover old-delay regression, impact timing, missile spend, and interruption. |
| Nuclear Strike damage/falloff | local docs say 500 damage or 2/3 max HP+shields, whichever is greater, with 100/50/25% splash falloff; BWAPI weapon id 31 uses 128/192/256px bands | named nuke damage helper plus shared radial percent helper | Fixed; tests cover high-HP full hit, shield split, 50%/25% falloff, and far/no-hit. |
| Yamato Gun | 150 energy, range 10, 260 damage; BWAPI weapon id 30 confirms 260 damage and 320px range, but not cast frames | instant damage | Keep instant until windup/cast frames and interruption semantics are sourced. |

Implementation:

- Add a small explicit entity transition primitive:
  - new typed columns such as `transitionKind`, `transitionTargetKind`, `transitionTimer`, and
    `transitionSourceKind` if cancellation/rollback needs it;
  - no object allocation in hot loops;
  - all columns added to clone, serialize, hash, observe/action masks where gameplay-affecting.
- Define transition specs in data, not switch piles:
  - `deploy`: Siege Tank <-> Siege Mode, preserves HP/shields/energy, locks orders while deploying;
  - `burrow`: burrow/unburrow, locks orders while changing visibility/collision state;
  - `merge`: High Templar -> Archon and Dark Templar -> Dark Archon, consumes partner, no cancel;
  - `morph`: Hydralisk/Mutalisk and Zerg structure morphs, preserves existing cancel/refund rules;
  - `instant`: only for truly instant state changes, and every instant entry must be intentional.
- Add one shared busy predicate:
  - `isTransitioning(s, slot)` blocks movement, attack, casting, harvest, repair, build, cargo load,
    unload, mine-lay, transform, and stop semantics as appropriate;
  - UI command cards, AI action masks, replay validation, and command ingestion must all see the same
    rejection reason through `validateCommand`.
- Rename or split the completion system:
  - keep worker build approach/SCV construction logic separate from generic unfinished entity
    completion;
  - make `construction` no longer silently mean Archon summoning and Zerg morph completion.
- Add an ability execution model with a tiny set of modes:
  - `instant`: immediate effects such as Feedback, Consume, Restoration, Parasite, Optical Flare;
  - `status`: target/area status durations such as Lockdown, Stasis, Maelstrom, Matrix, Ensnare,
    Plague, Irradiate;
  - `persistentArea`: Storm, Dark Swarm, Disruption Web, Scanner Sweep, Nuclear warning/impact;
  - `channel`: Nuclear Strike and any future ability cancelled by moving, disabling, or killing the
    caster;
  - `windup`: Yamato Gun and any spell that should spend energy, face/lock the caster, then resolve
    later if still valid;
  - `projectile`: future missile/volley cases where travel time or interception matters.
- Formalize internal ammo as a first-class producer result:
  - keep `specialAmmo` if that remains the cheapest column, but route writes through helpers such as
    `queueInternalProduct`, `finishInternalProduct`, and `consumeInternalAmmo`;
  - cover Scarabs, Interceptors, Spider Mines, and Nuclear Missiles without direct random writes.
- Keep deterministic ordering:
  - command ingestion starts transitions and ability executions;
  - transition advancement runs before normal orders, so newly completed forms are available
    deterministically on that tick;
  - status/effect ticking remains one ordered system with no unordered maps in gameplay mutation.

Stats and source work before implementation:

- Sourcing pass (2026-06-18):
  - Local specs confirm the research costs/times and current unit stat targets, but do not provide
    transform animation durations for siege/unsiege or burrow/unburrow.
  - Ignored `tmp/bwapi` reference material confirms the public command and order/state surfaces:
    `UnitCommand::burrow/unburrow/siege/unsiege`, tech-toggle mapping for `Burrowing` and
    `Tank_Siege_Mode`, command dispatch to `BW::Orders::Burrow`, `Unburrow`, `Siege`, and
    `Unsiege`, and client temporary orders `Orders::Burrowing`, `Orders::Unburrowing`, and
    `Orders::Sieging`.
  - Yamato audit: `tmp/bwapi` confirms `TechTypes::Yamato_Gun` is a unit-targeted tech that maps to
    `Orders::FireYamatoGun`, weapon id 30 is 260 damage at 320px range, and
    `MoveToFireYamatoGun` reports as `FireYamatoGun`; the checked BWAPI paths and tests do not
    expose cast/windup frames or interruption semantics.
  - BWAPI does not expose the exact animation/transition/cast frame counts in the checked command,
    order, unit-type, weapon-type, tech-type, or client-temp paths. Do not implement deterministic
    transition or windup timers from guessed values.
  - Durable note and repeatable audit live in `docs/research/bw-transition-timings.md` and
    `npm run research:bw-timings`.
  - Next source step before timed transition or Yamato windup implementation: extract/inspect Brood
    War `iscript.bin`/order data, or add a measurement harness from replay/game traces, then record
    the exact frame counts and interruption semantics here with source paths.
- Reconcile local doc/spec mismatches:
  - Stasis duration fixed: `docs/research/sc1-spells-upgrades.md` says about 43.8s and
    `data-abilities.ts` now matches.
  - Irradiate duration fixed: research doc says 25.2s for the damage window and
    `data-abilities.ts` now models 250 integer damage over that window.
  - Disruption Web duration fixed: research doc says 15.12s and `data-abilities.ts` now matches.
  - Nuclear Strike channel fixed: research doc says about 14.5s and `data-abilities.ts`
    now uses that channel duration.
  - Nuclear Strike damage/falloff fixed: research doc says 500 or 2/3 max HP+shields,
    whichever is greater, with 100/50/25% radius falloff; `tmp/bwapi` weapon id 31
    gives 128/192/256px splash bands, and sim now uses those bands through shared
    radial percent logic.
- Source missing animation/cast frame counts before coding:
  - Siege Tank siege and unsiege deploy duration.
  - Burrow and unburrow duration by unit class, or a verified shared BW value if one exists.
  - Yamato Gun cast/windup frames and whether interruption after energy spend cancels damage; BWAPI
    confirms command/order/damage/range facts only.
  - Spider Mine wake-up/acquire/leap timing if we want more than the current acquire/detonate model.
  - Carrier Interceptor exact attack-pass cadence if current orbit/return behavior proves materially
    different under tests.
- `tmp/bwapi` is available as ignored reference material. It is useful for command/order semantics,
  prerequisites, and BWAPI-facing behavior, but the missing timing values still require iscript/dat
  extraction or measured traces before implementation.

Tests and proof:

- Siege transform tests:
  - accepted command starts a transition, does not immediately change weapon/move capability;
  - tank cannot move/fire/cast/load while deploying;
  - completion changes kind once, preserves HP/cooldowns/facing consistently, and hashes/serializes.
- Burrow tests:
  - burrow/unburrow are not instant;
  - visibility/collision/attack capability changes at the chosen transition point;
  - Lurker attack gating remains correct and AI does not issue impossible orders mid-transition.
- Morph/merge regression tests:
  - Archon merge remains uncancellable, consumes exactly two templars, preserves supply semantics;
  - Zerg morph cancel/refund still restores the source kind and cost ledger;
  - unfinished morphs cannot attack, move, cast, load, or be used as completed producers.
- Ability execution tests:
  - duration effects tick exactly from source values;
  - Yamato windup delays damage and cancels correctly if the caster dies/is disabled if BW says so;
  - Nuclear Strike uses the verified channel duration, consumes the missile at the correct point, and
    cancels or completes through one shared channel path.
- Architecture tests:
  - every new entity column is covered by clone/serialize/hash registry tests;
  - action masks expose no command during `isTransitioning` unless explicitly allowed;
  - replay hash tests cover at least one transition and one delayed ability.

Done when:

- No implemented self-state transform that takes time in BW is represented as an instant kind/flag
  flip unless the roadmap names it as an intentional approximation.
- Timed transitions, production, research, channelled abilities, persistent effects, and status
  durations have separate, named ownership in the code.
- The command card and AI masks derive transition/cast legality from shared validation, not UI or bot
  special cases.
- Full `npm run typecheck`, `npm test`, and the relevant headless benchmark pass without measurable
  regression in no-vision and vision stepping.

## Phase 12: Architecture Compression And Blind-Spot Reduction

Status: in progress.

Purpose: keep the codebase understandable at a glance as BW fidelity grows. This is not a rewrite:
the deterministic SoA sim, typed-array hot loops, fixed tick pipeline, command stream, shared
validation, and data tables are the right foundation. The rework is about making each gameplay
concept have one owner, one vocabulary, and one public derived view so UI, AI, tests, replay, and
future networking do not each rediscover slightly different truths.

What is already elegant and should be preserved:

- `Command` is the universal boundary for UI, AI, replay, future network input, and RL actions.
- `validateCommand` is already the authoritative legality gate. This is valuable even though the
  file is large, because it prevents app-only command behavior from becoming a second ruleset.
- Validator-backed action masks are the right interface for RL and headless AI. They should expand
  from command heads into richer ability/research/build/train option summaries, not be bypassed.
- The `World`/`Entities` typed-array registry is fast, deterministic, cloneable, serializable, and
  hashable. Avoid replacing it with object graphs or allocation-heavy event systems.
- The fixed system order in `tick.ts` is a strength. Temporal mechanics should become more explicit
  inside that order rather than adding hidden callbacks.
- `data.ts`, `TechDefs`, `AbilityDefs`, footprint metadata, and derived stat helpers are the right
  direction: BW quirks belong in data or named mechanics, not scattered UI conditionals.
- Scarabs and Interceptors as child actors are conceptually correct. The issue is not the concept;
  it is that child actor commandability, presentation, ammo, and lifecycle are not yet described in
  one place.

Where representation is currently duplicated or at risk of drifting:

- Entity lifecycle is represented in multiple places:
  - sim columns such as `built`, `ctimer`, `morphFromKind`, `prodKind`, and `prodTimer`;
  - app presentation helpers for unfinished, morphing, and merging entities;
  - selected-unit status text;
  - health/progress bars in render code;
  - command-card availability and labels.
  This should collapse into one sim-side derived lifecycle/status helper.
- Command capability is represented in multiple layers:
  - `validateCommand`;
  - `action-mask`;
  - `Game.refreshSelectionSummary`;
  - command-card option construction;
  - AI tactical and macro checks.
  Validation should remain authoritative, but option discovery should move out of `Game` into a
  shared selection-capability/query module.
- Ability semantics are split across data, the large ability execution switch, AI casting heuristics,
  UI option metadata, and effect rendering. Every ability should have an execution mode and optional
  AI policy/presentation descriptors so adding one spell does not require hunting five files.
- Internal ammunition is overloaded:
  - Spider Mines, Scarabs, Interceptors, and Nuclear Missiles all use `specialAmmo`;
  - production completion, combat launch, nuke consumption, UI ammo labels, and AI checks know pieces
    of that story.
  Keep the cheap column if useful, but route all reads/writes through named internal-product helpers.
- App presentation has gameplay-shaped special cases:
  - Scarab projectile presentation and Scarab/Interceptor non-commandability are hardcoded in
    app-side child actor helpers;
  - construction/repair spark geometry duplicates build range and footprint math from sim-side
    worker construction/repair logic;
  - Scanner Sweep and Nuclear Strike affordances are hardcoded effect presentations.
  These are read-only today, but they are blind spots because visual truth can diverge from sim truth.
- Combat has accumulating unit-specific branches:
  - Reaver ammo, Carrier Interceptors, Bunker contained fire, Lurker line splash, Mutalisk bounce,
    Devourer acid spores, and suicide attackers are all real BW mechanics;
  - the smell is not that they exist, but that they live as direct `Kind.X` checks in the hot combat
    loop instead of behind named weapon delivery/on-hit mechanic ids.
- AI has too much duplicated BW knowledge:
  - direct race tech arrays are acceptable as strategy preferences;
  - direct ability thresholds, target filters, energy/range checks, and ordered casting chains should
    gradually move into ability policy descriptors backed by validation.
- Upgrade effects are centralized, which is good, but still switch-heavy. Range, speed, energy,
  armor, shield, and weapon effects should become table-driven where the table is clearer than a
  switch.
- `validation.ts`, `ingest.ts`, and `production.ts` are doing too much. Their public entry points can
  stay stable, but the internals should split by command family/system responsibility.

Acceptable special cases versus architectural debt:

- BW contains true special mechanics. Carrier, Reaver, Lurker, Bunker, Nydus, Spider Mine, Creep,
  Pylon power, addon attachment, larva, burrow, cloak, and Archon merge should not be forced into a
  fake generic model.
- A special case is acceptable when it is represented as a named mechanic with data, tests, and one
  owner.
- A special case is architectural debt when UI, AI, validation, combat, presentation, and production
  each check `kind === X` for different fragments of the same mechanic.
- Prefer "small closed sets" over abstraction soup: `abilityExecutionMode`, `weaponDelivery`,
  `onHitEffect`, `entityLifecycle`, `childActorRole`, `internalProductKind`, and `rallyTargetKind`
  are enough. Do not invent a generic component framework unless a second concrete mechanic needs it.

Rework slices:

1. Add a sim-side entity lifecycle/status query.
   - Return stable states such as `complete`, `constructing`, `morphing`, `merging`, `training`,
     `researching`, `transitioning`, `channeling`, and `dead`.
   - Include progress numerator/denominator, display kind, source/target kind, busy flags, and
     cancelability.
   - Replace app lifecycle interpretation, selected status progress, render progress bars, and command
     card lifecycle labels with this helper.
   - Slice 1 started: added a sim-side `entityLifecycle` derived query for complete, constructing,
     morphing, merging, training, researching, channeling, and dead states; selected-unit status now
     consumes this query for lifecycle labels/progress instead of reinterpreting `built`, `ctimer`,
     `prodKind`, and `researchKind` app-side. Selected world progress bars now use the same
     lifecycle progress for construction, morph, and merge states. Command-card readiness and
     cancelability now derive from lifecycle state/cancelability before `validateCommand` remains
     the final command legality authority.
2. Add entity roles and commandability helpers.
   - Define child/projectile/user-commandable roles in sim data or derived helpers.
   - Replace app-side `Kind.Scarab`/`Kind.Interceptor` commandability checks.
   - Make fallback/math render use the same footprint, base radius, cloak, child actor, and
     completion-state helpers as gameplay diagnostics.
   - Slice 2 started: audited child actor consumers and kept the existing sim-owned
     `child-actors`/render descriptor helpers as the small closed set. Selection commandability
     already flows through `isUserCommandableKind`; GL/Math child rendering already flows through
     `childActorRenderPresentation`; app minimaps now use the named `entityMinimapVisible` policy
     instead of deriving minimap inclusion from render sizing with a fake radius.
3. Centralize selection capability and command option discovery.
   - Keep `validateCommand` as the final authority.
   - Move build/train/research/ability/transform/load/unload option enumeration out of `Game`.
   - Return compact option records with command, hotkey id, enabled reason, affordability, target mode,
     and representative actor.
   - Feed mobile command cards, desktop command grid, AI action masks, and tests from the same query.
   - Slice 3 started: cargo order discovery now uses sim-owned selection candidates for both load
     and unload. `selectionCapabilities` consumes `loadSelectionCandidates` and
     `unloadSelectionCandidates`, while unload fan-out offsets, validation filtering, and Nydus exit
     routing live beside the other command-intent candidate helpers.
   - Transform option execution candidates now also resolve through `transformSelectionCandidates`,
     so simple morph commands and deterministic merge pairing live in the sim command-intent layer
     instead of the app command-card presenter.
   - Train option execution candidates now resolve through `trainSelectionCandidates`, preserving
     the least-loaded selected producer rule in the sim command-intent layer while app code keeps
     train labels and disabled reasons.
   - Add-on option execution candidates now resolve through `addonSelectionCandidates`, preserving
     selection-order choice in the sim command-intent layer while app code keeps add-on visibility
     and disabled reasons.
   - Research option execution candidates now resolve through `researchSelectionCandidates`, preserving
     first-valid selected producer choice in the sim command-intent layer while app code keeps research
     visibility and disabled reasons.
   - Self-targeted ability execution candidates now resolve through `selfAbilitySelectionCandidates`,
     so grouped caster fan-out and validation filtering live in the sim command-intent layer while
     targeted abilities remain app-armed target modes.
   - Ability option availability now resolves through sim-owned `abilitySelectionOptions`, including
     representative casters, disabled reasons, self-cast commands, and targeted ability arm modes;
     app code only maps those records to command-card presentation.
   - Transform option availability now resolves through sim-owned `transformSelectionOptions`,
     preserving ready-only UI visibility, disabled reasons, representative actors, and merge/morph
     execution commands while app code only maps the records into command-card options.
   - Research option availability now resolves through sim-owned `researchSelectionOptions`,
     preserving ready-only UI visibility, disabled reasons, representative producers, and executable
     commands while app code only maps the records into command-card options.
   - Train option availability now resolves through sim-owned `trainSelectionOptions`, preserving
     ready-only UI visibility, disabled reasons, least-loaded representative producers, and executable
     commands while app code keeps train labels and details.
   - Add-on option availability now resolves through sim-owned `addonSelectionOptions`, preserving
     ready-only UI visibility, target-not-allowed hiding, disabled reasons, first-valid representative
     producers, and executable commands while app code only maps records into command-card options.
   - Worker build option availability now resolves through sim-owned `workerBuildSelectionOptions`,
     preserving ready-only UI visibility, missing-capability hiding, disabled prerequisite/affordability
     reasons, first-valid representative workers, and app-side placement arming as presentation only.
4. Split validation by command family without changing the public API.
   - Keep `validateCommand(s, player, cmd)` as the only external entry point.
   - Move internals into movement, attack, gather, build, production, research, ability, cargo, rally,
     transform, and cancel validators.
   - Share predicates such as `isBusy`, `isTransitioning`, `isDisabled`, `canReceiveOrder`,
     `canTargetEntity`, `canUseProducer`, and `canPay`.
   - Ability command legality already lives in `ability-command.ts`; remaining extraction work should
     keep using that module rather than treating ability validation as local `command-specs.ts` debt.
   - Cargo command legality now lives in `cargo-command.ts` for `load`/`unload`, while
     `command-specs.ts` keeps dispatch and side effects unchanged.
   - Rally command legality and target snapping now live in `rally-command.ts`, while
     `command-specs.ts` keeps rally application/storage unchanged.
   - Train command legality now lives in `production-command.ts`, preserving reserved-supply
     validation, queue/internal-product capacity, larva spawn-count handling, and production apply
     behavior in `command-specs.ts`.
   - Research command legality now lives in `research-command.ts`, preserving active add-on,
     power, lifted-building, duplicate/max-level, prerequisite, level-scaled cost, and research apply
     behavior in `command-specs.ts`.
   - Cancel-build legality now lives in `cancel-command.ts`, preserving unfinished foundation,
     morph-cancel, stale/wrong-owner, and target-not-allowed behavior while `command-specs.ts` keeps
     cancel apply/refund behavior unchanged.
   - Harvest command legality now lives in `harvest-command.ts`, preserving worker/burrow/illusion,
     stale/wrong-owner, disabled-unit, and resource target gates while `command-specs.ts` keeps harvest
     order side effects unchanged.
   - Repair command legality now lives in `repair-command.ts`, preserving SCV-only, construction
     resume, target ownership, affordability, and repairability gates while `command-specs.ts` keeps
     repair/resume-construction side effects unchanged.
   - Build command legality now lives in `build-command.ts`, including ownership, entity-capacity,
     worker-build, affordability, prerequisite, and placement gates while `command-specs.ts` keeps
     placement recheck and `beginWorkerBuild` side effects unchanged.
   - Add-on command legality now lives in `addon-command.ts`, preserving parent-kind, landed-parent,
     prerequisite, affordability, entity-capacity, queue, and placement gates while `command-specs.ts`
     keeps `startAddon` side effects unchanged.
   - Spider-mine command legality now lives in `mine-command.ts`, preserving Vulture state, Spider
     Mines tech/ammo, entity-capacity, stale/wrong-owner, and missing-capability gates while
     `command-specs.ts` keeps `laySpiderMine` side effects unchanged.
5. Split command ingestion by command family without changing replay semantics.
   - Keep deterministic command ordering and stable rejection behavior.
   - Move side effects into small apply functions that pair with validation families.
   - Prevent one command handler from directly knowing unrelated concepts such as rally, morph,
     production, cargo, and spell execution.
6. Split production into named sub-systems.
   - Keep producer queues, internal products/ammo, larva spawn, spawn rally, gather rally, and load
     rally as separate named responsibilities.
   - Add helpers for internal products so Scarabs, Interceptors, Spider Mines, and Nukes cannot drift.
7. Introduce weapon delivery and on-hit mechanic ids.
   - Keep the combat loop data-oriented and allocation-free.
   - Move Reaver, Carrier, Bunker, Lurker, Mutalisk, Devourer, suicide, and future splash behaviors
     behind tiny closed-set mechanics.
   - Tests should prove each special weapon path through one named mechanic, not through scattered
     kind checks.
8. Introduce ability execution descriptors and AI policy descriptors.
   - Every ability gets an execution mode: `instant`, `status`, `persistentArea`, `channel`, `windup`,
     or `projectile`.
   - AI heuristics can remain hand-authored, but they should attach to ability policy records rather
     than a single long ordered casting chain.
   - UI, AI, and validation should all agree on target mode, range shape, required tech, energy,
     duration, and whether the caster is locked.
9. Add effect presentation descriptors.
   - Effects such as Scanner Sweep, Nuclear Strike, Storm, Swarm, Web, Plague/Irradiate overlays, and
     future detection affordances should declare visibility, radius, duration/progress, and render
     category in one table.
   - The app renderer can stay app-side, but it should consume effect descriptors rather than branch
     on each effect kind.
10. Gradually table-drive derived upgrade effects.
    - Do this only where it clarifies. Some centralized switches are acceptable until the table is
      simpler than the code.
    - Priority: range, speed, energy maximum, spell unlocks, weapon/armor/shield increments, and unit
      morph/producer unlocks.
11. Add architecture guard tests.
    - Every gameplay-affecting entity column must be covered by clone, serialize, hash, observe, and
      replay tests.
    - App commandability should not hardcode child actor kinds.
    - Every ability should have an execution mode and target descriptor.
    - Every internal product should be produced, consumed, serialized, and exposed through one helper.
    - Benchmark no-vision and vision stepping after any hot-loop architecture change.

Done when:

- A teammate can answer these questions from one helper/table each:
  - What is this entity?
  - What can it legally do now?
  - What is it doing now?
  - How should it be selected, drawn, targeted, and exposed to AI/RL?
- UI, AI, renderer, and tests no longer reimplement lifecycle, commandability, or ability target rules.
- Unit-specific BW quirks still exist, but they are named mechanics with data and tests rather than
  scattered conditionals.
- `Game` is mostly orchestration: input, selection, camera, renderer wiring, and sim command dispatch,
  not a second rules engine.
- Hot loops remain typed-array friendly, deterministic, and benchmarked.

## Phase 13: LOC Collapse Without Losing Correctness

Status: complete for the current scope.

Purpose: reduce the codebase by removing repeated representations, not by making dense clever code.
The target shape is small enough to hold in one mental model: authoritative tables, deterministic
state, command specs, tick systems, and derived queries. If a future teammate must grep five files to
understand one mechanic, the code has not collapsed far enough.

The engine should conceptually collapse to these layers:

- State:
  - `World`, `Entities`, `Players`, `Effects`, map, replay command stream, and deterministic hashes.
  - This remains typed-array/SoA. Do not trade clarity for object allocation in hot loops.
- Data:
  - unit, weapon, ability, tech, upgrade, footprint, role, transition, internal-product, child-actor,
    and effect-presentation definitions.
  - Data should answer "what is possible" before code answers "how does it mutate state."
- Commands:
  - one public command vocabulary;
  - one validation path;
  - one application path;
  - one option-discovery path for UI/AI/RL.
- Systems:
  - ordered deterministic mutations: movement, combat, production, research, ability/status/effect,
    visibility, construction/transition, harvest, cargo, and cleanup.
- Queries:
  - lifecycle/status, commandability, selection capability, target classification, combat capability,
    render affordances, and AI-visible option masks.
  - Queries are where app/AI/test code should look. They should not write gameplay state.

Highest-impact LOC reductions:

1. Replace parallel validation/application switches with command specs.
   - Current shape: `validation.ts` and `systems/ingest.ts` both switch over every command type, each
     with repeated actor lookup, ownership, busy/capability checks, and result plumbing.
   - Collapse shape:
     - keep `validateCommand` and `applyCommands` public;
     - define a small `CommandSpec` table keyed by command tag;
     - each spec has `actor`, `reserve`, `validate`, and `apply`;
     - shared preflight helpers handle player existence, live entity lookup, ownership, containment,
       complete/busy/powered checks, and affordability.
   - Expected win: fewer lines and fewer correctness holes. New command types get one local home
     instead of a validator branch, an ingest branch, UI option code, and AI legality workaround.
   - Completed:
     - Introduced the first internal `CommandSpec` table for the basic unit-order family (`move`,
       `amove`, `stop`) and routed both `validateCommand` and `applyCommands` through it while keeping
       public behavior stable.
     - Expanded the same spec path to `attack`, preserving target legality, detection, carrier/reaver
       special cases, and order application behavior.
     - Generalized the internal spec path beyond unit orders and moved `rally` into it, keeping rally
       target snapping and structure target validation in one command home.
     - Moved `harvest` into the same command-spec path, preserving worker/resource validation and
       resource-route collision setup.
     - Moved `repair` into the command-spec path and relocated paused Terran foundation resume into
       `repair.ts`, keeping SCV repair and construction continuation under one mechanic owner.
     - Moved the tiny special-action family (`burrow`, `mine`) into command specs, with burrow state
       mutation in `burrow.ts` and spider-mine laying in a small mechanic helper.
     - Moved `cancelBuild` into command specs and relocated foundation/morph cancellation into
       `build-cost.ts`, keeping refundable build ledgers and cancel side effects together.
     - Moved the cargo command family (`load`, `unload`) into command specs and relocated unload
       side effects into `cargo.ts` beside loading and placement helpers.
- Moved `transform` into command specs and relocated instant transform, Zerg morph, and Protoss
  merge side effects into `unit-transform.ts` beside the transform definitions; shared prerequisite
  checks now live in one requirements helper instead of being duplicated by the command split.
- Moved `lift`/`land` into command specs, moved their immediate Terran state transitions into
  `terran-mobility.ts`, and extracted placement checks to `placement.ts` so command specs,
  validation, construction, and movement share the same footprint query without a validation cycle.
- Moved `research` into command specs and put research queue/cost mutation in `tech.ts`; addon
  liveness is now a shared `addon.ts` helper used by production, research, and command validation.
- Moved `addon` into command specs and put add-on spawn/link/cost mutation in `addon.ts` beside
  add-on parent compatibility, position, and active-parent helpers.
- Moved `train` into command specs and put production queue/cost mutation in
  `production-queue.ts`, preserving same-tick reserved supply through narrow command-spec context.
- Moved `build` into command specs and put worker build legality plus pending construction order
  stamping in `build-command.ts`, preserving placement snapping, pending refunds, and construction
  ledgers outside ingestion.
- Moved `ability` into command specs and put the existing ability legality/apply bridge in
  `ability-command.ts`, leaving spell execution behavior unchanged for the descriptor refactor.
- Command-family migration is complete; start the larger ability descriptor refactor in the next
  slices.
2. Replace ability switch piles with ability execution descriptors plus tiny effect handlers.
   - Current shape: ability legality is mostly data-driven, but execution is a large switch and AI
     casting is a second long ordered switch/chain.
   - Collapse shape:
     - `AbilityDef` gains execution mode, target shape, status/effect id, duration, period, damage,
       caster lock/channel policy, and optional special handler id;
     - generic execution covers self toggle, single target status, point area status, persistent area,
       direct damage, energy/shield/hp transfer, and channel/windup;
     - only truly special abilities keep named handlers: Recall, Hallucination, Mind Control, Infest,
       Consume, Spawn Broodling, Nuke, maybe Restoration if status clearing stays bespoke.
   - Expected win: the ability system becomes a table plus a handful of named exceptional handlers,
     while validation/UI/AI all read the same target/execution metadata.
   - Completed:
     - Added first-pass `AbilityDef.execution` metadata and a generic timer-status executor for
       simple recurring spell shapes. `Stim Pack` now applies a caster status timer and `Lockdown`
       applies a target status timer through descriptors while complex spells stay on named
       handlers.
     - Extended descriptor execution to permanent target marker spells: `Optical Flare` now sets
       detector suppression and `Parasite` now records the caster owner through the generic marker
       path.
     - Added target restore descriptors: `Heal` restores hit points and `Shield Recharge` restores
       shields through the same capped restore path.
     - Extended descriptor target timers to `Irradiate`, so the generic execution path owns the
       target's damage-over-time timer while the existing tick system owns periodic splash damage.
     - Added a persistent point-effect execution descriptor for non-damaging map effects:
       `Disruption Web`, `Dark Swarm`, and `Scanner Sweep` now spawn their effects through the
       generic descriptor path while leaving effect ticking behavior unchanged.
     - Moved `Psionic Storm` onto the same persistent-effect descriptor path, with damage cadence
       still owned by effect ticking rather than spell-cast branching.
     - Added target direct-damage execution for `Yamato Gun`, preserving independent damage behavior
       while removing another single-spell cast branch.
     - Added target energy-feedback execution for `Feedback`, so the generic path drains target
       energy and applies matching independent damage.
     - Added self-toggle execution for active cloak abilities, including descriptor-aware free
       toggle-off validation/application.
     - Added point area-status execution for `Stasis Field`, `Maelstrom`, `Ensnare`, and `Plague`,
       preserving team/role/trait filtering and existing Plague ticking.
     - Added target timed-buffer execution for `Defensive Matrix`, preserving matrix hit point and
       timer behavior while removing another cast branch.
     - Added point area-drain execution for `EMP Shockwave`, preserving shield/energy zeroing for
       non-resource entities in radius.
     - Closed the generic execution pass: the remaining direct cast handlers are the intentional
       bespoke mechanics listed above.
3. Replace AI's tactical casting chain with an ability policy table.
   - Current shape: `bot.ts` has a one-line branch for almost every ability, then many near-identical
     `maybeCast*` and `score*` helpers.
   - Collapse shape:
     - one ordered `AbilityPolicy[]`;
     - each policy names the ability, minimum score, target search mode, scorer, friendly-fire policy,
       focus penalty, and special precondition;
     - one `tryCastPolicy` handles energy, tech, range, detection, `validateCommand`, and command
       emission.
   - Expected win: bot intelligence stays hand-authored, but the code becomes a compact list of
     strategic preferences instead of a procedural spell script.
   - Completed with the friendly restore family first: `Heal` and `Shield Recharge` now use a shared
     `AbilityPolicy`/`tryCastPolicy` path that scores targets and delegates legality to
     `validateCommand`.
   - Moved `Restoration` into the friendly entity policy path, preserving the existing
     status-clearing target preference while deleting the bespoke AI cast helper.
   - Extended entity policies with caster/focus context and moved `Defensive Matrix` into the shared
     policy path without changing its threat/damage target score.
   - Moved `Hallucination` into the same focus-aware friendly entity policy path, preserving its
     high-value combat target scoring while deleting the bespoke cast helper.
   - Added a narrow caster precondition hook for tactical policies and moved `Consume` into the
     friendly entity policy path while preserving its energy-deficit gate and expendable-unit score.
   - Moved `Scanner Sweep` into the enemy-point policy path, preserving its cloaked-undetected target
     score while deleting the bespoke scan helper.
   - Added a friendly-point policy mode and moved `Recall` into it, preserving its fight-proximity
     caster gate and distant friendly combat-cluster score.
   - Moved `Nuclear Strike` into the enemy-point policy path with a ready-missile precondition and
     removed the remaining generic point-cast helper.
   - Extended policies to descriptor-backed enemy entity spells: `Parasite`, `Optical Flare`, and
     `Lockdown` now share the policy target-selection path.
   - Moved plain high-value enemy entity spells into the same policy path: `Feedback`,
     `Yamato Gun`, and `Mind Control`.
   - Moved the remaining Queen enemy-entity pair, `Spawn Broodling` and `Infest Command Center`,
     into the policy path while keeping their existing scorers and validation gates.
   - Moved `Irradiate` into the same enemy-entity policy path and deleted the old generic
     entity-cast helper.
   - Added point-target policies for non-Nuke area spells: `EMP`, `Psionic Storm`, `Plague`,
     `Ensnare`, `Maelstrom`, `Stasis Field`, `Disruption Web`, and `Dark Swarm` now share
     the policy search path while preserving focus penalties.
   - Replaced the remaining per-ability tactical dispatch chain with iteration over the ordered
     `TACTICAL_ABILITY_POLICIES` table; active cloak remains the explicit self-toggle exception.
   - The tactical policy table now owns target/point/entity spell casting. Active cloak toggles
     (`Personnel Cloaking`, `Cloaking Field`) intentionally remain in the bespoke
     `maybeCastCloak` self-toggle path for now because they are combat-timing decisions rather
     than target-selection policies.
4. Replace `Game` command-option/status derivation with sim/app query modules.
   - Current shape: `Game` owns camera/input, selection, command modes, placement ghosts, command-card
     capability summaries, selected status text, group management, replay scrub, and command emission.
   - Collapse shape:
     - `Game` keeps orchestration and stateful input/camera concerns;
     - `selectionCapabilities(s, player, selectedIds)` builds command-card/desktop-grid options;
     - `entityLifecycleStatus(s, slot)` builds selected status and progress;
     - `smartCommandCandidates(s, player, actor, targetOrPoint, scheme)` returns ranked commands for
       mobile/desktop input.
   - Expected win: the app stops being a second rules engine, and both mobile and desktop controls
     become policy over shared command candidates.
   - Completed:
     - Extracted selected entity lifecycle/status derivation into `entityLifecycleStatus`, a pure
       read-only query used by `Game` when publishing `selectionView.status`.
     - Extracted command-card option and affordance aggregation into `selectionCapabilities`, a pure
       read-only query used by `Game` when publishing `selectionView`.
     - Extracted normal mobile tap and desktop smart-click command ranking into
       `smartCommandCandidates`, a pure read-only query used by `Game` before enqueueing commands.
     - Extracted producer/research/internal-ammo work derivation into `entityWorkQueue`, used by
       lifecycle status, nuclear command-card metadata, and producer load ordering.
     - Extracted resource/time/result/control-group/selection publication into `publishHud`, so
       `Game` supplies state and visibility while HUD signal writes live in one app-side module.
     - Extracted `ControlGroupController`, which owns group storage, live filtering, assign/recall
       selection mutation, pruning, and repeat-recall centering decisions behind stable `Game` wrappers.
     - Extracted `PlacementController`, which owns placement ghost derivation and build/land commit
       command construction behind stable `Game` wrappers for input and tests.
     - Extracted `InputGestureController`, which owns pointer session state, placement drag/commit,
       minimap drag, box select, desktop tap/right-click, middle-button pan, pinch pan/zoom, and
       multi-touch suppression while `attachInput` remains the DOM wiring surface.
     - Extracted `TapSelectionController`, which owns mobile tap, desktop select/smart tap, box select,
       double-tap select-all, preferred-hit validation, and harvest/repair target-mode command policy
       behind stable `Game` wrappers.
     - Closed the app-query/controller pass: command specs, ability descriptors, and AI policies are
       tracked in the earlier Phase 13 items rather than hidden in `Game`.
5. Introduce a scenario/test DSL.
   - Current shape: tests repeatedly create sims, find bases, spawn units, set resources, grant tech,
     advance frames, search commands, and assert command results.
   - Collapse shape:
     - shared builders such as `scenario().race(Zerg).minerals(1000).unit(Kind.Hydralisk).tech(...)`;
     - helpers such as `expectAccepted(command)`, `expectRejected(command, reason)`,
       `expectBotCasts(Ability.X)`, `advanceUntil(predicate, limit)`, and `entity(kind, owner)`;
     - table-driven cases for tech prerequisites, ability target restrictions, upgrade effects, and
       bot policy choices.
   - Expected win: likely the largest raw LOC reduction. `bot-abilities.test.ts` should become a
     compact policy matrix plus a few bespoke scenario tests instead of thousands of setup lines.
   - Completed:
     - Added the first AI `botScenario` helper with shared sim setup, entity lookup, resource/tech
       setup, spawning, bot execution, and command expectation helpers.
     - Migrated the Stim bot ability test as the initial proof before expanding the DSL across larger
       Zerg tech and command policy clusters.
     - Expanded the helper with build-command assertions and migrated the Hydralisk Den, Spire, and
       Queen Nest Zerg build-gate tests to remove repeated sim/resource/build-validation setup.
     - Migrated the remaining late-Zerg build-policy tests for Nydus Canal, Nydus endpoint expansion,
       Defiler Mound, and Ultralisk Cavern through the same scenario/build assertion helpers.
     - The DSL proof now covers ability assertions and Zerg build-policy assertions, which is enough
       to unblock the command-spec refactor. Additional test DSL migrations should be opportunistic,
       not a prerequisite for the command-spec work.
6. Replace scattered child/internal-product logic with descriptors.
   - Current shape: Scarabs, Interceptors, Spider Mines, and Nukes share concepts but appear as
     `specialAmmo`, child actors, production specials, UI labels, combat checks, and tests.
   - Collapse shape:
     - `InternalProductDef` describes producer, product, capacity tech, cost, build time, display, and
       consumption mode;
     - `ChildActorDef` describes commandability, home slot, launch/return/orbit/despawn behavior, and
       presentation role.
   - Expected win: fewer special checks and clearer ownership. This is more about preventing future
     growth than deleting hundreds of lines immediately.
   - Completed:
     - Added first-pass `InternalProductDef` descriptors for trainable internal ammo: Reaver
       Scarabs, Carrier Interceptors, and Nuclear Silo missiles.
     - Routed `internalAmmoCapacity` through the descriptor table while preserving the existing
       Reaver/Carrier capacity-upgrade helpers.
     - Routed Nuclear Silo ready/arming command-card labels and work status through descriptor
       display metadata instead of app-side `NuclearMissile` special cases.
     - Added first-pass `ChildActorDef` descriptors for Scarabs and Interceptors, moving
       commandability and projectile presentation facts out of the app helper while preserving
       existing selection and renderer behavior.
     - Added Spider Mines to `InternalProductDef` as research-gated Vulture charges, and routed mine
       validation, AI readiness, Vulture spawn/refill, ready-count presentation, and lay-mine
       consumption through shared internal-product helpers.
     - Routed generic internal-product queue fullness and production completion through
       internal-product helpers, preserving saturating completion so trainable internal ammo cannot
       fall through and spawn as normal units.
7. Replace combat's direct unit checks with weapon mechanic ids.
   - Current shape: combat is compact but has growing branches for Reaver, Carrier, Bunker, Lurker,
     Mutalisk, Devourer, and suicide units.
   - Collapse shape:
     - weapon definitions include `delivery`, `onHit`, `ammo`, `containerProvider`, and splash id;
     - the combat loop dispatches to a tiny closed set of mechanic handlers.
   - Expected win: moderate LOC reduction, large readability win, and better fit for future Valkyrie,
     missile, splash, and projectile fidelity.
   - Completed:
     - Added first-pass `WeaponMechanicDef` ids for Reaver Scarab launch and Carrier Interceptor
       launch.
     - Routed the existing Reaver ammo/child-launch and Carrier launch-range/cooldown combat
       branches through those descriptor ids without changing delivery behavior.
     - Added `onHit` mechanic ids for Lurker line splash and Mutalisk bounce, replacing their
       direct post-hit unit checks with a small descriptor dispatch.
     - Routed Devourer acid-spore application through the same `onHit` mechanic dispatch.
     - Added a `postFire` suicide mechanic for Scourge, Infested Terran, and Spider Mine cleanup.
     - Routed Bunker contained-fire targeting and resolution through a `containerProvider` weapon
       mechanic flag without changing loaded infantry behavior.
     - Routed Scarab-launch ammo readiness and consumption through weapon-mechanic helpers backed by
       internal-product descriptors, removing Reaver combat/validation reads of raw `specialAmmo`.
     - Routed Carrier Interceptor launch readiness, launch consumption, and return refill through
       internal-product helpers while preserving deterministic bay/orbit behavior.
     - Routed Nuclear Silo ready-missile lookup and launch consumption through internal-product
       helpers while preserving active add-on parent gating.
     - Routed child actor normal-combat participation and homed external steering through
       `ChildActorDef`, so combat no longer directly knows that Scarabs are projectile-system owned
       or that homed Interceptors are steered by the interceptor system.
     - Replaced the hand-indexed weapon-mechanic lookup with a self-indexed descriptor map and an
       invariant test, preventing `WeaponMechanicDefs` from drifting away from runtime lookup.
8. Move app-only presentation truth into render descriptors.
   - Current shape: cloak opacity, effect affordances, child projectile commandability, construction
     sparks, selection bars, and footprint rendering each have local interpretation.
   - Collapse shape:
     - sim exports pure read-only descriptors for lifecycle, footprint/base hull, commandability,
       effect visibility, and presentation role;
     - renderers choose pixels, not rules.
   - Expected win: smaller app code and more trustworthy fallback/math renderer.
   - Completed:
     - Moved entity lifecycle presentation classification into sim-exported render descriptors,
       including zerg combat cocoon art, zerg/protoss/terran unfinished labels, and merge-summon
       state. The app renderers now consume the descriptor and keep only pixel styling local.
     - Moved gameplay render hulls and selection bases into sim-exported render descriptors. App
       selection hit tests, Canvas2D math rendering, and GL selected health bars now share the same
       footprint/body math while sprite pixel placement remains app-owned.
     - Moved scan/nuke effect visibility affordance policy into a sim-exported render descriptor
       query. The app still supplies viewer tile visibility and renderers still own pixel styling.
     - Moved construction/repair work spark affordance policy into sim-exported render descriptors.
       The app renderers still own particle color and drawing, but no longer interpret worker orders
       or target footprint math themselves.
     - Moved cloaked-entity opacity policy into sim-exported render descriptors. Canvas and GL still
       choose their own sprite/body drawing paths, but share the same cloak presentation value.
     - Moved selected entity life/construction bar policy into sim-exported render descriptors.
       Renderers still choose exact thickness, offsets, and colors, but no longer duplicate selected,
       resource, progress, and HP/shield fraction rules.
     - Moved hallucination/illusion presentation into sim-exported render descriptors. App selection,
       Canvas2D, and GL now share the same viewer/team label, alpha, and tint policy.
     - Moved child projectile presentation into sim-exported render descriptors and removed the app
       child-actor facade. Gameplay child-actor descriptors still own commandability and combat
       participation; renderers consume only role, readable radius, and minimap visibility.
     - Audited remaining app presentation code: app modules now re-export/adapt sim descriptors or
       choose pixel styling; no remaining duplicate app-owned presentation rule was found.

Further concrete deletion opportunities found on review:

1. Collapse target-mode booleans into one discriminated union.
   - Current shape:
     - `ui.placement`, `ui.land`, `ui.amove`, `ui.rally`, `ui.abilityTarget`, and `ui.targetMode`
       can represent impossible mixed states;
     - `Game.clearTargetModes`, UI toggle handlers, placement commit, tap handling, desktop smart tap,
       and tests all reset the same scattered fields.
   - Collapse shape:
     - one `armedCommand` signal, for example:
     `none | place(kind) | land(kind) | ability(id) | rally | attackMove | targetVerb(harvest|repair)`;
     - a single `armCommand`, `clearArmedCommand`, and `isArmed(kind)` helper.
   - Expected win: fewer UI states, less reset boilerplate, cleaner tap semantics, and fewer tests
     that only prove impossible combinations were cleared correctly.
   - Completed:
     - Replaced the six app target-mode fields with one `armedCommand` union.
     - Migrated input, hotkeys, command-card active states, tap handling, desktop smart command
       routing, placement ghost preview/commit, and interaction tests to the single state.
     - Validation: `npm run typecheck` and `npm test` passed.
2. Collapse selection UI signals into one selection view snapshot.
   - Previous shape:
     - `store.ts` exposes separate signals for `selCanBuild`, `selCanRally`, `selBuildKinds`,
       `selBuildOptions`, `selCanLoad`, `selCanUnload`, `selCanBurrow`, and many more;
     - `clearSelectionUi` and `refreshSelectionSummary` write a long list of fields every frame.
   - Collapse shape:
     - one `selectionView` signal with `{ count, kindName, status, can, kinds, options }`;
     - UI and hotkeys read a single coherent selection snapshot instead of pairing scattered
       `selCanX` booleans with `selXOptions`.
   - Expected win: lower app LOC and no risk that `selCanX` disagrees with `selXOptions`.
   - Completed:
     - Replaced the scattered selection signals with one `selectionView` snapshot.
     - Migrated HUD selection labels, status/progress/stats, command-card buttons, command-card
       hotkey discovery, and app interaction tests.
     - Validation: `npm run typecheck`, focused app interaction tests, and `npm test` passed.
3. Make command options actual command candidates.
   - Current shape:
     - command-card options mostly carry `{ id, ok, reason, label, detail }`;
     - button handlers know how to turn each id back into a command through many `Game` methods.
   - Collapse shape:
     - `CommandOption` carries a `command` or a target-mode descriptor plus hotkey/action metadata;
     - UI clicks dispatch `game.executeOption(option)` for instant commands or arm its target mode.
   - Expected win: fewer bespoke methods such as train/build/research/ability/transform/lift/land
     wiring in `Game`, and desktop hotkeys can invoke the same option records.
   - Completed:
     - Added executable command candidates to enabled train, add-on, transform, and research options.
       The command card and desktop hotkeys now route those option clicks through one
       `Game.executeOption` path.
     - Added target-mode descriptors to enabled worker build and non-self ability options, plus
       command candidates for self abilities. Command-card clicks and desktop hotkeys now use
       `Game.executeOption` for build and ability options too.
     - Added order target-mode descriptors for rally, attack-move, harvest, and repair. Their
       command-card buttons and desktop hotkeys now route through the same `Game.executeOption`
       arm/toggle path as build placement and targeted abilities.
     - Moved stop, burrow, unburrow, lay mine, lift off, land, and cancel into
       `selection.options.order`; their command-card buttons and desktop hotkeys now execute the
       same option records, and the redundant direct `Game`/`CommandController` methods were
       removed.
     - Removed the parallel `SelectionView.kinds` arrays; app tests now assert enabled
       `selection.options.*` records directly, so command-card availability has one published
       representation.
     - Moved grouped load and unload generation into order options, including deterministic unload
       ring placement and nydus exit anchoring. UI buttons and desktop hotkeys now execute those
       option records, and the direct app load/unload wrappers were removed.
     - Removed the remaining train/research/add-on/transform selected-command wrappers from the app
       controller facade; tests now execute the published option records for research and grouped
       transforms. Targeted ability casting remains as tap-resolution behavior, not a command-card
       shortcut.
4. Move common read helpers into a tiny query/math layer.
   - Current shape:
     - `distSq`/`distanceSq` is duplicated in detection, creep, power, validation, unit transform,
       combat, mines, weapon hit, app activity, and AI bot code;
     - `hasCompletedKind` exists in both validation and AI;
     - ability tech availability is repeated in AI despite existing sim tech/ability data.
   - Collapse shape:
     - add boring shared helpers such as `distanceSq`, `withinRangeSq`, `completedKindCount`,
       `hasCompletedKind`, `requirementsMet`, `abilityAvailable`, `completedProducers`, and
       `liveOwnedSlots`;
     - keep them allocation-free and obvious.
   - Expected win: small raw LOC win, but large blind-spot reduction because AI, validation, and UI
     stop making subtly different "completed/available/in range" decisions.
   - Completed:
     - Exported the sim-owned `hasCompletedKind`/`requirementsMet` helpers through `@rts/sim` and
       removed AI's duplicate completed-kind implementation, including its add-on attachment rule.
     - Added sim-owned allocation-free center-distance helpers `distanceSq` and `withinRangeSq`,
       then replaced local duplicates in creep coverage, Pylon power coverage, and merge partner
       selection.
     - Replaced the remaining sim-side center-distance duplicates in detection, ability validation,
       load/unload validation, spider mine wake-up, splash weapon hits, and combat special mechanics.
     - Routed AI distance checks through the exported sim spatial helpers and replaced the bot's
       local ability-tech gate with a sim-owned helper that command validation also uses.
     - Moved rectangle-point distance into the shared sim spatial helpers and replaced the local
       construction-system and render-descriptor copies, keeping build-site range checks and
       construction spark affordances on the same math primitive.
     - Audited remaining distance-style uses: they are now shared helpers, explicit BW compatibility
       math, domain-specific footprint geometry, or test/reference assertions rather than duplicate
       generic helpers.
5. Split `Game` by responsibility only after collapsing UI state.
   - Completed shape:
     - `game-session.ts`: setup/restart/replay/human player;
     - `camera-controller.ts`: resize, screen/world transforms, zoom/pan/edge pan;
     - `visibility-controller.ts`: app fog cache, explored memory, tile visibility, and visible-entity
       cache, while sim vision/detection remain authoritative;
     - `selection-controller.ts`: hit tests, drag selection, control groups;
     - `command-controller.ts`: armed command state, smart command candidates, dispatch;
     - `hud-publisher.ts`: writes `selectionView` and top-bar resources.
   - Completed:
     - Extracted camera, viewport, edge-pan, screen/world conversion, and minimap navigation into
       `CameraController` while keeping `Game`'s public camera fields and wrapper methods stable for
       renderers, input, and existing tests.
     - Extracted app fog memory, explored memory, tile visibility, and visible-entity caching into
       `VisibilityController` while keeping sim vision/detection authoritative and preserving
       `Game`'s public visibility wrappers for renderers, HUD, and tests.
     - Extracted selection ownership, selection geometry hit-testing, drag-box selection,
       visible-kind selection, pruning, and control-group coordination into `SelectionController`,
       while leaving command dispatch in `Game`/`TapSelectionController`.
     - Extracted command queue ownership, placement ghost update/commit/cancel, command-card
       execution, and selected-command dispatch into `CommandController` while preserving `Game`
       wrappers for UI, hotkeys, input, and tests.
     - Extracted race normalization, play-session construction, replay construction/seek/export,
       and map-spec helpers into `game-session.ts` while `Game` keeps controller orchestration and
       stable lifecycle wrappers.
6. Treat tests as product code for compression.
   - Current shape:
     - bot and app tests repeat setup, entity finding, resource grants, tech grants, command search,
       and frame advancement;
     - the biggest test files are mostly ceremony.
   - Collapse shape:
     - one shared sim scenario builder and one app interaction harness;
     - matrix tests for ability policy, tech prerequisites, command rejection reasons, and UI command
       groups;
     - fewer end-to-end bespoke tests, kept only where behavior crosses multiple systems.
   - Expected win: largest immediate LOC reduction with the least gameplay risk.
   - Completed for the current compression scope:
     - Added a shared app test harness for `Game` setup, entity lookup, selection, centering, and
       screen projection, then migrated `tap-semantics` and `hotkeys` off their local setup copies.
     - Added a shared sim scenario harness for deterministic sim setup, entity lookup, spawning,
       resource grants, tech grants, and position reads. The AI bot scenario helper now layers on
       top of it, and `upgrades.test.ts` is the first migrated sim test file.
     - Migrated `abilities.test.ts` onto the shared sim scenario harness while keeping
       ability-specific add-on and loaded-silo helpers local to the test file.
     - Migrated `action-mask.test.ts` onto the shared sim scenario harness while keeping its
       validator/mask assertion helpers local to the file.
     - Migrated `repair.test.ts` onto the shared sim scenario harness while keeping repair and
       replay assertions local to the file.
     - Migrated `burrow.test.ts` onto the shared sim scenario harness while keeping detection,
       serialization, kill, and replay assertions local to the file.
     - Migrated `spider-mine.test.ts` onto the shared sim scenario harness while keeping mine-slot,
       serialization, and replay assertions local to the file.
     - Migrated `regeneration.test.ts` onto the shared sim scenario harness while keeping passive
       regeneration assertions local to the file.
     - Migrated `tech.test.ts` onto the shared sim scenario harness while keeping research
       completion and serialization assertions local to the file.
     - Migrated `protoss-merge.test.ts` onto the shared sim scenario harness while keeping merge
       lifecycle and replay parser assertions local to the file.
     - Migrated `siege-mode.test.ts` onto the shared sim scenario harness while keeping siege
       behavior, frame advancement, and replay parser assertions local to the file.
     - Migrated `terran-mobility.test.ts` onto the shared sim scenario harness while keeping lift,
       land, placement rejection, and replay parser assertions local to the file.
     - Migrated `addon.test.ts` onto the shared sim scenario harness while keeping add-on linkage,
       refund, validation, orphaning, and replay parser assertions local to the file.
     - Migrated `protoss-power.test.ts` onto the shared sim scenario harness while keeping power,
       detection, frame-advance, and local count assertions in the file.
     - Migrated the normal-match portions of `zerg-production.test.ts` onto the shared sim
       scenario harness while keeping the custom open-map creep placement case raw.
     - Migrated the normal-match setup portions of `economy.test.ts` onto the shared sim scenario
       harness while leaving the raw `makeState(open(...))` rally mechanics tests unchanged.
     - Migrated the normal-match setup portions of `validation.test.ts` onto the shared sim
       scenario harness while leaving the raw placement-boundary and live-resource placement tests
       unchanged.
     - Migrated `transport.test.ts` onto the shared sim scenario harness while keeping cargo,
       unload placement, visibility, serialization, replay parser, bunker, and nydus assertions
       local to the file.
     - Migrated the observation setup portions of `state-api.test.ts` onto the shared sim scenario
       harness while leaving disabled-vision, serialization, hash-history, and replay lifecycle
       tests as direct `Sim` cases.
     - Closed the remaining sim-test setup audit: direct setup left in `combat`, `reaver`,
       `terrain`, and lower-level raw/math/lifecycle tests is intentional because those cases probe
       exact geometry, custom maps, RNG/serialization, pathing, placement, or lifecycle semantics.
       Further harness conversion there would be churn rather than meaningful compression.
7. Make "current production/research/internal work" a query, not direct UI state inspection.
   - Completed:
     - moved `entityWorkQueue(s, slot)` into sim (`packages/sim/src/entity-work-queue.ts`) instead
       of creating a parallel helper;
     - app consumers now import the sim-owned query, preserving existing selection/status shapes;
     - `observe()` derives its stable `QueueView` from the sim query so RL/network observations and
       UI status share one owner for current work.
   - Win: less app code and cleaner future support for multi-queue, addons, morphs, and internal
     ammo.
8. Split data for navigation, not abstraction.
   - Current shape:
     - `data.ts` is large, but much of it is honest static BW data.
   - Collapse shape:
     - keep generated-looking tables as tables;
     - move enums/constants, unit defs, ability defs, tech defs, upgrade effects, and mechanic
       descriptors into separate data modules if navigation suffers;
     - do not over-normalize unit data into tiny fragments unless it lets validation/UI/AI delete code.
   - Expected win: readability, not necessarily raw LOC. Data lines are cheaper than duplicate logic.
   - Completed for the current navigation scope:
     - Extracted the stable core vocabulary from `data.ts` into `data-core.ts` and re-exported it
       through `data.ts` so existing imports keep working. The large unit, ability, tech, and
       weapon tables remain together for now because they are honest BW data, not duplicate logic.
     - Extracted weapon/combat vocabulary from `data.ts` into `data-weapons.ts`, including weapon
       range, splash, damage multiplier data, and damage helpers, while preserving `data.ts`
       re-exports and leaving unit/ability/tech tables in place.
     - Extracted research and upgrade vocabulary from `data.ts` into `data-tech.ts`, including
       the `Tech` ids, `TechDefs`, and table-local tech helpers, while preserving the `data.ts`
       public import surface for existing systems.
     - Extracted spell/command ability vocabulary from `data.ts` into `data-abilities.ts`,
       including `Ability`, `EffectKind`, ability descriptor types, and `Abilities`, while
       preserving the `data.ts` public import surface and leaving unit definitions table-owned.
     - Extracted unit definition vocabulary from `data.ts` into `data-units.ts`, including
       `UnitDef`, `Units`, unit trait/weapon helpers, worker build palettes, larva source checks,
       and production count helpers, while keeping `data.ts` as the public barrel plus faction and
       economy constants.
   - Current closure:
     - `data.ts` intentionally remains the compatibility barrel plus small faction/economy
       constants. Do not split `data-economy.ts` or `data-factions.ts` unless a real second owner,
       consumer, or validation/UI/AI deletion opportunity appears.

Abstraction acceptance test:

- A new abstraction must delete or prevent more code than it adds.
- It must make an existing concept have one owner.
- It must be usable by at least two consumers, usually sim + UI, sim + AI, or UI + tests.
- It must not allocate in hot loops unless the caller explicitly asks for a view object outside the
  tick path.
- It must keep validation authoritative. Convenience helpers can enumerate options, but command
  execution still goes through `validateCommand`.

What not to do:

- Do not replace typed arrays with class-per-unit objects.
- Do not introduce a generic ECS/component framework just to avoid `Kind.X` appearing anywhere.
- Do not hide hot-loop behavior behind allocation-heavy callbacks.
- Do not delete tests before the scenario DSL exists. First make the tests shorter, then remove
  redundant cases that are covered by tables.
- Do not merge all systems into one generic "process mechanics" runner. BW has real domain
  boundaries, and the fixed tick order is valuable.

LOC collapse order:

1. Build the test/scenario DSL first, because it makes all later refactors safer and may remove the
   most raw lines immediately.
2. Collapse `armedCommand` and `selectionView` in the app, because these remove impossible UI states
   and make later `Game` splitting meaningful. `armedCommand` and `selectionView` are complete.
3. Add lifecycle/status, work-queue, and selection-capability queries, then slim `Game`.
   `entityLifecycleStatus`, `selectionCapabilities`, `smartCommandCandidates`, and
   `entityWorkQueue` are complete.
4. Add command specs while keeping public `validateCommand`/`applyCommands` stable.
5. Add ability descriptors and AI policies.
6. Add internal-product/child-actor descriptors.
7. Add weapon mechanic ids.
8. Table-drive upgrade effects only after the above removes the larger sources of duplication.

Done when:

- Production code has fewer large god files, but public APIs remain stable for tests, replay, and app.
- Test LOC drops because scenarios and matrix cases express intent directly.
- Adding a normal ability, upgrade, internal product, or command mostly edits one table and one test
  matrix.
- Adding a truly special BW mechanic creates one named handler plus data, not scattered `Kind.X`
  checks across UI, AI, validation, combat, and production.
- Benchmarks show no regression in hot sim paths.

## Phase 14: Deterministic Training Substrate Hardening

Status: implemented for the current substrate-hardening scope.

Purpose: make the already-playable sim a robust substrate for replay, networking, fuzzing, and
large batched ML loops. The goal is not another layer of clever abstraction. The goal is that any
controller can ask one owner what is legal, emit commands, step safely, and receive observations
without duplicating game rules or crashing the process.

Architectural target:

- Entity/effect creation is capacity-aware and deterministic. Normal gameplay pressure must return
  command rejection or a documented capped no-op, not throw from deep inside a tick.
- State capacity remains fixed for the lifetime of a `State`. Do not grow typed arrays in the
  middle of gameplay; if capacities ever become configurable, they must be part of snapshot,
  serialization, hash/replay compatibility, and benchmark metadata.
- Command option discovery is complete enough for UI, scripted AI, network clients, and RL action
  masks to share the same legality source.
- Action schemas are stable and versioned. A policy-facing action must round-trip through
  `Action -> Command -> replay` without an app- or trainer-owned command vocabulary.
- Observation has two public shapes: an ergonomic immutable object for app/tests/debugging and a
  preallocated buffer writer for high-throughput ML.
- Buffer-backed masks and observations do not allocate in their write paths. Any allocation happens
  in explicit `create...Buffers` / `create...Scratch` helpers.
- Batch stepping has an explicit execution contract: either all scratch state is per-sim/per-batch,
  or the API documents and enforces synchronous non-reentrant stepping per JS worker/module instance.
- Benchmarks measure the surfaces that will actually dominate training: step, observe, mask
  generation, scripted-bot command generation, and vectorized batches.

Implementation:

0. Establish baseline contracts and measurements first.
   - Current risk:
     - this phase touches universal interfaces, so it is easy to "improve" an API without knowing
       whether step, observe, mask, or bot generation is the real bottleneck.
   - Collapse shape:
     - snapshot current `npm run bench` output before code changes;
     - audit every public `Command['t']` and record whether it is UI-facing, policy-facing,
       replay-only/internal, or deliberately unsupported by masks;
     - add an action/observation schema version constant before adding new buffers;
     - write down whether each mask represents one next command or a batch decode with reservations.
   - Tests:
     - a coverage test fails when a new command tag is added without an action-mask policy entry;
     - benchmark smoke tests keep stable JSON fields for before/after comparison.

1. Add capacity-safe allocation primitives.
   - Current risk:
     - `spawn` and `spawnEffect` throw on full entity/effect tables.
     - production, larva, hallucinations, broodlings, nukes, and persistent effects can reach those
       calls from ordinary command streams.
   - Collapse shape:
     - introduce small non-allocating queries such as `canSpawnEntity(s, count = 1)` and
       `canSpawnEffect(s, count = 1)`;
     - add narrow helpers such as `trySpawnUnit` / `trySpawnEffect` only where a command may have
       been validated earlier but capacity changed before application;
     - add an explicit capacity rejection reason, or document a single shared reason such as
       `queue-full`, so UI/RL/debugging can distinguish global capacity exhaustion from normal
       tech/resource/target illegality;
     - keep existing `spawn` for map/init/test setup where throwing is the right invariant check;
     - command specs reserve/check capacity before accepting commands that can create entities or
       effects;
     - multi-spawn actions reserve atomically: Spawn Broodling, Hallucination, Scarab/Interceptor
       creation, and production-count units must not partially create their payload;
     - apply paths re-check capacity before spending energy, HP, ammo, costs, or cooldowns when the
       command was validated earlier in the same batch;
     - timed autonomous systems use explicit deterministic semantics when capacity is exhausted:
       production/internal ammo holds at ready and retries; larva generation leaves the timer ready
       and retries; optional child actors do not consume ammo unless the actor is created; persistent
       effects do not consume spell resources unless the effect slot is secured.
   - Tests:
     - fill entity/effect capacity, then verify production, larva, hallucination, broodling,
       interceptor/scarab, nuke, and persistent spell paths reject or no-op deterministically;
     - multi-spawn abilities either create all children or none;
     - resource/energy/ammo costs are not consumed when capacity rejection prevents the effect;
     - replay/hash tests prove exhaustion behavior is stable.

2. Complete action masks through command specs.
   - Current risk:
     - `action-mask.ts` only covers core command heads plus train/build candidates.
     - abilities, research, upgrades, add-ons, transforms, load/unload, lift/land, cancel, merge,
       and target argument masks are still missing.
     - masks can become correct but too slow if they brute-force `validateCommand` across every
       entity, point, and argument every decision.
     - masks can become unusable for ML if they expose bits without a stable action encoder/decoder.
   - Collapse shape:
     - define a compact versioned `ActionSchema` beside command specs, not in UI code;
     - include stable command-head ids, argument vocabularies, entity-index mapping rules,
       point-coordinate quantization, and `encodeAction` / `decodeAction` helpers that produce the
       ordinary public `Command` union;
     - expose masks for:
       - command heads;
       - selected actor/entity candidates;
       - target entity candidates;
       - target point legality helpers;
       - kind/tech/ability/add-on/transform arguments;
       - load/unload cargo arguments;
       - cancel/lift/land/burrow/unburrow/toggle variants;
     - derive production masks from shared option enumerators that use the same legality helpers as
       command-card capabilities, with `validateCommand` parity tests as the truth check;
     - avoid production mask algorithms that are O(all entities × all command heads × all args) in
       normal use; brute-force validation is acceptable in tests and tiny debug helpers, not the
       default ML path;
     - provide both single-next-command masks and a small batch-decode context for reservations such
       as supply, resources, effect capacity, and entity capacity across multiple decoded commands;
     - only expose target entity candidates from the viewer's legal observation/visibility set, so
       fog and undetected cloak cannot leak hidden ids through masks;
     - keep masks factored and sparse-friendly so RL can decode autoregressively without building
       giant dense action tensors for every head.
   - Tests:
     - matrix tests compare masks against `validateCommand` for every command family;
     - fog/detection cases prove masks do not expose illegal hidden targets;
     - tech/power/creep/cargo/capacity cases prove masks match gameplay state.
     - encode/decode tests prove policy actions round-trip to public commands and replay records.

3. Add a buffer-backed observation writer.
   - Current risk:
     - `observe()` allocates arrays, maps, copied tech, cargo records, queue records, status records,
       effect records, and a copied vision plane on every call.
     - a fast buffer API can drift from object `observe()` if both reimplement visibility and
       feature selection separately.
   - Collapse shape:
     - keep `observe(player)` as the ergonomic fair-play object API;
     - define a versioned observation schema with scalar, entity-list, spatial-plane, queue, cargo,
       status, effect, larva, creep, power, and optional result/event sections;
     - add an explicit `createObservationBuffers(map, limits)` allocator for ML callers;
     - add `writeObservation(s, player, buffers, opts) -> counts` that fills typed arrays in a stable
       order without per-call allocation;
     - reuse the same visibility, detection, lifecycle, queue, cargo, larva, creep, and power query
       helpers as `observe()` so fair-play semantics cannot drift;
     - keep stale data beyond returned counts undefined by contract, and make consumers read only
       count-delimited regions;
     - make truncation explicit in returned counts/flags rather than silently losing entities.
   - Tests:
     - object observation and buffer observation agree on representative scenarios;
     - hidden cloaked enemies, parasite/scanner detection, cargo, queues, creep, power, larva, and
       effects have parity;
     - repeated writes reuse caller buffers and do not alias mutable sim arrays unless explicitly
       documented.
     - truncation flags are set when buffers are too small, and no stale entries are counted.

4. Make step results immutable or caller-owned.
   - Current risk:
     - empty command batches return a shared mutable `EMPTY_RESULTS` array and `Sim.lastCommandResults`
       stores it.
   - Collapse shape:
     - return `readonly CommandResult[]` from public APIs and freeze the shared empty array in dev, or
       return a fresh empty array when callers may mutate;
     - prefer caller-owned result buffers only if benchmarks show result allocation matters.
   - Tests:
     - mutating a previous empty result cannot affect later steps or `lastCommandResults`.

5. Define the batch/reentrancy contract.
   - Current risk:
     - grid, local-avoidance, and collision use module-global scratch arrays for speed.
     - a future `stepBatch` could accidentally interleave sims and corrupt shared scratch while
       still passing ordinary single-sim tests.
   - Collapse shape:
     - document current contract: `stepWorld` is synchronous and non-reentrant per JS worker/module
       instance;
     - add a small guard in debug/test mode to fail fast on nested steps;
     - when implementing `stepBatch`, start with sequential stepping inside a worker/process because
       it preserves the current high-performance scratch model;
     - only move scratch into an explicit `StepScratch` object if measured batch throughput or
       worker design requires multiple sims to be in-flight in the same module instance;
     - do not make hot loops allocate closure/callback-heavy abstractions to solve a theoretical
       parallelism problem.
   - Tests:
     - two independent sims stepped sequentially in one process preserve deterministic hashes;
     - attempted nested stepping fails in debug/test mode instead of corrupting scratch state.

6. Add ML-relevant benchmark lanes.
   - Current risk:
     - current `bench` is useful but mostly proves small step throughput.
   - Collapse shape:
     - add fixed-seed lanes for:
       - step only;
       - step plus full action-mask generation;
       - step plus object observe;
       - step plus buffer observe;
       - scripted-bot command generation;
       - N-env sequential batch stepping;
     - emit stable JSON so regressions can be compared over time without machine-specific hard
       thresholds.
   - Tests:
     - smoke-test output shape and deterministic hashes; avoid brittle timing assertions.
     - keep a short checked-in benchmark-baseline note in this plan or a docs file when a slice
       intentionally trades speed for correctness.

7. Keep the scripted bot useful but off the sim hot path.
   - Current risk:
     - bot command generation allocates Sets/arrays and scans entities repeatedly.
   - Collapse shape:
     - keep bot code readable first, because it is not the engine;
     - add reusable per-bot scratch only for proven hot generators used in behavior-cloning corpus
       production;
     - make benchmark data decide whether bot allocation matters before compressing it.
   - Tests:
     - existing bot behavior tests remain scenario-based; any bot scratch must be reset per player
       and preserve deterministic commands.

8. Add deterministic abuse/fuzz coverage.
   - Current risk:
     - the engine can pass targeted tests while still throwing on weird but legal-looking command
       streams, stale ids, saturated capacity, or edge-map coordinates.
   - Collapse shape:
     - add a deterministic command-stream fuzzer that emits a mix of valid, invalid, stale,
       wrong-owner, fog-illegal, capacity-stressing, and edge-coordinate commands;
     - run the same seeded stream twice and compare hashes, command-result summaries, and final
       winner state;
     - bias some fuzz lanes toward near-capacity entity/effect tables and mixed command batches that
       stress reservation semantics.
   - Tests:
     - no fuzz case may throw from normal `step`;
     - deterministic replay/hash equality holds for every fuzz seed;
     - command rejection reasons stay in the public `CommandRejectReason` vocabulary.

Completed:

- Added capacity-aware entity/effect allocation queries and `try` allocation paths while keeping
  throwing `spawn`/`spawnEffect` for setup and invariant-checked tests.
- Added explicit `capacity-full` rejection and wired capacity checks into train, build, add-on,
  spider mine, and ability validation through the shared command path.
- Made live gameplay spawn paths capacity-safe: production holds ready and retries, larva timers
  stay ready, construction refunds if capacity fills before placement, spider mines/interceptors/
  scarabs do not consume ammo when no child can be created, and effect-creating spells refuse
  before spending energy or nuke ammo.
- Removed the shared mutable empty command-result array; empty steps now return caller-isolated
  result arrays.
- Added a non-reentrant `stepWorld` guard that documents and enforces the module-level scratch
  contract.
- Added a versioned action schema with stable command heads, public `Command` encode/decode helpers,
  command-policy coverage, and validator-backed masks for command heads, train/build/research/
  add-on/transform/ability arguments, and target-entity candidates.
- Added a versioned buffer-backed observation writer with typed-array row strides, count-delimited
  output, truncation flags, and a `Sim.writeObservation` wrapper while preserving the ergonomic
  object `observe()` API.
- Added benchmark lanes for buffer observation, mask generation, bot command generation, and
  sequential N-env batch stepping.
- Added deterministic abuse/fuzz coverage plus focused capacity, action-schema, observation-buffer,
  and benchmark tests.
- Added a policy batch-decode reservation context that preserves single-command validator parity
  while reserving minerals, gas, supply, entity slots, effect slots, caster energy/HP, and command
  ammo across multiple decoded actions before they are submitted as a tick batch.

Remaining:

- None in the current Phase 14 scope. Future large-scale RL integration should benchmark whether
  policy callers need preallocated reusable reservation arrays, but the correctness contract is now
  represented and tested.

Done when:

- No accepted command or autonomous timed system can crash the sim because entity/effect capacity is
  exhausted.
- Every public command family has validator-backed mask coverage or is explicitly marked
  non-policy-facing with a reason.
- ML callers can observe into stable typed buffers without per-step object allocation.
- Policy actions can be encoded, masked, decoded into public `Command`s, recorded in replays, and
  replayed without trainer-only command semantics.
- Batch stepping has a documented and test-covered scratch/reentrancy model.
- `npm run bench` includes step, observe, masks, bot generation, and batch lanes.
- Deterministic fuzz tests cover stale/illegal/capacity-stressed command streams without throws.
- Existing replay/hash tests remain stable, and benchmark output shows no material hot-path
  regression.

## Phase 15: Training-Scale Performance Hardening

Status: current performance-hardening slice implemented; command-ingestion scratch remains a
measured follow-up.

Purpose: preserve the clean correctness substrate from Phase 14 while making the policy-facing
surfaces scale to many environments. The sim tick path is currently healthy; the next risk is
accidentally using correctness-first convenience APIs in tight RL loops and paying avoidable
allocation or non-linear scans.

Performance contracts:

- Gameplay tick systems stay typed-array/SoA, deterministic, and allocation-conscious. Do not
  replace them with class-per-entity objects, dynamic component maps, or collection-heavy state.
- Ergonomic APIs may allocate, but any API intended for per-env-step training must have a
  caller-owned `write...` / `...Into` / resettable scratch form.
- Action legality remains validator-backed. Faster masks can precompute vocabularies and reuse
  buffers, but they must not fork the command rules.
- Benchmark before and after each slice. Prefer stable hashes and shape counters over brittle wall
  clock thresholds, but inspect the standalone `npm run bench` output for obvious regressions.

Implementation slices:

1. Action-mask allocation reduction.
   - Precompute static producer vocabularies such as research techs by producer and add-ons by
     parent kind at module load.
   - Add caller-owned mask writers for command heads, train/build/research/add-on/transform/
     ability arguments, and entity-target masks.
   - Keep existing return-new-array helpers as compatibility wrappers around the writers.
   - Avoid option-spread/object churn inside inner mask loops where practical.
   - Tests: existing validator-parity action-mask tests must pass unchanged; add writer parity if
     a future writer diverges from a wrapper.

2. Batch-decode scratch reuse.
   - Add a resettable `BatchDecodeReservation` path so policy loops can reuse reservation arrays
     across decisions.
   - Add an `Into` helper for decoded batch results so callers can reuse the result array.
   - Keep the existing convenience decoder for tests and simple integrations.
   - Tests: resource, supply, capacity, energy/HP, and ammo double-spend tests cover both wrapper
     and scratch paths.

3. Observation complexity cleanup.
   - Keep object `observe()` ergonomic for tests/debugging.
   - Keep `writeObservation()` allocation-free and mostly linear.
   - Collapse larva reporting from source-by-source nested scans into source rows plus one nearest
     lookup per larva, or into explicit larva-source ownership if the sim later stores that state.
   - Tests: object/buffer observation parity and truncation tests continue to pass.

4. Command-ingestion scratch path.
   - Current grouped move planning uses `Map` and string keys, which is acceptable for human/UI
     command volume.
   - If large RL command batches make ingestion visible in profiles, replace this with numeric
     keyed scratch tables or a caller-owned `MoveGroupPlan` without changing group-slot semantics.
   - Tests: same-target deterministic destination-slot tests are the behavioral gate.

5. Benchmark coverage.
   - Extend the mask-generation benchmark to cover argument masks and batch decode, not only
     command-head masks.
   - Add an observation stress lane with multiple Zerg larva sources and a larger live entity count.
   - Keep benchmark output JSON stable so before/after comparisons remain easy.

Completed:

- Added architecture and training-doc performance contracts explaining why typed arrays, scratch,
  validator-backed masks, and caller-owned buffers are intentional.
- Added precomputed research/add-on vocabularies and caller-owned action-mask writer APIs.
- Added resettable batch-decode reservation scratch plus a decoded-batch `Into` helper.
- Collapsed buffer-observation larva reporting to source rows plus one nearest-source lookup per
  larva instead of source-by-source nested scans.
- Removed option-spread allocation from inner ability/entity-target mask writer loops.
- Added focused tests for caller-owned mask writers and decoded-batch scratch reuse.
- Extended the headless benchmark with full argument-mask, batch-decode, and Zerg larva observation
  stress coverage.

Remaining:

- Command-ingestion numeric scratch for very large same-tick command batches. Keep the current
  Map/string-key implementation until benchmark evidence shows it matters; it is simpler and lives
  at the command boundary, not inside per-entity systems.

Done when:

- `npm run typecheck`, focused sim tests, `npm test`, and standalone `npm run bench` pass.
- Existing benchmark hashes remain stable.
- Full-mask and batch-decode benchmark lanes exist, so future regressions are visible.
- The performance contracts are documented in both code comments and architecture/training docs.

## Phase 16: Pathfinding Reference Refinement

Status: analysis and implementation plan captured; no `packages/pathfinding` code should be
checked in or imported by the game.

Purpose: use `packages/pathfinding` as a behavioral reference for smoother RTS movement while
preserving the production sim's fixed-point, typed-array, deterministic, BW-specific architecture.
The reference package feels better because it treats movement as "global preferred velocity plus
reciprocal local velocity constraints plus residual pushout." Our sim has the right broad layers
already, but its local steering is still a small candidate-position scorer with no persistent
velocity state, so it can feel more grid-snappy and less fluid under traffic.

Reference comparison:

| Area | `packages/pathfinding` behavior | Current sim behavior | Decision |
|------|---------------------------------|----------------------|----------|
| Global route | Flow field from one Dijkstra sweep per goal; sampled as a continuous bilinear direction. | Clearance-aware 16px path lattice with cached distance fields; `navigate()` chooses a downhill neighbor cell or straight-line pass. | Keep sim lattice/caches, add smooth fixed-point flow-vector sampling over the existing distance field. |
| Passability | Simple float grid plus stamped rectangular obstacles. | Build-tile map projected to path cells; building footprints, body clearance classes, resources, lifted structures, and firing anchors are already modeled. | Keep sim passability. It is more game-correct. |
| Goal assignment | Group move assigns distinct spiral slots around a click. | Same-target move/attack-move batches assign deterministic slots, excluding workers and widening for large bodies. | Keep current command-boundary slotting; later improve slot assignment quality if crowd crossing remains visible. |
| Local avoidance | ORCA/RVO: preferred velocity is adjusted by reciprocal half-plane constraints using neighbor velocity, radius, time horizon, and max speed. | Candidate-position scorer checks direct/perpendicular/axis steps against a static same-tick body grid. | Replace candidate scorer incrementally with a fixed-point reciprocal velocity solver, not by copying object-heavy ORCA code. |
| Motion integration | Units store velocity; acceleration cap smooths heading changes. | Units write position directly each tick; only facing persists. | Add compact `vx`/`vy` movement columns or equivalent scratch-backed persisted velocity for mobile actors. Serialize/hash it if gameplay-affecting. |
| Arrival | Quadratic arrival easing plus settle deadzone. | Movement runs full step until close, then post-collision settling marks idle. | Add arrival preferred-speed shaping before steering; keep existing post-collision settle as the authoritative idle transition. |
| Pushout | ORCA first, then a few pushout iterations for residual static overlap. | Local avoidance first, then symmetric collision cleanup with pathing-anchor weighting. | Keep collision as the seatbelt, but reduce reliance on it after velocity avoidance lands. |
| Worker resource walking | Reference ghosts same-team gather workers for the whole loop. | Sim currently phases only mineral-route workers; gas workers remain solid and can jam on identical refinery paths. | Generalize to same-team resource-route worker phasing for mineral and gas harvest loops, while keeping workers solid for build/repair/ordinary move and against non-workers/enemies. |
| Performance shape | Float object arrays; fine for demo scale. | SoA typed arrays, fixed-point math, module-local scratch, hash/replay determinism. | Translate ideas, not code. No object-per-neighbor allocations inside the tick. |

Non-negotiable constraints:

- The production pathing implementation remains in `packages/sim`; `packages/pathfinding` is a
  reference only.
- Replay determinism wins over visual cleverness. No `Math.random`, wall-clock timing, object
  iteration order dependencies, or platform-sensitive float state in the sim tick.
- Keep pathing state SoA and capacity-bounded. New columns such as `vx`/`vy` are acceptable if they
  reduce hidden behavior and make steering easier to reason about.
- Keep terrain/building/resource/pathing-anchor clearance semantics in one place. Do not fork
  passability just to make the velocity layer easier.
- Collision remains as residual correction. The goal is to make overlap rare, not to delete pushout.
- "BW-style blocking" primarily means action-state blocking: units that are rooted by firing,
  deployment, burrow, construction, or other non-moving states should be authoritative local
  obstacles. Units that can move while firing, such as capital ships/air movers, should not become
  ground pathing anchors just because they are attacking.

Implementation slices:

1. Flow-field smoothing without changing state shape.
   - Add a fixed-point flow sampling helper over the existing `flowField()` distance grid.
   - For each candidate sample point, derive the downhill vector from neighboring integration costs
     and bilinearly blend nearby cell vectors. Invalid corners fall back to the nearest valid vector,
     then to straight goal steering.
   - Keep `clearPathLine()` and direct target movement for genuinely clear short paths, but use the
     smoothed vector when the flow field is active instead of always chasing the next cell center.
   - Tests: add a wall-adjacent flow test proving the steering vector turns around the obstacle
     instead of stepping hard from one compass direction to the next; existing route/hash tests must
     remain deterministic.

2. Persistent movement velocity.
   - Add `vx`/`vy` entity columns for mobile actors or an explicitly persisted movement-velocity
     table with serialization/hash coverage. Prefer entity columns because velocity affects future
     avoidance and therefore gameplay.
   - First land the state contract: clone/serialize/hash coverage plus hard resets on spawn/free,
     containment, burrow, hard stop, completed land, death, and movement-disabling transitions.
   - Then replace direct ground `moveToward` integration with "compute desired velocity from the
     existing chosen step/candidate scorer, acceleration-limit toward it, integrate." Keep air units
     on the old direct primitive until a dedicated air-behavior slice says otherwise.
   - Reset velocity on spawn/free, containment, burrow, hard stop, completed land, death, and any
     transition that disables movement.
   - Tests: state-contract tests cover reset and serialization/hash; behavior tests cover stopped
     units not drifting and crossing units having bounded turn oscillation.

3. Arrival speed shaping.
   - Compute preferred speed as full speed outside an arrival band and eased speed inside it.
   - Use body radius and formation slot spacing to choose the band; avoid easing too early for
     attack-move chase behavior where units should close to weapon/interaction range.
   - Keep `settleMovement()` responsible for switching orders to idle after collision cleanup.
   - Tests: a single mover should not overshoot/orbit a one-cell destination; group settle tests
     should remain stable with fewer collision nudges.

4. Fixed-point reciprocal avoidance prototype.
   - Implement a small, allocation-free neighbor-velocity solver behind `local-avoidance.ts`.
   - Start with the ORCA/RVO concept but represent lines/constraints in scratch typed arrays, using
     deterministic fixed-point or tightly controlled integer approximations.
   - Feed it preferred velocity, current velocity, radius, neighbor velocity, radius, and time
     horizon. Include pathing anchors as one-sided or high-weight constraints so firing units stay
     rooted.
   - Keep a fallback candidate scorer for edge cases until the solver is proven by tests and
     benchmarks.
   - Tests: head-on swap, perpendicular crossing, dense group to distinct slots, movers around
     rooted firing anchors, resource-route worker exceptions, and opposing choke traffic.

5. Resource-route worker phasing.
   - Rename the current mineral-walk helper to resource-route phasing so the rule is not hidden in
     mineral-specific names.
   - Treat same-team workers on active mineral or gas harvest/return routes as mutually non-solid
     to each other. This includes workers pathing to a refinery, harvesting gas, and returning gas
     to a depot, because refinery traffic commonly converges on identical lanes.
   - Keep phasing pairwise and narrow: no phasing against enemy workers, combat units, buildings,
     resources, ordinary moving workers, builders, repairers, or scouts.
   - Feed the same predicate into local avoidance and collision so path choice and pushout agree.
   - Tests: two gas workers assigned to the same refinery should not shove each other or deadlock;
     gas workers should still collide with idle/build/repair workers and non-workers.

6. Large-unit clearance audit.
   - Make the gap rule data-driven by body clearance: a unit can pass only if its top-down collision
     body fits through the pathing lattice. Do not add a special "large units cannot pass" rule.
   - Add explicit tests for small, medium, and large ground bodies through one-cell and two-cell
     gaps so the UX is predictable. The answer should come from the clearance mask, not from a unit
     kind check.
   - Use SC2 only as behavioral intuition here: large units like Siege Tanks/Thors do not squeeze
     through gaps sized for a single small unit; if the gap is wide enough for their footprint, they
     pass. Our sim should express the same idea through radius/footprint math.

7. Collision-pressure telemetry and benchmark gates.
   - Extend `movement-deathball` or add a focused pathing benchmark to report collision nudges,
     max overlap before pushout, active movement orders, settled count, and distinct positions.
   - Use this to prove velocity avoidance reduces pushout pressure rather than merely hiding bugs.
   - Do not accept a slice that introduces O(n^2) all-pairs behavior; neighbor lookup must stay
     spatial-grid bounded.

8. Code cleanup after behavior is proven.
   - Remove the old candidate scorer only after reciprocal velocity tests cover the same cases.
   - Keep the architecture comments close to the code explaining why the movement model is layered:
     route field -> preferred velocity -> local velocity constraints -> integrate -> collision
     cleanup -> settle.
   - Avoid exposing pathfinding package concepts directly in public APIs; command/AI/RL should still
     talk in orders and world targets, not steering internals.

Risks and mitigations:

- Persistent velocity changes replay hashes. Mitigation: land it as a deliberate sim-version slice
  with serialization/hash tests, not as an incidental movement tweak.
- ORCA math can become float-heavy. Mitigation: prototype with deterministic fixed-point/integer
  approximations and compare against package behavior in tests, not by importing the package.
- Smooth flow sampling can route into blocked corners if invalid samples are blended carelessly.
  Mitigation: reject invalid corners and keep the existing passability and no-corner-cutting checks
  authoritative.
- Better avoidance can make units too fluid compared with deliberate action-state blocking.
  Mitigation: preserve rooted/pathing-anchor semantics for units that cannot move while acting,
  preserve pairwise resource-worker exceptions, and keep collision cleanup as the residual guard.

Done when:

- Movement still passes all current pathing, worker-collision, combat-anchor, harvest, serialization,
  replay/hash, and headless benchmark tests.
- A new reference-inspired test set proves smooth flow sampling, acceleration-limited steering,
  crossing-agent stability, and dense crowd progress.
- Benchmark output shows no obvious throughput regression, and collision-pressure counters improve
  or stay flat in deathball/choke cases.
- The production sim imports nothing from `packages/pathfinding`.

Completed:

- Generalized worker collision phasing from mineral-only to resource-route workers. Same-team
  workers on active mineral or gas harvest/return routes now phase through each other in both local
  avoidance and collision, while remaining solid against idle/build/repair workers, non-workers,
  enemies, structures, and resources.
- Added a ground-clearance audit proving one-cell gaps admit small/medium bodies but reject large
  Dragoon/Siege Tank/Ultralisk bodies, while two-cell gaps admit all tested ground body sizes via
  the shared clearance mask rather than unit-kind special cases.
- Added transient collision-pressure counters and exposed them through the `movement-deathball`
  benchmark so future flow/velocity/avoidance changes can prove whether collision cleanup pressure
  improves without affecting gameplay hash or serialized state.
- Added fixed-point smooth flow-field sampling over the existing clearance-aware distance field.
  `navigate()` uses the smoothed lookahead only when it preserves downhill field progress, falling
  back to the old discrete cell-center route otherwise, so choke progress and no-corner-cutting stay
  guarded by the existing passability rules.
- Added persistent movement velocity columns with clone/serialize/hash coverage and hard-reset
  contracts for stop, containment, burrow, lift/land, transforms, disabled status, death, and
  spawn/free so later velocity steering can be deterministic instead of scratch-state behavior.
- Added deterministic acceleration-limited ground movement integration on top of the existing
  route/candidate scorer. Focused tests cover ramped `vx`/`vy`, stop-without-drift, and deterministic
  crossing-unit settling; benchmark throughput stayed healthy, while collision-pressure counters
  showed acceleration alone does not reduce deathball pushout pressure, leaving that job for the
  reciprocal-avoidance slice.
- Added exact-destination-only arrival speed shaping for ground movement before acceleration.
  Intermediate flow-cell steering remains full-speed, while near-goal exact destinations ease down
  to avoid overshoot/orbit. Focused tests cover no-overshoot behavior and existing group settle
  tests remain stable; benchmark pressure improved versus pure acceleration but still leaves the
  main overlap reduction target for reciprocal avoidance.
- Added a narrow fixed-point reciprocal-avoidance preferred-velocity adjustment for closing
  opposing/anchored ground interactions, while keeping the existing candidate scorer and collision
  cleanup as fallbacks. Tests cover predicted head-on avoidance and existing choke/ramp/resource
  phasing behavior; benchmark max overlap improved, but pair/nudge counters remain mixed, so this
  stays a prototype until cleanup proves whether it should replace more of the old scorer.
- Documented the layered movement pipeline in code near the hot path: route/flow, reciprocal
  preferred velocity, fallback candidate scoring, persisted-velocity integration, collision cleanup,
  and settle. The comment explicitly keeps the scorer/collision fallback authoritative while
  reciprocal counters remain mixed.
- Tightened worker-economy movement contracts after live play review: harvest docking now chooses
  face overlap instead of point-only diagonal corner contact, workers zero persistent movement
  velocity while mining/depositing at docks, explicit mineral harvest commands reuse the saturation
  picker so a clicked patch fans workers across nearby minerals, and sequential production rallies
  reserve already-occupied rally slots instead of sending every new unit to jitter around the same
  point.
- Generalized the same perimeter target contract beyond harvest: harvest/deposit, repair,
  generic move-to-load, and production entity rallies now resolve to the closest usable point on
  the target's body/footprint perimeter, stepping deterministically around occupied perimeter
  points instead of routing units into structure centers.
- Collapsed rally's armed-unit behavior into shared travel intent issuance: explicit move,
  explicit attack-move, and production rally now assign orders through the same helper, with rally
  using a command-equivalent `smart` intent instead of a rally-only attack-move special case.

## Phase 17: Command Intent, Follow, And Rally Architecture

Status: complete for the current command-intent/follow/rally scope. Targeted move/follow,
player-aware gather legality, typed producer rally, command-intent extraction, action-mask follow
targets, deterministic same-target follow slots, the intent/combat-target split, public UI/AI/RL
parity tests, and follow determinism/performance benchmarks are implemented. Internal
attack-move-follow is intentionally not public UI/API behavior yet; it needs an explicit escort
contract before exposure. Validation is green after the scoped `npm test` repair and the
rally-follow AI regression.

Purpose: make mobile/desktop commands, explicit target modes, rally behavior, pathfinding, AI,
RL masks, and replay semantics share one small set of intent concepts. The goal is to remove
rally-specific combat/resource branches while preserving the StarCraft feel: normal left-click
selects, armed-command left-click applies the selected command, desktop right-click is a contextual
smart command, right-clicking an enemy unit attacks, right-clicking a loadable target loads,
right-clicking an ordinary friendly unit follows, `A` plus left-click is attack-move, workers can
be explicitly rallied directly to resources, and resource
rally is never silently invented for non-resource targets.

Core thesis:

- Rally is not a unit order. Rally is a producer-owned spawn intent template.
- A producer may need more than one rally slot. The clean split is a general/unit rally for spawned
  non-workers and a worker/gather rally for spawned workers. Hatchery-family producers naturally
  use both; Command Center/Nexus mostly use the worker rally; Barracks/Gateway-style producers use
  the unit rally. A resource click should not overwrite the combat/unit rally unless we explicitly
  choose that UX.
- Unit-target movement is follow. A unit told to move to another unit should keep recomputing a
  stable approach point around the target while the target remains valid, not walk to the target's
  old center and forget why it moved.
- Interaction commands are follow-until-interaction: harvest, repair/resume construction, load,
  unload-to, and future heal/enter-Nydus-like interactions all share the same "approach entity,
  then execute a verb" shape.
- Combat targets and movement/follow targets are different concepts. Overloading one `target`
  column for both makes attack-move-follow, escort, and rally-to-unit brittle because combat may
  temporarily acquire an enemy while the original follow intent should remain alive.
- Resource rally is a worker/gather rally, not a generic unit rally. It should only be stored when
  the rally target is a resource or completed resource collector that shared validation considers a
  gather target. Workers resolve it to harvest; non-workers should continue using the producer's
  general/unit rally instead of silently converting the resource target into a combat rally.

Vocabulary under review:

```ts
CommandIntent =
  | { kind: 'travel'; mode: 'move' | 'attackMove'; endpoint: TravelEndpoint }
  | { kind: 'interact'; verb: 'harvest' | 'repair' | 'load'; target: EntityId }
  | { kind: 'attack'; target: EntityId }
  | { kind: 'ability'; ability: AbilityId; target: AbilityTarget };

TravelEndpoint =
  | { kind: 'point'; x: Fx; y: Fx }
  | { kind: 'follow'; target: EntityId };

UnitRally =
  | { kind: 'none' }
  | { kind: 'point'; x: Fx; y: Fx }
  | { kind: 'follow'; target: EntityId };

WorkerRally =
  | { kind: 'none' }
  | { kind: 'resource'; target: EntityId };

ProducerRally = {
  unit: UnitRally;
  worker: WorkerRally;
};
```

The exact TypeScript shape can change, but the conceptual split should not: point travel, follow
travel, verb interactions, combat targets, unit rally, and worker/resource rally need distinct
names so systems stop guessing from overloaded fields.

Review findings from the current code:

- Implemented in the first slice: the public `move` command now supports an optional entity target,
  replay/action encoding preserves it, validation accepts only friendly non-resource targets, and
  command ingestion converts stable entity IDs into slot-local travel endpoints before issuing
  `Order.Move`.
- Implemented in the first slice: desktop smart right-click now uses a finite StarCraft grammar:
  attack enemies, harvest resources, repair/continue repairable friends, load when valid, follow
  ordinary friendly entities, or move to ground. It does not emit attack-move or arbitrary ability
  behavior.
- Implemented in the first slice: `Order.Move + target` now keeps the follow target, recomputes the
  current approach point around a moving target, and settles at the approach point without clearing
  the follow intent. This is still stateless follow; sticky multi-follower approach slots remain a
  later performance/UX refinement.
- Implemented after the first slice: resource-target validation now uses shared
  `isGatherTarget` and player-aware `canPlayerGatherTarget` predicates. Neutral minerals are valid,
  friendly/allied completed gas collectors are valid, bare geysers and hostile collectors are not,
  and stale resource IDs are rechecked before slot conversion.
- Implemented after the first slice: `rallyX/rallyY/rallyTarget` is now the unit/general rally,
  with separate `workerRallyX/workerRallyY/workerRallyTarget` state for worker gather rally.
  Production, rendering, setup defaults, invalidation, and focused tests use the typed split.
- Implemented after the first extraction slice: `command-intent.ts` owns the finite smart-command
  grammar and the produced-unit rally intent vocabulary. Production now asks for a typed spawn
  intent, then performs the hot-path side effects, resource selection, cargo loading, and
  destination-slot reservation locally.
- Remaining duplication: validation entry points, action-mask option surfaces, AI policy choices,
  and future command-card target modes still need to consume the shared command-intent vocabulary
  more directly before richer follow or combat-target state is added.
- Implemented after action-mask coverage: targeted follow movement now builds a deterministic
  per-tick scratch plan for same-target ground followers and passes stable ranks into
  `entityApproachPoint`, so several followers reserve distinct perimeter approach slots without
  adding serialized state.
- Remaining representation gap: movement/follow/load travel reads `intentTarget`, normal combat
  reads `combatTarget`, and legacy `target` is now a compatibility mirror for older readers.
  Attack-move-follow or escort is unblocked internally, but public command/UI exposure should stay
  deferred until the internal follow endpoint behavior is tested.

Behavior matrix to review:

| Player action / stored intent | Worker result | Combat-capable unit result | Noncombat/nonworker result | Notes |
|-------------------------------|---------------|----------------------------|----------------------------|-------|
| Normal left-click entity | Select / inspect per control scheme | Select / inspect per control scheme | Select / inspect per control scheme | Left-click is selection unless a command mode is armed. |
| Armed-command left-click valid target | Apply selected command | Apply selected command | Apply selected command or reject by validation | Build, rally, attack-move, harvest, repair, load, unload, and abilities all use this pattern. |
| Right-click empty ground | Move to point | Move to point | Move to point | Ground right-click is movement. |
| A + left-click ground | Attack-move point | Attack-move point | Move or reject by validation | Attack-move is explicit command mode, not right-click behavior and not a rally special case. |
| Right-click enemy unit/building | Attack target if unit can attack | Attack target | Reject or move/follow only if unit truly cannot attack | This is targeted attack, not attack-move. |
| Right-click friendly mobile unit | Follow target unless a higher-priority smart interaction applies | Follow target unless a higher-priority smart interaction applies | Follow target | Follow recomputes approach slot around moving target. Requires public command support for entity travel. |
| Armed attack command on friendly unit | Reject/keep target mode or explicit escort if modeled | Reject/keep target mode or explicit escort if modeled | Reject | Do not confuse desktop smart right-click with the target click after arming Attack. |
| Right-click resource/gas collector | Harvest if unit can gather | Reject if not gather-capable | Reject | Smart worker harvest. |
| Right-click damaged/incomplete repairable friendly | Repair/resume if eligible | Reject unless unit can repair | Reject | Smart SCV repair/continue construction. |
| Right-click loadable transport/bunker/Nydus | Load or move-to-load if eligible | Load or move-to-load if eligible | Reject or follow if not eligible | Smart load belongs in the finite right-click grammar. |
| Explicit load/harvest/repair command | Same result as right-click when valid | Same result when valid | Reject when invalid | Explicit buttons/hotkeys remain available and should share validation with right-click. |
| Structure unit-rally to point | Worker uses worker rally first, otherwise normal/default handling | Attack-move or move by unit capability | Move to point | Bases may still auto-mine workers when no worker rally exists. |
| Structure unit-rally to unit/building | Worker uses worker rally first, otherwise follow/interact if valid | Attack-move-follow or move-follow by unit capability | Follow | This is the "rally is follow" rule. |
| Structure worker-rally to resource | Harvest if produced unit is a worker | Use unit rally, not resource target | Use unit rally, not resource target | Resource rally must only be set from valid gather targets and should not become combat rally. |

Left-click grammar checklist:

- Normal left-click:
  - entity: select / inspect per control scheme;
  - ground drag: box select;
  - Shift + entity: add/remove from selection;
  - double-click entity: select same visible type in the local/on-screen scope;
  - control groups remain hotkey-driven; left-click should not gain hidden group semantics.
- Armed-command left-click:
  - Attack / `A`: left-click ground issues attack-move; left-click enemy issues targeted attack;
    left-click friendly should reject/keep target mode unless an explicit escort/attack-move-follow
    feature has been implemented;
  - Move, if exposed as an explicit command mode: left-click ground moves, left-click entity follows;
  - Patrol, if/when implemented: left-click point/entity creates the patrol route/target;
  - Hold/Stop: immediate commands, no world left-click target;
  - Harvest: left-click valid resource/gas collector gathers;
  - Repair: left-click repairable damaged friendly or incomplete Terran structure repairs/resumes;
  - Load: left-click valid transport/bunker/Nydus target loads or moves-to-load;
  - Unload: left-click ground/entity-valid unload point unloads through shared unload validation;
  - Rally: left-click point/entity/resource sets unit rally, follow rally, or worker resource rally
    according to the producer rally split;
  - Build: left-click/pointer-up on valid snapped ground footprint places the building;
  - Land: left-click/pointer-up on valid snapped ground footprint starts/continues landing;
  - Point abilities: left-click ground/entity point casts through shared ability validation
    (Scanner Sweep, Psionic Storm, Dark Swarm, Disruption Web, Nuke target, etc.);
  - Entity abilities: left-click valid entity target casts through shared ability validation
    (Yamato, Lockdown, Feedback, Spawn Broodling, Consume, etc.);
  - Immediate/toggle abilities and transforms such as Stim, Burrow, Cloak, Siege, Stop, Hold,
    Train, Research, and most production buttons apply immediately from the button/hotkey and do
    not consume a world left-click.
- Mobile should mirror the concept, not the mouse buttons: normal tap selects; once a command is
  armed, the next tap applies it; mobile smart-command affordances should emit the same finite
  smart-command intents as desktop right-click.

Recommended answer for resource rally:

- Store worker/resource rally in a separate producer slot only when the target passes shared
  resource-rally validation.
- For town-hall producers, workers resolve worker rally to harvest. This gives Hatchery/Lair/Hive,
  Command Center, and Nexus the same worker-rally model without a Hatchery-only special case.
- For Zerg producers that can create both workers and combat units, non-workers use the unit rally;
  the worker rally remains available for future Drones.
- For non-worker-only producers, resource clicks should not create worker rally unless the producer
  can actually produce workers. They should either set a point/unit rally according to ordinary
  rally rules or be rejected by resource-rally validation.
- This is slightly more state than a single typed rally, but it prevents the worst UX ambiguity:
  setting a mineral rally for Drones should not make every later Zergling walk into the mineral
  line unless the player explicitly set the unit rally there too.

Pathfinding contract for follow:

- Follow targets resolve through a stable `approach slot` around the target's top-down body or
  footprint, not the target center.
- The slot should be deterministic and sticky:
  - keep the assigned side/offset while the target moves and the slot remains reachable;
  - recompute when the target moved far enough, the slot is blocked, the follower falls far behind,
    or the target invalidates;
  - group followers to the same target should reserve distinct slots around the target, analogous
    to point rally/move destination slotting.
- `entityApproachPoint` is the first version of this idea, but it is stateless. A true follow slice
  should decide whether sticky approach slots need new columns/scratch state or can be derived from
  deterministic rank assignment each tick without causing jitter.
- Arrival for follow differs from arrival for point travel: reaching the current approach point
  should settle the unit near the target, but it should not clear the follow intent while the target
  remains valid.

State representation decision under review:

- Short-term: `Order.Move` with `target != NONE` can mean follow/move-to-load because the movement
  system owns that target, while `Order.AttackMove` should continue to clear `target` because combat
  uses the same column for acquired enemies.
- Long-term cleaner model: split intent target from combat target, for example:
  - `intentTarget`: follow/interact/rally-instantiated entity target;
  - `combatTarget`: current acquired enemy or forced attack target;
  - `intentMode` or named order helpers: point move, follow move, attack-move point, attack-move
    follow, harvest, repair, load.
- Do not add a broad `Order.Follow` unless it improves replay/action semantics. The deeper need is
  separate movement-intent and combat-target state, not another enum value that still overloads
  `target`.

Implementation slices:

1. Document and test current semantics before changing representation.
   - Add scenario tests for right-click/move-to-friendly-unit, rally-to-friendly-unit, rally-to
     resource, non-worker spawned from a resource-rallied producer, and loadable target rally.
   - Tests should assert orders, target retention, approach point behavior, and no accidental
     conversion of resource rally into combat rally.
   - Add tests that capture the current gaps too: desktop right-click on a friendly unit degrades to
     point move, ordinary `Order.Move + target` clears non-loadable targets, and single-slot rally
     cannot retain resource-vs-unit intent after target invalidation. These tests should be marked
     as expected failures only if the test harness supports that; otherwise document them as first
     repair cases.

2. Extract command-intent resolution.
   - Introduce one module that maps validated commands and producer rally templates into
     `CommandIntent`/`ProducerRally`/`UnitRally`/`WorkerRally`/`TravelEndpoint` concepts.
   - `command-specs.ts`, production, UI command candidates, AI, replay, and action masks should call
     into that same vocabulary instead of duplicating "if worker/resource/loadable" logic.
   - Keep validation authoritative: resource rally can only target resources/resource collectors;
     load interaction can only target valid cargo endpoints; harvest can only target harvestable
     resources.
   - Status: current extraction scope implemented. `command-intent.ts` now owns the finite
     smart-command resolver for enemy attack, resource harvest, repair, load, friendly follow,
     structure rally, and ground move; the app file is a thin re-export, and sim-level parity tests
     cover the candidate priority. It also owns `producedUnitRallyIntent`, which maps typed producer
     rally state into gather-near, gather-target, load, travel, or none for production. Remaining
     extraction work is future AI/RL/action-mask callers and eventual target-mode command cards.
   - Status: armed attack-mode command resolution is now also shared. `attackModeCandidates` owns
     the explicit target-mode grammar: enemy entity means targeted `attack`, point/neutral means
     point `amove`, and friendly/allied entity means no command. The app queues those candidates
     instead of duplicating combat target classification.
   - Status: Harvest and Repair armed target modes now also resolve through `command-intent.ts`.
     Harvest fans out to every selected valid worker, Repair fans out to valid repairers for built
     targets, and unfinished construction keeps the existing nearest-valid-worker rule in shared
     sim code instead of app controller code.
   - Status: immediate command-card Load candidates now resolve through `command-intent.ts`, so
     mixed-selection transport/cargo pairing and validation filtering are shared with sim tests
     instead of being rebuilt in the app selection presenter.
   - Status: armed Rally target resolution now also lives in `command-intent.ts`, including
     friendly/gather target detection, targeted rally validation, and fallback to point rally when a
     hit entity is not a valid rally target for the selected producer.
   - Status: action-mask follow-target coverage implemented. Entity target masks and caller-owned
     writers now accept the `move` head for targeted follow candidates, with validator-parity tests
     proving friendly non-resource targets are exposed while enemy, resource, and self targets are
     rejected.
   - Status: action-mask target legality now has command-intent parity coverage for smart-command,
     harvest, repair, load, and rally candidates. This keeps the RL/policy-facing entity target
     masks pinned to the same finite command vocabulary used by the app before changing mask internals.
   - Status: entity-target masks for Harvest, Repair, and Rally now reuse the shared command-intent
     candidate helpers directly. Rally masks only expose true targeted rally candidates, not point
     fallback commands from invalid entity hits.

3. Add public entity-travel command support.
   - Status: done for `{ t: 'move'; unit; x; y; target? }` plus replay/action encode/decode,
     validator parity, and desktop smart command emission.
   - Decide whether the public command is `{ t: 'move'; unit; x; y; target? }` or a new
     `{ t: 'follow'; unit; target }` command. Prefer the smallest replay/action-schema change that
     still makes the command log honest.
   - Desktop right-click with units selected must emit only the finite StarCraft smart-command set:
     attack enemy, harvest resource, repair/continue construction, load into valid transports or
     structures, follow ordinary friendly units/buildings, or move to ground. It must not emit
     attack-move or arbitrary ability behavior.
   - Left-click applies the currently armed command mode. `A` plus left-click emits attack-move;
     armed Harvest/Repair/Load/Unload/Rally/Ability/Build/Land modes should use the same selected
     command application path. Armed-command left-click is not the same thing as right-click smart
     command resolution.
   - Mobile explicit target modes should use the same armed-command application path where possible,
     with mobile-specific selection grammar layered above the shared command semantics.
   - Replay parser, action masks, command validation, and command-card capability checks need the
     same command shape before movement behavior changes.

4. Add true follow semantics for entity-target travel.
   - Status: deterministic same-target follow slots implemented for ground followers. Movement
     derives a per-tick scratch plan keyed by live follow target id, ranks followers by slot, and
     uses rank-aware perimeter approach points. Tests assert distinct destinations, target retention,
     stable hashes, and no serialized state churn. Remaining work is the eventual
     intent/combat-target split.
   - Preserve a follow target until it invalidates instead of clearing it on first arrival.
   - Recompute the current `tx/ty` from a stable approach slot when the target moves.
   - Clear follow only on explicit stop/new command, target invalidation fallback, successful
     one-shot interaction where the unit enters cargo, or a command-specific completion rule.
   - Tests should cover a moving leader and a follower that continues tracking without orbiting or
     jittering.

5. Split producer rally state.
   - Prerequisite next slice: introduce a shared `isGatherTarget` / resource-rally predicate and use
     it from harvest validation, rally validation, smart-command candidates, masks, and focused
     tests. Status: implemented for command validation, rally snapping/validation, production rally
     resolution, harvest routing, resource-route collision checks, app smart
     commands, and focused sim/app tests. The predicate is split into shape-level
     `isGatherTarget` and player-aware `canPlayerGatherTarget`: neutral minerals are gatherable,
     completed friendly/allied gas collectors are gatherable, and hostile gas collectors are not.
     This landed before new rally state columns so "resource rally" has one authoritative meaning.
   - Status: implemented. Existing `rallyX/Y/Target` is now the unit/general rally, with new
     `workerRallyX/Y/Target` columns for resource/gather rally. Clone/serialize pick the columns up
     through `ENTITY_COLUMNS`, hashes include them, snapshot version is bumped, and both renderers
     draw typed rally endpoints. Setup does not store hidden default worker rally state anymore:
     produced workers with no explicit worker or unit rally derive their nearest mineral-line
     default through `producedUnitRallyIntent`.
   - Status: implemented. `resolveUnitRallyEndpoint` and `resolveWorkerRallyEndpoint` now split
     invalidation/retargeting: unit rally retargets friendly entities, worker rally retargets gather
     targets. Production uses worker rally only for workers and unit rally for non-workers, so
     resource rally no longer sends Zerglings/Marines into mineral lines.
   - Status: implemented. Command Center, Nexus, and Hatchery-family worker defaults now live in the
     shared production/rally intent path rather than setup-time state. Tests cover hidden-state-free
     defaults for Terran, Protoss, and Zerg workers, explicit unit rally overriding the default for
     workers, combat units ignoring mineral defaults, and the real production path assigning a new
     worker to harvest.

6. Decide and implement attack-move-follow.
   - Option A: reject attack-move entity targets until `intentTarget`/`combatTarget` split lands.
   - Option B: implement the split first, then allow `attackMove + follow target` so escorts follow
     a friendly unit/building while acquiring/releasing enemy combat targets along the route.
   - Pushback: do not emulate attack-move-follow by stuffing the friendly target into `target` and
     letting combat overwrite it. That recreates the current ambiguity with a nicer name.
   - Status: internal behavior unblocked. The intent/combat-target split exists for normal movement
     and combat, so the next slice can support an internal AttackMove follow endpoint while keeping
     public command/UI exposure deferred until behavior is validated.
   - Status: internal behavior implemented. Travel issuance can retain an entity endpoint for
     AttackMove in `intentTarget` while leaving legacy `target` free for the combat compatibility
     mirror. Movement refreshes entity-follow destinations for both Move and AttackMove orders, and
     settle treats AttackMove with a live `intentTarget` as a follow order rather than a completed
     point order. Tests cover production unit-rally-to-unit AttackMove follow and an escort-shaped
     AttackMove state that keeps following after combat acquisition/release. Public command/UI
     exposure remains deferred.

6A. Schema-first target split.
   - Purpose: add room for the real split before changing behavior. The current `target` column is
     still the source of truth; new columns must be cloned, serialized, hashed, reset, and observed
     by coverage tests before systems read from them.
   - Add `intentTarget` for movement/interact/follow intent and `combatTarget` for acquired or
     forced enemy combat targets.
   - Include both columns in `ENTITY_COLUMNS`, `makeEntities`, spawn reset, clone/serialize/hash,
     snapshot versioning, and state API coverage.
   - Do not change command application, movement, combat, harvest, repair, load, abilities, or
     render behavior in this schema slice.
   - Add tests proving `ENTITY_COLUMNS` covers the new columns, serialize/hash include them, and
     spawn/free/reused slots reset them to `NONE`.
   - Status: schema slice implemented with no behavior changes. `intentTarget` and `combatTarget`
     are allocated as entity columns, reset on spawn/reuse, serialized in snapshot version 22,
     cloned via `ENTITY_COLUMNS`, and included in desync hashes. Replay/state tests prove
     round-trip, hash participation, and slot reuse reset.
   - Status: movement follow/load migration implemented. `issueTravelOrder` mirrors move entity
     targets into `intentTarget` and legacy `target`; movement, settle, and landing prefer
     `intentTarget` with legacy fallback; containment, unload, stop, and egg completion clear stale
     movement intent. Tests wipe legacy `target` during targeted follow and production rally-load
     cases to prove `intentTarget` is the source of truth for recompute and load-on-arrival.
   - Status: stale movement-intent cleanup implemented. Non-travel command/order boundaries such as
     attack, harvest, repair/resume, build, burrow, transform, lift, addon/cancel paths, abilities,
     production morphs, construction release/failure, and cargo containment clear `intentTarget`.
     Landing remains the explicit exception because it is movement-to-self and stores the building's
     own id in `intentTarget`. Validation tests cover representative command boundaries.
   - After the target split slices:
     - public exposure of attack-move-follow/escort should stay behind command-card/UI/API review;
     - public commands, UI command cards, action masks, and observations should only expose richer
       target semantics after the internal behavior is tested;
     - replay/hash/bench coverage remains checked after each migration.
   - Status: normal combat migration implemented. Direct attack seeds `combatTarget`, combat
     acquisition reads `combatTarget` before the legacy compatibility mirror, acquired
     Idle/AttackMove targets are remembered in `combatTarget`, and combat target invalidation
     clears the mirrored legacy target without touching `intentTarget`. Focused combat tests prove
     direct attack, attack-move acquisition, and a future attack-move-follow-shaped state where
     movement intent survives enemy acquisition and release. Child actors that own their own target
     semantics, such as scarabs, interceptors, and spider mines, intentionally remain outside this
     normal-combat slice.
   - Status: stale combat-target cleanup implemented. Travel issuance clears old `combatTarget`,
     and command/order boundaries that replace combat intent clear both target halves unless the new
     order is direct Attack. The boundary regression now dirties both `intentTarget` and
     `combatTarget` before move, attack-move, stop, harvest, repair, build, ability, burrow,
     transform, lift, and land commands, proving old enemy memory cannot resurrect through the new
     column.

7. Normalize resource rally across town halls.
   - Status: implemented. Town-hall worker defaults are derived in `producedUnitRallyIntent`, not
     stored by setup. Command Center, Nexus, and Hatchery-family producers support worker/resource
     rally for workers; combat units ignore resource rally and use unit/general rally instead.
   - Treat Hatchery/Lair/Hive, Command Center/Orbital-like future variants, and Nexus as producers
     that can instantiate worker gather from `RallyIntent.resource`.
   - Make "default town-hall rally to nearby minerals" a producer default when no explicit rally is
     set, not a hardcoded Hatchery or setup-only exception.
   - Preserve resource rally targets for future workers even when combat units are produced from the
     same Zerg producer.

8. Update UI/AI/RL surfaces only after sim semantics are stable.
   - Status: public attack-mode exposure pinned. Desktop/mobile armed Attack remains enemy-target
     attack or point attack-move only; friendly entity targets are rejected/keep target mode rather
     than becoming implicit escort. RL/entity target masks expose `attack` only for enemies, while
     `amove` remains a point command with no entity target until an explicit escort API is chosen.
   - Status: smart-command UI parity pinned. Desktop smart/right-click and mobile normal tap command
     paths are covered against `smartCommandCandidates` for the finite grammar they actually expose:
     enemy attack, friendly follow, mineral harvest, repair/continue construction, load, empty-point
     movement, and structure rally. Mobile's owned-entity selection interception remains explicit
     UX, not a command-intent mismatch.
   - Status: bot/action-mask parity pinned. Scripted bot combat decisions now have focused tests
     proving defense attacks match `attackModeCandidates`, attack waves use public point
     attack-move, and same-team Nydus load/unload commands are exposed by shared validation/action
     masks at the correct sequence point.
   - Status: complete for the current public surface. Desktop right-click, desktop `A` plus
     left-click, mobile explicit target modes, action masks, and bot commands now pin the same
     finite command-intent vocabulary. Escort/attack-move-follow remains deliberately unexposed
     until it gets an explicit API/action-mask contract.

9. Performance and determinism audit.
   - Follow slot recomputation must be bounded by local spatial queries or deterministic small
     scans, not all-pairs work in the movement hot loop.
   - Any new gameplay state such as `intentTarget`, `combatTarget`, or sticky follow-slot columns
     must be cloned, serialized, hashed, and reset on spawn/free/death/containment/transform.
   - Benchmark movement-follow cases and the existing `movement-deathball` lane before accepting
     the representation split.
   - Status: first audit slice complete. Follow slots are not persisted; `movement.ts` builds a
     module-local scratch plan once per tick by grouping live followers by `intentTarget`, sorting
     each target's followers by slot id, and passing deterministic rank/spacing to
     `entityApproachPoint`. This is a bounded grouped scan, not all-pairs follower matching.
   - Status: target-split state coverage confirmed. `intentTarget` and `combatTarget` are registered
     in `ENTITY_COLUMNS`, and replay tests cover typed-column coverage plus serialize/hash/reset
     behavior for those columns. No sticky follow-slot column exists, so there is no extra replay
     state to clone, serialize, hash, or reset.
   - Status: benchmark coverage started. `movement-follow` now exercises a moving leader with
     same-target followers alongside the existing `movement-deathball` pressure lane.
   - Status: combat-churn coverage added. `movement-follow-churn` now exercises two mixed follow
     groups, including internal `Order.AttackMove + intentTarget` followers, while temporary enemy
     targets appear and disappear. The benchmark records combat-target ticks, target retention,
     leader movement, and collision pressure so the representation split has both steady-follow and
     combat-churn measurements.
   - Status: complete for the current representation split. Further work should be driven by the
     benchmark counters or by a deliberate public escort/attack-move-follow API design, not by adding
     sticky follow state preemptively.

Open questions for review:

- Should setting a resource rally on a Hatchery-family producer also set/clear the unit rally, or
  only the worker rally? Decision: only worker rally. Resource rally targets future workers without
  overwriting unit/general rally, so combat units are not sent into mineral lines.
- Should desktop attack-command on a friendly unit mean attack-move-follow, escort, or invalid
  target? Decision for current public UI/API: invalid target. Keep the armed command active and do
  not expose escort until it has an explicit command shape and action-mask contract.
- Should follow slots be persisted per follower for smoothness, or derived from deterministic
  target/follower rank each tick for lower state and easier replay stability? Decision for the
  current implementation: derive them from deterministic target/follower rank each tick. This keeps
  replay state smaller and avoids adding a sticky slot column unless profiling proves the scratch
  plan is too costly or visually unstable.
- Should `load` remain a separate explicit command plus explicit move-to-load, or become an
  interaction intent selected only after the player arms Load / uses a load hotkey?
- How should invalidated worker resource rally retargeting choose between closest resource, closest
  owned resource collector, or reverting to no worker rally? It should not retarget to a friendly
  combat unit.

Done when:

- The roadmap and tests describe the chosen intent model before code depends on it.
- Production, explicit commands, right-click smart commands, armed-command left-click, rally, AI,
  replay, and masks use the same intent vocabulary.
- Following a moving unit/building is stable, deterministic, and does not path to centers.
- Worker resource rally only stores gather targets and resolves to harvest only for workers.
- General/unit rally and worker/resource rally no longer overwrite each other accidentally.
- Combat acquisition no longer destroys movement/follow intent.
- Focused tests, `npm run typecheck`, `npm test`, and `npm run bench` pass with no unexpected hash
  churn.

## Current BW-Fidelity Missing Inventory

This is the working list of "things that were actually in the game" which remain either partial,
approximated, or absent. Keep this list honest as mechanics land.

- Architecture and representation:
  - Entity lifecycle, command capability, child actor roles, internal ammo, ability execution, and
    effect presentation are still represented in more than one place. Phase 12 is the consolidation
    plan to reduce blind spots before the remaining BW mechanics make these seams harder to see.
  - Phase 13 tracks the deeper LOC collapse: command specs, ability descriptors, AI policies,
    `armedCommand`, `selectionView`, scenario-test DSL, internal-product descriptors, child-actor
    descriptors, weapon mechanic ids, and render/query descriptors.
  - Phase 14 tracks the training substrate contract: capacity-safe creation, complete action masks,
    buffer-backed observations, immutable/caller-owned step results, and batch/reentrancy rules.
  - Phase 17 tracks the command-intent/follow/rally split needed to stop overloading one `target`
    column for movement intent, combat acquisition, resource rally, and cargo interactions.
- Temporal mechanics:
  - Siege/unsiege and burrow/unburrow are currently instant; they need verified timed transition
    specs and shared busy-state validation.
  - Ability execution needs explicit instant/status/persistent-area/channel/windup/projectile modes;
    Yamato and Nuclear Strike are the current highest-risk examples.
  - `timer`, `ctimer`, `built`, and `specialAmmo` are overloaded enough that future mechanics should
    route through named helpers/columns rather than writing those fields directly.
- Top-down spatial semantics:
  - Audit ability target ranges separately; combat/repair/harvest/scarab final reach checks now
    use named top-down edge metrics, while ability validation still intentionally uses caster/point
    center ranges until each spell gets its own geometry decision.
- Procedural map generation:
  - Expand beyond the first shared-plateau preset into island, fortress, corner-base, and isolated
    main presets.
  - Add richer generated-map visual/debug proofs for resource/base reservations and midfield
    module clearance.
- Unit production specials:
  - Further Carrier Interceptor attack-pass cadence polish if needed.
- Upgrade fidelity:
  - Audit any remaining weapon-specific or multi-hit upgrade exceptions against BW references;
    `weaponUpgradeBonus` now receives weapon identity, but only documented clear cases are wired.
- Combat spatial rules:
  - More exact projectile/travel behavior for missiles, Valkyrie volleys, and nuke
    missile/presentation beyond the existing fog-safe warning affordance.
- Visibility and UI presentation:
  - App-side spell fields and last-known/fog affordances.
  - Keep click/drag selection geometry covered by tests whenever Math renderer hulls, sprite
    placement, or body/footprint definitions change.
- Macro/tech tree:
  - AI macro should continue filling race tech paths with validator-backed research/upgrade
    choices after the existing Protoss powered expansion and Zerg structure progression work.
- UX/control:
  - Explicit subgroup handling for large mixed selections.
- Rendering/assets:
  - Richer construction/warp-in visual effects and sound cues after the refreshed asset pass.
  - More exact footprint/art placement checks for every imported sprite after asset refreshes.
- Maintenance/performance:
  - Split `Game` selection/input/HUD/replay responsibilities once command-card growth stabilizes.
  - Add event-stream benchmark coverage if the sim grows a public gameplay event stream.
  - Add ML-relevant benchmark lanes for masks, object observation, buffer observation, bot command
    generation, and N-env batch stepping.

## Phase 10: Performance And Maintainability Passes

Status: complete for the current scope.

Purpose: prevent SC fidelity from turning the engine into a slow or brittle rule pile.

Implementation:

- Profile after each major slice with demo/headless benchmarks.
- Keep derived fields out of hashes unless gameplay-affecting.
- Split browser entrypoint wiring from app runtime boot. The browser `main.tsx` should only find
  DOM nodes and call an injectable `bootApp` function; Node tests must be able to boot the same
  app runtime with fake canvases, fake RAF, fake UI mounting, and a fake renderer.
- Add an app startup smoke test that constructs the real default `Game`, resizes the playfield,
  attaches input, and can step one update/render frame without a browser. This test must fail on
  startup exceptions such as invalid procedural maps before any browser screenshot flow runs.
- Keep browser/Playwright tests for final-mile CSS, canvas pixels, WebGL atlas behavior, and
  visual screenshots only. Core layout, hit geometry, command-card capacity, viewport math, and
  boot/runtime errors should be covered by Node tests first.
- Move app selection/input/HUD/replay responsibilities into smaller modules once command-card
  complexity grows.
- Add data coverage tests: every implemented `notes` item should either be removed or tracked in
  this plan.
- Add scenario tests for cross-system interactions: cloak + scan + fog, power + production,
  creep + placement, transport + unload + collision.

Done when:

- The codebase still has obvious extension points for the next SC mechanic.
- Tests describe behavior rather than implementation accidents.
- A single Node test can exercise the actual app boot path deeply enough to catch default game
  startup failures, without opening a browser.

Completed:

- Added `npm run bench` / `npm run bench -w @rts/headless` as a repeatable headless throughput
  harness. It prints stable JSON lines for fixed-seed no-vision stepping, vision-tracked
  stepping, and vision plus `observe()` plus command-result receipt pressure, with a smoke test
  guarding output shape without hard-coding machine-specific timing thresholds.
- Selected-entity HUD status now reports cloaked, burrowed, and viewer-detected state from the
  existing sim visibility/detection helpers, and ignores stale non-owned selections that are no
  longer visible so HUD state cannot leak hidden enemy entities.
- Weapon damage upgrades now apply the documented BW per-unit increments for Protoss ground and
  Zerg melee/missile/flyer weapons, including Dragoon +2, DT/Archon +3, Ultralisk +3, Lurker +2,
  and Guardian/Devourer +2 per level.
- Split the browser app into a thin `main.tsx`, a document bootstrap adapter, and an injectable
  runtime boot path. Node tests can now boot the production sequence with fake canvases, fake RAF,
  fake UI mounting, and a fake renderer.
- Added a Node startup smoke that exercises document lookup, default `Game` construction,
  procedural map generation, canvas resize, input attachment, a real pointer selection, one
  update/render step, RAF scheduling, and cleanup without opening a browser. This harness caught
  the invalid generated-map startup failure before the map fix was applied.
- Mirrored depot/resource exclusion math in placement validation so north and south base clusters
  use the same legal gas/mineral spacing contract.
- Added a sim data coverage test that fails if a non-empty `UnitDef.notes` entry is not either
  removed from the registry or copied into this roadmap for explicit follow-up.
- Added a Protoss power + production scenario test that proves powered queues tick, unpowered
  producers reject new work and pause existing queues, and restored power lets production complete
  through normal sim stepping.
- Added a transport unload + collision scenario test and shared unload placement helper: blocked
  terrain and occupied ground bodies reject without releasing cargo, while a nearby clear point
  unloads without overlap.
- Added a command-ingestion regression proving accepted harvest orders immediately enter the
  resource-route collision class against workers that are harvesting or returning resources.
- Added a Zerg creep + placement scenario test that proves off-creep structures are rejected and
  hidden from build masks until a creep-providing Hatchery finishes through normal sim stepping,
  after which the same placement is accepted through shared validation.
- Existing cloak + scan + fog coverage is now credited in this phase: sim observation tests hide
  undetected cloaked enemies and reveal fogged cloaked enemies after Scanner Sweep, ability tests
  prove scan changes cloaked-target attack legality, and app visibility tests keep selected/HUD
  cloak and detection presentation fog-safe.

Remaining:

- None in the current Phase 10 scope. Longer-running app responsibility splitting remains tracked
  in the Current BW-Fidelity Missing Inventory as an architectural follow-up once command-card
  growth stabilizes.
