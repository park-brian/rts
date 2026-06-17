# SC:BW Spec Completion Plan

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
- Structure rally now supports point, unit, building, and resource targets through the shared
  `rally` command/replay path. Rally mode snaps to valid entity targets, production resolves live
  target positions, and invalid entity rallies retarget to the nearest valid rally entity instead
  of collapsing to a stale point.
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

Status: in progress.

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

Remaining:

- Run and compare the new movement stress benchmark across representative seeds after tuning
  changes.
- Decide from movement-stress measurements and visual review whether the path lattice needs to move
  from 16px to true BW-style 8px cells.

## Phase 9B: Top-Down Spatial Semantics And Procedural Map Design

Status: in progress.

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
  - **Timing calibration layer:** per-route or per-layout targets that preserve BW-equivalent
    economy timing when top-down geometry and tile/grid discreteness cannot hit the target exactly.
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
- Preserve economy timing with a positive-only calibration model:
  - solve resource positions and docking sides first so the top-down route length is at or below
    the BW-equivalent target within a tight band;
  - make equal route distance the first-order target for symmetric mineral clusters; if movement
    speed is shared, equal calculated distance gives equal relative trip time across SCVs, Drones,
    and Probes without worker-specific placement hacks;
  - if a route is slightly shorter than target, add deterministic wait frames at the dock or
    depot to match the calibrated trip;
  - if a route is longer than target, the layout is invalid and must move resources or fail
    generation. Do not compensate by making the worker mine before contact or by silently speeding
    it up.
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
  - Treat the BW-equivalent target as a frame count or route-time contract, not as permission to
    keep BW's approximate visual distance. Source BW distance constants seed the solver, but the
    pass/fail result is "top-down path plus waits matches target frames."
  - Store no per-worker path history beyond deterministic order state unless a small route timer
    field is required for calibration.
  - Navigate to the docking point, not the resource center.
  - Start mining/deposit only after docking.
  - Compute actual leg length as path/top-down distance between docking points. For the first
    implementation, straight-line top-down length is acceptable only if pathing is unobstructed;
    once ramps/obstacles affect workers, use the path lattice route cost.
  - Build a calibration table for main-base mineral patches:
    - target route time from the BW-equivalent model;
    - actual top-down route time;
    - positive wait frames needed to match target;
    - invalid flag when actual route exceeds target by more than tolerance.
  - Keep the timing compensation deterministic and visible in tests. It should be an economy
    timing shim, not a movement distortion.
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
- Added the first positive-only harvest calibration table for main-base mineral routes. It exposes
  BW target trip frames, target route frames, actual top-down dock-to-dock route frames,
  deterministic wait frames, and invalid-too-long flags without letting calibration bypass
  physical docking.
- Consumed valid main-base mineral calibration rows in the harvest cycle: workers returning
  minerals hold at the depot for the deterministic wait frames before deposit, preserving physical
  docking and replay-hashed state.
- Added main-base mineral route-quality validation and wired procedural generation to reject maps
  with missing, invalid, or overly asymmetric calibrated mineral routes.
- Replaced procedural base-site resource stamping with reusable base-cluster solver results that
  expose exact depot anchors, depot footprints, standard mineral/gas geometry, and whole-cluster
  reservation footprints for mains and naturals.
- Added deterministic local base-anchor retry before procedural resource stamping. Candidate
  clusters must satisfy depot buildability, whole-reservation walkability/overlap, resource
  clearance, and main-base mineral route quality before they are committed to the map.

Remaining:

- Broaden base/resource repair from local depot-anchor retry into resource-geometry adjustment when
  a cluster's mineral routes are intrinsically too long or too asymmetric.
- Move harvest timing from straight edge distance to path-lattice route cost once obstacles/ramps
  can affect worker trips.
- Add gas-specific cadence validation for three-worker refinery saturation.
- Add a debug/headless overlay for interaction hulls, docking points, route targets, base-site
  reservations, resource footprints, and timing-valid/invalid markers.

## Current BW-Fidelity Missing Inventory

This is the working list of "things that were actually in the game" which remain either partial,
approximated, or absent. Keep this list honest as mechanics land.

- Pathing and movement fidelity:
  - Movement-stress benchmark comparisons and visual review to decide whether the 16px path
    lattice needs true BW-style 8px cells.
- Top-down spatial semantics:
  - Build the remaining harvest timing calibration layer on top of the new contact-only top-down
    docking behavior.
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

## Phase 10: Performance And Maintainability Passes

Status: planned.

Purpose: prevent SC fidelity from turning the engine into a slow or brittle rule pile.

Implementation:

- Profile after each major slice with demo/headless benchmarks.
- Keep derived fields out of hashes unless gameplay-affecting.
- Move app selection/input/HUD/replay responsibilities into smaller modules once command-card
  complexity grows.
- Add data coverage tests: every implemented `notes` item should either be removed or tracked in
  this plan.
- Add scenario tests for cross-system interactions: cloak + scan + fog, power + production,
  creep + placement, transport + unload + collision.

Done when:

- The codebase still has obvious extension points for the next SC mechanic.
- Tests describe behavior rather than implementation accidents.

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
