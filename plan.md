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
- Screenshot review compacted desktop chrome to a 46px top bar and 76px bottom console, with
  fixed command cells on the right so the playable viewport gets the reclaimed space.
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

- Fuller Zerg macro flow beyond the first Hydralisk Den and basic Spire hooks, especially real
  tech-path planning toward the remaining Hive tech structures.
- Richer construction/warp-in art and sound-effect polish once the refreshed assets define the
  desired visual language.
- Any remaining power-field UI affordances beyond the current placement overlay and powered-state
  validation.
- Deeper Terran add-on ownership behavior such as dependency on landed parent state.

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
- Protoss scripted macro now queues a legal Stargate from that same ordered tech-structure path
  after Cybernetics Core, preserving shared power, prerequisite, duplicate, and budget checks.
- Protoss scripted macro now queues a legal Citadel of Adun through the ordered tech-structure path,
  unlocking the templar branch while preserving the same validation-backed legality checks.
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

Done when:

- A bot can play each race using its real macro mechanic and tactical abilities without relying on
  impossible commands.

## Current BW-Fidelity Missing Inventory

This is the working list of "things that were actually in the game" which remain either partial,
approximated, or absent. Keep this list honest as mechanics land.

- Unit production specials:
  - Further Carrier Interceptor attack-pass cadence polish if needed.
- Upgrade fidelity:
  - Attack-speed upgrade fidelity for any remaining non-Zergling cases.
  - Broader per-weapon upgrade increments for multi-hit/special weapons.
- Combat spatial rules:
  - More exact projectile/travel behavior for missiles, Valkyrie volleys, and nuke
    missile/presentation beyond the existing fog-safe warning affordance.
- Visibility and UI presentation:
  - App-side spell fields, cloaking/detection, and last-known/fog affordances.
- Macro/tech tree:
  - AI macro should use real race tech paths, including Protoss power-aware expansions beyond
    Gateway.
- UX/control:
  - Control-group chips and explicit subgroup handling for large mixed selections.
- Rendering/assets:
  - Richer construction/warp-in visual effects and sound cues after the refreshed asset pass.
  - More exact footprint/art placement checks for every imported sprite after asset refreshes.
- Maintenance/performance:
  - Split `Game` selection/input/HUD/replay responsibilities once command-card growth stabilizes.
  - Add repeatable throughput benchmarks with vision on/off and command-result/event options.

## Phase 9: Performance And Maintainability Passes

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
